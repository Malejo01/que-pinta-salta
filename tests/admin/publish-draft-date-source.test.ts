// Ronda 14 / tarea 14-b (QPS-073): la guarda de needsDateConfirmation() dentro de
// publishDraftEvent (lib/admin-actions.ts). Mismo patrón de mocks que
// tests/admin/publish-draft-guards.test.ts (Ronda 11), pero con un fake de cliente admin propio
// que además sabe responder `instagram_flyers.select(...).eq(...)` (necesario para los
// borradores viejos sin date_source y para la falla-cerrada). Se prefirió no tocar el fake de la
// Ronda 11 para no arriesgar esos tests ya en verde.
// Sin red ni base. Fechas y hora via las funciones puras reales (saltaWallClockToUtcISO):
// no hace falta mockearlas.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const createClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: (...a: unknown[]) => createClient(...a),
}))

const adminState: { client: unknown } = { client: null }
vi.mock('@supabase/supabase-js', () => ({
  createClient: (...a: unknown[]) => adminState.client,
}))

import { publishDraftEvent } from '@/lib/admin-actions'

type Row = Record<string, unknown>

const EVENT_ID = '11111111-1111-4111-8111-111111111111'
const ADMIN_USER = { id: 'admin-de-prueba' }

function baseEvent(overrides: Row = {}): Row {
  return {
    id: EVENT_ID,
    title: 'Borrador de Prueba',
    status: 'DRAFT',
    ai_metadata: null,
    end_date: null,
    scrape_source_key: null,
    start_date: '2029-01-01T00:00:00.000Z',
    ...overrides,
  }
}

/** Cliente de sesión falso: getUser() + profiles.role, siempre ADMIN acá (ya cubierto en R11). */
function sessionClient() {
  return {
    auth: { getUser: async () => ({ data: { user: ADMIN_USER } }) },
    from: (table: string) => {
      if (table !== 'profiles') throw new Error('tabla inesperada en el cliente de sesión: ' + table)
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { role: 'ADMIN' } }),
          }),
        }),
      }
    },
  }
}

/**
 * Cliente de service role falso: `events` en memoria + `instagram_flyers`, que soporta tanto
 * `select('published_at').eq('ai_metadata->>event_id', eventId)` (lectura de los flyers de
 * origen) como `update(...).eq('id', flyerId)` (marcar PROCESSED al publicar).
 *
 * `flyersByEventId` mapea eventId -> array de filas `{ published_at }` (o más de una, para el
 * caso de un evento nacido de la fusión de varios posteos). `flyersError` simula que el select
 * a instagram_flyers vuelve con error (falla cerrada).
 */
function fakeAdminClient(
  events: Row[],
  flyersByEventId: Record<string, Array<{ published_at: string }>> = {},
  flyersError: { message: string } | null = null,
) {
  const store = events.map((e) => ({ ...e }))
  const eventUpdates: Array<{ id: string; payload: Row }> = []
  const flyerUpdates: Array<{ id: string; payload: Row }> = []
  let flyersSelectCalls = 0

  const client = {
    from(table: string) {
      if (table === 'events') {
        let filterId: string | undefined
        let mode: 'select' | 'update' = 'select'
        let payload: Row = {}
        const c: Record<string, unknown> = {}
        c.select = () => {
          mode = 'select'
          return c
        }
        c.update = (p: Row) => {
          mode = 'update'
          payload = p
          return c
        }
        c.eq = (_col: string, val: string) => {
          filterId = val
          return c
        }
        c.maybeSingle = async () => ({ data: store.find((e) => e.id === filterId) ?? null, error: null })
        c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
          if (mode === 'update') eventUpdates.push({ id: filterId as string, payload })
          return Promise.resolve({ error: null }).then(res, rej)
        }
        return c
      }
      if (table === 'instagram_flyers') {
        let mode: 'select' | 'update' = 'select'
        let payload: Row = {}
        const c: Record<string, unknown> = {}
        c.select = () => {
          mode = 'select'
          return c
        }
        c.update = (p: Row) => {
          mode = 'update'
          payload = p
          return c
        }
        // El código de producción hace `await ....eq(...)` directo (sin .select() final ni
        // .single()): el builder real de supabase-js es awaitable ("thenable") en ese punto.
        c.eq = (_col: string, val: string) => {
          if (mode === 'select') {
            flyersSelectCalls++
            if (flyersError) return Promise.resolve({ data: null, error: flyersError })
            return Promise.resolve({ data: flyersByEventId[val] ?? [], error: null })
          }
          flyerUpdates.push({ id: val, payload })
          return Promise.resolve({ error: null })
        }
        return c
      }
      throw new Error('tabla inesperada en el cliente admin: ' + table)
    },
  }

  return {
    client,
    eventUpdates,
    flyerUpdates,
    get flyersSelectCalls() {
      return flyersSelectCalls
    },
  }
}

function setup(
  events: Row[],
  flyersByEventId: Record<string, Array<{ published_at: string }>> = {},
  flyersError: { message: string } | null = null,
) {
  createClient.mockResolvedValue(sessionClient())
  const db = fakeAdminClient(events, flyersByEventId, flyersError)
  adminState.client = db.client
  return db
}

beforeEach(() => {
  createClient.mockReset()
  adminState.client = null
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proyecto-de-prueba.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-prueba'
})
afterEach(() => vi.restoreAllMocks())

const TITULO = 'Título Nuevo de Prueba'

describe('publishDraftEvent: needsDateConfirmation / QPS-073', () => {
  it('date_source "published_at" sin confirm_date: no publica', async () => {
    const db = setup([baseEvent({ ai_metadata: { date_source: 'published_at' } })])
    const res = await publishDraftEvent(EVENT_ID, { title: TITULO, start_date: '2030-06-15' })
    expect(res).toEqual({ error: 'Confirmá la fecha: salió de la publicación, no del flyer' })
    expect(db.eventUpdates).toHaveLength(0)
  })

  it('date_source "published_at" con confirm_date true: publica', async () => {
    const db = setup([baseEvent({ ai_metadata: { date_source: 'published_at' } })])
    const res = await publishDraftEvent(EVENT_ID, {
      title: TITULO,
      start_date: '2030-06-15',
      confirm_date: true,
    })
    expect(res).toEqual({ success: true })
    expect(db.eventUpdates).toHaveLength(1)
  })

  it('date_source "flyer": no pide confirmación', async () => {
    const db = setup([baseEvent({ ai_metadata: { date_source: 'flyer' } })])
    const res = await publishDraftEvent(EVENT_ID, { title: TITULO, start_date: '2030-06-15' })
    expect(res).toEqual({ success: true })
    expect(db.eventUpdates).toHaveLength(1)
  })

  it('is_fallback true (con o sin date_source): sigue exigiendo confirm_date', async () => {
    const db = setup([baseEvent({ ai_metadata: { is_fallback: true, date_source: 'published_at' } })])
    const sinConfirmar = await publishDraftEvent(EVENT_ID, { title: TITULO, start_date: '2030-06-15' })
    expect(sinConfirmar).toEqual({ error: 'Confirmá la fecha: salió de la publicación, no del flyer' })
    expect(db.eventUpdates).toHaveLength(0)

    const conConfirmar = await publishDraftEvent(EVENT_ID, {
      title: TITULO,
      start_date: '2030-06-15',
      confirm_date: true,
    })
    expect(conConfirmar).toEqual({ success: true })
    expect(db.eventUpdates).toHaveLength(1)
  })

  it('borrador viejo (sin date_source) del pipeline instagram-ai, con un flyer cuyo published_at coincide exactamente con start_date: exige confirmación sin confirm_date', async () => {
    const db = setup(
      [baseEvent({ scrape_source_key: 'instagram-ai', ai_metadata: null, start_date: '2029-05-10T03:00:00.000Z' })],
      { [EVENT_ID]: [{ published_at: '2029-05-10T03:00:00.000Z' }] },
    )
    const res = await publishDraftEvent(EVENT_ID, { title: TITULO, start_date: '2030-06-15' })
    expect(res).toEqual({ error: 'Confirmá la fecha: salió de la publicación, no del flyer' })
    expect(db.eventUpdates).toHaveLength(0)
  })

  it('borrador viejo (sin date_source) del pipeline instagram-ai, con un flyer publicado el mismo día de Salta (otra hora): exige confirmación igual', async () => {
    // start_date guardado: 2029-05-10T03:00:00.000Z = 00:00 del 10/05 en Salta (UTC-3).
    // published_at del flyer: 2029-05-10T23:30:00.000Z = 20:30 del 10/05 en Salta: mismo día,
    // instante distinto.
    const db = setup(
      [baseEvent({ scrape_source_key: 'instagram-ai', ai_metadata: null, start_date: '2029-05-10T03:00:00.000Z' })],
      { [EVENT_ID]: [{ published_at: '2029-05-10T23:30:00.000Z' }] },
    )
    const res = await publishDraftEvent(EVENT_ID, { title: TITULO, start_date: '2030-06-15' })
    expect(res).toEqual({ error: 'Confirmá la fecha: salió de la publicación, no del flyer' })
    expect(db.eventUpdates).toHaveLength(0)
  })

  it('borrador viejo del pipeline instagram-ai, con un flyer de otro día: no pide confirmación', async () => {
    const db = setup(
      [baseEvent({ scrape_source_key: 'instagram-ai', ai_metadata: null, start_date: '2029-05-10T03:00:00.000Z' })],
      { [EVENT_ID]: [{ published_at: '2029-04-01T03:00:00.000Z' }] },
    )
    const res = await publishDraftEvent(EVENT_ID, { title: TITULO, start_date: '2030-06-15' })
    expect(res).toEqual({ success: true })
    expect(db.eventUpdates).toHaveLength(1)
  })

  it('un evento que no viene de instagram-ai (borrador viejo sin date_source): ni consulta instagram_flyers', async () => {
    const db = setup([baseEvent({ scrape_source_key: null, ai_metadata: null })])
    const res = await publishDraftEvent(EVENT_ID, { title: TITULO, start_date: '2030-06-15' })
    expect(res).toEqual({ success: true })
    expect(db.flyersSelectCalls).toBe(0)
  })

  it('un evento scrapeado de otra fuente (p. ej. "ticketera-prueba"): tampoco consulta instagram_flyers', async () => {
    const db = setup([baseEvent({ scrape_source_key: 'ticketera-prueba', ai_metadata: null })])
    const res = await publishDraftEvent(EVENT_ID, { title: TITULO, start_date: '2030-06-15' })
    expect(res).toEqual({ success: true })
    expect(db.flyersSelectCalls).toBe(0)
  })

  describe('falla cerrada: si el select a instagram_flyers vuelve con error, se exige confirmación (hallazgo de seguridad de la Ronda 14)', () => {
    it('sin confirm_date: no publica', async () => {
      const db = setup(
        [baseEvent({ scrape_source_key: 'instagram-ai', ai_metadata: null })],
        {},
        { message: 'timeout de prueba leyendo instagram_flyers' },
      )
      const res = await publishDraftEvent(EVENT_ID, { title: TITULO, start_date: '2030-06-15' })
      expect(res).toEqual({ error: 'Confirmá la fecha: salió de la publicación, no del flyer' })
      expect(db.eventUpdates).toHaveLength(0)
    })

    it('con confirm_date true: el admin puede seguir publicando a propósito', async () => {
      const db = setup(
        [baseEvent({ scrape_source_key: 'instagram-ai', ai_metadata: null })],
        {},
        { message: 'timeout de prueba leyendo instagram_flyers' },
      )
      const res = await publishDraftEvent(EVENT_ID, {
        title: TITULO,
        start_date: '2030-06-15',
        confirm_date: true,
      })
      expect(res).toEqual({ success: true })
      expect(db.eventUpdates).toHaveLength(1)
    })
  })

  it('evento nacido de la fusión de 2+ posteos: varias filas en instagram_flyers y la que coincide es la SEGUNDA, no la primera', async () => {
    const db = setup(
      [baseEvent({ scrape_source_key: 'instagram-ai', ai_metadata: null, start_date: '2029-05-10T03:00:00.000Z' })],
      {
        [EVENT_ID]: [
          { published_at: '2029-01-01T03:00:00.000Z' }, // no coincide
          { published_at: '2029-05-10T03:00:00.000Z' }, // coincide: la segunda fila
        ],
      },
    )
    const res = await publishDraftEvent(EVENT_ID, { title: TITULO, start_date: '2030-06-15' })
    expect(res).toEqual({ error: 'Confirmá la fecha: salió de la publicación, no del flyer' })
    expect(db.eventUpdates).toHaveLength(0)
  })

  it.each(['true', 1, {}])(
    'confirm_date truthy pero distinto de `true` (%j) no saltea la guarda de date_source',
    async (confirmDate) => {
      const db = setup([baseEvent({ ai_metadata: { date_source: 'published_at' } })])
      const res = await publishDraftEvent(EVENT_ID, {
        title: TITULO,
        start_date: '2030-06-15',
        confirm_date: confirmDate as unknown as boolean,
      })
      expect(res).toEqual({ error: 'Confirmá la fecha: salió de la publicación, no del flyer' })
      expect(db.eventUpdates).toHaveLength(0)
    },
  )

  it.each(['true', 1, {}])(
    'confirm_date truthy pero distinto de `true` (%j) tampoco saltea la guarda de borrador viejo / flyer coincidente',
    async (confirmDate) => {
      const db = setup(
        [baseEvent({ scrape_source_key: 'instagram-ai', ai_metadata: null, start_date: '2029-05-10T03:00:00.000Z' })],
        { [EVENT_ID]: [{ published_at: '2029-05-10T03:00:00.000Z' }] },
      )
      const res = await publishDraftEvent(EVENT_ID, {
        title: TITULO,
        start_date: '2030-06-15',
        confirm_date: confirmDate as unknown as boolean,
      })
      expect(res).toEqual({ error: 'Confirmá la fecha: salió de la publicación, no del flyer' })
      expect(db.eventUpdates).toHaveLength(0)
    },
  )
})
