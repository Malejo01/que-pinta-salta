/**
 * 58-e: la pausa del push patrocinado y `destinatarios` en GET
 * /api/cron/notificaciones. Sin red ni base: el cliente de Supabase es un
 * doble (copia reducida del de tests/cron/notificaciones.test.ts) y `fetch`
 * también. Tokens y ids inventados.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saltaWallClockToDate, saltaWallClockToUtcISO } from '@qps/core/date-format'

const createAdminClient = vi.fn()
const withJobRun = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: (...a: unknown[]) => createAdminClient(...a),
}))
vi.mock('@/lib/job-runs', () => ({
  withJobRun: (...a: unknown[]) => withJobRun(...a),
  jobTriggerFrom: () => 'test',
}))

import { GET } from '@/app/api/cron/notificaciones/route'

type Row = Record<string, unknown>
type Update = { values: Row; llamadas: { metodo: string; args: unknown[] }[] }

const SECRETO = 'secreto-falso-de-prueba'
const USER_ID = '10000000-0000-4000-8000-000000000001'
const EVENT_ID = '20000000-0000-4000-8000-000000000001'
const EVENT_ID_PATROCINADO = '30000000-0000-4000-8000-000000000001'
const CAMPANIA_ID = '30000000-0000-4000-8000-000000000002'
const TOKEN = 'ExponentPushToken[de-prueba-a]'
const MOTIVO_PAUSA = 'MOTIVO-SECRETO-DE-LA-PAUSA'
const PAUSADO_AT = '2030-10-19T10:00:00.000Z'

const AHORA = saltaWallClockToDate('2030-10-20T20:00:00')
const EVENTO_START = saltaWallClockToUtcISO('2030-10-20T21:00:00')

const entornoSecreto = process.env.CRON_SECRET
const entornoEnvioReal = process.env.PUSH_ENVIO_REAL

function campaniaRow(overrides: Row = {}): Row {
  return {
    id: CAMPANIA_ID,
    title: 'Campaña de Prueba',
    body: 'Cuerpo de la campaña de prueba',
    event_id: EVENT_ID_PATROCINADO,
    starts_at: saltaWallClockToUtcISO('2030-10-19T00:00:00'),
    ends_at: saltaWallClockToUtcISO('2030-10-25T00:00:00'),
    sent_at: null,
    destinatarios: 0,
    event: { status: 'PUBLISHED' },
    ...overrides,
  }
}

const favoritoRow = (): Row => ({
  user_id: USER_ID,
  event_id: EVENT_ID,
  events: { title: 'Show de Prueba', start_date: EVENTO_START, end_date: null, status: 'PUBLISHED' },
})

const prefRow = (): Row => ({
  user_id: USER_ID,
  radar_channel: 'email',
  favorite_reminders: true,
  follow_news: true,
  announcements: false,
  sponsored: true,
  quiet_start: '23:00:00',
  quiet_end: '09:00:00',
  daily_cap: 4,
})

let updates: Record<string, Update[]>
let inserts: Record<string, Row[]>
let fetchMock: ReturnType<typeof vi.fn>

/** `counts[tabla]` es el `count` que devuelve un `select(..., { count: 'exact', head: true })` de esa tabla. */
function mockDb(
  tables: Record<string, Row[]> = {},
  opciones: { errors?: Record<string, string>; counts?: Record<string, number> } = {},
) {
  updates = {}
  inserts = {}
  const errors = opciones.errors ?? {}
  const counts = opciones.counts ?? {}
  const base: Record<string, Row[]> = {
    push_tokens: [{ id: '00000000-0000-4000-8000-000000000a01', user_id: USER_ID, token: TOKEN }],
    notification_preferences: [prefRow()],
    user_favorites: [favoritoRow()],
    notification_sends: [],
    job_runs: [],
    user_followed_categories: [],
    user_followed_venues: [],
    user_followed_instagram_accounts: [],
    sponsored_campaigns: [campaniaRow()],
    ad_settings: [],
    ...tables,
  }
  createAdminClient.mockReturnValue({
    from: (table: string) => {
      const rows = base[table] ?? []
      const chain: Record<string, unknown> = {}
      for (const nombre of ['select', 'eq', 'in', 'not', 'gt', 'gte', 'lte', 'order', 'range', 'is']) chain[nombre] = () => chain
      chain.maybeSingle = () => {
        const mensaje = errors[table]
        return Promise.resolve(mensaje ? { data: null, error: { message: mensaje } } : { data: rows[0] ?? null, error: null })
      }
      chain.delete = () => ({ in: () => Promise.resolve({ error: null }) })
      chain.update = (values: Row) => {
        const u: Update = { values, llamadas: [] }
        updates[table] = [...(updates[table] ?? []), u]
        const c: Record<string, unknown> = {
          eq: (...args: unknown[]) => (u.llamadas.push({ metodo: 'eq', args }), c),
          is: (...args: unknown[]) => (u.llamadas.push({ metodo: 'is', args }), c),
          then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
            const mensaje = errors[`${table}:update`]
            return Promise.resolve(mensaje ? { error: { message: mensaje } } : { error: null }).then(res, rej)
          },
        }
        return c
      }
      chain.insert = (nuevas: Row[]) => {
        inserts[table] = [...(inserts[table] ?? []), ...nuevas]
        return Promise.resolve({ error: null })
      }
      chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
        const mensaje = errors[table]
        const resultado = mensaje
          ? { data: null, count: null, error: { message: mensaje } }
          : { data: rows, count: counts[table] ?? rows.length, error: null }
        return Promise.resolve(resultado).then(res, rej)
      }
      return chain
    },
  })
}

const call = () => GET(new Request('http://localhost.test/api/cron/notificaciones', { headers: { authorization: `Bearer ${SECRETO}` } }))

/** El `details` que quedaría en job_runs, vía el `toOutcome` que la ruta le pasa a `withJobRun`. */
function detailsDe(status: number, body: unknown, llamada = 0): Record<string, unknown> {
  const toOutcome = withJobRun.mock.calls[llamada][3] as (r: unknown) => { details?: Record<string, unknown> }
  return toOutcome({ httpStatus: status, body }).details ?? {}
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AHORA)
  process.env.CRON_SECRET = SECRETO
  delete process.env.PUSH_ENVIO_REAL
  createAdminClient.mockReset()
  withJobRun.mockReset()
  withJobRun.mockImplementation(async (_job: string, _trigger: string, work: () => Promise<unknown>) => work())
  fetchMock = vi.fn(async (url: string, init: { body?: string }) => {
    if (String(url).includes('/send')) {
      const body = JSON.parse(init.body ?? '[]') as { to: string }[]
      return { ok: true, status: 200, json: async () => ({ data: body.map((_, i) => ({ status: 'ok', id: `ticket-${i}` })) }) } as Response
    }
    const body = JSON.parse(init.body ?? '{}') as { ids: string[] }
    return { ok: true, status: 200, json: async () => ({ data: Object.fromEntries(body.ids.map((id) => [id, { status: 'ok' }])) }) } as Response
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  if (entornoSecreto === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = entornoSecreto
  if (entornoEnvioReal === undefined) delete process.env.PUSH_ENVIO_REAL
  else process.env.PUSH_ENVIO_REAL = entornoEnvioReal
})

describe('58-e: la pausa del push patrocinado', () => {
  it('con la pausa activa y una campaña vigente: cero patrocinados, los favoritos salen igual y details.patrocinadoPausado', async () => {
    mockDb({ ad_settings: [{ push_patrocinado_pausado_at: PAUSADO_AT, push_patrocinado_pausa_motivo: MOTIVO_PAUSA }] })

    const res = await call()
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.porTipo.patrocinado).toBeUndefined()
    expect(body.porTipo.favorito).toBe(1)
    expect(body.patrocinados).toBe(0)
    expect(body.patrocinadoPausado).toBe(true)
    expect(detailsDe(res.status, body).patrocinadoPausado).toBe(true)
  })

  it('con la pausa activa en modo real: sale el favorito, ningún mensaje ni fila patrocinada, y no se toca la campaña', async () => {
    process.env.PUSH_ENVIO_REAL = '1'
    mockDb({ ad_settings: [{ push_patrocinado_pausado_at: PAUSADO_AT }] })

    const res = await call()
    const body = await res.json()
    expect(body.mensajes).toBe(1)
    expect(inserts.notification_sends.every((f) => f.kind !== 'patrocinado')).toBe(true)
    expect(updates.sponsored_campaigns ?? []).toHaveLength(0)
  })

  it('con la lectura de ad_settings en error: falla cerrado (cero patrocinados), el resto sale y details.patrocinadoPausaIlegible', async () => {
    mockDb({}, { errors: { ad_settings: 'conexión perdida' } })

    const res = await call()
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.porTipo.patrocinado).toBeUndefined()
    expect(body.porTipo.favorito).toBe(1)
    expect(body.patrocinadoPausaIlegible).toBe(true)
    const details = detailsDe(res.status, body)
    expect(details.patrocinadoPausaIlegible).toBe(true)
    expect(details.patrocinadoPausado).toBeUndefined()
  })

  it('sin pausa (push_patrocinado_pausado_at nulo): el patrocinado sale como en la R51', async () => {
    mockDb({ ad_settings: [{ push_patrocinado_pausado_at: null }], user_favorites: [] })

    const res = await call()
    const body = await res.json()
    expect(body.porTipo.patrocinado).toBe(1)
    expect(body.patrocinados).toBe(1)
    expect(body.campaniaId).toBe(CAMPANIA_ID)
    expect(body.patrocinadoPausado).toBeUndefined()
    expect(body.patrocinadoPausaIlegible).toBeUndefined()
  })

  it('sin fila de ad_settings: tampoco hay pausa', async () => {
    mockDb({ ad_settings: [], user_favorites: [] })

    const body = await (await call()).json()
    expect(body.porTipo.patrocinado).toBe(1)
  })
})

describe('58-e: destinatarios de la campaña', () => {
  it('modo real: después del envío, destinatarios es el count de notification_sends de la campaña', async () => {
    process.env.PUSH_ENVIO_REAL = '1'
    mockDb({ user_favorites: [] }, { counts: { notification_sends: 7 } })

    const res = await call()
    expect(res.status).toBe(200)
    const porCampania = updates.sponsored_campaigns
    // El update de sent_at (R51) y el de destinatarios.
    expect(porCampania).toHaveLength(2)
    expect(porCampania[0].values).toHaveProperty('sent_at')
    expect(porCampania[1].values).toEqual({ destinatarios: 7 })
    expect(porCampania[1].llamadas).toContainEqual({ metodo: 'eq', args: ['id', CAMPANIA_ID] })
  })

  it('dos corridas seguidas: el mismo número, no el doble (se recuenta, no se suma)', async () => {
    process.env.PUSH_ENVIO_REAL = '1'
    mockDb({ user_favorites: [] }, { counts: { notification_sends: 7 } })
    await call()
    // Segunda corrida: la campaña ya trae lo guardado por la primera.
    mockDb({ user_favorites: [], sponsored_campaigns: [campaniaRow({ sent_at: PAUSADO_AT, destinatarios: 7 })] }, { counts: { notification_sends: 7 } })
    await call()

    const escritos = (updates.sponsored_campaigns ?? []).map((u) => u.values.destinatarios).filter((d) => d !== undefined)
    expect(escritos.every((d) => d === 7)).toBe(true)
    // `mockDb` reinicia `updates`: la segunda corrida, con el mismo recuento, no escribe.
    expect(escritos).toHaveLength(0)
  })

  it('una tanda posterior (sent_at ya marcado) con más gente: recuenta y actualiza destinatarios', async () => {
    process.env.PUSH_ENVIO_REAL = '1'
    mockDb(
      { user_favorites: [], sponsored_campaigns: [campaniaRow({ sent_at: PAUSADO_AT, destinatarios: 7 })] },
      { counts: { notification_sends: 9 } },
    )

    await call()
    expect(updates.sponsored_campaigns).toHaveLength(1)
    expect(updates.sponsored_campaigns[0].values).toEqual({ destinatarios: 9 })
  })

  it('dryRun: ni update de destinatarios ni de sent_at', async () => {
    mockDb({ user_favorites: [] }, { counts: { notification_sends: 7 } })

    const body = await (await call()).json()
    expect(body.dryRun).toBe(true)
    expect(updates.sponsored_campaigns ?? []).toHaveLength(0)
    expect(inserts.notification_sends ?? []).toHaveLength(0)
  })

  it('si el update de destinatarios falla: no tumba la corrida, va a details como código', async () => {
    process.env.PUSH_ENVIO_REAL = '1'
    mockDb(
      { user_favorites: [], sponsored_campaigns: [campaniaRow({ sent_at: PAUSADO_AT })] },
      { errors: { 'sponsored_campaigns:update': 'detalle-interno-de-la-base' }, counts: { notification_sends: 3 } },
    )

    const res = await call()
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.destinatariosError).toBe('update')
    const details = detailsDe(res.status, body)
    expect(details.destinatariosError).toBe('update')
    expect(JSON.stringify(details)).not.toContain('detalle-interno-de-la-base')
  })

  it('si el count de notification_sends falla: no tumba la corrida y no escribe destinatarios', async () => {
    process.env.PUSH_ENVIO_REAL = '1'
    // El error afecta a las lecturas de notification_sends: se hace fallar solo el count
    // dejando que la lectura previa pase (primera llamada de la tabla ok, siguientes con error).
    mockDb({ user_favorites: [], sponsored_campaigns: [campaniaRow({ sent_at: PAUSADO_AT })] }, { counts: { notification_sends: 3 } })
    const clienteOk = createAdminClient()
    let llamadasSends = 0
    createAdminClient.mockReturnValue({
      from: (tabla: string) => {
        const t = clienteOk.from(tabla)
        if (tabla !== 'notification_sends') return t
        llamadasSends += 1
        // 1.ª: lectura de la tanda (ok). 2.ª: insert. 3.ª: el count (con error).
        if (llamadasSends < 3) return t
        t.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve({ data: null, count: null, error: { message: 'x' } }).then(res, rej)
        return t
      },
    })

    const res = await call()
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.destinatariosError).toBe('count')
    expect(updates.sponsored_campaigns ?? []).toHaveLength(0)
  })
})

describe('58-e: los details no filtran datos', () => {
  it('con la pausa activa, ni el motivo ni nada con forma de uuid en details ni en la respuesta', async () => {
    mockDb({ ad_settings: [{ push_patrocinado_pausado_at: PAUSADO_AT, push_patrocinado_pausa_motivo: MOTIVO_PAUSA }] })

    const res = await call()
    const body = await res.json()
    const texto = JSON.stringify(detailsDe(res.status, body))
    expect(texto).not.toContain(MOTIVO_PAUSA)
    expect(texto).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
    expect(JSON.stringify(body)).not.toContain(MOTIVO_PAUSA)
  })

  it('en modo real con campaña, details no tiene el motivo ni el id del usuario ni del token', async () => {
    process.env.PUSH_ENVIO_REAL = '1'
    mockDb({ user_favorites: [], ad_settings: [{ push_patrocinado_pausado_at: null, push_patrocinado_pausa_motivo: MOTIVO_PAUSA }] }, { counts: { notification_sends: 1 } })

    const res = await call()
    const texto = JSON.stringify(detailsDe(res.status, await res.json()))
    expect(texto).not.toContain(MOTIVO_PAUSA)
    expect(texto).not.toContain(USER_ID)
    expect(texto).not.toContain(TOKEN)
  })
})
