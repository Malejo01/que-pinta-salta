/**
 * Zona de Salta para el mapa y la geocodificación (R53, R54 y R55).
 *
 * Lo crea la primera de esas tres rondas que corra, con este contenido exacto:
 * así ninguna depende del merge de otra. Si ya existe, se importa y no se toca.
 */

/** Rectángulo que contiene a la provincia de Salta, con un margen (aproximado). */
export const ZONA_SALTA = { latMin: -26.6, latMax: -21.8, lngMin: -68.7, lngMax: -62.2 } as const

/** Plaza 9 de Julio, el centro de Salta capital (aproximado): el centro inicial del mapa. */
export const CENTRO_SALTA_CAPITAL = { lat: -24.7883, lng: -65.4106 } as const

/** `true` si las dos son números finitos y caen adentro de `ZONA_SALTA`. */
export function coordenadasEnSalta(lat: unknown, lng: unknown): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  return lat >= ZONA_SALTA.latMin && lat <= ZONA_SALTA.latMax && lng >= ZONA_SALTA.lngMin && lng <= ZONA_SALTA.lngMax
}
