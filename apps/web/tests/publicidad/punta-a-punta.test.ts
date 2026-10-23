/**
 * R58, 58-q: los tests que cruzan tareas, de punta a punta y sin red ni base.
 *
 * La ruta del cron (58-b), las acciones del admin (58-c), `/anunciantes` y
 * `/reporte/<token>` (58-d) y la ruta de notificaciones (58-e) corren contra el
 * MISMO doble en memoria de Supabase (`_soporte/doble-supabase.ts`), que respeta
 * los filtros, separa la service key de la sesión del admin y emula los check de
 * la migración. El reloj (solo `Date`) y el `fetch` son inventados.
 *
 * Los `vi.mock` de más abajo solo cambian de dónde sale el cliente de Supabase:
 * `withJobRun` es el verdadero y escribe en la tabla `job_runs` del doble.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PRODUCTOS_CON_PRECIO } from '@qps/core/publicidad/formula'
import {
  PIE_TARIFARIO,
  TARIFARIO,
  VIGENCIA_TARIFARIO,
} from '@qps/core/publicidad/precios'
import { filasDe, sembrar, type Fila, type Llamada } from './_soporte/doble-supabase'
import {
  ADMIN_ID,
  ID_CAMPANIA,
  PUSH,
  SECRETO,
  crearFetch,
  entorno,
  fijarAhora,
  idEvento,
  reiniciar,
  sembrarDestacados,
  sembrarEscenarioPush,
  servicio,
} from './_soporte/entorno'

vi.mock('@/lib/supabase/server', async () => {
  const { servicio, sesion } = await import('./_soporte/entorno')
  return { createAdminClient: () => servicio(), createClient: async () => sesion() }
})
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))

import { GET as cronPublicidad } from '@/app/api/cron/publicidad/route'
import { GET as cronNotificaciones } from '@/app/api/cron/notificaciones/route'
import ReportePage from '@/app/reporte/[token]/page'
import {
  aprobarCiclo,
  cargarAudienciaYTipoCambio,
  reanudarPushPatrocinado,
} from '@/lib/admin/publicidad-actions'
import { cargarTarifarioVigente, type TarifarioVigente } from '@/lib/anunciantes/precios'

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const config = { tipoCambio: 1500 as number | null }
const red = crearFetch(config)
const entornoPrevio = { cron: process.env.CRON_SECRET, envioReal: process.env.PUSH_ENVIO_REAL }

function preparar() {
  vi.useFakeTimers({ toFake: ['Date'] })
  process.env.CRON_SECRET = SECRETO
  delete process.env.PUSH_ENVIO_REAL
  vi.stubGlobal('fetch', red.fetch)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
}

function limpiar() {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  if (entornoPrevio.cron === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = entornoPrevio.cron
  if (entornoPrevio.envioReal === undefined) delete process.env.PUSH_ENVIO_REAL
  else process.env.PUSH_ENVIO_REAL = entornoPrevio.envioReal
}

const encabezados = { authorization: `Bearer ${SECRETO}` }

/** Una corrida del cron de publicidad a la hora `iso`. */
async function correrPublicidad(iso: string): Promise<Record<string, unknown>> {
  fijarAhora(iso)
  const res = await cronPublicidad(new Request('http://localhost.test/api/cron/publicidad', { headers: encabezados }))
  expect(res.status).toBe(200)
  return (await res.json()) as Record<string, unknown>
}

/** La corrida de las 09:00 UTC (06:00 de Salta) de un día `AAAA-MM-DD`. */
const corridaDelDia = (dia: string) => correrPublicidad(`${dia}T09:00:00.000Z`)

async function correrNotificaciones(iso: string) {
  fijarAhora(iso)
  const res = await cronNotificaciones(new Request('http://localhost.test/api/cron/notificaciones', { headers: encabezados }))
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

function* diasEntre(desde: string, hasta: string): Generator<string> {
  for (let t = Date.parse(`${desde}T00:00:00Z`); t <= Date.parse(`${hasta}T00:00:00Z`); t += 86_400_000) {
    yield new Date(t).toISOString().slice(0, 10)
  }
}

const tabla = (nombre: string): Fila[] => filasDe(entorno.almacen, nombre)
const cicloDe = (ciclo: string): Fila | undefined => tabla('ad_price_cycles').find((c) => c.ciclo === ciclo)
const preciosDe = (ciclo: string): Record<string, Fila> =>
  Object.fromEntries(tabla('ad_prices').filter((p) => p.ciclo === ciclo).map((p) => [p.producto as string, p]))
const ars = (precios: Record<string, Fila>, producto: string): number => Number(precios[producto]?.precio_ars)
const hoyTarifario = (dia: string): Promise<TarifarioVigente> => cargarTarifarioVigente(servicio(), dia)

function listaArs(t: TarifarioVigente, id: string): number | null {
  const p = t.productos.find((x) => x.id === id)
  return p && p.precio.tipo === 'pesos' ? p.precio.listaArs : null
}

function fundadorArs(t: TarifarioVigente, id: string): number | null {
  const p = t.productos.find((x) => x.id === id)
  return p && p.precio.tipo === 'pesos' ? p.precio.fundadorArs : null
}

const SEIS = PRODUCTOS_CON_PRECIO.filter((p) => p !== 'push')

/** La tabla de aceptación del plan (audiencia 490, tramo 500, TC 1.530, factores 1, sin push). */
const LISTA_ACEPTACION: Record<string, number> = {
  'destacado-3': 8500,
  'destacado-7': 14000,
  'destacado-14': 24000,
  'pack-lanzamiento': 20000,
  'plan-mensual': 42000,
  'plan-rrpp': 14500,
}
const FUNDADOR_ACEPTACION: Record<string, number> = {
  'destacado-3': 6000,
  'destacado-7': 10000,
  'destacado-14': 17000,
  'pack-lanzamiento': 14000,
  'plan-mensual': 29500,
  'plan-rrpp': 10000,
}

/** Un mes del ciclo: la corrida del día 1, la carga de la audiencia y la aprobación del admin. */
async function mesCompleto(ciclo: string, audiencia: number) {
  const corrida = await corridaDelDia(ciclo)
  const carga = await cargarAudienciaYTipoCambio({ ciclo, audienciaWeb28d: audiencia })
  const aprobacion = await aprobarCiclo({ ciclo })
  expect(carga).toMatchObject({ ok: true, sinFila: [] })
  expect(aprobacion).toEqual({ ok: true })
  return { corrida, fila: cicloDe(ciclo) as Fila, precios: preciosDe(ciclo) }
}

// ---------------------------------------------------------------------------
// 1. Tres meses, del 1/11 al 31/1
// ---------------------------------------------------------------------------

describe('R58 de punta a punta: tres meses de corridas diarias', () => {
  const c: {
    nov1a?: Record<string, unknown>
    nov1b?: Record<string, unknown>
    cicloNovTrasSegundaCorrida?: Fila
    dic1?: Record<string, unknown>
    cicloDicPropuesto?: Fila
    tarifarioDicAntes?: TarifarioVigente
    tarifarioDicTrasCarga?: TarifarioVigente
    cargaDic?: unknown
    aprobacionDic?: unknown
    llamadasAdminDic?: Llamada[]
    llamadasDelAdmin?: Llamada[]
    cicloDicAprobado?: Fila
    preciosDic?: Record<string, Fila>
    tarifarioDic?: TarifarioVigente
    ene1?: Record<string, unknown>
    cicloEne?: Fila
    preciosEne?: Record<string, Fila>
    preciosEnePropuestos?: Record<string, Fila>
    tarifarioEneAntes?: TarifarioVigente
    tarifarioEne?: TarifarioVigente
    ocupacion?: Fila[]
    reportes?: Fila[]
    jobRuns?: Fila[]
    corridas?: Array<Record<string, unknown>>
  } = {}

  beforeAll(async () => {
    preparar()
    reiniciar()
    const a = entorno.almacen
    // Seis destacados vigentes todo el período (el Hero lleno: 100% de ocupación).
    sembrarDestacados(a, { cantidad: 6, hasta: '2027-01-01T00:00:00.000Z' })
    // Métricas del primero: vistas y clics de la campaña (featured) y de la búsqueda (no cuentan).
    sembrar(a, 'event_metrics_daily', [
      { event_id: idEvento(1), day: '2026-12-05', origin: 'home', featured: true, views: 100, clicks: 5 },
      { event_id: idEvento(1), day: '2026-12-06', origin: 'search', featured: false, views: 40, clicks: 40 },
    ])
    c.corridas = []

    // --- Noviembre ---
    config.tipoCambio = 1500
    c.nov1a = await corridaDelDia('2026-11-01')
    c.corridas.push(c.nov1a)
    // Segunda corrida el mismo día, con otro dólar: no puede tocar nada.
    config.tipoCambio = 1600
    c.nov1b = await correrPublicidad('2026-11-01T15:00:00.000Z')
    c.corridas.push(c.nov1b)
    c.cicloNovTrasSegundaCorrida = cicloDe('2026-11-01')
    config.tipoCambio = 1500
    for (const dia of diasEntre('2026-11-02', '2026-11-30')) c.corridas.push(await corridaDelDia(dia))

    // --- Diciembre: se propone, se mira antes, el admin carga y aprueba ---
    config.tipoCambio = 1530
    c.dic1 = await corridaDelDia('2026-12-01')
    c.corridas.push(c.dic1)
    c.cicloDicPropuesto = cicloDe('2026-12-01')
    c.tarifarioDicAntes = await hoyTarifario('2026-12-01')

    // Solo lo que hace el admin (la lectura de /anunciantes de en medio es de la service key y no cuenta).
    const desdeCarga = a.llamadas.length
    c.cargaDic = await cargarAudienciaYTipoCambio({ ciclo: '2026-12-01', audienciaWeb28d: 490 })
    const hastaCarga = a.llamadas.length
    c.tarifarioDicTrasCarga = await hoyTarifario('2026-12-01')
    const desdeAprobacion = a.llamadas.length
    c.aprobacionDic = await aprobarCiclo({ ciclo: '2026-12-01' })
    const delAdmin = [...a.llamadas.slice(desdeCarga, hastaCarga), ...a.llamadas.slice(desdeAprobacion)]
    c.llamadasDelAdmin = delAdmin
    c.llamadasAdminDic = delAdmin.filter((l) => l.op !== 'select')
    c.cicloDicAprobado = cicloDe('2026-12-01')
    c.preciosDic = preciosDe('2026-12-01')
    c.tarifarioDic = await hoyTarifario('2026-12-15')
    for (const dia of diasEntre('2026-12-02', '2026-12-31')) c.corridas.push(await corridaDelDia(dia))

    // --- Enero: el factor del Hero sube ---
    c.ene1 = await corridaDelDia('2027-01-01')
    c.corridas.push(c.ene1)
    c.cicloEne = cicloDe('2027-01-01')
    c.preciosEnePropuestos = preciosDe('2027-01-01')
    c.tarifarioEneAntes = await hoyTarifario('2027-01-02')
    expect(await aprobarCiclo({ ciclo: '2027-01-01' })).toEqual({ ok: true })
    c.preciosEne = preciosDe('2027-01-01')
    c.tarifarioEne = await hoyTarifario('2027-01-15')
    for (const dia of diasEntre('2027-01-02', '2027-01-31')) c.corridas.push(await corridaDelDia(dia))

    c.ocupacion = tabla('ad_occupancy_daily')
    c.reportes = tabla('ad_campaign_reports')
    c.jobRuns = tabla('job_runs')
  }, 120_000)

  afterAll(limpiar)

  it('93 corridas (92 días y una repetida): todas SUCCESS y registradas como "publicidad" en job_runs', () => {
    expect(c.corridas).toHaveLength(93)
    expect(c.corridas?.every((r) => r.status === 'SUCCESS' && r.pasosConError === 0)).toBe(true)
    expect(c.jobRuns).toHaveLength(93)
    expect(c.jobRuns?.every((r) => r.job_key === 'publicidad' && r.status === 'SUCCESS')).toBe(true)
  })

  it('dos corridas el mismo día: una sola fila de ocupación y un solo ciclo, sin tocar el primero', () => {
    expect(c.nov1a).toMatchObject({ ocupacion: 'ok', ciclo: 'creado' })
    expect(c.nov1b).toMatchObject({ ocupacion: 'ok', ciclo: 'ya-existia' })
    expect(c.ocupacion?.filter((f) => f.day === '2026-11-01')).toHaveLength(1)
    // 30 días de noviembre + 31 de diciembre + 31 de enero: un día, una fila.
    expect(c.ocupacion).toHaveLength(92)
    expect(tabla('ad_price_cycles').map((x) => x.ciclo)).toEqual(['2026-11-01', '2026-12-01', '2027-01-01'])
    // El dólar de la segunda corrida (1.600) no pisó el del ciclo.
    expect(c.cicloNovTrasSegundaCorrida).toMatchObject({ tipo_cambio: 1500, fuente_tipo_cambio: 'dolarapi' })
    // Y los precios del ciclo no se duplicaron: seis por ciclo (el push no se vende sin dispositivos).
    expect(tabla('ad_prices').filter((p) => p.ciclo === '2026-11-01')).toHaveLength(6)
  })

  it('noviembre y diciembre: el Hero lleno (6 de 6 cupos) todos los días', () => {
    const delPeriodo = (c.ocupacion ?? []).filter((f) => String(f.day) >= '2026-11-01' && String(f.day) <= '2026-12-31')
    expect(delPeriodo).toHaveLength(61)
    expect(delPeriodo.every((f) => f.hero_ocupados === 6 && f.hero_cupos === 6)).toBe(true)
  })

  it('el ciclo del 1/12 se propone: estado "propuesto", audiencia manual y el dólar de la fuente', () => {
    expect(c.dic1).toMatchObject({ ciclo: 'creado' })
    expect(c.cicloDicPropuesto).toMatchObject({
      estado: 'propuesto',
      fuente_audiencia: 'manual',
      fuente_tipo_cambio: 'dolarapi',
      tipo_cambio: 1530,
      approved_at: null,
      approved_by: null,
      mau_app_28d: null,
      dispositivos_push: null,
      // Noviembre estuvo lleno: la ocupación que mira el ciclo es la del mes anterior.
      ocupacion_hero: 1,
    })
  })

  it('antes de aprobar el ciclo, /anunciantes muestra exactamente el respaldo de precios.ts (con propuestas cargadas y todo)', () => {
    // Hay filas "propuesto" en ad_prices (la service key las ve todas): no deben llegar a la página.
    expect(Object.keys(preciosDe('2026-12-01'))).toHaveLength(6)
    for (const t of [c.tarifarioDicAntes, c.tarifarioDicTrasCarga]) {
      expect(t?.productos).toEqual([...TARIFARIO])
      expect(t?.pie).toBe(PIE_TARIFARIO)
      expect(t?.vigencia).toBe(VIGENCIA_TARIFARIO)
      expect(t?.aviso).toBeNull()
    }
  })

  it('el admin carga la audiencia y aprueba con SU sesión: ninguna llamada de la service key y approved_by es el admin', () => {
    expect(c.cargaDic).toEqual({ ok: true, sinFila: [] })
    expect(c.aprobacionDic).toEqual({ ok: true })
    expect(c.llamadasDelAdmin?.length).toBeGreaterThan(0)
    expect(c.llamadasDelAdmin?.every((l) => l.rol === 'admin')).toBe(true)
    expect(c.cicloDicAprobado).toMatchObject({ estado: 'aprobado', audiencia_web_28d: 490, audiencia: 490, fuente_audiencia: 'manual', approved_by: ADMIN_ID })
    expect(typeof c.cicloDicAprobado?.approved_at).toBe('string')
    expect(Object.values(c.preciosDic ?? {}).every((p) => p.estado === 'aprobado')).toBe(true)
    // Escribió solo en las tablas que le tocan, nunca insertó (la RLS no se lo permite).
    expect(c.llamadasAdminDic?.map((l) => l.op).includes('insert')).toBe(false)
    expect(new Set(c.llamadasAdminDic?.map((l) => l.tabla))).toEqual(new Set(['ad_price_cycles', 'ad_prices']))
  })

  it('después de aprobar: los precios de la tabla de aceptación (8.500 ... 14.500), fundador incluido, y el pie con la fecha del ciclo', () => {
    for (const p of SEIS) {
      expect(listaArs(c.tarifarioDic as TarifarioVigente, p), `lista de ${p}`).toBe(LISTA_ACEPTACION[p])
      expect(fundadorArs(c.tarifarioDic as TarifarioVigente, p), `fundador de ${p}`).toBe(FUNDADOR_ACEPTACION[p])
    }
    expect(c.tarifarioDic?.vigencia).toBe('diciembre 2026')
    expect(c.tarifarioDic?.pie).toContain('dólar BNA del 1/12/2026')
    expect(c.tarifarioDic?.pie).not.toContain('1/11/2026')
    // El push sigue sin precio ("Próximamente"): no hay dispositivos.
    expect(c.tarifarioDic?.productos.find((p) => p.id === 'push')?.precio.tipo).toBe('proximamente')
    expect(c.tarifarioDic?.aviso).toBeNull()
  })

  it('el 1/1 el factor del Hero sube a 1,15 y los precios del destacado suben', () => {
    expect(c.ene1).toMatchObject({ ciclo: 'creado' })
    expect(c.cicloEne).toMatchObject({
      estado: 'propuesto',
      factor_hero: 1.15,
      ocupacion_hero: 1,
      // La audiencia cargada a mano en diciembre se arrastra a enero.
      audiencia_web_28d: 490,
      tramo_vigente: 500,
      tipo_cambio: 1530,
    })
    expect(c.cicloDicAprobado).toMatchObject({ factor_hero: 1 })
    for (const p of ['destacado-3', 'destacado-7', 'destacado-14', 'pack-lanzamiento', 'plan-mensual']) {
      expect(ars(c.preciosEnePropuestos ?? {}, p), p).toBeGreaterThan(ars(c.preciosDic ?? {}, p))
    }
    expect(ars(c.preciosEnePropuestos ?? {}, 'destacado-7')).toBe(16000)
  })

  it('enero propuesto no se publica; ya aprobado, /anunciantes muestra los precios nuevos y la fecha del 1/1', () => {
    expect(listaArs(c.tarifarioEneAntes as TarifarioVigente, 'destacado-7')).toBe(14000)
    expect(c.tarifarioEneAntes?.pie).toContain('dólar BNA del 1/12/2026')
    expect(listaArs(c.tarifarioEne as TarifarioVigente, 'destacado-7')).toBe(16000)
    expect(fundadorArs(c.tarifarioEne as TarifarioVigente, 'destacado-7')).toBe(11000)
    expect(c.tarifarioEne?.pie).toContain('dólar BNA del 1/1/2027')
    expect(c.tarifarioEne?.vigencia).toBe('enero 2027')
  })

  it('los seis destacados que terminaron el 1/1 tienen un reporte cada uno, creado una sola vez a pesar de 31 corridas', () => {
    expect(c.reportes).toHaveLength(6)
    expect(new Set(c.reportes?.map((r) => r.event_id)).size).toBe(6)
    expect(c.reportes?.every((r) => r.tipo === 'destacado' && r.sponsored_campaign_id === null)).toBe(true)
    const tokens = (c.reportes ?? []).map((r) => String(r.token))
    expect(new Set(tokens).size).toBe(6)
    expect(tokens.every((t) => /^[0-9a-f]{32}$/.test(t))).toBe(true)
  })

  it('el reporte del primer destacado cuenta solo las filas featured y no las de la búsqueda', () => {
    const r = c.reportes?.find((x) => x.event_id === idEvento(1))
    // Del 30/10 al 31/12 (hora de Salta): 63 días; 500 × 0,7 × 63 / 30 = 735.
    expect(r?.metricas).toEqual({ dias: 63, vistas: 100, clics: 5, alcanceEstimado: 735 })
  })

  it('/reporte/<token> muestra las cantidades del reporte y nada más', async () => {
    const r = c.reportes?.find((x) => x.event_id === idEvento(1)) as Fila
    const html = renderToStaticMarkup(await ReportePage({ params: Promise.resolve({ token: String(r.token) }) }))
    expect(html).toContain('Evento Destacado de Prueba 1')
    expect(html).toContain('Vistas de la ficha del evento')
    expect(html).toContain('Clics a entradas')
    expect(html).toContain('735')
    expect(html).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  })
})

// ---------------------------------------------------------------------------
// 2. La histéresis del cambio de tramo
// ---------------------------------------------------------------------------

describe('R58 de punta a punta: la histéresis del tramo', () => {
  type Mes = Awaited<ReturnType<typeof mesCompleto>> & { tarifario: TarifarioVigente }
  const meses: Record<string, Mes> = {}

  beforeAll(async () => {
    preparar()
    const a = reiniciar()
    // Tres destacados de seis (50% de ocupación): ni sube ni baja el factor de demanda.
    sembrarDestacados(a, { cantidad: 3, hasta: '2030-01-01T00:00:00.000Z' })
    config.tipoCambio = 1500
    const plan: Array<[string, number]> = [
      ['2027-01-01', 500],
      ['2027-02-01', 800], // pasa de 750 en UN solo ciclo
      ['2027-03-01', 600], // vuelve abajo
      ['2027-04-01', 800], // pasa de nuevo...
      ['2027-05-01', 900], // ...y se queda: dos ciclos seguidos
      ['2027-06-01', 900], // el ciclo siguiente aplica el tramo
    ]
    for (const [ciclo, audiencia] of plan) {
      const mes = await mesCompleto(ciclo, audiencia)
      meses[ciclo] = { ...mes, tarifario: await hoyTarifario(`${ciclo.slice(0, 8)}20`) }
    }
  }, 60_000)

  afterAll(limpiar)

  it('la audiencia pasa los 750 en un solo ciclo: el tramo vigente sigue en 500, sin cambio anunciado ni aviso', () => {
    const feb = meses['2027-02-01']
    expect(feb.fila).toMatchObject({ audiencia: 800, tramo_vigente: 500, cambio_tramo_desde: null })
    expect(feb.tarifario.aviso).toBeNull()
    expect(feb.precios['destacado-7']).toMatchObject({ tramo_ref: 500, precio_ars: 13500 })
    // Y al mes siguiente vuelve abajo: tampoco hay aviso, ni cambio.
    const mar = meses['2027-03-01']
    expect(mar.fila).toMatchObject({ audiencia: 600, tramo_vigente: 500, cambio_tramo_desde: null })
    expect(mar.tarifario.aviso).toBeNull()
    // Un 800 aislado en abril tampoco cambia nada (el anterior, marzo, estaba abajo).
    const abr = meses['2027-04-01']
    expect(abr.fila).toMatchObject({ audiencia: 800, tramo_vigente: 500, cambio_tramo_desde: null })
    expect(abr.tarifario.aviso).toBeNull()
  })

  it('dos ciclos seguidos arriba: /anunciantes avisa "Desde el 1/6, los precios pasan al tramo de 1.000 personas." y todavía no cambia el precio', () => {
    const may = meses['2027-05-01']
    expect(may.fila).toMatchObject({ tramo_vigente: 500, tramo_calculado: 1000, cambio_tramo_desde: '2027-06-01' })
    expect(may.tarifario.aviso).toBe('Desde el 1/6, los precios pasan al tramo de 1.000 personas.')
    expect(may.precios['destacado-7']).toMatchObject({ tramo_ref: 500, precio_ars: 13500 })
    expect(listaArs(may.tarifario, 'destacado-7')).toBe(13500)
  })

  it('el ciclo siguiente aplica el tramo nuevo (precios más altos) y el aviso desaparece', () => {
    const jun = meses['2027-06-01']
    expect(jun.fila).toMatchObject({ tramo_vigente: 1000, cambio_tramo_desde: null })
    expect(jun.precios['destacado-7']).toMatchObject({ tramo_ref: 1000, precio_ars: 15500 })
    expect(listaArs(jun.tarifario, 'destacado-7')).toBe(15500)
    expect(jun.tarifario.aviso).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 3. El trinquete del tipo de cambio
// ---------------------------------------------------------------------------

describe('R58 de punta a punta: el trinquete', () => {
  /** Diciembre aprobado a 1.530 y enero al dólar `tcEnero`, con la misma audiencia. */
  async function dosMeses(tcEnero: number) {
    const a = reiniciar()
    sembrarDestacados(a, { cantidad: 3, hasta: '2030-01-01T00:00:00.000Z' })
    config.tipoCambio = 1530
    const dic = await mesCompleto('2026-12-01', 490)
    config.tipoCambio = tcEnero
    const ene = await mesCompleto('2027-01-01', 490)
    return { dic, ene }
  }

  let baja5: Awaited<ReturnType<typeof dosMeses>>
  let baja12: Awaited<ReturnType<typeof dosMeses>>

  beforeAll(async () => {
    preparar()
    baja5 = await dosMeses(1453.5) // -5%
    baja12 = await dosMeses(1346.4) // -12%
  }, 60_000)

  afterAll(limpiar)

  it('el dólar baja 5%: ningún precio en pesos baja (ni el de lista ni el fundador)', () => {
    expect(baja5.ene.fila).toMatchObject({ tipo_cambio: 1453.5, fuente_tipo_cambio: 'dolarapi' })
    for (const p of SEIS) {
      expect(ars(baja5.ene.precios, p), p).toBe(ars(baja5.dic.precios, p))
      expect(Number(baja5.ene.precios[p].precio_fundador_ars), p).toBe(Number(baja5.dic.precios[p].precio_fundador_ars))
    }
    expect(ars(baja5.ene.precios, 'destacado-7')).toBe(14000)
  })

  it('el dólar baja 12%: los precios en pesos bajan, todos', () => {
    expect(baja12.ene.fila).toMatchObject({ tipo_cambio: 1346.4 })
    for (const p of SEIS) {
      expect(ars(baja12.ene.precios, p), p).toBeLessThan(ars(baja12.dic.precios, p))
    }
    expect(ars(baja12.ene.precios, 'destacado-7')).toBe(12500)
  })

  it('la lista pública acompaña: con -5% sigue en 14.000 y con -12% pasa a 12.500', async () => {
    // Cada escenario tiene su propio almacén: se vuelve a levantar el de -5% para leer /anunciantes.
    const a = reiniciar()
    sembrarDestacados(a, { cantidad: 3, hasta: '2030-01-01T00:00:00.000Z' })
    config.tipoCambio = 1530
    await mesCompleto('2026-12-01', 490)
    config.tipoCambio = 1453.5
    await mesCompleto('2027-01-01', 490)
    expect(listaArs(await hoyTarifario('2027-01-20'), 'destacado-7')).toBe(14000)
  })
})

// ---------------------------------------------------------------------------
// 4. El reporte de una campaña que termina
// ---------------------------------------------------------------------------

describe('R58 de punta a punta: el reporte al anunciante', () => {
  const c: {
    corrida?: Record<string, unknown>
    reportes?: Fila[]
    html?: string
    htmlPush?: string
    error404Inventado?: string
    error404Invalido?: string
    llamadasInvalido?: number
    llamadasAntes?: number
  } = {}

  const ID_EVENTO_PUSH = idEvento(80)
  const ID_CAMPANIA_PUSH = '00000000-0000-4000-8000-0000000000c9'

  beforeAll(async () => {
    preparar()
    const a = reiniciar()
    // Diciembre propuesto, cargado y aprobado de verdad: el precio de lista del reporte sale de ahí.
    config.tipoCambio = 1530
    await mesCompleto('2026-12-01', 490)
    // Un destacado de 7 días (1/12 al 8/12) y un push que terminó el mismo día.
    sembrar(a, 'events', [
      {
        id: idEvento(70),
        title: 'Peña de Prueba',
        slug: 'pena-de-prueba',
        status: 'PUBLISHED',
        start_date: '2026-12-08T23:00:00.000Z',
        end_date: null,
        featured_set_at: '2026-12-01T12:00:00.000Z',
        featured_until: '2026-12-08T12:00:00.000Z',
        created_at: '2026-09-01T00:00:00.000Z',
      },
      {
        id: ID_EVENTO_PUSH,
        title: 'Festival de Prueba',
        slug: 'festival-de-prueba',
        status: 'PUBLISHED',
        start_date: '2026-12-20T23:00:00.000Z',
        end_date: null,
        featured_set_at: null,
        featured_until: null,
        created_at: '2026-09-01T00:00:00.000Z',
      },
    ])
    sembrar(a, 'sponsored_campaigns', [
      {
        id: ID_CAMPANIA_PUSH,
        title: 'Campaña de Prueba',
        body: 'Cuerpo de la campaña de prueba',
        event_id: ID_EVENTO_PUSH,
        starts_at: '2026-12-07T00:00:00.000Z',
        ends_at: '2026-12-08T12:00:00.000Z',
        sent_at: '2026-12-07T15:00:00.000Z',
        destinatarios: 200,
        bajas_48h: 3,
        bajas_medidas_at: '2026-12-10T00:00:00.000Z',
        created_by: null,
      },
    ])
    const fila = (day: string, featured: boolean, origin: string, views: number, clicks: number): Fila => ({
      event_id: idEvento(70),
      day,
      featured,
      origin,
      views,
      clicks,
    })
    sembrar(a, 'event_metrics_daily', [
      // La campaña: seis días de destacado (100 vistas y 5 clics por día)...
      ...['2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06', '2026-12-07'].map((d) => fila(d, true, 'home', 100, 5)),
      // ...una fila sin destacado (no es de la campaña) y otra de otra fecha (afuera).
      fila('2026-12-03', false, 'search', 40, 40),
      fila('2026-12-20', true, 'home', 999, 99),
      { event_id: ID_EVENTO_PUSH, day: '2026-12-07', featured: false, origin: 'home', views: 30, clicks: 4 },
    ])

    c.llamadasAntes = a.llamadas.length
    c.corrida = await correrPublicidad('2026-12-09T09:00:00.000Z')
    c.reportes = tabla('ad_campaign_reports')

    const destacado = c.reportes.find((r) => r.tipo === 'destacado') as Fila
    c.html = renderToStaticMarkup(await ReportePage({ params: Promise.resolve({ token: String(destacado.token) }) }))
    const push = c.reportes.find((r) => r.tipo === 'push') as Fila
    c.htmlPush = renderToStaticMarkup(await ReportePage({ params: Promise.resolve({ token: String(push.token) }) }))

    const inventado = 'ab'.repeat(16) // 32 hex, bien formado, no existe
    const antes = a.llamadas.length
    c.error404Inventado = await ReportePage({ params: Promise.resolve({ token: inventado }) }).then(
      () => 'sin error',
      (e: unknown) => String(e),
    )
    const trasInventado = a.llamadas.length
    c.error404Invalido = await ReportePage({ params: Promise.resolve({ token: 'no-es-un-token' }) }).then(
      () => 'sin error',
      (e: unknown) => String(e),
    )
    c.llamadasInvalido = a.llamadas.length - trasInventado
    expect(trasInventado - antes).toBeGreaterThan(0)
  }, 60_000)

  afterAll(limpiar)

  it('la corrida crea un reporte por campaña que terminó: uno de destacado y uno de push', () => {
    expect(c.corrida).toMatchObject({ status: 'SUCCESS', reportes: 2 })
    expect(c.reportes?.map((r) => r.tipo).sort()).toEqual(['destacado', 'push'])
    const push = c.reportes?.find((r) => r.tipo === 'push')
    expect(push?.sponsored_campaign_id).toBe(ID_CAMPANIA_PUSH)
  })

  it('el reporte del destacado: solo las filas featured dentro de las fechas, el alcance estimado y el precio de lista aprobado', () => {
    const r = c.reportes?.find((x) => x.tipo === 'destacado')
    // Del 1/12 al 8/12 (hora de Salta): 8 días; 500 × 0,7 × 8 / 30 = 93.
    expect(r?.metricas).toEqual({ dias: 8, vistas: 600, clics: 30, alcanceEstimado: 93 })
    expect(r?.precio_ars).toBe(14000)
  })

  it('el reporte del push lleva destinatarios y bajas, y no tiene precio (todavía no se vende)', () => {
    const r = c.reportes?.find((x) => x.tipo === 'push')
    expect(r?.metricas).toMatchObject({ vistas: 30, clics: 4, destinatarios: 200, bajas48h: 3 })
    expect(r?.precio_ars).toBeNull()
  })

  it('/reporte/<token> del destacado muestra las cantidades, el costo por clic y la referencia de Meta', () => {
    const html = c.html as string
    expect(html).toContain('Peña de Prueba')
    expect(html).toContain('Destacado en la portada')
    expect(html).toContain('600')
    expect(html).toContain('Clics a entradas')
    expect(html).toContain('93')
    // 14.000 / 30 clics = 466,67.
    expect(html).toContain('$ 467 por clic')
    expect(html).toContain('referencia del estudio de precios, octubre 2026')
    expect(html).not.toContain('999')
    expect(html).not.toContain('Salió más barato')
  })

  it('/reporte/<token> del push muestra a cuántas personas llegó el aviso', () => {
    const html = c.htmlPush as string
    expect(html).toContain('Push patrocinado')
    expect(html).toContain('Festival de Prueba')
    expect(html).toContain('Personas a las que llegó el aviso')
    expect(html).toContain('200')
  })

  it('un token inventado con la misma forma y uno inválido dan EL MISMO 404, y el inválido no abre la base', () => {
    expect(c.error404Inventado).toBe('Error: NEXT_NOT_FOUND')
    expect(c.error404Invalido).toBe(c.error404Inventado)
    expect(c.llamadasInvalido).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 5. Bajas, pausa, envío y reanudar
// ---------------------------------------------------------------------------

describe('R58 de punta a punta: bajas, pausa, envío y reanudar', () => {
  const c: {
    medicion?: Record<string, unknown>
    ajustesTrasMedicion?: Fila
    campaniaTrasMedicion?: Fila
    envioPausado?: { status: number; body: Record<string, unknown> }
    enviosExpoPausado?: Array<{ to: string }>
    sendsTrasPausa?: Fila[]
    campaniaTrasPausa?: Fila
    otraCorrida?: Record<string, unknown>
    ajustesTrasOtraCorrida?: Fila
    reanudar?: unknown
    ajustesTrasReanudar?: Fila
    llamadasReanudar?: Array<{ rol: string }>
    envioReanudado?: { status: number; body: Record<string, unknown> }
    enviosExpoReanudado?: Array<{ to: string }>
    sendsTrasReanudar?: Fila[]
    campaniaFinal?: Fila
  } = {}

  beforeAll(async () => {
    preparar()
    process.env.PUSH_ENVIO_REAL = '1'
    const a = reiniciar()
    config.tipoCambio = 1530
    // Una campaña con 200 destinatarios y 5 bajas en 48 h (2,5% > 2%).
    sembrarEscenarioPush(a, { destinatarios: 200, bajasEnVentana: 5 })

    c.medicion = await correrPublicidad(PUSH.AHORA)
    c.ajustesTrasMedicion = tabla('ad_settings')[0]
    c.campaniaTrasMedicion = tabla('sponsored_campaigns')[0]

    // La ruta de notificaciones, en modo real, con la pausa activa.
    const enviadosAntes = red.enviadosAExpo.length
    c.envioPausado = await correrNotificaciones(PUSH.AHORA)
    c.enviosExpoPausado = red.enviadosAExpo.slice(enviadosAntes)
    c.sendsTrasPausa = tabla('notification_sends').filter((s) => s.user_id === PUSH.USUARIO_A || s.user_id === PUSH.USUARIO_B)
    c.campaniaTrasPausa = tabla('sponsored_campaigns')[0]

    // Otra corrida de publicidad: no vuelve a medir ni toca la pausa.
    c.otraCorrida = await correrPublicidad('2026-12-13T00:30:00.000Z')
    c.ajustesTrasOtraCorrida = tabla('ad_settings')[0]

    // El admin reanuda con su sesión.
    const desde = a.llamadas.length
    c.reanudar = await reanudarPushPatrocinado()
    c.llamadasReanudar = a.llamadas.slice(desde)
    c.ajustesTrasReanudar = tabla('ad_settings')[0]

    // La siguiente corrida de notificaciones sí manda el patrocinado.
    const enviadosAntesDeReanudar = red.enviadosAExpo.length
    c.envioReanudado = await correrNotificaciones('2026-12-13T00:35:00.000Z')
    c.enviosExpoReanudado = red.enviadosAExpo.slice(enviadosAntesDeReanudar)
    c.sendsTrasReanudar = tabla('notification_sends').filter((s) => s.user_id === PUSH.USUARIO_A || s.user_id === PUSH.USUARIO_B)
    c.campaniaFinal = tabla('sponsored_campaigns')[0]
  }, 60_000)

  afterAll(limpiar)

  it('la corrida de publicidad mide 5 bajas de 200 (2,5% > 2%), pausa y guarda solo cantidades', () => {
    expect(c.medicion).toMatchObject({ status: 'SUCCESS', bajasMedidas: 1, pausado: true })
    expect(c.campaniaTrasMedicion).toMatchObject({ destinatarios: 200, bajas_48h: 5 })
    expect(typeof c.campaniaTrasMedicion?.bajas_medidas_at).toBe('string')
    expect(typeof c.ajustesTrasMedicion?.push_patrocinado_pausado_at).toBe('string')
    expect(c.ajustesTrasMedicion?.push_patrocinado_pausa_motivo).toBe('Bajas en 48 h: 5 de 200 (umbral 2%), campaña del 10/12')
  })

  it('con la pausa: la ruta de notificaciones no manda el patrocinado y sí el favorito', () => {
    expect(c.envioPausado?.status).toBe(200)
    expect(c.envioPausado?.body).toMatchObject({ dryRun: false, patrocinadoPausado: true, patrocinados: 0, porTipo: { favorito: 1 } })
    expect(c.enviosExpoPausado).toEqual([expect.objectContaining({ to: PUSH.TOKEN_A })])
    expect(c.sendsTrasPausa?.map((s) => s.kind)).toEqual(['favorito'])
    // Con la pausa no se toca la campaña (ni destinatarios ni sent_at).
    expect(c.campaniaTrasPausa).toMatchObject({ destinatarios: 200, sent_at: PUSH.ENVIADA })
  })

  it('otra corrida de publicidad después: no vuelve a medir la campaña ni levanta la pausa', () => {
    expect(c.otraCorrida).toMatchObject({ status: 'SUCCESS', bajasMedidas: 0, pausado: false })
    expect(c.ajustesTrasOtraCorrida).toEqual(c.ajustesTrasMedicion)
  })

  it('el admin reanuda con su sesión: borra la fecha y el motivo juntos (la base exige las dos) y deja su id', () => {
    expect(c.reanudar).toEqual({ ok: true })
    expect(c.llamadasReanudar?.length).toBeGreaterThan(0)
    expect(c.llamadasReanudar?.every((l) => l.rol === 'admin')).toBe(true)
    expect(c.ajustesTrasReanudar).toMatchObject({
      push_patrocinado_pausado_at: null,
      push_patrocinado_pausa_motivo: null,
      updated_by: ADMIN_ID,
    })
  })

  it('la siguiente corrida de notificaciones manda el patrocinado y recuenta los destinatarios', () => {
    expect(c.envioReanudado?.status).toBe(200)
    expect(c.envioReanudado?.body).toMatchObject({ patrocinados: 2, campaniaId: ID_CAMPANIA, porTipo: { patrocinado: 2 } })
    expect(c.envioReanudado?.body.patrocinadoPausado).toBeUndefined()
    expect(c.enviosExpoReanudado?.map((m) => m.to).sort()).toEqual([PUSH.TOKEN_A, PUSH.TOKEN_B].sort())
    const delPatrocinado = c.sendsTrasReanudar?.filter((s) => s.campaign_id === ID_CAMPANIA)
    expect(delPatrocinado).toHaveLength(2)
    // 200 de antes y 2 de ahora; las 5 bajas medidas siguen donde estaban.
    expect(c.campaniaFinal).toMatchObject({ destinatarios: 202, bajas_48h: 5 })
  })
})

describe('R58 de punta a punta: el umbral de bajas', () => {
  beforeAll(preparar)
  afterAll(limpiar)

  it.each([
    ['justo en el umbral (4 de 200 = 2%): no pausa, el umbral es estricto', 4, 0, false],
    ['4 en la ventana y 10 fuera de ella (antes del envío o pasadas las 48 h): no cuentan, no pausa', 4, 10, false],
    ['5 en la ventana y 10 fuera: pausa por las 5, no por las 15', 5, 10, true],
    ['sin bajas: no pausa', 0, 0, false],
  ])('%s', async (_nombre, enVentana, fuera, pausa) => {
    const a = reiniciar()
    config.tipoCambio = 1530
    sembrarEscenarioPush(a, { destinatarios: 200, bajasEnVentana: enVentana, bajasFueraDeVentana: fuera })
    const corrida = await correrPublicidad(PUSH.AHORA)
    expect(corrida).toMatchObject({ bajasMedidas: 1, pausado: pausa })
    expect(tabla('sponsored_campaigns')[0]).toMatchObject({ bajas_48h: enVentana })
    const ajustes = tabla('ad_settings')[0]
    expect(ajustes.push_patrocinado_pausado_at !== null).toBe(pausa)
    expect(ajustes.push_patrocinado_pausa_motivo !== null).toBe(pausa)
  })
})
