/**
 * `lib/notificaciones/novedades.ts` (R41, tarea 41-b): la capa que junta de
 * la base lo que `@qps/core/notificaciones/novedades` (41-a, puro) necesita
 * para armar las novedades de cada usuario. Sin red ni base de verdad: el
 * cliente de Supabase es un doble a mano que registra las consultas
 * (columnas y filtros pedidos por tabla), no solo las filas que devuelve:
 * varios de los casos de abajo ("usa `created_at` y nunca pide
 * `updated_at`", "nadie sigue nada: no se lee `events`") se prueban sobre
 * ese registro.
 *
 * El doble NO aplica los filtros de verdad (como el de `tests/cron/notificaciones.test.ts`):
 * cada fixture ya viene pre-filtrada a lo que esa consulta devolvería en la
 * base real. Lo que el doble SÍ hace es registrar cada llamada a
 * `.select()`/`.eq()`/`.in()`/`.gt()`/`.gte()`/`.lte()`/`.order()`, para que
 * los tests puedan afirmar qué se pidió, no solo qué volvió.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cargarNovedades, type CargarNovedadesInput } from '@/lib/notificaciones/novedades'
import { saltaWallClockToDate, saltaWallClockToUtcISO } from '@qps/core/date-format'
import { PREFERENCIAS_POR_DEFECTO, type PreferenciasNotificacion } from '@qps/core/notificaciones/preferencias'

const salta = (wallClock: string) => saltaWallClockToDate(wallClock)
const hastaISO = (wallClock: string) => saltaWallClockToUtcISO(wallClock)

let autoId = 0
function uuid(): string {
  autoId += 1
  const hex = autoId.toString(16).padStart(12, '0')
  return `00000000-0000-0000-0000-${hex}`
}

type Row = Record<string, unknown>
type Llamada = { metodo: string; args: unknown[] }
type RegistroTabla = { columnas?: string; llamadas: Llamada[] }

/** Cliente falso: registra, por tabla, cada `.select()`/filtro pedido, y devuelve las filas (o el error) de la fixture, sin aplicar los filtros de verdad. */
function clienteFalso(tablas: Partial<Record<string, Row[]>>, errores: Partial<Record<string, string>> = {}) {
  const registro: Record<string, RegistroTabla[]> = {}

  const client = {
    from: (tabla: string) => {
      const entrada: RegistroTabla = { llamadas: [] }
      registro[tabla] = [...(registro[tabla] ?? []), entrada]

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
        gt: metodo('gt'),
        gte: metodo('gte'),
        lte: metodo('lte'),
        order: metodo('order'),
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
          const mensaje = errores[tabla]
          const resultado = mensaje ? { data: null, error: { message: mensaje } } : { data: tablas[tabla] ?? [], error: null }
          return Promise.resolve(resultado).then(res, rej)
        },
      }
      return chain
    },
  }

  return { client, registro }
}

function prefs(overrides: Partial<PreferenciasNotificacion> = {}): PreferenciasNotificacion {
  return { ...PREFERENCIAS_POR_DEFECTO, ...overrides }
}

function jobRun(startedAtWallClock: string, details: unknown = {}): Row {
  return { started_at: hastaISO(startedAtWallClock), details }
}

function eventoRow(overrides: Partial<Row> = {}): Row {
  return {
    id: uuid(),
    title: 'Evento de Prueba',
    created_at: hastaISO('2026-10-20T10:00:00'),
    start_date: hastaISO('2026-11-01T20:00:00'), // bien en el futuro: siempre vigente.
    end_date: null,
    status: 'PUBLISHED',
    category_id: null,
    venue_id: null,
    ...overrides,
  }
}

async function cargar(
  tablas: Partial<Record<string, Row[]>>,
  input: Omit<CargarNovedadesInput, 'preferenciasPorUsuario'> & { preferenciasPorUsuario?: Map<string, PreferenciasNotificacion> },
  errores: Partial<Record<string, string>> = {},
) {
  const { client, registro } = clienteFalso(tablas, errores)
  const resultado = await cargarNovedades(client as unknown as SupabaseClient, {
    preferenciasPorUsuario: input.preferenciasPorUsuario ?? new Map(),
    userIds: input.userIds,
    ahora: input.ahora,
  })
  return { resultado, registro }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('cargarNovedades', () => {
  it('usa `created_at` y nunca pide `updated_at` al leer events', async () => {
    // El `.select()` pide `created_at` sin importar qué columna use el
    // FILTRO de ventana (se usa también para el cruce en memoria): mirar
    // solo las columnas del `.select()` no detecta que el filtro cambie a
    // `updated_at`. Por eso esta prueba mira los FILTROS registrados
    // (`.gt()`/`.lte()`), no el string de `.select()`.
    const userId = uuid()
    const categoriaId = uuid()
    const ahora = salta('2026-10-20T12:00:00')
    const evento = eventoRow({ category_id: categoriaId, created_at: hastaISO('2026-10-20T10:00:00') })

    const { resultado, registro } = await cargar(
      {
        job_runs: [],
        user_followed_categories: [{ user_id: userId, category_id: categoriaId }],
        user_followed_venues: [],
        user_followed_instagram_accounts: [],
        events: [evento],
      },
      { userIds: [userId], ahora },
    )

    expect(resultado.ok).toBe(true)
    const columnasEvents = registro.events?.[0]?.columnas ?? ''
    expect(columnasEvents).toContain('created_at')

    const llamadasEvents = registro.events?.[0]?.llamadas ?? []
    // El filtro de ventana es `.gt()` (desde) + `.lte()` (hasta): tienen que
    // existir los dos y los dos sobre `created_at`.
    const filtrosDeVentana = llamadasEvents.filter((l) => l.metodo === 'gt' || l.metodo === 'lte')
    expect(filtrosDeVentana).toHaveLength(2)
    for (const filtro of filtrosDeVentana) {
      expect(filtro.args[0]).toBe('created_at')
    }
    // Ninguna llamada a events (de ningún método: eq/in/gt/gte/lte/order)
    // filtra por `updated_at`.
    expect(llamadasEvents.some((l) => l.args[0] === 'updated_at')).toBe(false)
  })

  it('la ingesta de la madrugada: a un usuario en silencio por defecto, un evento de las 05:00 le llega a las 09:05', async () => {
    const userId = uuid()
    const categoriaId = uuid()
    const ahora = salta('2026-10-20T09:05:00')
    const corridas = [
      jobRun('2026-10-19T22:05:00'),
      jobRun('2026-10-20T04:05:00'),
      jobRun('2026-10-20T05:05:00'),
      jobRun('2026-10-20T06:05:00'),
      jobRun('2026-10-20T07:05:00'),
      jobRun('2026-10-20T08:05:00'),
    ]
    const evento = eventoRow({ category_id: categoriaId, created_at: hastaISO('2026-10-20T05:00:00') })

    const { resultado } = await cargar(
      {
        job_runs: corridas,
        user_followed_categories: [{ user_id: userId, category_id: categoriaId }],
        user_followed_venues: [],
        user_followed_instagram_accounts: [],
        events: [evento],
      },
      { userIds: [userId], ahora }, // preferencias por defecto: silencio 23:00-09:00
    )

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.porUsuario.get(userId)?.map((n) => n.id)).toEqual([evento.id])
  })

  it('la misma corrida de las 05:05, para un usuario SIN silencio: el evento de las 05:00 no le llega a las 09:05 (ya entró en su ventana anterior)', async () => {
    const userId = uuid()
    const categoriaId = uuid()
    const ahora = salta('2026-10-20T09:05:00')
    const corridas = [
      jobRun('2026-10-19T22:05:00'),
      jobRun('2026-10-20T04:05:00'),
      jobRun('2026-10-20T05:05:00'),
      jobRun('2026-10-20T06:05:00'),
      jobRun('2026-10-20T07:05:00'),
      jobRun('2026-10-20T08:05:00'),
    ]
    const evento = eventoRow({ category_id: categoriaId, created_at: hastaISO('2026-10-20T05:00:00') })

    const { resultado } = await cargar(
      {
        job_runs: corridas,
        user_followed_categories: [{ user_id: userId, category_id: categoriaId }],
        user_followed_venues: [],
        user_followed_instagram_accounts: [],
        events: [evento],
      },
      {
        userIds: [userId],
        ahora,
        preferenciasPorUsuario: new Map([[userId, prefs({ quiet_start: '03:00', quiet_end: '03:01' })]]), // ventana angosta: ninguna corrida cae en silencio, desde = 08:05
      },
    )

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.porUsuario.get(userId)).toEqual([])
  })

  it('`details.novedadesHasta` gana sobre `started_at`', async () => {
    const userId = uuid()
    const categoriaId = uuid()
    const ahora = salta('2026-10-20T12:00:00')
    const corridas = [jobRun('2026-10-20T10:00:00', { novedadesHasta: hastaISO('2026-10-20T11:00:00') })]

    // Un evento ANTES de novedadesHasta (11:00) no tiene que llegar: si
    // ganara `started_at` (10:00), sí llegaría.
    const eventoViejo = eventoRow({ category_id: categoriaId, created_at: hastaISO('2026-10-20T10:30:00') })
    // Uno DESPUÉS de novedadesHasta sí.
    const eventoNuevo = eventoRow({ category_id: categoriaId, created_at: hastaISO('2026-10-20T11:30:00') })

    const { resultado } = await cargar(
      {
        job_runs: corridas,
        user_followed_categories: [{ user_id: userId, category_id: categoriaId }],
        user_followed_venues: [],
        user_followed_instagram_accounts: [],
        events: [eventoViejo, eventoNuevo],
      },
      { userIds: [userId], ahora },
    )

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.porUsuario.get(userId)?.map((n) => n.id)).toEqual([eventoNuevo.id])
  })

  it('un `details` sin `novedadesHasta`, o con un valor inválido, usa `started_at`', async () => {
    const userId = uuid()
    const categoriaId = uuid()
    const ahora = salta('2026-10-20T12:00:00')

    for (const details of [{}, { novedadesHasta: 'esto-no-es-una-fecha' }]) {
      const corridas = [jobRun('2026-10-20T10:00:00', details)]
      const evento = eventoRow({ category_id: categoriaId, created_at: hastaISO('2026-10-20T10:30:00') })

      const { resultado } = await cargar(
        {
          job_runs: corridas,
          user_followed_categories: [{ user_id: userId, category_id: categoriaId }],
          user_followed_venues: [],
          user_followed_instagram_accounts: [],
          events: [evento],
        },
        { userIds: [userId], ahora },
      )

      expect(resultado.ok).toBe(true)
      if (!resultado.ok) continue
      expect(resultado.porUsuario.get(userId)?.map((n) => n.id)).toEqual([evento.id])
    }
  })

  it('sin corridas: la ventana es de 24 h', async () => {
    const userId = uuid()
    const categoriaId = uuid()
    const ahora = salta('2026-10-20T12:00:00')
    const dentro = eventoRow({ category_id: categoriaId, created_at: hastaISO('2026-10-19T13:00:00') }) // 23h antes
    const afuera = eventoRow({ category_id: categoriaId, created_at: hastaISO('2026-10-19T11:00:00') }) // 25h antes

    const { resultado } = await cargar(
      {
        job_runs: [],
        user_followed_categories: [{ user_id: userId, category_id: categoriaId }],
        user_followed_venues: [],
        user_followed_instagram_accounts: [],
        events: [dentro, afuera],
      },
      { userIds: [userId], ahora },
    )

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.porUsuario.get(userId)?.map((n) => n.id)).toEqual([dentro.id])
  })

  it('un evento seguido por Instagram (por el flyer) entra, y un flyer con `event_id` no uuid se ignora', async () => {
    const userId = uuid()
    const cuentaId = uuid()
    const ahora = salta('2026-10-20T12:00:00')

    const eventoConFlyerValido = eventoRow({ created_at: hastaISO('2026-10-20T10:00:00') })
    const eventoConFlyerInvalido = eventoRow({ created_at: hastaISO('2026-10-20T10:00:00') })

    const { resultado } = await cargar(
      {
        job_runs: [],
        user_followed_categories: [],
        user_followed_venues: [],
        user_followed_instagram_accounts: [{ user_id: userId, instagram_account_id: cuentaId }],
        events: [eventoConFlyerValido, eventoConFlyerInvalido],
        instagram_flyers: [
          { account_id: cuentaId, status: 'ACTIVE', ai_status: 'PROCESSED', ai_metadata: { event_id: eventoConFlyerValido.id } },
          { account_id: cuentaId, status: 'ACTIVE', ai_status: 'PROCESSED', ai_metadata: { event_id: 'no-es-un-uuid' } },
        ],
      },
      { userIds: [userId], ahora },
    )

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.porUsuario.get(userId)?.map((n) => n.id)).toEqual([eventoConFlyerValido.id])
  })

  it('nadie sigue nada: devuelve un mapa vacío y no se lee `events`', async () => {
    const userId = uuid()
    const ahora = salta('2026-10-20T12:00:00')

    const { resultado, registro } = await cargar(
      {
        job_runs: [],
        user_followed_categories: [],
        user_followed_venues: [],
        user_followed_instagram_accounts: [],
      },
      { userIds: [userId], ahora },
    )

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.porUsuario.size).toBe(0)
    expect(registro.events).toBeUndefined()
  })

  it('una lectura con error: `ok: false`, con la tabla', async () => {
    const userId = uuid()
    const categoriaId = uuid()
    const ahora = salta('2026-10-20T12:00:00')

    const { resultado } = await cargar(
      {
        job_runs: [],
        user_followed_categories: [{ user_id: userId, category_id: categoriaId }],
        user_followed_venues: [],
        user_followed_instagram_accounts: [],
        events: [],
      },
      { userIds: [userId], ahora },
      { events: 'conexión perdida' },
    )

    expect(resultado).toEqual({ ok: false, tabla: 'events' })
    expect(console.error).toHaveBeenCalled()
    const [, mensaje] = (console.error as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string]
    expect(mensaje).toBe('conexión perdida')
  })

  it('dos usuarios que siguen cosas distintas no ven las novedades del otro', async () => {
    const userA = uuid()
    const userB = uuid()
    const categoriaA = uuid()
    const categoriaB = uuid()
    const ahora = salta('2026-10-20T12:00:00')

    const eventoA = eventoRow({ category_id: categoriaA, created_at: hastaISO('2026-10-20T10:00:00') })
    const eventoB = eventoRow({ category_id: categoriaB, created_at: hastaISO('2026-10-20T10:00:00') })

    const { resultado } = await cargar(
      {
        job_runs: [],
        user_followed_categories: [
          { user_id: userA, category_id: categoriaA },
          { user_id: userB, category_id: categoriaB },
        ],
        user_followed_venues: [],
        user_followed_instagram_accounts: [],
        events: [eventoA, eventoB],
      },
      { userIds: [userA, userB], ahora },
    )

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.porUsuario.get(userA)?.map((n) => n.id)).toEqual([eventoA.id])
    expect(resultado.porUsuario.get(userB)?.map((n) => n.id)).toEqual([eventoB.id])
  })
})
