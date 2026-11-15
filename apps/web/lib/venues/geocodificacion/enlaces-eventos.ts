/**
 * Q7-2: el puente entre los eventos de la base y los links de Google Maps de
 * `./enlaces-maps`: qué eventos se miran, cómo se juntan por lugar canónico y
 * qué se escribe en `venues.geocode_sugerencia_*`.
 *
 * Puro: sin red ni base.
 */

import { lecturasDeEvento, textoSugerenciaEnlace, type EventoConEnlaces, type LecturaEnlaceMaps } from './enlaces-maps'
import { textoDeSugerencia, type ColumnasSugerencia } from './sugerencia'

/** Se miran los eventos publicados desde hace estos días (los que ya pasaron también traen el link del lugar). */
export const DIAS_EVENTOS_PARA_ENLACES = 180

/**
 * Las lecturas de Maps de cada lugar canónico: un evento de un alias ya
 * fusionado suma a su canónico. Los eventos sin lugar no cuentan.
 */
export function lecturasPorLugarCanonico(
  eventos: EventoConEnlaces[],
  venues: Array<{ id: string; canonical_venue_id: string | null }>
): Map<string, LecturaEnlaceMaps[]> {
  const canonicoDe = new Map(venues.map((v) => [v.id, v.canonical_venue_id ?? v.id]))
  const porLugar = new Map<string, LecturaEnlaceMaps[]>()
  for (const evento of eventos) {
    if (!evento.venue_id) continue
    const lecturas = lecturasDeEvento(evento)
    if (lecturas.length === 0) continue
    const id = canonicoDe.get(evento.venue_id) ?? evento.venue_id
    porLugar.set(id, [...(porLugar.get(id) ?? []), ...lecturas])
  }
  return porLugar
}

/** Las columnas de la sugerencia por link (nunca `latitude`/`longitude`: eso lo confirma un admin). */
export function columnasSugerenciaEnlace(propuesta: { lat: number; lng: number; links: number }, ahora: Date): ColumnasSugerencia {
  return {
    geocode_sugerencia_lat: propuesta.lat,
    geocode_sugerencia_lng: propuesta.lng,
    geocode_sugerencia_texto: textoDeSugerencia(textoSugerenciaEnlace(propuesta.links)),
    geocode_sugerencia_at: ahora.toISOString(),
  }
}
