/**
 * Vigencia única de un evento (agenda del sitio y Radar).
 *
 *   fin = coalesce(end_date,
 *                  start_date + 4 h        si tiene hora explícita,
 *                  fin del día en Salta    si no la tiene)
 *   vigente si fin >= now
 *
 * "Tiene hora" se decide en código (hasExplicitTime: 00:00 de Salta = sin
 * hora), así que la base recibe un prefiltro (superconjunto exacto de lo
 * vigente) y el filtro exacto se hace con isVigente sobre las filas.
 */
import { hasExplicitTime, saltaStartOfDayISO } from '@/lib/event-display'

export const DURACION_ESTIMADA_HORAS = 4

const HORA_MS = 60 * 60 * 1000
const DIA_MS = 24 * HORA_MS

type ConVigencia = { start_date: string; end_date?: string | null }

/** Fin del evento: end_date, o inicio + 4 h con hora, o 23:59:59.999 de Salta sin hora. */
export function estimatedEnd(e: ConVigencia): Date {
  if (e.end_date) {
    const fin = new Date(e.end_date)
    if (!Number.isNaN(fin.getTime())) return fin
  }
  const inicio = new Date(e.start_date)
  if (Number.isNaN(inicio.getTime())) return new Date(Number.NaN)
  if (hasExplicitTime(inicio)) {
    return new Date(inicio.getTime() + DURACION_ESTIMADA_HORAS * HORA_MS)
  }
  const inicioDia = new Date(saltaStartOfDayISO(inicio)).getTime()
  return new Date(inicioDia + DIA_MS - 1)
}

/** true si el fin (real o estimado) todavía no pasó. Fecha inválida: false. */
export function isVigente(e: ConVigencia, now: Date = new Date()): boolean {
  return estimatedEnd(e).getTime() >= now.getTime()
}

/**
 * Prefiltro para la base: superconjunto de lo vigente. Después se filtra con
 * isVigente.
 *
 * Por defecto (casi exacto):
 *   end_date >= now
 *   o (sin end_date y start_date >= now - 4 h)
 *   o (sin end_date y start_date = 00:00 de Salta de hoy: "sin hora" de hoy)
 *
 * Con includeToday: sin end_date, start_date >= min(now - 4 h, inicio del día
 * de Salta); trae también lo de hoy que ya empezó (para la home, que filtra
 * en el cliente).
 */
export function applyVigenciaPrefilter<Q>(
  query: Q,
  now: Date = new Date(),
  opts?: { includeToday?: boolean }
): Q {
  const nowIso = now.toISOString()
  const hace4h = now.getTime() - DURACION_ESTIMADA_HORAS * HORA_MS
  const inicioDia = new Date(saltaStartOfDayISO(now)).getTime()
  const filtro = opts?.includeToday
    ? `end_date.gte.${nowIso},and(end_date.is.null,start_date.gte.${new Date(Math.min(hace4h, inicioDia)).toISOString()})`
    : `end_date.gte.${nowIso},and(end_date.is.null,start_date.gte.${new Date(hace4h).toISOString()}),and(end_date.is.null,start_date.eq.${new Date(inicioDia).toISOString()})`
  return (query as unknown as { or: (f: string) => Q }).or(filtro)
}
