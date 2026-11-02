/**
 * GET /api/cron/notificaciones con teléfonos SIN cuenta (R82 / Q4-2). Sin red
 * ni base: un doble de Supabase que SÍ respeta `.is(col, null)`,
 * `.not(col, 'is', null)` e `.in(col, ids)`, y `fetch` falso para Expo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saltaWallClockToDate, saltaWallClockToUtcISO } from '@qps/core/date-format'
import { claveDedupePatrocinado, semanaSalta } from '@qps/core/notificaciones/reglas'

const createAdminClient = vi.fn()
const withJobRun = vi.fn()
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: (...a: unknown[]) => createAdminClient(...a) }))
vi.mock('@/lib/job-runs', () => ({
  withJobRun: (...a: unknown[]) => withJobRun(...a),
  jobTriggerFrom: () => 'test',
}))

import { GET } from '@/app/api/cron/notificaciones/route'

type Row = Record<string, unknown>

const SECRETO = 'secreto-falso-de-prueba'
const AHORA = saltaWallClockToDate('2030-10-20T20:00:00')
const USER_ID = '10000000-0000-4000-8000-000000000001'
const TOKEN_USUARIO = 'ExponentPushToken[token-del-usuario]'
const ANON_SI = '40000000-0000-4000-8000-0000000000a1'
const ANON_NO = '40000000-0000-4000-8000-0000000000a2'
const TOKEN_ANON_SI = 'ExponentPushToken[anon-con-patrocinados]'
const TOKEN_ANON_NO = 'ExponentPushToken[anon-sin-patrocinados]'
const CAMPANIA_ID = '30000000-0000-4000-8000-000000000002'

function campania(): Row {
  return {
    id: CAMPANIA_ID,
    title: 'Campaña',
    body: 'Cuerpo',
    event_id: '30000000-0000-4000-8000-000000000001',
    starts_at: saltaWallClockToUtcISO('2030-10-19T00:00:00'),
    ends_at: saltaWallClockToUtcISO('2030-10-25T00:00:00'),
    sent_at: null,
    event: { status: 'PUBLISHED' },
  }
}

type Writes = { inserts: Record<string, Row[]>; deletes: Record<string, unknown[]>; rpc: string[] }

function cliente(tablas: Record<string, Row[]>, writes: Writes) {
  return {
    rpc: async (fn: string) => {
      writes.rpc.push(fn)
      return { data: 0, error: null }
    },
    from: (tabla: string) => {
      const filtros: Array<(f: Row) => boolean> = []
      const filas = () => (tablas[tabla] ?? []).filter((f) => filtros.every((p) => p(f)))
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        gt: () => chain,
        gte: () => chain,
        lte: () => chain,
        order: () => chain,
        limit: () => chain,
        is: (col: string, val: unknown) => {
          if (val === null) filtros.push((f) => f[col] == null)
          return chain
        },
        not: (col: string, op: string, val: unknown) => {
          if (op === 'is' && val === null) filtros.push((f) => f[col] != null)
          return chain
        },
        in: (col: string, vals: unknown[]) => {
          filtros.push((f) => vals.includes(f[col]))
          return chain
        },
        range: (desde: number, hasta: number) => Promise.resolve({ data: filas().slice(desde, hasta + 1), error: null }),
        maybeSingle: () => Promise.resolve({ data: filas()[0] ?? null, error: null }),
        insert: (nuevas: Row[]) => {
          writes.inserts[tabla] = [...(writes.inserts[tabla] ?? []), ...nuevas]
          return Promise.resolve({ error: null })
        },
        delete: () => ({
          in: (_c: string, vals: unknown[]) => {
            writes.deletes[tabla] = [...(writes.deletes[tabla] ?? []), ...vals]
            return Promise.resolve({ error: null })
          },
        }),
        update: () => {
          const u: Record<string, unknown> = { eq: () => u, is: () => u, then: (r: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(r) }
          return u
        },
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve({ data: filas(), count: filas().length, error: null }).then(res, rej),
      }
      return chain
    },
  }
}

let writes: Writes
let enviados: string[]

function mockDb(extra: Partial<Record<string, Row[]>> = {}) {
  writes = { inserts: {}, deletes: {}, rpc: [] }
  const base: Record<string, Row[]> = {
    push_tokens: [
      { id: '00000000-0000-4000-8000-000000000a01', user_id: USER_ID, token: TOKEN_USUARIO, avisos_equipo: true, avisos_patrocinados: true },
      { id: ANON_SI, user_id: null, token: TOKEN_ANON_SI, avisos_equipo: true, avisos_patrocinados: true },
      { id: ANON_NO, user_id: null, token: TOKEN_ANON_NO, avisos_equipo: true, avisos_patrocinados: false },
    ],
    // El usuario con cuenta apagó los patrocinados en Cuenta: manda eso, no push_tokens.
    notification_preferences: [
      { user_id: USER_ID, radar_channel: 'email', favorite_reminders: true, follow_news: true, announcements: true, sponsored: false, quiet_start: '23:00', quiet_end: '09:00', daily_cap: 4 },
    ],
    user_favorites: [],
    notification_sends: [],
    job_runs: [],
    user_followed_categories: [],
    user_followed_venues: [],
    user_followed_instagram_accounts: [],
    sponsored_campaigns: [campania()],
    ad_settings: [],
    ...extra,
  }
  createAdminClient.mockReturnValue(cliente(base, writes))
}

const call = () => GET(new Request('http://localhost.test/api/cron/notificaciones', { headers: { authorization: `Bearer ${SECRETO}` } }))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AHORA)
  process.env.CRON_SECRET = SECRETO
  delete process.env.PUSH_ENVIO_REAL
  withJobRun.mockReset()
  withJobRun.mockImplementation(async (_j: string, _t: string, work: () => Promise<unknown>) => work())
  enviados = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: { body?: string }) => {
      if (String(url).includes('/send')) {
        const body = JSON.parse(init.body ?? '[]') as { to: string }[]
        enviados.push(...body.map((m) => m.to))
        return { ok: true, status: 200, json: async () => ({ data: body.map((_, i) => ({ status: 'ok', id: `t-${i}` })) }) } as Response
      }
      const body = JSON.parse(init.body ?? '{}') as { ids: string[] }
      return { ok: true, status: 200, json: async () => ({ data: Object.fromEntries(body.ids.map((id) => [id, { status: 'ok' }])) }) } as Response
    }),
  )
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete process.env.PUSH_ENVIO_REAL
})

describe('cron de notificaciones con teléfonos sin cuenta', () => {
  it('dryRun: el patrocinado va solo al anónimo que lo activó; el usuario con cuenta sigue sus preferencias', async () => {
    mockDb()
    const body = await (await call()).json()
    expect(body.dryRun).toBe(true)
    expect(body.patrocinados).toBe(1)
    expect(body.anonimos).toBe(2)
    expect(writes.rpc).toEqual([]) // dryRun: ni limpieza
  })

  it('modo real: un mensaje al anónimo, registrado con push_token_id y user_id nulo; limpieza enganchada', async () => {
    process.env.PUSH_ENVIO_REAL = '1'
    mockDb()
    const body = await (await call()).json()
    expect(enviados).toEqual([TOKEN_ANON_SI])
    expect(writes.inserts.notification_sends).toEqual([
      expect.objectContaining({ user_id: null, push_token_id: ANON_SI, kind: 'patrocinado', campaign_id: CAMPANIA_ID }),
    ])
    expect(writes.rpc).toEqual(['purge_notification_sends', 'purge_push_tokens_anonimos'])
    expect(body.enviosPurgados).toBe(0)
    expect(body.anonimosPurgados).toBe(0)

    // job_runs: solo conteos, nunca tokens ni ids.
    const toOutcome = withJobRun.mock.calls[0][3] as (r: unknown) => { details?: Record<string, unknown> }
    const detalles = JSON.stringify(toOutcome({ httpStatus: 200, body }).details)
    expect(detalles).toContain('"anonimos":2')
    for (const secreto of [TOKEN_ANON_SI, TOKEN_ANON_NO, ANON_SI, ANON_NO, USER_ID]) expect(detalles).not.toContain(secreto)
  })

  it('tope semanal del patrocinado por id de token: si ya lo recibió esta semana, no sale otro', async () => {
    process.env.PUSH_ENVIO_REAL = '1'
    mockDb({
      notification_sends: [
        {
          user_id: null,
          push_token_id: ANON_SI,
          dedupe_key: claveDedupePatrocinado(ANON_SI, semanaSalta(AHORA)),
          sent_at: saltaWallClockToUtcISO('2030-10-19T20:00:00'),
        },
      ],
    })
    await call()
    expect(enviados).toEqual([])
  })

  it('un token inválido de un anónimo también se borra', async () => {
    process.env.PUSH_ENVIO_REAL = '1'
    mockDb()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: { body?: string }) => {
        const body = JSON.parse(init.body ?? '[]') as { to: string }[]
        if (String(url).includes('/send')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ data: body.map(() => ({ status: 'error', message: 'x', details: { error: 'DeviceNotRegistered' } })) }),
          } as Response
        }
        return { ok: true, status: 200, json: async () => ({ data: {} }) } as Response
      }),
    )
    await call()
    expect(writes.deletes.push_tokens).toEqual([TOKEN_ANON_SI])
  })

  it('sin usuarios con cuenta pero con anónimos: la tanda corre igual', async () => {
    mockDb({
      push_tokens: [{ id: ANON_SI, user_id: null, token: TOKEN_ANON_SI, avisos_equipo: true, avisos_patrocinados: true }],
    })
    const body = await (await call()).json()
    expect(body.patrocinados).toBe(1)
  })
})
