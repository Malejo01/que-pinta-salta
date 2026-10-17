/**
 * GET /api/cron/notificaciones (R39, tarea 39-d). Sin red ni base: el
 * cliente de Supabase es un doble (`createAdminClient` mockeado) y `fetch`
 * también (los `POST` a la API de Expo que hacen `enviarLote`/`leerReceipts`
 * de verdad, sin mockear esas dos funciones).
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

const URL_RUTA = 'http://localhost.test/api/cron/notificaciones'
const SECRETO = 'secreto-falso-de-prueba'
const entornoSecreto = process.env.CRON_SECRET
const entornoEnvioReal = process.env.PUSH_ENVIO_REAL

const USER_ID = '10000000-0000-4000-8000-000000000001'
const EVENT_ID = '20000000-0000-4000-8000-000000000001'
const TOKEN_A = 'ExponentPushToken[token-a-de-prueba]'
const TOKEN_B = 'ExponentPushToken[token-b-de-prueba]'

// 20:00 en Salta: fuera del horario de silencio por defecto (23:00-09:00).
const AHORA = saltaWallClockToDate('2030-10-20T20:00:00')
// 21:00 en Salta: con hora explícita, el recordatorio sale 3 h antes (18:00),
// que ya pasó respecto de AHORA (20:00): el favorito está "due".
const EVENTO_START = saltaWallClockToUtcISO('2030-10-20T21:00:00')

function favoritoRow(userId: string, overrides: Row = {}): Row {
  return {
    user_id: userId,
    event_id: EVENT_ID,
    events: { title: 'Show de Prueba', start_date: EVENTO_START, end_date: null, status: 'PUBLISHED' },
    ...overrides,
  }
}

type Writes = { inserts: Record<string, Row[]>; deletes: Record<string, unknown[]> }

function fakeClient(tables: Record<string, Row[]>, writes: Writes) {
  return {
    from: (table: string) => {
      const rows = tables[table] ?? []
      const chain: Record<string, unknown> = {
        select: () => chain,
        in: () => chain,
        not: () => chain,
        delete: () => ({
          in: (_col: string, vals: unknown[]) => {
            writes.deletes[table] = [...(writes.deletes[table] ?? []), ...vals]
            return Promise.resolve({ error: null })
          },
        }),
        insert: (newRows: Row[]) => {
          writes.inserts[table] = [...(writes.inserts[table] ?? []), ...newRows]
          return Promise.resolve({ error: null })
        },
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve({ data: rows, error: null }).then(res, rej),
      }
      return chain
    },
  }
}

type Ticket = { status: string; id?: string; message?: string; details?: { error?: string } }

/** Por defecto, cada token manda un ticket `ok`. Los tests que necesitan un `DeviceNotRegistered` lo pisan. */
let armarTickets: (tokens: string[]) => Ticket[] = (tokens) => tokens.map((_, i) => ({ status: 'ok', id: `ticket-${i}` }))

function fetchFalso() {
  return vi.fn(async (url: string, init: { body?: string }) => {
    const u = String(url)
    if (u.includes('/send')) {
      const body = JSON.parse(init.body ?? '[]') as { to: string }[]
      const tickets = armarTickets(body.map((m) => m.to))
      return { ok: true, status: 200, json: async () => ({ data: tickets }) } as Response
    }
    if (u.includes('/getReceipts')) {
      const body = JSON.parse(init.body ?? '{}') as { ids: string[] }
      const data = Object.fromEntries(body.ids.map((id) => [id, { status: 'ok' }]))
      return { ok: true, status: 200, json: async () => ({ data }) } as Response
    }
    throw new Error('url inesperada en el fetch falso: ' + u)
  })
}

let writes: Writes
let fetchMock: ReturnType<typeof fetchFalso>

function mockDb(tables: Partial<Record<string, Row[]>> = {}) {
  writes = { inserts: {}, deletes: {} }
  const base: Record<string, Row[]> = {
    push_tokens: [{ user_id: USER_ID, token: TOKEN_A }],
    notification_preferences: [],
    user_favorites: [favoritoRow(USER_ID)],
    notification_sends: [],
    ...tables,
  }
  createAdminClient.mockReturnValue(fakeClient(base, writes))
}

const call = (headers: Record<string, string> = { authorization: `Bearer ${SECRETO}` }) =>
  GET(new Request(URL_RUTA, { headers }))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AHORA)
  process.env.CRON_SECRET = SECRETO
  delete process.env.PUSH_ENVIO_REAL
  armarTickets = (tokens) => tokens.map((_, i) => ({ status: 'ok', id: `ticket-${i}` }))
  createAdminClient.mockReset()
  withJobRun.mockReset()
  withJobRun.mockImplementation(async (_job: string, _trigger: string, work: () => Promise<unknown>) => work())
  fetchMock = fetchFalso()
  vi.stubGlobal('fetch', fetchMock)
  mockDb()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  if (entornoSecreto === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = entornoSecreto
  if (entornoEnvioReal === undefined) delete process.env.PUSH_ENVIO_REAL
  else process.env.PUSH_ENVIO_REAL = entornoEnvioReal
})

describe('GET /api/cron/notificaciones: autenticación', () => {
  it('sin el secreto: 401 y no lee nada (ni job_runs, ni un cliente admin)', async () => {
    const res = await GET(new Request(URL_RUTA))
    expect(res.status).toBe(401)
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(withJobRun).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('con un CRON_SECRET incorrecto: 401', async () => {
    const res = await call({ authorization: 'Bearer otro-secreto-de-prueba' })
    expect(res.status).toBe(401)
    expect(createAdminClient).not.toHaveBeenCalled()
  })
})

describe('GET /api/cron/notificaciones: dryRun (PUSH_ENVIO_REAL distinto de "1")', () => {
  it('sin PUSH_ENVIO_REAL definida: dryRun, cero fetch y cero escrituras', async () => {
    const res = await call()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.dryRun).toBe(true)
    expect(body.mensajes).toBe(1)
    expect(body.porTipo).toEqual({ favorito: 1 })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(writes.inserts.notification_sends ?? []).toHaveLength(0)
    expect(writes.deletes.push_tokens ?? []).toHaveLength(0)
  })

  it.each(['0', 'true', 'false', ''])('PUSH_ENVIO_REAL=%j también es dryRun', async (valor) => {
    process.env.PUSH_ENVIO_REAL = valor
    const res = await call()
    const body = await res.json()
    expect(body.dryRun).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(writes.inserts.notification_sends ?? []).toHaveLength(0)
    expect(writes.deletes.push_tokens ?? []).toHaveLength(0)
  })
})

describe('GET /api/cron/notificaciones: PUSH_ENVIO_REAL="1"', () => {
  it('manda de verdad y, si el envío salió bien, registra en notification_sends (caso ya existente)', async () => {
    process.env.PUSH_ENVIO_REAL = '1'
    // armarTickets por default (ver beforeEach): todos los tickets vuelven "ok".

    const res = await call()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.dryRun).toBe(false)
    expect(body.mensajes).toBe(1)

    expect(writes.inserts.notification_sends).toHaveLength(1)
    expect(writes.inserts.notification_sends[0]).toMatchObject({
      user_id: USER_ID,
      kind: 'favorito',
      channel: 'push',
      status: 'SUCCESS',
      event_id: EVENT_ID,
    })
    expect(typeof writes.inserts.notification_sends[0].dedupe_key).toBe('string')
    expect(body.enviosNoRegistradosPorFalla).toBe(0)
  })

  it('arreglo 3 (R39): el único ticket de un dedupeKey vuelve con error — no se inserta fila (se reintenta la próxima corrida), pero el token igual se borra si es DeviceNotRegistered', async () => {
    process.env.PUSH_ENVIO_REAL = '1'
    armarTickets = () => [{ status: 'error', message: 'no registrado', details: { error: 'DeviceNotRegistered' } }]

    const res = await call()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.dryRun).toBe(false)
    expect(body.mensajes).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(1) // solo /send: sin tickets "ok" no hay ids para /getReceipts

    // La fila NO se inserta: el status 'SUCCESS' no puede mentir sobre un
    // envío que en realidad falló, y como no queda registrada, la corrida
    // siguiente la vuelve a intentar (dedupeKeysYaEnviados no la va a tener).
    expect(writes.inserts.notification_sends ?? []).toHaveLength(0)
    expect(body.enviosNoRegistradosPorFalla).toBe(1)

    // El borrado del token es independiente de si se pudo registrar el envío.
    expect(writes.deletes.push_tokens).toEqual([TOKEN_A])
  })

  it('arreglo 3 (R39): un dedupeKey con dos tokens, uno ok y uno con error, SÍ se inserta (alcanza con un ticket ok)', async () => {
    process.env.PUSH_ENVIO_REAL = '1'
    mockDb({ push_tokens: [{ user_id: USER_ID, token: TOKEN_A }, { user_id: USER_ID, token: TOKEN_B }] })
    armarTickets = (tokens) =>
      tokens.map((_, i) => (i === 0 ? { status: 'ok', id: `ticket-${i}` } : { status: 'error', message: 'algo salió mal' }))

    const res = await call()
    const body = await res.json()
    expect(body.mensajes).toBe(2)
    expect(writes.inserts.notification_sends).toHaveLength(1)
    expect(body.enviosNoRegistradosPorFalla).toBe(0)
    expect(writes.deletes.push_tokens ?? []).toHaveLength(0) // el error no es DeviceNotRegistered: no se borra nada
  })

  it('dos tokens del mismo usuario: dos mensajes pero una sola fila en notification_sends (los dos tickets salen ok)', async () => {
    process.env.PUSH_ENVIO_REAL = '1'
    mockDb({ push_tokens: [{ user_id: USER_ID, token: TOKEN_A }, { user_id: USER_ID, token: TOKEN_B }] })

    const res = await call()
    const body = await res.json()
    expect(body.mensajes).toBe(2)
    expect(writes.inserts.notification_sends).toHaveLength(1)
    expect(writes.deletes.push_tokens ?? []).toHaveLength(0)
  })

  it('la respuesta no contiene ningún token ni ningún email', async () => {
    process.env.PUSH_ENVIO_REAL = '1'
    mockDb({ push_tokens: [{ user_id: USER_ID, token: TOKEN_A }, { user_id: USER_ID, token: TOKEN_B }] })

    const res = await call()
    const texto = JSON.stringify(await res.json())
    expect(texto).not.toContain(TOKEN_A)
    expect(texto).not.toContain(TOKEN_B)
    expect(texto).not.toContain('@')
    expect(texto).not.toContain(USER_ID)
  })
})
