/**
 * Links internos con origen, para medir de dónde viene cada vista o clic
 * (QPS-027). El origen viaja como `?o=` y no identifica a nadie.
 */

export const METRIC_ORIGINS = [
  'hero',
  'hoy',
  'fila',
  'busqueda',
  'favoritos',
  'ficha',
  'radar',
  'directo',
] as const

export type MetricOrigin = (typeof METRIC_ORIGINS)[number]

/** Valida un valor de `?o=`. Cualquier cosa fuera de la lista es `directo`. */
export function parseOrigin(value: unknown): MetricOrigin {
  return typeof value === 'string' && (METRIC_ORIGINS as readonly string[]).includes(value)
    ? (value as MetricOrigin)
    : 'directo'
}

/** Ficha del evento. Sin origen, el link queda limpio (cuenta como `directo`). */
export function eventHref(id: string, origin?: MetricOrigin): string {
  return origin ? `/evento/${id}?o=${origin}` : `/evento/${id}`
}

/** Salida a la ticketera, pasando por el contador. */
export function goHref(id: string, origin: MetricOrigin): string {
  return `/go/${id}?o=${origin}`
}
