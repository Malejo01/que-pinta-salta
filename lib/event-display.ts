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
export function selectTodayEvents<T extends HomeEventLike>(events: T[], saltaTodayStr: string): T[] {
  return sortEventsByTime(
    events.filter((e) => e.date === saltaTodayStr && !e.isInstagramFlyer && !e.isCinemaMovie),
  )
}

/** Con el filtro "Hoy": cada fila ordenada por hora y Cine al final (resto en su orden). */
export function arrangeRowsForToday<
  T extends { startDateTime: string },
  R extends { category: string; events: T[] },
>(rows: R[]): R[] {
  const arranged = rows.map((row) => ({ ...row, events: sortEventsByTime(row.events) }))
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
