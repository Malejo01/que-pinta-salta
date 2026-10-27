/**
 * GET /api/cron/notificaciones (R39, tarea 39-d). Sin red ni base: el
 * cliente de Supabase es un doble (`createAdminClient` mockeado) y `fetch`
 * también (los `POST` a la API de Expo que hacen `enviarLote`/`leerReceipts`
 * de verdad, sin mockear esas dos funciones).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saltaWallClockToDate, saltaWallClockToUtcISO } from '@qps/core/date-format'
import { claveDedupe } from '@qps/core/notificaciones/reglas'

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

// Usuarios con un token de forma inválida (no matchea EXPO_PUSH_TOKEN_REGEX):
// `enviarLote` los descarta ANTES de mandar nada a Expo, así que nunca
// generan un ticket. Si el emparejamiento ticket↔mensaje de route.ts se
// corriera (ver el test "arreglo 3 (R39): el filtro..." más abajo), un
// ticket real terminaría atribuido a uno de ellos.
const USER_ID_TOKEN_INVALIDO = '10000000-0000-4000-8000-000000000002'
const USER_ID_TOKEN_INVALIDO_2 = '10000000-0000-4000-8000-000000000003'
const TOKEN_FORMA_INVALIDA = 'no-tiene-forma-de-token-de-expo'
const TOKEN_FORMA_INVALIDA_2 = 'tampoco-esta'

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

// D2/Ronda 51, 51-b: avisos patrocinados. Una campaña vigente durante AHORA
// (20:00 de Salta del 2030-10-20), con su evento PUBLISHED por defecto.
const EVENT_ID_PATROCINADO = '30000000-0000-4000-8000-000000000001'
const CAMPANIA_ID = '30000000-0000-4000-8000-000000000002'

function campaniaRow(overrides: Row = {}): Row {
  return {
    id: CAMPANIA_ID,
    title: 'Campaña de Prueba',
    body: 'Cuerpo de la campaña de prueba',
    event_id: EVENT_ID_PATROCINADO,
    starts_at: saltaWallClockToUtcISO('2030-10-19T00:00:00'),
    ends_at: saltaWallClockToUtcISO('2030-10-25T00:00:00'),
    sent_at: null,
    event: { status: 'PUBLISHED' },
    ...overrides,
  }
}

function prefRow(userId: string, overrides: Row = {}): Row {
  return {
    user_id: userId,
    radar_channel: 'email',
    favorite_reminders: true,
    follow_news: true,
    announcements: false,
    sponsored: true,
    quiet_start: '23:00:00',
    quiet_end: '09:00:00',
    daily_cap: 4,
    ...overrides,
  }
}

type EntradaUpdate = { values: Row; llamadas: Llamada[] }
type Writes = { inserts: Record<string, Row[]>; deletes: Record<string, unknown[]>; updates: Record<string, EntradaUpdate[]> }

/** Una llamada a un método de filtro (`.eq()`, `.in()`, `.gt()`, ...) registrada por `fakeClient`, para los tests que necesitan afirmar QUÉ se pidió, no solo qué volvió. */
type Llamada = { metodo: string; args: unknown[] }
type RegistroTabla = { columnas?: string; llamadas: Llamada[] }
type Queries = Record<string, RegistroTabla[]>

/**
 * Ignora los filtros de verdad: cada fixture de `tables` ya viene
 * pre-filtrada a lo que esa consulta devolvería en la base real (igual
 * criterio que antes de R41). Lo nuevo (R41, 41-b, porque `cargarNovedades`
 * ahora corre adentro de `enviarNotificaciones` y usa `.eq()`/`.gt()`/`.gte()`/`.lte()`,
 * que esta función no tenía) es que registra, por tabla, las columnas
 * pedidas y cada filtro, en `queries` — y que una tabla puede devolver un
 * error a pedido (`errors`), para simular una lectura que falla.
 *
 * 51-b (QPS-201 + avisos patrocinados) suma `range`/`is` como filtros
 * registrados más (se ignoran igual que los demás: cada fixture ya viene
 * completa, y como todas son más chicas que una página, la paginación de la
 * ruta corta siempre en la primera vuelta) y un `update(...)` de verdad
 * (encadenable con `.eq()`/`.is()`), para el `sent_at` de la campaña
 * patrocinada: `errors[\`${table}:update\`]` simula que ESE update falla,
 * sin afectar las lecturas de la misma tabla.
 */
function fakeClient(tables: Record<string, Row[]>, writes: Writes, queries: Queries = {}, errors: Record<string, string> = {}) {
  return {
    from: (table: string) => {
      const rows = tables[table] ?? []
      const entrada: RegistroTabla = { llamadas: [] }
      queries[table] = [...(queries[table] ?? []), entrada]

      const metodo = (nombre: string) => (...args: unknown[]) => {
        entrada.llamadas.push({ metodo: nombre, args })
        return chain
      }

      const chain: Record<string, unknown> = {
        select: (columnas?: string) => {
          entrada.columnas = columnas
          return chain
        },
        eq: metodo('eq'),
        in: metodo('in'),
        not: metodo('not'),
        gt: metodo('gt'),
        gte: metodo('gte'),
        lte: metodo('lte'),
        order: metodo('order'),
        range: metodo('range'),
        is: metodo('is'),
        // 58-e: ad_settings se lee con `.maybeSingle()` (una fila o null).
        maybeSingle: () => {
          const mensaje = errors[table]
          return Promise.resolve(mensaje ? { data: null, error: { message: mensaje } } : { data: rows[0] ?? null, error: null })
        },
        delete: () => ({
          in: (_col: string, vals: unknown[]) => {
            writes.deletes[table] = [...(writes.deletes[table] ?? []), ...vals]
            return Promise.resolve({ error: null })
          },
        }),
        update: (values: Row) => {
          const entradaUpdate: EntradaUpdate = { values, llamadas: [] }
          writes.updates[table] = [...(writes.updates[table] ?? []), entradaUpdate]
          const updateChain: Record<string, unknown> = {
            eq: (...args: unknown[]) => {
              entradaUpdate.llamadas.push({ metodo: 'eq', args })
              return updateChain
            },
            is: (...args: unknown[]) => {
              entradaUpdate.llamadas.push({ metodo: 'is', args })
              return updateChain
            },
            then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
              const mensaje = errors[`${table}:update`]
              const resultado = mensaje ? { error: { message: mensaje } } : { error: null }
              return Promise.resolve(resultado).then(res, rej)
            },
          }
          return updateChain
        },
        insert: (newRows: Row[]) => {
          writes.inserts[table] = [...(writes.inserts[table] ?? []), ...newRows]
          return Promise.resolve({ error: null })
        },
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
          const mensaje = errors[table]
          // 58-e: el `count` de un `select(..., { count: 'exact', head: true })`
          // es la cantidad de filas de la fixture de esa tabla.
          const resultado = mensaje ? { data: null, error: { message: mensaje } } : { data: rows, count: rows.length, error: null }
          return Promise.resolve(resultado).then(res, rej)
        },
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
let queries: Queries
let fetchMock: ReturnType<typeof fetchFalso>

function mockDb(tables: Partial<Record<string, Row[]>> = {}, errors: Record<string, string> = {}) {
  writes = { inserts: {}, deletes: {}, updates: {} }
  queries = {}
  const base: Record<string, Row[]> = {
    push_tokens: [{ id: '00000000-0000-4000-8000-000000000a01', user_id: USER_ID, token: TOKEN_A }],
    notification_preferences: [],
    user_favorites: [favoritoRow(USER_ID)],
    notification_sends: [],
    // R41, 41-b: cargarNovedades lee estas cuatro tablas en TODA corrida con
    // al menos un token. Vacías por defecto: nadie sigue nada, así que
    // cargarNovedades corta ahí y ni mira `events` (ver su propio test en
    // tests/notificaciones/novedades.test.ts) — los tests de R39 de acá
    // abajo no necesitan saber nada de novedades para seguir pasando.
    job_runs: [],
    user_followed_categories: [],
    user_followed_venues: [],
    user_followed_instagram_accounts: [],
    // D2/Ronda 51, 51-b: sin campaña vigente por defecto, para que los tests
    // de R39/R41 de más abajo (que no saben nada de avisos patrocinados)
    // sigan pasando igual.
    sponsored_campaigns: [],
    // 58-e: sin fila de ad_settings = sin pausa.
    ad_settings: [],
    ...tables,
  }
  createAdminClient.mockReturnValue(fakeClient(base, writes, queries, errors))
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

  it('arreglo 3 (R39): un token de forma inválida ANTES de uno válido no corre el emparejamiento ticket↔dedupeKey (el dedupe_key registrado es el del usuario del token válido, no el de encima)', async () => {
    process.env.PUSH_ENVIO_REAL = '1'
    // Orden deliberado: el token de forma inválida va PRIMERO en push_tokens,
    // así que su mensaje también va primero en `mensajes` (armarTanda
    // preserva el orden de `userIds`, que sale de push_tokens). Si el
    // emparejamiento se hiciera por posición sobre TODOS los mensajes (en
    // vez de filtrar primero por `esTokenExpoValido`, como hace `enviarLote`
    // de verdad), el único ticket real -el del token válido- quedaría
    // atribuido a este primer mensaje. Si el inválido fuera el segundo, un
    // emparejamiento corrido podría dar el resultado correcto por
    // casualidad y el test no probaría nada.
    mockDb({
      push_tokens: [
        { user_id: USER_ID_TOKEN_INVALIDO, token: TOKEN_FORMA_INVALIDA },
        { user_id: USER_ID, token: TOKEN_A },
      ],
      user_favorites: [favoritoRow(USER_ID_TOKEN_INVALIDO), favoritoRow(USER_ID)],
    })
    // armarTickets por default (ver beforeEach): todo lo que de verdad se
    // manda a Expo vuelve "ok". Como enviarLote descarta el token de forma
    // inválida antes de armar el lote, a Expo solo llega TOKEN_A.

    const res = await call()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.dryRun).toBe(false)
    // Los dos usuarios generan candidato (armarTanda no valida la forma del
    // token: eso es trabajo de enviarLote/expo-push.ts, más abajo en la
    // cadena), así que son 2 mensajes.
    expect(body.mensajes).toBe(2)
    // Pero `enviarLote` descarta el de forma inválida antes de mandar nada.
    expect(body.descartados).toBe(1)

    // Solo un token llega de verdad a la API de Expo.
    const [, initEnviado] = fetchMock.mock.calls[0] as [string, { body: string }]
    const enviados = JSON.parse(initEnviado.body) as { to: string }[]
    expect(enviados).toHaveLength(1)
    expect(enviados[0].to).toBe(TOKEN_A)

    // El único envío que puede quedar registrado es el del usuario con token
    // válido, con SU dedupeKey (no el del usuario del token inválido, que
    // nunca generó un ticket).
    expect(writes.inserts.notification_sends).toHaveLength(1)
    const fila = writes.inserts.notification_sends[0]
    expect(fila.user_id).toBe(USER_ID)
    expect(fila.dedupe_key).toBe(claveDedupe({ kind: 'favorito', userId: USER_ID, eventId: EVENT_ID }))
    expect(fila.dedupe_key).not.toBe(
      claveDedupe({ kind: 'favorito', userId: USER_ID_TOKEN_INVALIDO, eventId: EVENT_ID }),
    )

    // El mensaje de forma inválida nunca tuvo ticket, así que su dedupeKey
    // queda como "no registrado por falla" (se reintenta la corrida que viene).
    expect(body.enviosNoRegistradosPorFalla).toBe(1)
  })

  it('arreglo 3 (R39): dos tokens de forma inválida intercalados con uno válido en el medio no corren el emparejamiento', async () => {
    process.env.PUSH_ENVIO_REAL = '1'
    mockDb({
      push_tokens: [
        { user_id: USER_ID_TOKEN_INVALIDO, token: TOKEN_FORMA_INVALIDA },
        { user_id: USER_ID, token: TOKEN_A },
        { user_id: USER_ID_TOKEN_INVALIDO_2, token: TOKEN_FORMA_INVALIDA_2 },
      ],
      user_favorites: [favoritoRow(USER_ID_TOKEN_INVALIDO), favoritoRow(USER_ID), favoritoRow(USER_ID_TOKEN_INVALIDO_2)],
    })

    const res = await call()
    const body = await res.json()
    expect(body.mensajes).toBe(3)
    expect(body.descartados).toBe(2)

    const [, initEnviado] = fetchMock.mock.calls[0] as [string, { body: string }]
    const enviados = JSON.parse(initEnviado.body) as { to: string }[]
    expect(enviados).toHaveLength(1)
    expect(enviados[0].to).toBe(TOKEN_A)

    expect(writes.inserts.notification_sends).toHaveLength(1)
    const fila = writes.inserts.notification_sends[0]
    expect(fila.user_id).toBe(USER_ID)
    expect(fila.dedupe_key).toBe(claveDedupe({ kind: 'favorito', userId: USER_ID, eventId: EVENT_ID }))
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

// Las novedades en sí (la ventana por usuario, el cruce con lo que sigue,
// los flyers de Instagram) se prueban a fondo en
// tests/notificaciones/novedades.test.ts (41-b), con un doble que registra
// las consultas. Acá solo lo que le toca a la RUTA: que cargarNovedades se
// conecte (una novedad real cuenta en porTipo), que `novedadesHasta` viaje
// en las tres salidas 200 (modo real, dryRun y la salida temprana sin
// tokens) y SOLO ahí, y que una lectura fallida dé 500 con FAILED sin
// `details` (la ventana no avanza).
describe('GET /api/cron/notificaciones: novedades (R41, 41-b)', () => {
  const CATEGORY_ID = '40000000-0000-4000-8000-000000000001'
  const EVENT_ID_NOVEDAD = '40000000-0000-4000-8000-000000000002'
  // 5h antes de AHORA (20:00 de Salta): dentro de la ventana de 24h que usa
  // inicioVentanaNovedades cuando no hay corridas previas (job_runs vacía,
  // el default de mockDb).
  const EVENTO_NOVEDAD_CREATED_AT = saltaWallClockToUtcISO('2030-10-20T15:00:00')
  // Bien en el futuro: isVigente siempre lo deja pasar.
  const EVENTO_NOVEDAD_START = saltaWallClockToUtcISO('2030-10-25T20:00:00')

  function eventoNovedadRow(): Row {
    return {
      id: EVENT_ID_NOVEDAD,
      title: 'Evento Nuevo de Prueba',
      created_at: EVENTO_NOVEDAD_CREATED_AT,
      start_date: EVENTO_NOVEDAD_START,
      end_date: null,
      status: 'PUBLISHED',
      category_id: CATEGORY_ID,
      venue_id: null,
    }
  }

  it('en dryRun, con una novedad real: porTipo.novedad es 1, cero fetch y cero escrituras', async () => {
    mockDb({
      user_favorites: [], // aísla: sin favoritos, para que la única novedad sea la de categoría.
      user_followed_categories: [{ user_id: USER_ID, category_id: CATEGORY_ID }],
      events: [eventoNovedadRow()],
    })

    const res = await call()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.dryRun).toBe(true)
    expect(body.porTipo.novedad).toBe(1)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(writes.inserts.notification_sends ?? []).toHaveLength(0)
    expect(writes.deletes.push_tokens ?? []).toHaveLength(0)
  })

  it('`novedadesHasta` es el `ahora` de la corrida, tanto en el body como en `details` (vía toOutcome)', async () => {
    const res = await call()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.novedadesHasta).toBe(AHORA.toISOString())

    const toOutcome = withJobRun.mock.calls[0][3] as (r: unknown) => { details?: Record<string, unknown> }
    const outcome = toOutcome({ httpStatus: res.status, body })
    expect(outcome.details?.novedadesHasta).toBe(AHORA.toISOString())
  })

  it('sin tokens (la salida temprana): también lleva `novedadesHasta`, para que la ventana avance igual', async () => {
    mockDb({ push_tokens: [] })

    const res = await call()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.mensajes).toBe(0)
    expect(body.novedadesHasta).toBe(AHORA.toISOString())
  })

  it('PUSH_ENVIO_REAL="1": la respuesta de verdad también lleva `novedadesHasta`', async () => {
    process.env.PUSH_ENVIO_REAL = '1'
    const res = await call()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.dryRun).toBe(false)
    expect(body.novedadesHasta).toBe(AHORA.toISOString())
  })

  it('si falla la lectura de novedades: 500, y toOutcome da FAILED, SIN `details` (la ventana no avanza)', async () => {
    mockDb({}, { job_runs: 'conexión perdida' })

    const res = await call()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('job_runs query failed')
    expect(body.novedadesHasta).toBeUndefined()

    const toOutcome = withJobRun.mock.calls[0][3] as (r: unknown) => { status: string; details?: Record<string, unknown> }
    const outcome = toOutcome({ httpStatus: res.status, body })
    expect(outcome.status).toBe('FAILED')
    expect(outcome.details).toBeUndefined()
  })

  it('una lectura de novedades fallida no expone ningún dato de usuario en la respuesta', async () => {
    mockDb({ user_followed_categories: [{ user_id: USER_ID, category_id: CATEGORY_ID }] }, { events: 'conexión perdida' })

    const res = await call()
    expect(res.status).toBe(500)
    const texto = JSON.stringify(await res.json())
    expect(texto).not.toContain(USER_ID)
    expect(texto).not.toContain(CATEGORY_ID)
  })
})

// ---------------------------------------------------------------------------
// 41-q: de punta a punta, A TRAVÉS DE LA RUTA (no solo de cargarNovedades,
// que ya se prueba sola en tests/notificaciones/novedades.test.ts), con
// armarTanda real de por medio. Los cuatro casos del encargo.
// ---------------------------------------------------------------------------
describe('GET /api/cron/notificaciones: 41-q, de punta a punta (ruta + cargarNovedades + armarTanda)', () => {
  const CATEGORY_ID = '50000000-0000-4000-8000-000000000001'
  const EVENT_ID_NOVEDAD = '50000000-0000-4000-8000-000000000002'
  // Bien en el futuro: isVigente siempre lo deja pasar.
  const EVENTO_NOVEDAD_START = saltaWallClockToUtcISO('2030-11-20T20:00:00')

  function eventoNovedadRow(overrides: Row = {}): Row {
    return {
      id: EVENT_ID_NOVEDAD,
      title: 'Evento Nuevo de Prueba (41-q)',
      created_at: saltaWallClockToUtcISO('2030-11-01T05:00:00'),
      start_date: EVENTO_NOVEDAD_START,
      end_date: null,
      status: 'PUBLISHED',
      category_id: CATEGORY_ID,
      venue_id: null,
      ...overrides,
    }
  }

  const AHORA_0505 = saltaWallClockToUtcISO('2030-11-01T05:05:00')
  const AHORA_CORRIDA1 = saltaWallClockToDate('2030-11-01T09:05:00')
  const AHORA_CORRIDA2 = saltaWallClockToDate('2030-11-01T10:05:00')
  // Corrida OK a las 05:05 (dentro del silencio por defecto, 23:00-09:00):
  // inicioVentanaNovedades la descarta como candidata (el usuario estaba en
  // silencio en ese momento), así que la ventana cae al fallback de 24 h.
  const CORRIDA_0505: Row = { started_at: AHORA_0505, details: { novedadesHasta: AHORA_0505 } }

  it('corrida 1 a las 09:05, con una corrida OK a las 05:05 ya registrada: el evento creado a las 05:00 da porTipo.novedad: 1', async () => {
    vi.setSystemTime(AHORA_CORRIDA1)
    mockDb({
      user_favorites: [],
      user_followed_categories: [{ user_id: USER_ID, category_id: CATEGORY_ID }],
      events: [eventoNovedadRow()],
      job_runs: [CORRIDA_0505],
    })

    const res = await call()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.dryRun).toBe(true)
    expect(body.porTipo.novedad).toBe(1)
  })

  it('corrida 2 a las 10:05, con la corrida 1 registrada OK y su envío ya en notification_sends: ese evento no vuelve', async () => {
    // Corrida 1 de verdad (PUSH_ENVIO_REAL="1"), para tener una fila real de
    // notification_sends con su dedupe_key, no uno inventado a mano.
    process.env.PUSH_ENVIO_REAL = '1'
    vi.setSystemTime(AHORA_CORRIDA1)
    mockDb({
      user_favorites: [],
      user_followed_categories: [{ user_id: USER_ID, category_id: CATEGORY_ID }],
      events: [eventoNovedadRow()],
      job_runs: [CORRIDA_0505],
    })
    const res1 = await call()
    const body1 = await res1.json()
    expect(body1.porTipo.novedad).toBe(1)
    expect(writes.inserts.notification_sends).toHaveLength(1)
    const filaNovedad = writes.inserts.notification_sends[0]
    expect(filaNovedad.kind).toBe('novedad')

    // Corrida 2, una hora más tarde: la corrida 1 ya quedó registrada OK en
    // job_runs (con su novedadesHasta = 09:05) y ese envío ya está en
    // notification_sends. El evento sigue en la base (created_at no cambia).
    vi.setSystemTime(AHORA_CORRIDA2)
    mockDb({
      user_favorites: [],
      user_followed_categories: [{ user_id: USER_ID, category_id: CATEGORY_ID }],
      events: [eventoNovedadRow()],
      job_runs: [CORRIDA_0505, { started_at: AHORA_CORRIDA1.toISOString(), details: { novedadesHasta: AHORA_CORRIDA1.toISOString() } }],
      notification_sends: [{ user_id: USER_ID, dedupe_key: filaNovedad.dedupe_key, sent_at: AHORA_CORRIDA1.toISOString() }],
    })

    const res2 = await call()
    const body2 = await res2.json()
    expect(body2.porTipo.novedad).toBeUndefined()
    expect(body2.mensajes).toBe(0)
  })

  it('un evento con updated_at reciente y created_at viejo: no cuenta como novedad (la ventana es siempre sobre created_at)', async () => {
    vi.setSystemTime(AHORA_CORRIDA1)
    mockDb({
      user_favorites: [],
      user_followed_categories: [{ user_id: USER_ID, category_id: CATEGORY_ID }],
      events: [
        eventoNovedadRow({
          // Mucho antes que la ventana de 24h (sin corridas previas útiles,
          // cae al fallback ahora-24h: este created_at queda bien afuera).
          created_at: saltaWallClockToUtcISO('2030-10-01T10:00:00'),
          // "Recién editado": si el filtro usara updated_at (el agujero que
          // reporté arriba), este evento SÍ entraría.
          updated_at: AHORA_CORRIDA1.toISOString(),
        }),
      ],
    })

    const res = await call()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.porTipo.novedad).toBeUndefined()
    expect(body.mensajes).toBe(0)
  })

  it('tres envíos de novedad hoy: ninguna novedad más (tope de 3), pero el recordatorio de favorito sale porque queda lugar en el tope total (3 de 4)', async () => {
    // AHORA (del beforeEach, 20:00 de Salta) ya deja "debido" al favorito
    // default de mockDb (favoritoRow(USER_ID), 3h antes de EVENTO_START):
    // no hace falta tocar el reloj para este caso.
    const dedupeNovedad = (extra: string) => claveDedupe({ kind: 'novedad', userId: USER_ID, extra })
    mockDb({
      user_followed_categories: [{ user_id: USER_ID, category_id: CATEGORY_ID }],
      events: [eventoNovedadRow({ created_at: saltaWallClockToUtcISO('2030-10-20T15:00:00') })],
      notification_sends: [
        { user_id: USER_ID, dedupe_key: dedupeNovedad('hora-1'), sent_at: AHORA.toISOString() },
        { user_id: USER_ID, dedupe_key: dedupeNovedad('hora-2'), sent_at: AHORA.toISOString() },
        { user_id: USER_ID, dedupe_key: dedupeNovedad('hora-3'), sent_at: AHORA.toISOString() },
      ],
      // user_favorites: el default de mockDb (favoritoRow(USER_ID)), sin tocar.
    })

    const res = await call()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.porTipo.novedad).toBeUndefined() // el tope de 3 novedades/día ya está agotado
    expect(body.porTipo.favorito).toBe(1) // 3 envíos hoy, daily_cap default 4: queda 1 lugar, y lo toma el favorito
    expect(body.mensajes).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// D2/Ronda 51, tarea 51-b: avisos push patrocinados.
// ---------------------------------------------------------------------------
describe('GET /api/cron/notificaciones: el arreglo del agujero de 51-a (notification_preferences.sponsored)', () => {
  it('el select de notification_preferences pide la columna `sponsored`', async () => {
    mockDb({ notification_preferences: [prefRow(USER_ID)] })

    await call()

    const columnas = queries.notification_preferences?.[0]?.columnas ?? ''
    expect(columnas).toContain('sponsored')
  })

  it('con sponsored: true y campaña vigente, SÍ sale el aviso patrocinado (si el mapeo perdiera el campo, esto fallaría)', async () => {
    mockDb({
      user_favorites: [],
      notification_preferences: [prefRow(USER_ID, { sponsored: true })],
      sponsored_campaigns: [campaniaRow()],
    })

    const res = await call()
    const body = await res.json()
    expect(body.porTipo.patrocinado).toBe(1)
  })

  it('con sponsored: false, NO sale el aviso patrocinado', async () => {
    mockDb({
      user_favorites: [],
      notification_preferences: [prefRow(USER_ID, { sponsored: false })],
      sponsored_campaigns: [campaniaRow()],
    })

    const res = await call()
    const body = await res.json()
    expect(body.porTipo.patrocinado).toBeUndefined()
  })
})

describe('GET /api/cron/notificaciones: avisos patrocinados (D2/Ronda 51, 51-b)', () => {
  it('con campaña vigente y evento PUBLISHED: el dryRun cuenta 1 patrocinado por usuario, cero fetch y cero escrituras', async () => {
    mockDb({
      user_favorites: [], // aísla: solo el patrocinado.
      sponsored_campaigns: [campaniaRow()],
    })

    const res = await call()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.dryRun).toBe(true)
    expect(body.porTipo.patrocinado).toBe(1)
    expect(body.patrocinados).toBe(1)
    expect(body.campaniaId).toBe(CAMPANIA_ID)
    expect(body.patrocinadoDescartado).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(writes.inserts.notification_sends ?? []).toHaveLength(0)
    expect(writes.deletes.push_tokens ?? []).toHaveLength(0)
    expect(writes.updates.sponsored_campaigns ?? []).toHaveLength(0)
  })

  it('con el evento en DRAFT (no PUBLISHED): se descarta, 0 patrocinados y patrocinadoDescartado', async () => {
    mockDb({
      user_favorites: [],
      sponsored_campaigns: [campaniaRow({ event: { status: 'DRAFT' } })],
    })

    const res = await call()
    const body = await res.json()
    expect(body.porTipo.patrocinado).toBeUndefined()
    expect(body.patrocinados).toBe(0)
    expect(body.patrocinadoDescartado).toBe(true)
    expect(body.campaniaId).toBeNull()

    const toOutcome = withJobRun.mock.calls[0][3] as (r: unknown) => { details?: Record<string, unknown> }
    const outcome = toOutcome({ httpStatus: res.status, body })
    expect(outcome.details?.patrocinadoDescartado).toBe(true)
  })

  it('en dryRun, con campaña vigente: cero escrituras de cualquier tipo (ni insert ni update)', async () => {
    mockDb({
      user_favorites: [],
      sponsored_campaigns: [campaniaRow()],
    })

    await call()

    expect(Object.keys(writes.inserts).every((tabla) => (writes.inserts[tabla] ?? []).length === 0)).toBe(true)
    expect(Object.keys(writes.updates).every((tabla) => (writes.updates[tabla] ?? []).length === 0)).toBe(true)
  })

  it('PUSH_ENVIO_REAL="1": la fila de notification_sends lleva campaign_id, y se marca sent_at UNA sola vez, con .is("sent_at", null)', async () => {
    process.env.PUSH_ENVIO_REAL = '1'
    mockDb({
      user_favorites: [],
      sponsored_campaigns: [campaniaRow()],
    })

    const res = await call()
    const body = await res.json()
    expect(body.dryRun).toBe(false)
    expect(body.mensajes).toBe(1)

    expect(writes.inserts.notification_sends).toHaveLength(1)
    expect(writes.inserts.notification_sends[0]).toMatchObject({
      user_id: USER_ID,
      kind: 'patrocinado',
      channel: 'push',
      status: 'SUCCESS',
      campaign_id: CAMPANIA_ID,
    })

    expect(writes.updates.sponsored_campaigns).toHaveLength(1)
    const update = writes.updates.sponsored_campaigns[0]
    expect(update.values.sent_at).toBe(AHORA.toISOString())
    expect(update.llamadas).toContainEqual({ metodo: 'eq', args: ['id', CAMPANIA_ID] })
    expect(update.llamadas).toContainEqual({ metodo: 'is', args: ['sent_at', null] })
  })

  it('con la campaña ya con sent_at (no nulo): no hay update, aunque el envío salga bien', async () => {
    process.env.PUSH_ENVIO_REAL = '1'
    mockDb({
      user_favorites: [],
      sponsored_campaigns: [campaniaRow({ sent_at: saltaWallClockToUtcISO('2030-10-19T12:00:00') })],
    })

    const res = await call()
    const body = await res.json()
    expect(body.mensajes).toBe(1)
    expect(writes.updates.sponsored_campaigns ?? []).toHaveLength(0)
  })

  it('sin event_id: la campaña se descarta igual que con el evento sin publicar', async () => {
    mockDb({
      user_favorites: [],
      sponsored_campaigns: [campaniaRow({ event_id: null, event: null })],
    })

    const res = await call()
    const body = await res.json()
    expect(body.porTipo.patrocinado).toBeUndefined()
    expect(body.patrocinadoDescartado).toBe(true)
  })

  it('si falla la lectura de sponsored_campaigns: 500, igual que las otras lecturas', async () => {
    mockDb({}, { sponsored_campaigns: 'conexión perdida' })

    const res = await call()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('sponsored_campaigns query failed')
  })

  it('ni el título ni el cuerpo de la campaña aparecen en los logs', async () => {
    mockDb({
      user_favorites: [],
      sponsored_campaigns: [campaniaRow({ title: 'TITULO-SENSIBLE-DE-PRUEBA', body: 'CUERPO-SENSIBLE-DE-PRUEBA' })],
    })

    await call()

    const logueado = (console.error as ReturnType<typeof vi.fn>).mock.calls.flat().map((a) => JSON.stringify(a))
    expect(logueado.some((t) => t.includes('TITULO-SENSIBLE-DE-PRUEBA'))).toBe(false)
    expect(logueado.some((t) => t.includes('CUERPO-SENSIBLE-DE-PRUEBA'))).toBe(false)
  })
})
