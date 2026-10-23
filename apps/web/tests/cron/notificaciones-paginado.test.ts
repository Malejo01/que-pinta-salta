/**
 * QPS-201 (D2/Ronda 51, tarea 51-b): GET /api/cron/notificaciones, pero con
 * un cliente de Supabase que SÍ respeta `.in(...)`/`.order(...)`/`.range(...)`
 * (a diferencia del `fakeClient` de `tests/cron/notificaciones.test.ts`, que
 * los ignora a propósito porque cada fixture ya viene pre-filtrada). Hace
 * falta un doble de verdad acá: el punto de esta tarea es la paginación, y un
 * doble que ignora `.range(...)` (devolviendo siempre la MISMA porción de la
 * fixture, sin importar `desde`/`hasta`) no puede distinguir un código que
 * pagina de uno que no — con una fixture de más de una página, ESE tipo de
 * doble o bien devuelve siempre la primera porción completa (y el código
 * jamás ve una "página corta": `leerPaginado` seguiría pidiendo páginas hasta
 * el tope de 50, acumulando filas DUPLICADAS en vez de las que de verdad
 * faltan) o bien devuelve siempre la MISMA porción corta (y el código nunca
 * vería las filas de más adelante). Ninguno de los dos comportamientos sirve
 * para probar "se leyeron las N filas, en orden, sin duplicar": por eso el
 * doble de este archivo (`clienteRealista`) filtra por los ids de `.in(...)`
 * y corta la porción real que le corresponde a `desde`/`hasta`, como
 * PostgREST con `.range(...)` de verdad.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saltaWallClockToDate } from '@qps/core/date-format'
import { claveDedupePatrocinado, semanaSalta } from '@qps/core/notificaciones/reglas'
import { TAMANIO_LOTE_IN, TAMANIO_PAGINA_TOKENS } from '@qps/core/notificaciones/lotes'

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
type Llamada = { metodo: string; args: unknown[] }
type RegistroTabla = { columnas?: string; llamadas: Llamada[] }

const URL_RUTA = 'http://localhost.test/api/cron/notificaciones'
const SECRETO = 'secreto-falso-de-prueba'
const entornoSecreto = process.env.CRON_SECRET
const entornoEnvioReal = process.env.PUSH_ENVIO_REAL

// 20:00 de Salta: fuera del horario de silencio por defecto (23:00-09:00).
const AHORA = saltaWallClockToDate('2030-10-20T20:00:00')

/**
 * Cliente que SÍ respeta `.in(...)`/`.order(...)`/`.range(...)` (ver el
 * docstring de arriba del archivo). `columnasConId`/`columnasSinId` no hacen
 * falta: el orden de cada página sale directo del orden del ARRAY de la
 * fixture (quien escribe el test ya lo deja pre-ordenado como lo pediría la
 * ruta real con `.order(...)`), nunca de una re-ordenación acá.
 */
function clienteRealista(tablas: Partial<Record<string, Row[]>>) {
  const registro: Record<string, RegistroTabla[]> = {}

  const client = {
    from: (tabla: string) => {
      const entrada: RegistroTabla = { llamadas: [] }
      registro[tabla] = [...(registro[tabla] ?? []), entrada]
      let idsFiltrados: string[] | null = null

      const metodoSimple = (nombre: string) => (...args: unknown[]) => {
        entrada.llamadas.push({ metodo: nombre, args })
        return chain
      }

      const chain: Record<string, unknown> = {
        select: (columnas?: string) => {
          entrada.columnas = columnas
          return chain
        },
        eq: metodoSimple('eq'),
        not: metodoSimple('not'),
        gt: metodoSimple('gt'),
        gte: metodoSimple('gte'),
        lte: metodoSimple('lte'),
        order: metodoSimple('order'),
        in: (col: string, vals: string[]) => {
          entrada.llamadas.push({ metodo: 'in', args: [col, vals] })
          idsFiltrados = vals
          return chain
        },
        range: (desde: number, hasta: number) => {
          entrada.llamadas.push({ metodo: 'range', args: [desde, hasta] })
          const base = tablas[tabla] ?? []
          const filtradas = idsFiltrados ? base.filter((fila) => idsFiltrados!.includes(fila.user_id as string)) : base
          return Promise.resolve({ data: filtradas.slice(desde, hasta + 1), error: null })
        },
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
          // Tablas sin `.range()` en la ruta (notification_preferences,
          // sponsored_campaigns, job_runs, events): se devuelven enteras.
          return Promise.resolve({ data: tablas[tabla] ?? [], error: null }).then(res, rej)
        },
      }
      return chain
    },
  }

  return { client, registro }
}

const call = (headers: Record<string, string> = { authorization: `Bearer ${SECRETO}` }) =>
  GET(new Request(URL_RUTA, { headers }))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AHORA)
  process.env.CRON_SECRET = SECRETO
  delete process.env.PUSH_ENVIO_REAL
  createAdminClient.mockReset()
  withJobRun.mockReset()
  withJobRun.mockImplementation(async (_job: string, _trigger: string, work: () => Promise<unknown>) => work())
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  if (entornoSecreto === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = entornoSecreto
  if (entornoEnvioReal === undefined) delete process.env.PUSH_ENVIO_REAL
  else process.env.PUSH_ENVIO_REAL = entornoEnvioReal
})

describe('GET /api/cron/notificaciones: QPS-201, push_tokens paginado (sin .in)', () => {
  it('2500 tokens, todos del mismo usuario: se leen los 2500, en 3 páginas', async () => {
    const USER_ID = '10000000-0000-4000-8000-000000000001'
    const EVENT_ID = '20000000-0000-4000-8000-000000000001'
    const EVENTO_START = saltaWallClockToDate('2030-10-20T21:00:00').toISOString()

    const tokens: Row[] = Array.from({ length: 2500 }, (_, i) => ({
      id: `t-${i}`,
      user_id: USER_ID,
      token: `ExponentPushToken[tok-${i}-de-prueba]`,
    }))

    const { client, registro } = clienteRealista({
      push_tokens: tokens,
      notification_preferences: [],
      user_favorites: [
        { user_id: USER_ID, event_id: EVENT_ID, events: { title: 'Show de Prueba', start_date: EVENTO_START, end_date: null, status: 'PUBLISHED' } },
      ],
      notification_sends: [],
      job_runs: [],
      user_followed_categories: [],
      user_followed_venues: [],
      user_followed_instagram_accounts: [],
      sponsored_campaigns: [],
    })
    createAdminClient.mockReturnValue(client)

    const res = await call()
    expect(res.status).toBe(200)
    const body = await res.json()

    // El favorito está vencido (AHORA, 20:00, es 3h después de las 18:00 de
    // recordatorio para un evento a las 21:00): un candidato por usuario, un
    // mensaje por TOKEN. Si la lectura de push_tokens se hubiera cortado en
    // la primera página (1000), esto daría 1000, no 2500.
    expect(body.mensajes).toBe(2500)
    expect(body.tokensTruncados).toBeUndefined()

    const llamadasRange = (registro.push_tokens ?? []).flatMap((e) => e.llamadas.filter((l) => l.metodo === 'range'))
    expect(llamadasRange).toHaveLength(3) // 2500 / 1000 por página: 1000 + 1000 + 500.
    expect(llamadasRange.map((l) => l.args)).toEqual([
      [0, TAMANIO_PAGINA_TOKENS - 1],
      [TAMANIO_PAGINA_TOKENS, 2 * TAMANIO_PAGINA_TOKENS - 1],
      [2 * TAMANIO_PAGINA_TOKENS, 3 * TAMANIO_PAGINA_TOKENS - 1],
    ])

    // push_tokens nunca llamó `.in(...)`: se pagina la tabla entera, sin lotear por id.
    const llamadasIn = (registro.push_tokens ?? []).flatMap((e) => e.llamadas.filter((l) => l.metodo === 'in'))
    expect(llamadasIn).toHaveLength(0)
  })

  it('con exactamente 50.000 tokens (50 páginas llenas, nunca una corta): tokensTruncados y la corrida queda PARTIAL', async () => {
    // 50 usuarios con 1000 tokens cada uno: 50.000 filas de push_tokens (un
    // múltiplo exacto de TAMANIO_PAGINA_TOKENS), pero solo 50 userIds, para
    // que las demás lecturas (lotes de a 200) no multipliquen el costo del
    // test. Ninguna página de push_tokens viene nunca "corta" (todas de
    // 1000), así que `leerPaginado` llega al tope de 50 páginas sin parar
    // antes: es justo el escenario que exige el tope (si un doble o una base
    // real ignorara `.range`, esto colgaría la corrida sin un límite).
    const usuarios = Array.from({ length: 50 }, (_, u) => `10000000-0000-4000-8000-${String(u).padStart(12, '0')}`)
    const tokens: Row[] = usuarios.flatMap((userId, u) =>
      Array.from({ length: 1000 }, (_, i) => ({
        id: `t-${u}-${i}`,
        user_id: userId,
        token: `ExponentPushToken[tok-${u}-${i}-de-prueba]`,
      })),
    )

    const { client } = clienteRealista({
      push_tokens: tokens,
      notification_preferences: [],
      user_favorites: [],
      notification_sends: [],
      job_runs: [],
      user_followed_categories: [],
      user_followed_venues: [],
      user_followed_instagram_accounts: [],
      sponsored_campaigns: [],
    })
    createAdminClient.mockReturnValue(client)

    const res = await call()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.tokensTruncados).toBe(true)

    const toOutcome = withJobRun.mock.calls[0][3] as (r: unknown) => { status: string; details?: Record<string, unknown> }
    const outcome = toOutcome({ httpStatus: res.status, body })
    expect(outcome.status).toBe('PARTIAL')
    expect(outcome.details?.tokensTruncados).toBe(true)

    // Nunca un token ni un id de usuario en la respuesta.
    const texto = JSON.stringify(body)
    expect(texto).not.toContain('ExponentPushToken')
    expect(texto).not.toContain(usuarios[0])
  })
})

describe('GET /api/cron/notificaciones: QPS-201, lotes de 200 ids', () => {
  it('con 450 usuarios con token: ningún `.in("user_id", ...)` (notification_preferences, user_favorites, notification_sends) lleva más de 200 ids', async () => {
    const usuarios = Array.from({ length: 450 }, (_, i) => `20000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
    const tokens: Row[] = usuarios.map((userId, i) => ({ id: `t-${i}`, user_id: userId, token: `ExponentPushToken[tok-${i}-de-prueba]` }))

    const { client, registro } = clienteRealista({
      push_tokens: tokens,
      notification_preferences: [],
      user_favorites: [],
      notification_sends: [],
      job_runs: [],
      user_followed_categories: [],
      user_followed_venues: [],
      user_followed_instagram_accounts: [],
      sponsored_campaigns: [],
    })
    createAdminClient.mockReturnValue(client)

    const res = await call()
    expect(res.status).toBe(200)

    for (const tabla of ['notification_preferences', 'user_favorites', 'notification_sends']) {
      const llamadasIn = (registro[tabla] ?? []).flatMap((e) => e.llamadas.filter((l) => l.metodo === 'in'))
      // 450 ids en lotes de TAMANIO_LOTE_IN (200): 3 lotes (200 + 200 + 50).
      expect(llamadasIn).toHaveLength(Math.ceil(450 / TAMANIO_LOTE_IN))
      for (const llamada of llamadasIn) {
        const ids = llamada.args[1] as string[]
        expect(ids.length).toBeLessThanOrEqual(TAMANIO_LOTE_IN)
      }
      const totalIds = llamadasIn.reduce((acc, l) => acc + (l.args[1] as string[]).length, 0)
      expect(totalIds).toBe(450)
    }
  })
})

describe('GET /api/cron/notificaciones: QPS-201, la promesa de la ronda — leer TODO notification_sends evita un segundo aviso patrocinado en la misma semana', () => {
  it('más de 1000 filas de notification_sends para el mismo lote: se leen todas, y el envío patrocinado de la semana (en la página 2) SÍ se encuentra', async () => {
    const USER_ID = '30000000-0000-4000-8000-000000000001'
    const EVENT_ID_PATROCINADO = '30000000-0000-4000-8000-000000000002'
    const CAMPANIA_ID = '30000000-0000-4000-8000-000000000003'

    const semana = semanaSalta(AHORA)
    const dedupeYaEnviadoEstaSemana = claveDedupePatrocinado(USER_ID, semana)

    // 1100 filas de "ruido" (otros dedupe_key, de otro kind) para el MISMO
    // usuario (mismo lote de `.in`), y la fila real (ya mandada esta semana)
    // en la posición 1050: cae en la SEGUNDA página (1000-1099), no en la
    // primera. Si la lectura se cortara en la página 1 (max_rows sin
    // paginar), esta fila nunca se vería, y el patrocinado se mandaría de
    // nuevo — exactamente lo que este test prueba que NO pasa.
    const ruido = (n: number): Row[] =>
      Array.from({ length: n }, (_, i) => ({
        id: `ruido-${i}`,
        user_id: USER_ID,
        dedupe_key: `favorito:${USER_ID}:evento-de-ruido-${i}`,
        sent_at: saltaWallClockToDate('2030-10-01T10:00:00').toISOString(),
      }))
    const sends: Row[] = [
      ...ruido(1050),
      { id: 'el-real', user_id: USER_ID, dedupe_key: dedupeYaEnviadoEstaSemana, sent_at: AHORA.toISOString() },
      ...ruido(50),
    ]
    expect(sends.length).toBeGreaterThan(1000)

    const { client, registro } = clienteRealista({
      push_tokens: [{ id: 'tok-1', user_id: USER_ID, token: 'ExponentPushToken[patrocinado-de-prueba]' }],
      notification_preferences: [
        {
          user_id: USER_ID,
          radar_channel: 'email',
          favorite_reminders: false,
          follow_news: false,
          announcements: false,
          sponsored: true,
          quiet_start: '23:00:00',
          quiet_end: '09:00:00',
          daily_cap: 10,
        },
      ],
      user_favorites: [],
      notification_sends: sends,
      job_runs: [],
      user_followed_categories: [],
      user_followed_venues: [],
      user_followed_instagram_accounts: [],
      sponsored_campaigns: [
        {
          id: CAMPANIA_ID,
          title: 'Campaña de Prueba',
          body: 'Cuerpo de prueba',
          event_id: EVENT_ID_PATROCINADO,
          starts_at: saltaWallClockToDate('2030-10-19T00:00:00').toISOString(),
          ends_at: saltaWallClockToDate('2030-10-25T00:00:00').toISOString(),
          sent_at: null,
          event: { status: 'PUBLISHED' },
        },
      ],
    })
    createAdminClient.mockReturnValue(client)

    const res = await call()
    expect(res.status).toBe(200)
    const body = await res.json()

    // La garantía de la ronda: ya se mandó esta semana, así que NO vuelve a
    // aparecer un candidato patrocinado para este usuario.
    expect(body.porTipo.patrocinado).toBeUndefined()
    expect(body.patrocinados).toBe(0)

    const llamadasRange = (registro.notification_sends ?? []).flatMap((e) => e.llamadas.filter((l) => l.metodo === 'range'))
    expect(llamadasRange.length).toBeGreaterThanOrEqual(2) // 1101 filas / 1000 por página.
  })
})
