// Ronda 14 / tarea 14-b (QPS-073): la guarda de needsDateConfirmation() dentro de
// publishDraftEvent (lib/admin-actions.ts). Mismo patrón de mocks que
// tests/admin/publish-draft-guards.test.ts (Ronda 11), pero con un fake de cliente admin propio
// que además sabe responder `instagram_flyers.select(...).in(...)` (necesario para los
// borradores viejos sin date_source y para la falla-cerrada; desde la ronda 19,
// `loadFlyersByEvent` consulta con `.in('ai_metadata->>event_id', ids)` en vez de `.eq(...)`,
// una sola consulta para varios eventos). Se prefirió no tocar el fake de la Ronda 11 para no
// arriesgar esos tests ya en verde.
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
import { DATE_CONFIRMATION_CODE } from '@/lib/admin/date-confirmation'

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
 * `select('published_at, ai_metadata').in('ai_metadata->>event_id', eventIds)` (lectura de los
 * flyers de origen, una sola consulta para varios eventos) como `update(...).eq('id', flyerId)`
 * (marcar PROCESSED al publicar).
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
        let payload: Row = {}
        const c: Record<string, unknown> = {}
        c.select = () => c
        c.update = (p: Row) => {
          payload = p
          return c
        }
        // loadFlyersByEvent (lib/admin/date-confirmation.ts) consulta con `.in(...)` una sola
        // vez para varios eventIds, y agrupa el resultado filtrando por `ai_metadata.event_id`
        // (igual que el cliente real de supabase-js, que filtra server-side por
        // `ai_metadata->>event_id`). `flyersByEventId` ya viene indexado por eventId: lo
        // "desindexamos" acá, como si fuera la fila cruda que devolvería Postgres.
        c.in = (_col: string, ids: string[]) => {
          flyersSelectCalls++
          if (flyersError) return Promise.resolve({ data: null, error: flyersError })
          const rows = ids.flatMap((id) =>
            (flyersByEventId[id] ?? []).map((f) => ({
              published_at: f.published_at,
              ai_metadata: { event_id: id },
            })),
          )
          return Promise.resolve({ data: rows, error: null })
        }
        // El código de producción hace `await ....eq(...)` directo (sin .select() final ni
        // .single()) para marcar un flyer PROCESSED al publicar: el builder real de
        // supabase-js es awaitable ("thenable") en ese punto.
        c.eq = (_col: string, val: string) => {
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
    // Ronda 19: cambiar la fecha/hora del formulario respecto de la guardada también cuenta
    // como confirmación, así que para probar que la guarda frena sin `confirm_date` hay que
    // mandar la MISMA fecha que ya tiene el borrador (el default de baseEvent()).
    const res = await publishDraftEvent(EVENT_ID, { title: TITULO, start_date: '2029-01-01T00:00:00.000Z' })
    // Antes se comparaba el objeto completo con toEqual (solo `error`). Ahora la guarda
    // también manda `code`: comparamos el código, no el texto.
    expect(res).toMatchObject({ code: DATE_CONFIRMATION_CODE })
    expect(db.eventUpdates).toHaveLength(0)
  })

  it('date_source "published_at" sin confirm_date pero con otra fecha en el formulario: publica (cambiar la fecha ya cuenta como confirmarla)', async () => {
    const db = setup([baseEvent({ ai_metadata: { date_source: 'published_at' } })])
    const res = await publishDraftEvent(EVENT_ID, { title: TITULO, start_date: '2030-06-15' })
    expect(res).toEqual({ success: true })
    expect(db.eventUpdates).toHaveLength(1)
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
    // Misma fecha que el default de baseEvent(): el punto de este caso es que is_fallback
    // exige confirm_date aunque también haya date_source, no que cambiar la fecha baste (eso
    // ya lo cubre el caso de arriba para date_source "published_at" solo).
    const sinConfirmar = await publishDraftEvent(EVENT_ID, { title: TITULO, start_date: '2029-01-01T00:00:00.000Z' })
    expect(sinConfirmar).toMatchObject({ code: DATE_CONFIRMATION_CODE })
    expect(db.eventUpdates).toHaveLength(0)

    const conConfirmar = await publishDraftEvent(EVENT_ID, {
      title: TITULO,
      start_date: '2029-01-01T00:00:00.000Z',
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
    // Ronda 19: mandamos la MISMA fecha/hora que el borrador ya tiene guardada, para probar
    // que la guarda frena sin `confirm_date` (si mandáramos otra fecha, ahora publicaría: eso
    // se prueba aparte, más abajo).
    const res = await publishDraftEvent(EVENT_ID, { title: TITULO, start_date: '2029-05-10T03:00:00.000Z' })
    expect(res).toMatchObject({ code: DATE_CONFIRMATION_CODE })
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
    // De nuevo, la misma fecha/hora guardada en el payload: lo que hace que la guarda frene
    // acá es el flyer de origen (reason 'legacy'), no un cambio de fecha en el formulario.
    const res = await publishDraftEvent(EVENT_ID, { title: TITULO, start_date: '2029-05-10T03:00:00.000Z' })
    expect(res).toMatchObject({ code: DATE_CONFIRMATION_CODE })
    expect(db.eventUpdates).toHaveLength(0)
  })

  it('borrador viejo (legacy) con un flyer coincidente, pero el admin cambió la hora en el formulario (mismo día): publica igual, sin tildar nada (cambiar la fecha/hora ya cuenta como confirmarla)', async () => {
    const db = setup(
      [baseEvent({ scrape_source_key: 'instagram-ai', ai_metadata: null, start_date: '2029-05-10T03:00:00.000Z' })],
      { [EVENT_ID]: [{ published_at: '2029-05-10T03:00:00.000Z' }] },
    )
    const res = await publishDraftEvent(EVENT_ID, { title: TITULO, start_date: '2029-05-10T23:00:00.000Z' }) // 20:00 Salta: mismo día, otra hora
    expect(res).toEqual({ success: true })
    expect(db.eventUpdates).toHaveLength(1)
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
      // Mismo start_date que el default de baseEvent(): sin esto, cambiar la fecha ya cuenta
      // como confirmación (ronda 19) y este caso dejaría de probar la falla cerrada.
      const res = await publishDraftEvent(EVENT_ID, { title: TITULO, start_date: '2029-01-01T00:00:00.000Z' })
      expect(res).toMatchObject({ code: DATE_CONFIRMATION_CODE })
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
    // Misma fecha/hora guardada: lo que frena acá es el flyer coincidente, no un cambio de
    // fecha en el formulario.
    const res = await publishDraftEvent(EVENT_ID, { title: TITULO, start_date: '2029-05-10T03:00:00.000Z' })
    expect(res).toMatchObject({ code: DATE_CONFIRMATION_CODE })
    expect(db.eventUpdates).toHaveLength(0)
  })

  it.each(['true', 1, {}])(
    'confirm_date truthy pero distinto de `true` (%j) no saltea la guarda de date_source',
    async (confirmDate) => {
      const db = setup([baseEvent({ ai_metadata: { date_source: 'published_at' } })])
      // Misma fecha/hora guardada (default de baseEvent()): si mandáramos otra, cambiar la
      // fecha ya alcanzaría para publicar y este caso dejaría de probar que un confirm_date
      // "truthy pero no true" no sirve.
      const res = await publishDraftEvent(EVENT_ID, {
        title: TITULO,
        start_date: '2029-01-01T00:00:00.000Z',
        confirm_date: confirmDate as unknown as boolean,
      })
      expect(res).toMatchObject({ code: DATE_CONFIRMATION_CODE })
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
        start_date: '2029-05-10T03:00:00.000Z',
        confirm_date: confirmDate as unknown as boolean,
      })
      expect(res).toMatchObject({ code: DATE_CONFIRMATION_CODE })
      expect(db.eventUpdates).toHaveLength(0)
    },
  )
})
