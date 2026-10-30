// Q3: /en/evento/<descartado de una fusión> redirige con un 308 a
// /en/evento/<el que queda> (no a la ficha en castellano), conservando un
// ?o= válido. La ficha en inglés reusa el cuerpo de `app/evento/[id]/page.tsx`
// (que hace `permanentRedirect('/evento/<otro>')`) y le agrega el `/en` al
// destino. Mismo armado que evento-merged-308.test.ts: `permanentRedirect`
// es el REAL de next/navigation (308 de verdad), solo `notFound` se mockea.
// Sin red ni base.
//
// ALARMA DE UPGRADE: `app/en/evento/[id]/page.tsx` traduce el 308 con helpers
// INTERNOS de Next (`next/dist/client/components/redirect` y
// `.../redirect-error`), que no son API pública. Si un upgrade los mueve o
// cambia el formato del error de redirección, este archivo se pone en rojo
// (falla el import, o el 308 deja de ir a /en/evento/<otro>?o=…): no lo
// relajes, arreglá la página.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getRedirectStatusCodeFromError, getURLFromRedirectError } from 'next/dist/client/components/redirect'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { createFakeEventsDb, type EventRow } from './fake-events-db'

class NotFoundSignal extends Error {
  constructor() {
    super('NOT_FOUND')
  }
}
const notFound = vi.fn(() => {
  throw new NotFoundSignal()
})
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>()
  return { ...actual, notFound: () => notFound() }
})

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

import EventPageEn from '@/app/en/evento/[id]/page'

const uid = (n: number) => `dddddddd-dddd-4ddd-8ddd-${String(n).padStart(12, '0')}`
const DROPPED = uid(1)
const KEEP = uid(2)

function setup(rows: EventRow[]) {
  const db = createFakeEventsDb(rows)
  createAdminClient.mockReturnValue(db.client)
  createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null } }) } })
  getEventById.mockImplementation(async (id: string) => rows.find((x) => x.id === id && x.status === 'PUBLISHED') ?? null)
}

async function render(id: string, o?: string) {
  try {
    return { resultado: await EventPageEn({ params: Promise.resolve({ id }), searchParams: Promise.resolve(o === undefined ? {} : { o }) }) }
  } catch (e) {
    return { error: e }
  }
}

const FUSIONADO: EventRow[] = [
  { id: DROPPED, status: 'DRAFT', ai_metadata: { merged_into_event_id: KEEP } },
  { id: KEEP, status: 'PUBLISHED', title: 'Evento de Prueba' },
]

beforeEach(() => {
  notFound.mockClear()
  createAdminClient.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('/en/evento/[id] con eventos fusionados', () => {
  it('fusionado: 308 real a /en/evento/<el que queda>', async () => {
    setup(FUSIONADO)
    const { error } = await render(DROPPED)
    if (!isRedirectError(error)) throw new Error('se esperaba un error de redirección (NEXT_REDIRECT)')
    expect(getRedirectStatusCodeFromError(error)).toBe(308)
    expect(getURLFromRedirectError(error)).toBe(`/en/evento/${KEEP}`)
    expect(notFound).not.toHaveBeenCalled()
  })

  it('con ?o= válido se conserva; con uno inválido no se propaga', async () => {
    setup(FUSIONADO)
    const valido = (await render(DROPPED, 'radar')).error
    if (!isRedirectError(valido)) throw new Error('se esperaba un error de redirección (NEXT_REDIRECT)')
    expect(getRedirectStatusCodeFromError(valido)).toBe(308)
    expect(getURLFromRedirectError(valido)).toBe(`/en/evento/${KEEP}?o=radar`)

    const invalido = (await render(DROPPED, 'https://malo.example.test/x')).error
    if (!isRedirectError(invalido)) throw new Error('se esperaba un error de redirección (NEXT_REDIRECT)')
    expect(getURLFromRedirectError(invalido)).toBe(`/en/evento/${KEEP}`)
  })

  it('el que queda no está publicado: 404, sin redirección', async () => {
    setup([
      { id: DROPPED, status: 'DRAFT', ai_metadata: { merged_into_event_id: KEEP } },
      { id: KEEP, status: 'DRAFT', title: 'Evento de Prueba (sin publicar)' },
    ])
    const { error } = await render(DROPPED)
    expect(error).toBeInstanceOf(NotFoundSignal)
    expect(isRedirectError(error)).toBe(false)
    expect(notFound).toHaveBeenCalledTimes(1)
  })

  it('publicado: dibuja la ficha (sin redirección)', async () => {
    setup([{ id: KEEP, status: 'PUBLISHED', title: 'Evento de Prueba', start_date: '2026-11-07T23:00:00Z', created_at: '2026-10-01T00:00:00Z' }])
    const { resultado, error } = await render(KEEP)
    expect(error).toBeUndefined()
    expect(resultado).toBeTruthy()
  })
})
