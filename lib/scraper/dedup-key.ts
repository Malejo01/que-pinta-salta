import { formatSaltaDayKey } from '../date-format'

/**
 * Clave de deduplicación de eventos: título normalizado + día calendario.
 *
 * Por qué título + fecha y no venue + fecha
 * -----------------------------------------
 * La versión anterior deduplicaba por (venue_id, fecha) y no encontraba nada
 * si el venue_id era null. Justamente los duplicados que importan son los que
 * entran por dos fuentes que escriben el lugar distinto ("Teatro Provincial"
 * vs "teatroprovincialsalta"), o los de Instagram, donde el lugar sale del
 * handle de la cuenta y a veces ni existe. El título y la fecha son los dos
 * campos que TODAS las fuentes traen y traen igual.
 *
 * El venue no desaparece del problema: se usa para resolver el conflicto una
 * vez que dos registros ya matchearon (ver merge-events.ts).
 */

/**
 * Sufijos de ciudad. Se sacan sólo del final del título, nunca del medio:
 * "Salta la Linda Fest" tiene que sobrevivir entero.
 *
 * Cubre las formas que aparecen en las fuentes reales:
 *   "Airbag en Salta"            -> "airbag"
 *   "Airbag - Salta 2026"        -> "airbag"
 *   "Airbag | Salta Capital"     -> "airbag"
 *   "Airbag (Salta, Argentina)"  -> "airbag"
 *   "Gira Federal Salta 2026"    -> "gira federal"
 *
 * El año sólo se saca si viene pegado a la ciudad. Un año suelto se conserva:
 * "Expo Ganadera 2026" y "Expo Ganadera 2027" son eventos distintos, y aunque
 * la fecha ya los separa, borrar el año escondería el error si la fecha viene
 * mal parseada.
 */
const CITY_SUFFIX_RE =
  /\s+(?:en\s+|de\s+)?(?:la\s+)?(?:ciudad\s+de\s+)?salta(?:\s+capital)?(?:\s+(?:argentina|arg|ar))?(?:\s+(?:19|20)\d{2})?$/

/** "salta" repetido al final ("... en Salta Salta", típico de address duplicada). */
const TRAILING_NOISE_RE = /\s+(?:argentina|arg)$/

/**
 * Normaliza un título para usarlo como clave de dedup.
 *
 * Pasos: lowercase -> sin diacríticos -> puntuación a espacio ->
 * espacios colapsados -> sin sufijo de ciudad.
 *
 * A diferencia de normalizeTitle() (en deduplicate.ts, que se usa para el
 * score de similitud) esta función NO saca stop words. La clave tiene que ser
 * exacta y reversible de leer: si "Show de Rock" y "Rock" colapsaran a la
 * misma clave, dos eventos distintos del mismo día se fusionarían solos.
 */
export function normalizeTitleForKey(title?: string | null): string {
  if (!title) return ''

  let normalized = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) return ''

  // Se aplica en loop: "Airbag en Salta Argentina 2026" necesita dos pasadas.
  // El guard evita vaciar títulos que SON la ciudad ("Salta", "Salta Capital").
  for (let i = 0; i < 3; i++) {
    const stripped = normalized.replace(CITY_SUFFIX_RE, '').replace(TRAILING_NOISE_RE, '').trim()
    if (!stripped || stripped === normalized) break
    normalized = stripped
  }

  return normalized
}

/**
 * Clave completa: `<titulo normalizado>|<YYYY-MM-DD en hora de Salta>`.
 *
 * El día se calcula en zona Salta y no en UTC a propósito: un evento a las
 * 22:00 del sábado es 01:00 UTC del domingo, así que agrupar por día UTC
 * partiría en dos los duplicados de todos los eventos nocturnos — que son la
 * mayoría de los que llegan por Instagram.
 *
 * Devuelve '' si falta título o fecha. Una clave vacía nunca matchea con nada:
 * un registro sin título o sin fecha se inserta como nuevo en vez de fusionarse
 * a ciegas con el primero que pase.
 */
export function buildDedupKey(title?: string | null, startDate?: string | Date | null): string {
  const normalizedTitle = normalizeTitleForKey(title)
  if (!normalizedTitle || !startDate) return ''

  const day = formatSaltaDayKey(startDate)
  if (!day || day.includes('NaN')) return ''

  return `${normalizedTitle}|${day}`
}

/** Conveniencia: clave de una fila de `events` ya leída de la base. */
export function dedupKeyOf(event: { title?: string | null; start_date?: string | null }): string {
  return buildDedupKey(event?.title, event?.start_date)
}

/**
 * Rango UTC que cubre un día calendario de Salta completo, para acotar la
 * query de candidatos. Argentina no aplica DST desde 2009 (ver SALTA_UTC_OFFSET
 * en date-format.ts), así que el offset fijo -03:00 alcanza.
 */
export function saltaDayRangeUtc(startDate: string | Date): { from: string; to: string } {
  const day = formatSaltaDayKey(startDate)
  return {
    from: new Date(`${day}T00:00:00.000-03:00`).toISOString(),
    to: new Date(`${day}T23:59:59.999-03:00`).toISOString(),
  }
}
