/**
 * Resumen de "varias fechas" para el pie de la card (QPS-024): sin hover, el
 * usuario tiene que poder ver que un evento tiene más de una función.
 */
import { formatEventDayMonth, formatSaltaDayKey, saltaWallClockToDate } from '../date-format'

/**
 * Una función/fecha de un evento agrupado. Igual de forma a los elementos de
 * `DisplayEvent['occurrences']` (`components/home-content.tsx`), pero solo
 * con los campos que hacen falta acá.
 */
export interface OccurrenceSummaryInput {
  /** Día calendario en Salta, "YYYY-MM-DD". */
  date: string
  /** Hora de pared en Salta "HH:mm", o "" si el evento no tiene hora explícita. */
  time: string
}

function occurrenceInstantMs(occ: OccurrenceSummaryInput): number {
  const timePart = occ.time || '00:00'
  return saltaWallClockToDate(`${occ.date}T${timePart}:00`).getTime()
}

/**
 * ¿Esta ocurrencia todavía puede pasar? Con hora explícita, exige que el
 * instante no haya pasado. Sin hora (desconocida, no necesariamente 00:00),
 * alcanza con que el día calendario en Salta sea hoy o más adelante.
 */
function isUpcoming(occ: OccurrenceSummaryInput, now: Date): boolean {
  if (occ.time) return occurrenceInstantMs(occ) >= now.getTime()
  return occ.date >= formatSaltaDayKey(now)
}

/**
 * Línea de pie de card para eventos con varias funciones: "+3 fechas" o,
 * si hay alguna todavía por venir, "+3 fechas · 12 oct 21:00" (sin hora,
 * "+3 fechas · 12 oct"). `null` con 0 o 1 ocurrencias.
 *
 * Va corta a propósito, sin día de la semana ni "próxima": a 11 px en una
 * card de 180 px tiene que entrar en un renglón (decisión de Mauro, 08/10).
 *
 * Pura y determinista: nunca lee la hora del sistema, `now` siempre llega
 * por parámetro.
 */
export function summarizeOccurrences(
  occurrences: OccurrenceSummaryInput[],
  now: Date,
): string | null {
  if (!occurrences || occurrences.length <= 1) return null

  const count = occurrences.length
  const upcoming = [...occurrences]
    .filter((occ) => isUpcoming(occ, now))
    .sort((a, b) => occurrenceInstantMs(a) - occurrenceInstantMs(b))

  if (upcoming.length === 0) return `+${count} fechas`

  const next = upcoming[0]
  const dayLabel = formatEventDayMonth(next.date)
  const label = next.time ? `${dayLabel} ${next.time}` : dayLabel

  return `+${count} fechas · ${label}`
}
