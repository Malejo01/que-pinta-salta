import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeEventsDb, type EventRow } from './fake-events-db'

class RedirectSignal extends Error {
  constructor(public readonly url: string) {
    super('REDIRECT')
  }
}
class NotFoundSignal extends Error {
  constructor() {
    super('NOT_FOUND')
  }
}

const permanentRedirect = vi.fn((url: string) => {
  throw new RedirectSignal(url)
})
const notFound = vi.fn(() => {
  throw new NotFoundSignal()
})
vi.mock('next/navigation', () => ({
  permanentRedirect: (u: string) => permanentRedirect(u),
  notFound: () => notFound(),
}))

const getEventById = vi.fn()
vi.mock('@/lib/data', () => ({
  getEventById: (...a: unknown[]) => getEventById(...a),
  getCategories: async () => [],
}))

const createClient = vi.fn()
const createAdminClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: (...a: unknown[]) => createClient(...a),
  createAdminClient: (...a: unknown[]) => createAdminClient(...a),
}))

vi.mock('@/components/event-detail-page', () => ({ EventDetailPage: () => null }))

import EventPage from '@/app/evento/[id]/page'

const uid = (n: number) => `99999999-9999-4999-8999-${String(n).padStart(12, '0')}`
const ev = (n: number, over: EventRow = {}, mergedInto?: string): EventRow => ({
  id: uid(n),
  status: 'PUBLISHED',
  ai_metadata: mergedInto ? { merged_into_event_id: mergedInto } : null,
  ...over,
})

function setup(rows: EventRow[]) {
  const db = createFakeEventsDb(rows)
  createAdminClient.mockReturnValue(db.client)
  createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null } }) } })
  // El cliente público no ve borradores: getEventById devuelve null para todo menos PUBLISHED.
  getEventById.mockImplementation(async (id: string) => {
    const r = rows.find((x) => x.id === id && x.status === 'PUBLISHED')
    return r ?? null
  })
  return db
}

async function render(id: string, o?: string | string[]) {
  try {
    await EventPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve(o === undefined ? {} : { o }) })
  } catch (e) {
    return e
  }
  return null
}

beforeEach(() => {
  permanentRedirect.mockClear()
  notFound.mockClear()
  createAdminClient.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('/evento/[id] con eventos fusionados', () => {
  it('fusionado: permanentRedirect a /evento/<destino> conservando ?o=', async () => {
    setup([ev(1, { status: 'DRAFT' }, uid(2)), ev(2)])
    const err = await render(uid(1), 'radar')
    expect(err).toBeInstanceOf(RedirectSignal)
    expect((err as RedirectSignal).url).toBe(`/evento/${uid(2)}?o=radar`)
    expect(notFound).not.toHaveBeenCalled()
  })

  it('fusionado sin origen: redirige al destino sin inyectar nada raro', async () => {
    setup([ev(1, { status: 'DRAFT' }, uid(2)), ev(2)])
    const err = await render(uid(1))
    expect(err).toBeInstanceOf(RedirectSignal)
    expect((err as RedirectSignal).url).toBe(`/evento/${uid(2)}`)
  })

  it('origen malicioso: no se propaga', async () => {
    setup([ev(1, { status: 'DRAFT' }, uid(2)), ev(2)])
    const err = await render(uid(1), 'https://malo.example.test/x?a=1&b=2')
    expect(err).toBeInstanceOf(RedirectSignal)
    expect((err as RedirectSignal).url).toBe(`/evento/${uid(2)}`)
  })

  it('cadena de 2 saltos: redirige al final', async () => {
    setup([ev(1, { status: 'DRAFT' }, uid(2)), ev(2, { status: 'DRAFT' }, uid(3)), ev(3)])
    const err = await render(uid(1), 'hero')
    expect((err as RedirectSignal).url).toBe(`/evento/${uid(3)}?o=hero`)
  })

  it('el lookup de fusión usa el cliente admin', async () => {
    setup([ev(1, { status: 'DRAFT' }, uid(2)), ev(2)])
    await render(uid(1), 'radar')
    expect(createAdminClient).toHaveBeenCalled()
  })

  it('no fusionado e inexistente: notFound()', async () => {
    setup([])
    const err = await render(uid(1), 'radar')
    expect(err).toBeInstanceOf(NotFoundSignal)
    expect(permanentRedirect).not.toHaveBeenCalled()
  })

  it('borrador sin fusión: notFound(), sin redirección', async () => {
    setup([ev(1, { status: 'DRAFT' })])
    expect(await render(uid(1))).toBeInstanceOf(NotFoundSignal)
    expect(permanentRedirect).not.toHaveBeenCalled()
  })

  it('fusionado cuyo destino no está PUBLISHED: notFound()', async () => {
    setup([ev(1, { status: 'DRAFT' }, uid(2)), ev(2, { status: 'DRAFT' })])
    expect(await render(uid(1))).toBeInstanceOf(NotFoundSignal)
    expect(permanentRedirect).not.toHaveBeenCalled()
  })

  it('si el cliente admin falla: notFound() y no revienta', async () => {
    setup([ev(1, { status: 'DRAFT' }, uid(2)), ev(2)])
    createAdminClient.mockImplementation(() => {
      throw new Error('sin env')
    })
    expect(await render(uid(1))).toBeInstanceOf(NotFoundSignal)
  })
})
