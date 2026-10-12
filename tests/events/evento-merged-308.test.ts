// Sin red ni base. Contrato de la fusión manual con /evento/[id]: la fila que
// merge_events() deja en el descartado (status DRAFT, ai_metadata con
// merged_into_event_id/merged_at/merged_by AGREGADOS a las claves que ya tuviera
// -- ver supabase/migrations/20261011120000_merge_events.sql, paso 8) tiene que
// hacer que /evento/<descartado> redirija con el permanentRedirect REAL de
// next/navigation (308, no simulado) a /evento/<que-queda>. Si el que queda
// todavía no está PUBLISHED, no hay redirección: notFound() (404).
//
// A diferencia de evento-page-merged.test.ts (que mockea next/navigation entero
// y cubre la lógica de saltos/origen con más detalle), este archivo usa el
// permanentRedirect de verdad y las utilidades que trae el propio paquete
// (getRedirectStatusCodeFromError / getURLFromRedirectError / isRedirectError)
// para comprobar el código de estado 308 sin reimplementar esa lógica acá.
// notFound() se mockea igual: fuera del runtime de Next no hace falta un Error
// especial, alcanza con confirmar que SE LLAMÓ.
import { beforeEach, describe, expect, it, vi } from 'vitest'
// Helpers internos de next/navigation: no se re-exportan desde el paquete público,
// pero son el mismo código que usa permanentRedirect() de verdad (sin red ni base:
// es lógica pura sobre un Error con un `digest` especial, ya instalada con next).
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
// permanentRedirect queda SIN mockear (es el real de next/navigation): solo se
// reemplaza notFound, para poder afirmar "se llamó" sin que tire una excepción
// rara fuera del runtime de Next.
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

import EventPage from '@/app/evento/[id]/page'

const uid = (n: number) => `eeeeeeee-eeee-4eee-8eee-${String(n).padStart(12, '0')}`
const ADMIN_UUID = 'ffffffff-ffff-4fff-8fff-000000000099'
const DROPPED = uid(1)
const KEEP = uid(2)

/**
 * ai_metadata tal como lo deja merge_events() en el descartado (paso 8 de la
 * migración): coalesce(v_drop.ai_metadata, '{}') || {merged_into_event_id,
 * merged_at, merged_by}. Se arranca de `previous` (claves que YA tenía el
 * evento, p. ej. de la ingesta) y se le agregan las tres del merge, como hace
 * el `||` de jsonb en la base: nunca se pisan las claves previas.
 */
function mergedAiMetadata(keepId: string, previous: Record<string, unknown> = {}) {
  return {
    ...previous,
    merged_into_event_id: keepId,
    merged_at: '2026-10-09T15:00:00.000Z',
    merged_by: ADMIN_UUID,
  }
}

function setup(rows: EventRow[]) {
  const db = createFakeEventsDb(rows)
  createAdminClient.mockReturnValue(db.client)
  createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null } }) } })
  // El cliente público no ve borradores: getEventById devuelve null para todo menos PUBLISHED
  // (igual que lib/data real: el descartado de un merge nunca llega acá por esa vía).
  getEventById.mockImplementation(async (id: string) => {
    const r = rows.find((x) => x.id === id && x.status === 'PUBLISHED')
    return r ?? null
  })
  return db
}

async function render(id: string, o?: string) {
  try {
    await EventPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve(o === undefined ? {} : { o }) })
  } catch (e) {
    return e
  }
  return null
}

beforeEach(() => {
  notFound.mockClear()
  createAdminClient.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('/evento/[id]: contrato real con merge_events() (308)', () => {
  it('fila tal como la deja merge_events() (DRAFT + ai_metadata con claves previas): 308 real al que queda', async () => {
    setup([
      {
        id: DROPPED,
        status: 'DRAFT',
        is_featured: false,
        ai_metadata: mergedAiMetadata(KEEP, { instagram_flyer_id: 'flyer-de-prueba-123', is_fallback: true }),
      },
      { id: KEEP, status: 'PUBLISHED', title: 'Evento de Prueba' },
    ])

    const err = await render(DROPPED)
    if (!isRedirectError(err)) throw new Error('se esperaba un error de redirección (NEXT_REDIRECT)')
    expect(getRedirectStatusCodeFromError(err)).toBe(308)
    expect(getURLFromRedirectError(err)).toBe(`/evento/${KEEP}`)
    expect(notFound).not.toHaveBeenCalled()
  })

  it('con ?o= válido: se conserva en la URL de la redirección 308', async () => {
    setup([
      { id: DROPPED, status: 'DRAFT', ai_metadata: mergedAiMetadata(KEEP) },
      { id: KEEP, status: 'PUBLISHED', title: 'Evento de Prueba' },
    ])

    const err = await render(DROPPED, 'radar')
    if (!isRedirectError(err)) throw new Error('se esperaba un error de redirección (NEXT_REDIRECT)')
    expect(getRedirectStatusCodeFromError(err)).toBe(308)
    expect(getURLFromRedirectError(err)).toBe(`/evento/${KEEP}?o=radar`)
  })

  it('?o= inválido: no se propaga a la URL de la redirección', async () => {
    setup([
      { id: DROPPED, status: 'DRAFT', ai_metadata: mergedAiMetadata(KEEP) },
      { id: KEEP, status: 'PUBLISHED', title: 'Evento de Prueba' },
    ])

    const err = await render(DROPPED, 'https://malo.example.test/x')
    if (!isRedirectError(err)) throw new Error('se esperaba un error de redirección (NEXT_REDIRECT)')
    expect(getRedirectStatusCodeFromError(err)).toBe(308)
    expect(getURLFromRedirectError(err)).toBe(`/evento/${KEEP}`)
  })

  it('el que queda sigue en DRAFT (todavía no publicado): no redirige, 404', async () => {
    setup([
      { id: DROPPED, status: 'DRAFT', ai_metadata: mergedAiMetadata(KEEP) },
      { id: KEEP, status: 'DRAFT', title: 'Evento de Prueba (sin publicar)' },
    ])

    const err = await render(DROPPED)
    expect(err).toBeInstanceOf(NotFoundSignal)
    expect(isRedirectError(err)).toBe(false)
    expect(notFound).toHaveBeenCalledTimes(1)
  })
})
