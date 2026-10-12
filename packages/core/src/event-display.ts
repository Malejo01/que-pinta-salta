/**
 * Helpers puros para mostrar eventos (sin React ni Supabase): higiene de datos
 * públicos (QPS-010) y orden/agrupado de la home "qué hago hoy" (QPS-011).
 */
import { formatSaltaClock } from './date-format'
import { hasRealTime, isAutoDescription } from './scraper/dedup-key'

/** Descripción lista para mostrar, o null si no hay o es la automática del scraper. */
export function cleanDescription(text?: string | null): string | null {
  if (!text) return null
  const trimmed = text.trim()
  if (!trimmed || isAutoDescription(trimmed)) return null
  return trimmed
}

/**
 * Chip de edad: 'adultos' solo con dato explícito (>= 18). 0, null y undefined
 * son "sin dato" (los scripts de carga escriben 0): nunca se inventa "familiar".
 */
export function ageChip(ageRestriction?: number | null): 'adultos' | null {
  return typeof ageRestriction === 'number' && ageRestriction >= 18 ? 'adultos' : null
}

/** false cuando la hora en Salta es 00:00 (fecha sola) o la fecha es inválida. */
export function hasExplicitTime(startDate?: string | Date | null): boolean {
  return hasRealTime(startDate)
}

/** Hora en 24 h ("21:30"), o null si el evento no tiene hora explícita. */
export function formatEventTimeDisplay(startDate?: string | Date | null): string | null {
  if (!startDate || !hasExplicitTime(startDate)) return null
  return formatSaltaClock(startDate)
}

/** Solo la primera letra en mayúscula ("viernes, 2 de octubre" -> "Viernes, 2 de octubre"). */
export function capitalizeFirst(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text
}

// ---------------------------------------------------------------------------
// Home: orden y agrupado
// ---------------------------------------------------------------------------

export interface HomeEventLike {
  startDateTime: string
  date: string
  isInstagramFlyer?: boolean
  isCinemaMovie?: boolean
}

/** Minutos desde 00:00 de Salta; Infinity si no hay hora explícita (va al final). */
function timeSortKey(startDateTime: string): number {
  if (!hasExplicitTime(startDateTime)) return Number.POSITIVE_INFINITY
  const [h, m] = formatSaltaClock(startDateTime).split(':').map(Number)
  return h * 60 + m
}

/** Copia ordenada por hora del día en Salta (sin hora al final); desempata por instante. */
export function sortEventsByTime<T extends { startDateTime: string }>(events: T[]): T[] {
  return [...events].sort((a, b) => {
    const diff = timeSortKey(a.startDateTime) - timeSortKey(b.startDateTime)
    if (diff !== 0 && !Number.isNaN(diff)) return diff
    return new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime()
  })
}

/**
 * Fila "Hoy en Salta": eventos reales del día (no flyers ni películas, que
 * se proyectan "hoy" sin ser una función de hoy), ordenados por hora.
 */
export function selectTodayEvents<T extends HomeEventLike>(
  events: T[],
  saltaTodayStr: string,
  nowMs?: number,
): T[] {
  return orderUpcomingFirst(
    sortEventsByTime(
      events.filter((e) => e.date === saltaTodayStr && !e.isInstagramFlyer && !e.isCinemaMovie),
    ),
    nowMs,
  )
}

/** Categorías cuya "función" dura todo el día (abren y siguen abiertas). */
const LONG_RUNNING_CATEGORIES = new Set(['museos'])

/**
 * Para "Hoy": ¿sigue siendo útil mostrar este evento ahora? Sí si todavía no
 * empezó, o si ya empezó pero es de larga duración (categoría museos) o su
 * `endDateTime` existe y es >= ahora. Una función de las 14:00 a las 23:00 no.
 */
export function isRelevantToday(
  event: { startDateTime: string; endDateTime?: string | null; category?: string | null },
  nowMs: number,
): boolean {
  const start = new Date(event.startDateTime).getTime()
  if (Number.isNaN(start)) return false
  if (start >= nowMs) return true
  if (event.category && LONG_RUNNING_CATEGORIES.has(event.category)) return true
  if (event.endDateTime) {
    const end = new Date(event.endDateTime).getTime()
    if (!Number.isNaN(end) && end >= nowMs) return true
  }
  return false
}

/** Lo que está por empezar antes que lo ya empezado (cada grupo conserva su orden). Sin nowMs, no cambia nada. */
export function orderUpcomingFirst<T extends { startDateTime: string }>(events: T[], nowMs?: number): T[] {
  if (nowMs === undefined) return [...events]
  const upcoming = events.filter((e) => new Date(e.startDateTime).getTime() >= nowMs)
  const started = events.filter((e) => !(new Date(e.startDateTime).getTime() >= nowMs))
  return [...upcoming, ...started]
}

/** Con el filtro "Hoy": cada fila ordenada por hora y Cine al final (resto en su orden). */
export function arrangeRowsForToday<
  T extends { startDateTime: string },
  R extends { category: string; events: T[] },
>(rows: R[], nowMs?: number): R[] {
  const arranged = rows.map((row) => ({
    ...row,
    events: orderUpcomingFirst(sortEventsByTime(row.events), nowMs),
  }))
  return [
    ...arranged.filter((row) => row.category !== 'cine'),
    ...arranged.filter((row) => row.category === 'cine'),
  ]
}

/** Inicio (00:00) del día de Salta de un instante, como ISO UTC. Offset fijo -03:00. */
export function saltaStartOfDayISO(now: Date = new Date()): string {
  const dayKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Salta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  return new Date(`${dayKey}T00:00:00-03:00`).toISOString()
}

/** Precio como lo muestra el sitio: "Gratis", "$35.000" o "A confirmar". */
export function formatPriceDisplay(e: { is_free?: boolean | null; price_min?: number | string | null }): string {
  if (e.is_free) return 'Gratis'
  const price = Number(e.price_min)
  if (Number.isFinite(price) && price > 0) return '$' + price.toLocaleString('es-AR')
  return 'A confirmar'
}
