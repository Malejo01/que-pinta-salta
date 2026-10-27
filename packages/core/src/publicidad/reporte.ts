/**
 * Reporte al anunciante al terminar una campaña (R58): métricas, costo por
 * clic y la comparación con Meta Ads. Todo puro; las fechas las pasa quien llama.
 */

import { formatSaltaDayKey } from '../date-format'
import { K_ALC } from './formula'

/**
 * Mediana del costo por clic de Meta Ads en pesos, de
 * `ops/estudio-precios-publicidad.md`. Es una referencia, no una medición propia.
 */
export const MEDIANA_CPC_META_ARS = 290
export const FRASE_REFERENCIA_META = 'referencia del estudio de precios, octubre 2026'

export type TipoCampania = 'destacado' | 'push'

/** Una fila de `event_metrics_daily`. */
export interface FilaMetricaDiaria {
  day: string
  origin?: string | null
  featured: boolean
  views: number
  clicks: number
}

export interface MetricasCampania {
  dias: number
  vistas: number
  clics: number
  /** Estimado: se muestra siempre como estimado, no como medición. */
  alcanceEstimado: number
}

/**
 * Suma las métricas de la campaña entre `desde` y `hasta` (días de Salta,
 * ambos inclusive). El destacado cuenta solo las filas `featured = true`; el
 * push, todas las del evento en esos días.
 */
export function metricasDeCampania(entrada: {
  filas: readonly FilaMetricaDiaria[]
  tipo: TipoCampania
  desde: string | Date
  hasta: string | Date
  tramoRef: number
}): MetricasCampania {
  const { filas, tipo, tramoRef } = entrada
  const diaDesde = formatSaltaDayKey(entrada.desde)
  const diaHasta = formatSaltaDayKey(entrada.hasta)
  let vistas = 0
  let clics = 0
  for (const fila of filas) {
    if (fila.day < diaDesde || fila.day > diaHasta) continue
    if (tipo === 'destacado' && fila.featured !== true) continue
    vistas += fila.views
    clics += fila.clicks
  }
  const dias = Math.max(
    0,
    Math.round((Date.parse(`${diaHasta}T00:00:00Z`) - Date.parse(`${diaDesde}T00:00:00Z`)) / 86_400_000) + 1,
  )
  return { dias, vistas, clics, alcanceEstimado: Math.round((tramoRef * K_ALC * dias) / 30) }
}

/** Pesos por clic, o `null` sin precio o sin clics. Nunca divide por cero. */
export function costoPorClic(precioArs: number | null | undefined, clics: number): number | null {
  if (!precioArs || precioArs <= 0) return null
  if (!Number.isFinite(clics) || clics <= 0) return null
  return precioArs / clics
}

function pesos(n: number): string {
  return `$ ${Math.round(n).toLocaleString('es-AR')}`
}

/** El costo por clic como texto: "$ 140 por clic" o "sin clics todavía". */
export function textoCostoPorClic(precioArs: number | null | undefined, clics: number): string | null {
  if (!Number.isFinite(clics) || clics <= 0) return 'sin clics todavía'
  const cpc = costoPorClic(precioArs, clics)
  return cpc === null ? null : `${pesos(cpc)} por clic`
}

export interface ComparacionConMeta {
  cpcQps: number
  cpcMeta: number
  masBarato: boolean
  texto: string
}

/** Compara el costo por clic con la mediana de Meta. Con `cpc` nulo, `null`. */
export function comparacionConMeta(cpc: number | null): ComparacionConMeta | null {
  if (cpc === null || !Number.isFinite(cpc)) return null
  const masBarato = cpc < MEDIANA_CPC_META_ARS
  const texto =
    `Tu costo por clic fue ${pesos(cpc)}; la mediana publicada de Meta Ads en Argentina ronda ` +
    `${pesos(MEDIANA_CPC_META_ARS)} por clic (dato de terceros, muy variable; ${FRASE_REFERENCIA_META}).`
  return { cpcQps: cpc, cpcMeta: MEDIANA_CPC_META_ARS, masBarato, texto }
}

/**
 * Las claves que puede traer `ad_campaign_reports.metricas`: las de
 * `MetricasCampania` y, en el push, `destinatarios` y `bajas48h` (las escribe
 * el cron de la R58 con estos mismos nombres).
 */
export const CLAVES_METRICAS_REPORTE = [
  'dias',
  'vistas',
  'clics',
  'alcanceEstimado',
  'destinatarios',
  'bajas48h',
] as const

export type MetricasReporte = Partial<Record<(typeof CLAVES_METRICAS_REPORTE)[number], number>>

/**
 * La página pública lee `metricas` (jsonb) como dato: solo enteros >= 0 en las
 * claves conocidas. Cualquier otra cosa (strings, negativos, decimales,
 * objetos anidados, claves desconocidas) devuelve `null` y la página no lo muestra.
 */
export function validarMetricasReporte(json: unknown): MetricasReporte | null {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return null
  const conocidas = new Set<string>(CLAVES_METRICAS_REPORTE)
  const salida: MetricasReporte = {}
  for (const [clave, valor] of Object.entries(json)) {
    if (!conocidas.has(clave)) return null
    if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 0) return null
    salida[clave as keyof MetricasReporte] = valor
  }
  return salida
}
