// Sin red ni base. publishDraftEvent usa dos clientes:
//  - createClient() de '@/lib/supabase/server' (sesión: getUser + profiles)
//  - getPrivilegedClient(), que llama a createClient() de '@supabase/supabase-js'
//    directo con las variables de entorno de service role (no pasa por lib/supabase/server).
// Las dos van mockeadas. Fechas y hora via las funciones puras reales (saltaWallClockToUtcISO,
// isVigente, mergedIntoId): no hace falta mockearlas.
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
import { saltaWallClockToUtcISO } from '@/lib/date-format'

type Row = Record<string, unknown>

const EVENT_ID = '11111111-1111-4111-8111-111111111111'
const MERGED_TARGET_ID = '22222222-2222-4222-8222-222222222222'
const ADMIN_USER = { id: 'admin-de-prueba' }

function baseEvent(overrides: Row = {}): Row {
  return {
    id: EVENT_ID,
    title: 'Borrador de Prueba',
    status: 'DRAFT',
    ai_metadata: null,
    end_date: null,
    ...overrides,
  }
}

/** Cliente de sesión falso: getUser() + profiles.role. */
function sessionClient(user: { id: string } | null, role: string | null) {
  return {
    auth: { getUser: async () => ({ data: { user } }) },
    from: (table: string) => {
      if (table !== 'profiles') throw new Error('tabla inesperada en el cliente de sesión: ' + table)
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: role !== null ? { role } : null }),
          }),
        }),
      }
    },
  }
}

/** Cliente de service role falso: tablas `events` e `instagram_flyers` en memoria. */
function fakeAdminClient(events: Row[]) {
  const store = events.map((e) => ({ ...e }))
  const eventUpdates: Array<{ id: string; payload: Row }> = []
  const flyerUpdates: Array<{ id: string; payload: Row }> = []

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
        let filterId: string | undefined
        let payload: Row = {}
        const c: Record<string, unknown> = {}
        c.update = (p: Row) => {
          payload = p
          return c
        }
        c.eq = (_col: string, val: string) => {
          filterId = val
          return c
        }
        c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
          flyerUpdates.push({ id: filterId as string, payload })
          return Promise.resolve({ error: null }).then(res, rej)
        }
        return c
      }
      throw new Error('tabla inesperada en el cliente admin: ' + table)
    },
  }

  return { client, eventUpdates, flyerUpdates }
}

function setup(events: Row[], user: { id: string } | null = ADMIN_USER, role: string | null = 'ADMIN') {
  createClient.mockResolvedValue(sessionClient(user, role))
  const db = fakeAdminClient(events)
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

describe('publishDraftEvent: guardas del servidor (QPS-068/064/065/060/062)', () => {
  it('título vacío: no publica', async () => {
    const db = setup([baseEvent()])
    const res = await publishDraftEvent(EVENT_ID, { title: '   ', start_date: '2030-06-15' })
    expect(res).toEqual({ error: 'Cambiá el título antes de publicar' })
    expect(db.eventUpdates).toHaveLength(0)
  })

  it.each(['Revisar: Show de Prueba', 'revisar: show de prueba'])(
    'título sin editar "%s" (sin distinguir mayúsculas): no publica',
    async (title) => {
      const db = setup([baseEvent()])
      const res = await publishDraftEvent(EVENT_ID, { title, start_date: '2030-06-15' })
      expect(res).toEqual({ error: 'Cambiá el título antes de publicar' })
      expect(db.eventUpdates).toHaveLength(0)
    },
  )

  it('evento fusionado: no publica', async () => {
    const db = setup([baseEvent({ ai_metadata: { merged_into_event_id: MERGED_TARGET_ID } })])
    const res = await publishDraftEvent(EVENT_ID, { title: 'Título Nuevo de Prueba', start_date: '2030-06-15' })
    expect(res).toEqual({ error: 'Este evento fue fusionado en otro; no se publica' })
    expect(db.eventUpdates).toHaveLength(0)
  })

  it('sin hora: la fecha queda a las 00:00 de Salta, nunca a las 20:00', async () => {
    const db = setup([baseEvent()])
    const res = await publishDraftEvent(EVENT_ID, { title: 'Título Nuevo de Prueba', start_date: '2030-06-15' })
    expect(res).toEqual({ success: true })
    expect(db.eventUpdates).toHaveLength(1)
    const startDate = db.eventUpdates[0].payload.start_date
    expect(startDate).toBe(saltaWallClockToUtcISO('2030-06-15'))
    // 00:00 de Salta (UTC-3) es 03:00 UTC.
    expect(startDate).toBe('2030-06-15T03:00:00.000Z')
    // Nunca el default viejo de 20:00 de Salta (23:00 UTC).
    expect(startDate).not.toBe('2030-06-15T23:00:00.000Z')
  })

  it('is_fallback sin confirm_date: no publica', async () => {
    const db = setup([baseEvent({ ai_metadata: { is_fallback: true } })])
    const res = await publishDraftEvent(EVENT_ID, { title: 'Título Nuevo de Prueba', start_date: '2030-06-15' })
    expect(res).toEqual({ error: 'Confirmá la fecha: salió de la publicación, no del flyer' })
    expect(db.eventUpdates).toHaveLength(0)
  })

  it('is_fallback con confirm_date true: publica', async () => {
    const db = setup([baseEvent({ ai_metadata: { is_fallback: true } })])
    const res = await publishDraftEvent(EVENT_ID, {
      title: 'Título Nuevo de Prueba',
      start_date: '2030-06-15',
      confirm_date: true,
    })
    expect(res).toEqual({ success: true })
    expect(db.eventUpdates).toHaveLength(1)
  })

  it('fecha pasada: no publica', async () => {
    const db = setup([baseEvent()])
    const res = await publishDraftEvent(EVENT_ID, { title: 'Título Nuevo de Prueba', start_date: '2020-01-01' })
    expect(res).toEqual({ error: 'Este evento ya pasó; no se puede publicar' })
    expect(db.eventUpdates).toHaveLength(0)
  })

  it('precio vacío: price_min null', async () => {
    const db = setup([baseEvent()])
    await publishDraftEvent(EVENT_ID, { title: 'Título Nuevo de Prueba', start_date: '2030-06-15' })
    expect(db.eventUpdates[0].payload.price_min).toBeNull()
    expect(db.eventUpdates[0].payload.is_free).toBe(false)
  })

  it('gratis: price_min 0 aunque venga un price_min distinto en el payload', async () => {
    const db = setup([baseEvent()])
    await publishDraftEvent(EVENT_ID, {
      title: 'Título Nuevo de Prueba',
      start_date: '2030-06-15',
      is_free: true,
      price_min: 500,
    })
    expect(db.eventUpdates[0].payload.price_min).toBe(0)
    expect(db.eventUpdates[0].payload.is_free).toBe(true)
  })

  it('precio informado y no gratis: se respeta', async () => {
    const db = setup([baseEvent()])
    await publishDraftEvent(EVENT_ID, {
      title: 'Título Nuevo de Prueba',
      start_date: '2030-06-15',
      price_min: 1500,
    })
    expect(db.eventUpdates[0].payload.price_min).toBe(1500)
  })

  it('usuario no autenticado: no publica y no escribe nada', async () => {
    const db = setup([baseEvent()], null, null)
    const res = await publishDraftEvent(EVENT_ID, { title: 'Título Nuevo de Prueba', start_date: '2030-06-15' })
    expect(res).toEqual({ error: 'No autenticado' })
    expect(db.eventUpdates).toHaveLength(0)
  })

  it('usuario autenticado sin rol admin: no publica y no escribe nada', async () => {
    const db = setup([baseEvent()], { id: 'usuario-de-prueba' }, 'USER')
    const res = await publishDraftEvent(EVENT_ID, { title: 'Título Nuevo de Prueba', start_date: '2030-06-15' })
    expect(res).toEqual({ error: 'No tienes permisos de administrador' })
    expect(db.eventUpdates).toHaveLength(0)
  })

  it('la guarda de fusión se resuelve con el evento de la base, no con lo que diga el payload', async () => {
    const db = setup([baseEvent({ ai_metadata: { merged_into_event_id: MERGED_TARGET_ID } })])
    // El payload no manda ai_metadata en absoluto: no hay forma de "mentir" con un merge, pero
    // tampoco hay forma de que el cliente lo oculte. La guarda tiene que mirar la base igual.
    const res = await publishDraftEvent(EVENT_ID, { title: 'Título Nuevo de Prueba', start_date: '2030-06-15' })
    expect(res).toEqual({ error: 'Este evento fue fusionado en otro; no se publica' })
    expect(db.eventUpdates).toHaveLength(0)
  })

  it('la guarda de is_fallback se resuelve con el evento de la base: el payload no puede mentir con ai_metadata.is_fallback = false', async () => {
    const db = setup([baseEvent({ ai_metadata: { is_fallback: true } })])
    const res = await publishDraftEvent(EVENT_ID, {
      title: 'Título Nuevo de Prueba',
      start_date: '2030-06-15',
      // Miente: en la base el borrador SÍ es is_fallback, pero el payload dice que no y no manda confirm_date.
      ai_metadata: { is_fallback: false },
    })
    expect(res).toEqual({ error: 'Confirmá la fecha: salió de la publicación, no del flyer' })
    expect(db.eventUpdates).toHaveLength(0)
  })
})
