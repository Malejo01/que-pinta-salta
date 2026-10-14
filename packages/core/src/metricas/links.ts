/**
 * Links internos con origen, para medir de dónde viene cada vista o clic
 * (QPS-027). El origen viaja como `?o=` y no identifica a nadie.
 * Movido de `apps/web/lib/metricas/links.ts` (R26, tarea 26-a), que suma
 * los links absolutos del sitio (`urlEvento`, `urlGo`, `urlTarjeta`,
 * `urlComoLlegar`) para usarlos fuera de la web (p. ej. la app).
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
  'app',
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

export const SITIO = 'https://www.quepintasalta.com.ar'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(id: string): boolean {
  return UUID_RE.test(id)
}

/** Link absoluto a la ficha del evento. `null` si `id` no es un uuid. */
export function urlEvento(id: string, origen?: MetricOrigin): string | null {
  return isUuid(id) ? SITIO + eventHref(id, origen) : null
}

/** Link absoluto de salida a la ticketera. `null` si `id` no es un uuid. */
export function urlGo(id: string, origen: MetricOrigin): string | null {
  return isUuid(id) ? SITIO + goHref(id, origen) : null
}

/** Link absoluto a la tarjeta (imagen) del evento. `null` si `id` no es un uuid. */
export function urlTarjeta(id: string): string | null {
  return isUuid(id) ? `${SITIO}/api/tarjeta/${id}` : null
}

/**
 * Link a Google Maps para llegar al evento: misma URL que armaba
 * `event-detail-page.tsx`. `null` si no hay dirección ni venue (o los dos
 * están vacíos/con solo espacios).
 */
export function urlComoLlegar({ address, venue }: { address?: string | null; venue?: string | null }): string | null {
  const query = (address && address.trim()) || (venue && venue.trim())
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null
}
