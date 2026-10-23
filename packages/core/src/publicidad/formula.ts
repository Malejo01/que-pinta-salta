/**
 * La fórmula de precios automáticos de la publicidad (R58).
 *
 * Fuente de cada constante: `ops/estudio-precios-publicidad.md`, sección
 * "Precios anclados al dólar BNA, recalculados una vez por mes con reglas
 * fijas". El cron (58-b) y el admin (58-c) calculan con `armarPropuesta`,
 * para no repetir la cuenta.
 *
 * Todo es puro: sin `Date`, sin red, sin base. Las fechas (`'AAAA-MM-01'`) las
 * pasa quien llama.
 */

import { aplicarHisteresis, tramoDeAudiencia } from './tramos'

// --- Constantes (estudio de precios, sección de la fórmula) ---

/** USD fijos de un destacado de 7 días (la base de la fórmula del Hero). */
export const BASE_D7_USD = 8
/** USD por cada 1.000 personas de alcance estimado en 7 días. */
export const USD_POR_MIL_ALCANCE = 14
/** USD fijos de un push patrocinado. */
export const BASE_PUSH_USD = 10
/** USD por cada 1.000 dispositivos con el push activado. */
export const USD_POR_MIL_DISPOSITIVOS = 12
/** El destacado de 3 días vale el 60% del de 7. */
export const FACTOR_D3 = 0.6
/** El destacado de 14 días vale 1,7 veces el de 7. */
export const FACTOR_D14 = 1.7
/** Descuento del pack de lanzamiento y del plan RRPP (15%). */
export const DESCUENTO_PACK = 0.85
/** Descuento del plan mensual (25%). */
export const DESCUENTO_PLAN_MENSUAL = 0.75
/** Qué fracción de la audiencia del tramo ve el Hero en un mes (alcance estimado). */
export const K_ALC = 0.7
/** El precio fundador es el 70% de la lista (30% off), redondeado a $500. */
export const FACTOR_FUNDADOR = 0.7
/** El dólar tiene que caer más de 10% para que el precio en pesos baje solo por eso. */
export const UMBRAL_TRINQUETE = 0.1
/** Piso del factor de demanda. */
export const FACTOR_DEMANDA_MIN = 0.8
/** Tope del factor de demanda. */
export const FACTOR_DEMANDA_MAX = 1.5

/** Los productos con precio calculado: los `id` de `precios.ts` salvo `basica`. */
export const PRODUCTOS_CON_PRECIO = [
  'destacado-3',
  'destacado-7',
  'destacado-14',
  'pack-lanzamiento',
  'plan-mensual',
  'plan-rrpp',
  'push',
] as const

export type ProductoConPrecio = (typeof PRODUCTOS_CON_PRECIO)[number]

export interface PrecioVigente {
  precioArs: number
  precioUsd: number
  tipoCambio: number
}

export interface PrecioCalculado {
  precioUsd: number
  precioArs: number
  precioFundadorArs: number
}

export type PreciosCalculados = Partial<Record<ProductoConPrecio, PrecioCalculado>>

const PRECIO_MINIMO_ARS = 500

function redondear2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Al múltiplo de 500 más cercano. Un precio nunca queda en 0: el mínimo es 500. */
export function redondeo500(n: number): number {
  const redondeado = Math.round(n / 500) * 500
  return Math.max(PRECIO_MINIMO_ARS, redondeado)
}

/**
 * El trinquete: el precio en pesos no baja solo porque el dólar se movió un
 * poco. Baja si bajó el tramo o el factor (el USD es menor), o si el dólar cayó
 * más de 10%.
 */
export function aplicarTrinquete(entrada: {
  arsNuevo: number
  usdNuevo: number
  vigente: PrecioVigente | null
  tipoCambio: number
}): number {
  const { arsNuevo, usdNuevo, vigente, tipoCambio } = entrada
  if (!vigente) return arsNuevo
  if (usdNuevo < vigente.precioUsd) return arsNuevo
  if (tipoCambio < vigente.tipoCambio * (1 - UMBRAL_TRINQUETE)) return arsNuevo
  return Math.max(arsNuevo, vigente.precioArs)
}

/**
 * El factor de demanda del mes: sube 15% si la ocupación de los dos meses
 * anteriores fue mayor a 0,8; baja 10% si fue menor a 0,3; si no (o si falta un
 * dato), queda igual. Entre 0,8 y 1,5, con 2 decimales (la columna es
 * `numeric(4,2)`).
 */
export function factorDeDemanda(
  ocupacionUltimos2Meses: readonly [number | null, number | null],
  factorVigente: number,
): number {
  const [a, b] = ocupacionUltimos2Meses
  let factor = factorVigente
  if (a !== null && b !== null) {
    if (a > 0.8 && b > 0.8) factor = Math.min(FACTOR_DEMANDA_MAX, factorVigente * 1.15)
    else if (a < 0.3 && b < 0.3) factor = Math.max(FACTOR_DEMANDA_MIN, factorVigente * 0.9)
  }
  return redondear2(factor)
}

export interface EntradaCalcularPrecios {
  tramoRef: number
  kAlc: number
  tipoCambio: number
  factorHero: number
  factorPush: number
  dispositivosPush: number | null
  vigentes: Partial<Record<ProductoConPrecio, PrecioVigente>>
}

/** Calcula los precios de todos los productos (sin `push` si no hay dispositivos). */
export function calcularPrecios(entrada: EntradaCalcularPrecios): PreciosCalculados {
  const { tramoRef, kAlc, tipoCambio, factorHero, factorPush, dispositivosPush, vigentes } = entrada

  const alcance7d = (tramoRef * kAlc * 7) / 30
  const d7 = (BASE_D7_USD + (USD_POR_MIL_ALCANCE * alcance7d) / 1000) * factorHero
  const d3 = FACTOR_D3 * d7
  const d14 = FACTOR_D14 * d7

  const hayPush = dispositivosPush !== null && dispositivosPush > 0
  const push = hayPush
    ? (BASE_PUSH_USD + (USD_POR_MIL_DISPOSITIVOS * dispositivosPush) / 1000) * factorPush
    : 0

  const usd: Record<ProductoConPrecio, number | null> = {
    'destacado-3': d3,
    'destacado-7': d7,
    'destacado-14': d14,
    'pack-lanzamiento': (d14 + push) * DESCUENTO_PACK,
    'plan-mensual': (4 * d7 + push) * DESCUENTO_PLAN_MENSUAL,
    'plan-rrpp': 2 * d3 * DESCUENTO_PACK,
    push: hayPush ? push : null,
  }

  const resultado: PreciosCalculados = {}
  for (const producto of PRODUCTOS_CON_PRECIO) {
    const usdSinRedondear = usd[producto]
    if (usdSinRedondear === null) continue
    const precioUsd = redondear2(usdSinRedondear)
    const precioArs = aplicarTrinquete({
      arsNuevo: redondeo500(usdSinRedondear * tipoCambio),
      usdNuevo: precioUsd,
      vigente: vigentes[producto] ?? null,
      tipoCambio,
    })
    const precioFundadorArs = Math.min(precioArs, redondeo500(precioArs * FACTOR_FUNDADOR))
    resultado[producto] = { precioUsd, precioArs, precioFundadorArs }
  }
  return resultado
}

// --- La propuesta completa del ciclo ---

export interface CicloAnterior {
  /** `'AAAA-MM-01'`. */
  ciclo: string
  audiencia: number
  tramoVigente: number
  tramoCalculado: number
  cambioTramoDesde: string | null
  factorHero: number
  factorPush: number
  /** Los precios aprobados de ese ciclo, para el trinquete. */
  precios: Partial<Record<ProductoConPrecio, PrecioVigente>>
}

export interface EntradaPropuesta {
  /** `'AAAA-MM-01'`. */
  ciclo: string
  audienciaWeb28d: number
  mauApp28d: number | null
  dispositivosPush: number | null
  fuenteAudiencia: 'vercel' | 'manual'
  tipoCambio: number
  fuenteTipoCambio: string
  /** Ocupación del Hero de los dos meses anteriores, `[m-2, m-1]`. */
  ocupacionHero: readonly [number | null, number | null]
  ocupacionPush: readonly [number | null, number | null]
  anterior: CicloAnterior | null
}

/** La fila de `ad_price_cycles` que arma la fórmula (sin estado ni aprobación). */
export interface FilaCicloPropuesto {
  ciclo: string
  audiencia_web_28d: number
  mau_app_28d: number | null
  dispositivos_push: number | null
  audiencia: number
  fuente_audiencia: 'vercel' | 'manual'
  tramo_calculado: number
  tramo_vigente: number
  cambio_tramo_desde: string | null
  tipo_cambio: number
  fuente_tipo_cambio: string
  ocupacion_hero: number | null
  ocupacion_push: number | null
  factor_hero: number
  factor_push: number
}

/** La fila de `ad_prices` que arma la fórmula (sin estado). */
export interface FilaPrecioPropuesto {
  producto: ProductoConPrecio
  tramo_ref: number
  precio_usd: number
  precio_ars: number
  precio_fundador_ars: number
  tipo_cambio: number
  vigente_desde: string
}

export interface Propuesta {
  ciclo: FilaCicloPropuesto
  precios: FilaPrecioPropuesto[]
}

/** Peso de los usuarios de la app en la audiencia (el 80% de los MAU). */
export const PESO_MAU_APP = 0.8

/** Tramo de la tabla de respaldo, el de salida cuando no hay ciclo anterior. */
const TRAMO_INICIAL = 500

/** Suma un mes a `'AAAA-MM-01'` sobre el texto (diciembre pasa a enero del año siguiente). */
export function sumarUnMes(ciclo: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ciclo)
  if (!m) throw new Error(`Ciclo inválido: ${ciclo}`)
  let anio = Number(m[1])
  let mes = Number(m[2]) + 1
  if (mes > 12) {
    mes = 1
    anio += 1
  }
  return `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${m[3]}`
}

/**
 * Arma la propuesta del ciclo: la fila de `ad_price_cycles` y las de `ad_prices`.
 *
 * - `audiencia = round(web28d + 0,8 × mauApp28d)`.
 * - Tramo vigente: si el ciclo anterior anunció un cambio que empieza en este
 *   ciclo (`cambioTramoDesde === ciclo`), el anunciado (`tramoCalculado` del
 *   anterior); si no, el vigente del anterior; sin anterior, 500.
 * - `tramo_calculado`: con un cambio anunciado, el `tramoNuevo` (es lo que lee
 *   el aviso de 58-d y lo que aplica el ciclo siguiente); si no, el tramo de la
 *   audiencia de este ciclo.
 * - `cambio_tramo_desde`: el ciclo siguiente si hay cambio anunciado; si no, null.
 * - Los precios se calculan con el tramo vigente y con los factores de demanda
 *   ya redondeados.
 */
export function armarPropuesta(entrada: EntradaPropuesta): Propuesta {
  const { ciclo, anterior } = entrada
  const audiencia = Math.round(entrada.audienciaWeb28d + PESO_MAU_APP * (entrada.mauApp28d ?? 0))

  let tramoVigente = TRAMO_INICIAL
  if (anterior) {
    tramoVigente = anterior.cambioTramoDesde === ciclo ? anterior.tramoCalculado : anterior.tramoVigente
  }

  const calculadoActual = tramoDeAudiencia(audiencia)
  const histeresis = aplicarHisteresis({
    vigente: tramoVigente,
    calculadoAnterior: anterior ? tramoDeAudiencia(anterior.audiencia) : calculadoActual,
    calculadoActual,
    audienciaActual: audiencia,
    audienciaAnterior: anterior ? anterior.audiencia : null,
  })
  const cambio = histeresis.cambioAnunciado

  const factorHero = factorDeDemanda(entrada.ocupacionHero, anterior?.factorHero ?? 1)
  const factorPush = factorDeDemanda(entrada.ocupacionPush, anterior?.factorPush ?? 1)

  const calculados = calcularPrecios({
    tramoRef: histeresis.tramo,
    kAlc: K_ALC,
    tipoCambio: entrada.tipoCambio,
    factorHero,
    factorPush,
    dispositivosPush: entrada.dispositivosPush,
    vigentes: anterior?.precios ?? {},
  })

  const precios: FilaPrecioPropuesto[] = []
  for (const producto of PRODUCTOS_CON_PRECIO) {
    const p = calculados[producto]
    if (!p) continue
    precios.push({
      producto,
      tramo_ref: histeresis.tramo,
      precio_usd: p.precioUsd,
      precio_ars: p.precioArs,
      precio_fundador_ars: p.precioFundadorArs,
      tipo_cambio: entrada.tipoCambio,
      vigente_desde: ciclo,
    })
  }

  return {
    ciclo: {
      ciclo,
      audiencia_web_28d: entrada.audienciaWeb28d,
      mau_app_28d: entrada.mauApp28d,
      dispositivos_push: entrada.dispositivosPush,
      audiencia,
      fuente_audiencia: entrada.fuenteAudiencia,
      tramo_calculado: cambio ? cambio.tramoNuevo : calculadoActual,
      tramo_vigente: histeresis.tramo,
      cambio_tramo_desde: cambio ? sumarUnMes(ciclo) : null,
      tipo_cambio: entrada.tipoCambio,
      fuente_tipo_cambio: entrada.fuenteTipoCambio,
      ocupacion_hero: entrada.ocupacionHero[1],
      ocupacion_push: entrada.ocupacionPush[1],
      factor_hero: factorHero,
      factor_push: factorPush,
    },
    precios,
  }
}
