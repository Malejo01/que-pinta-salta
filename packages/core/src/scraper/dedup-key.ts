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

// Marcas diacríticas combinantes que deja `normalize("NFD")` (U+0300-U+036F),
// armadas con los códigos para no dejar caracteres invisibles en el fuente.
const COMBINING_MARKS_RE = new RegExp(
  `[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`,
  'g',
)

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
    .replace(COMBINING_MARKS_RE, '')
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

  // Fecha inválida: clave vacía, sin lanzar (QPS-033).
  if (Number.isNaN(new Date(startDate).getTime())) return ''

  const day = formatSaltaDayKey(startDate)
  if (!day) return ''

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

/**
 * Dos eventos con la misma clave (título + día) se fusionan solo si el lugar es
 * compatible: el mismo venue canónico, o a uno de los dos le falta el venue.
 * Sin esto, dos boliches que el mismo sábado publican "Fiesta de fin de semana"
 * terminaban fusionados en uno. Los venue_id ya son canónicos (ver
 * 20261002190100_venue_canonical_data.sql y resolve_venue_id), así que la
 * igualdad de ids es confiable.
 */
export function venuesCompatible(a?: string | null, b?: string | null): boolean {
  return !a || !b || a === b
}

/**
 * Hosts cuyos links no identifican un evento: perfiles de redes, agregadores de
 * links, WhatsApp, mapas. Dos posts de la misma cuenta comparten el link al
 * perfil y no por eso son el mismo evento.
 */
const NON_IDENTITY_HOSTS =
  /(^|\.)(instagram\.com|facebook\.com|fb\.me|linktr\.ee|wa\.me|whatsapp\.com|tiktok\.com|youtube\.com|youtu\.be|x\.com|twitter\.com|google\.com|goo\.gl|maps\.app\.goo\.gl)$/

/** Parámetros de tracking que no cambian a qué página apunta el link. */
const TRACKING_PARAM = /^(utm_|fbclid$|gclid$|igshid$|mc_)/

/**
 * Normaliza un link de compra para compararlo como identidad. Devuelve '' si
 * el link no sirve para eso: inválido, de una red social, o sin path (la home
 * de un sitio la comparten todos los eventos de ese sitio).
 *
 *   "https://NorteTicket.com/BERSUIT-EN-SALTA-2026/?utm_source=ig"
 *     -> "norteticket.com/bersuit-en-salta-2026"
 */
export function normalizeTicketUrl(raw?: string | null): string {
  if (!raw) return ''
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return ''
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''

  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  if (NON_IDENTITY_HOSTS.test(host)) return ''

  const path = url.pathname.replace(/\/+$/, '')
  if (!path) return ''

  const params = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAM.test(key.toLowerCase()))
    .sort(([a], [b]) => a.localeCompare(b))
  const query = params.length ? `?${new URLSearchParams(params).toString()}` : ''

  return `${host}${path}${query}`.toLowerCase()
}

/** Todos los links de compra de un evento (ticket_url + ticket_sources), normalizados. */
export function ticketUrlsOf(event: { ticket_url?: string | null; ticket_sources?: any }): Set<string> {
  const urls = new Set<string>()
  const add = (raw?: string | null) => {
    const normalized = normalizeTicketUrl(raw)
    if (normalized) urls.add(normalized)
  }
  add(event?.ticket_url)
  if (Array.isArray(event?.ticket_sources)) {
    for (const source of event.ticket_sources) add(source?.url)
  }
  return urls
}

/** Hora local de Salta "HH:MM" de un instante. Offset fijo -03:00, sin DST. */
function saltaClock(startDate: string | Date): string {
  const date = new Date(startDate)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(11, 16)
}

/**
 * true si el evento tiene hora real. Las fuentes que no traen hora (flyers sin
 * horario, algunos portales) guardan 00:00 de Salta: eso es "sin hora".
 */
export function hasRealTime(startDate?: string | Date | null): boolean {
  if (!startDate) return false
  const clock = saltaClock(startDate)
  return clock !== '' && clock !== '00:00'
}

/**
 * Tolerancia, en minutos, para considerar compatibles dos horas en los
 * caminos de deduplicación que van por similitud (no por clave exacta):
 * decisión de Mauro del 17/10 (QPS-164, hallazgo 1). La usan el paso 2 de
 * `findDuplicateMatch` y la colisión de slug de `upsertEventWithDeduplication`
 * en `apps/web/lib/scraper/deduplicate.ts`. Separa las 16:00 de las 21:00 del
 * mismo show (no se fusionan) y junta las 21:00 con las 21:30 que llegan de
 * dos fuentes distintas (sí se fusionan). El paso 0 (`sameTicketEvent`) y el
 * paso 1 siguen comparando la hora exacta: no cambian en esta ronda.
 */
export const TOLERANCIA_HORA_DEDUP_MIN = 120

/**
 * Compara dos horas de inicio como instantes (no como "hora de pared"), con
 * una tolerancia en minutos. Si a alguna de las dos le falta una hora real
 * (00:00 de Salta, `null`/`undefined`, o una fecha inválida), devuelve `true`
 * sin comparar nada: así se mantiene el comportamiento de hoy, donde un
 * evento sin hora no se parte de uno que sí la tiene.
 *
 * Espera instantes ya resueltos a UTC (lo que guarda `start_date` en la
 * base: `save-to-supabase.ts` y `run-scrape-job.ts` ya pasaron la hora de
 * pared de Salta por `saltaWallClockToUtcISO`/`.toISOString()` antes de
 * llegar acá). No hace ninguna conversión de zona horaria: para un string de
 * hora de pared sin zona, convertir antes con `saltaWallClockToUtcISO`.
 *
 * El borde es inclusivo: exactamente `toleranciaMin` minutos de diferencia
 * da `true`.
 */
export function horasCompatibles(
  a?: string | Date | null,
  b?: string | Date | null,
  toleranciaMin = TOLERANCIA_HORA_DEDUP_MIN,
): boolean {
  if (!hasRealTime(a) || !hasRealTime(b)) return true
  const diffMs = Math.abs(new Date(a as string | Date).getTime() - new Date(b as string | Date).getTime())
  return diffMs <= toleranciaMin * 60_000
}

/** Descripción que genera el scraper cuando la fuente no trae ninguna. */
export function isAutoDescription(text?: string | null): boolean {
  return !!text && /^\s*evento importado autom[aá]ticamente/i.test(text)
}

/**
 * Mismo link de compra = mismo evento, aunque los venues difieran: es la señal
 * de identidad más fuerte que hay. Con dos condiciones, porque una ticketera
 * usa UNA landing para todas las funciones de un espectáculo:
 *
 *   - mismo día de Salta (si no, un museo con 81 fechas en entradauno se
 *     fusionaría en una sola);
 *   - misma hora, o una de las dos sin hora (00:00 es el placeholder de "sin
 *     hora"). Si no, la función de las 16 y la de las 21 serían una.
 */
export function sameTicketEvent(
  a: { start_date?: string | null; ticket_url?: string | null; ticket_sources?: any },
  b: { start_date?: string | null; ticket_url?: string | null; ticket_sources?: any }
): boolean {
  if (!a?.start_date || !b?.start_date) return false
  if (formatSaltaDayKey(a.start_date) !== formatSaltaDayKey(b.start_date)) return false

  const clockA = saltaClock(a.start_date)
  const clockB = saltaClock(b.start_date)
  if (clockA !== clockB && clockA !== '00:00' && clockB !== '00:00') return false

  const urlsA = ticketUrlsOf(a)
  if (urlsA.size === 0) return false
  for (const url of ticketUrlsOf(b)) {
    if (urlsA.has(url)) return true
  }
  return false
}
