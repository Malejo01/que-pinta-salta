/**
 * Normalización de nombres de venue.
 *
 * Estas funciones son el espejo exacto de `venue_sanitize()`,
 * `venue_normalize()`, `venue_core_key()` y `venue_slugify()` en
 * supabase/migrations/20261002190000_venue_canonical.sql.
 *
 * Si tocás una, tocá la otra. La resolución real la hace Postgres (para que
 * haya un único árbitro y para poder indexar); esto sirve para agrupar en
 * memoria antes de escribir, mostrar previews en el panel de admin y testear
 * sin base de datos.
 */

/** Sufijos de ciudad / marca que las fuentes pegan al nombre del lugar. */
const CITY_SUFFIX = /\s(salta salta|salta capital|salta|oficial salta|oficial|argentina)$/
const LEADING_ARTICLE = /^(el|la|los|las)\s/
const LEADING_CITY = /^salta\s/

/**
 * Clave de match exacto: NFD -> sin diacríticos -> lowercase -> puntuación a
 * espacio -> espacios colapsados.
 *
 *   "Amnesia Pub & Música"  -> "amnesia pub musica"
 *   "casagrande.salta"      -> "casagrande salta"
 *   "LA ROKA"               -> "la roka"
 */
export function venueNormalize(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Clave relajada: normalize + sin artículo inicial ni sufijo de ciudad.
 * Es la que hace que "Amnesia" y "Amnesia Salta" caigan en el mismo bucket.
 *
 *   "La Casona de Güemes" -> "casona de guemes"
 *   "Amnesia Salta"       -> "amnesia"
 *   "Salta Roka"          -> "roka"
 */
export function venueCoreKey(raw: string | null | undefined): string {
  return venueNormalize(raw)
    .replace(LEADING_ARTICLE, '')
    .replace(CITY_SUFFIX, '')
    .replace(LEADING_CITY, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function venueSlugify(raw: string | null | undefined): string {
  return venueNormalize(raw).replace(/ /g, '-').slice(0, 100)
}

/**
 * Limpia un nombre crudo antes de guardarlo o resolverlo: saltos de línea,
 * tabs, espacios duros y caracteres invisibles pasan a un espacio simple, y se
 * colapsan los espacios. Un flyer procesado por IA trajo un CRLF en medio del
 * nombre ("La Casona de G" + CRLF + "uemes") y eso creó un venue nuevo.
 * Espejo de venue_sanitize() en Postgres.
 */
export function venueSanitize(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw
    .replace(/[​-‍﻿]/g, '')
    .replace(/[\s ]+/g, ' ')
    .trim()
}

/**
 * Varias fuentes mandan "Teatro del Huerto, Salta, Salta" (nombre + domicilio).
 * El nombre del lugar es lo anterior a la primera coma.
 */
export function venueDisplayName(raw: string | null | undefined): string {
  return venueSanitize(venueSanitize(raw).split(',')[0])
}
