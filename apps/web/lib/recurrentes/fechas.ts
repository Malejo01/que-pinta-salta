import { SALTA_UTC_OFFSET } from '../date-format'

/**
 * Lógica pura de fechas para los eventos recurrentes (sin red ni base).
 * Día calendario de Salta (UTC-3, sin horario de verano), igual que
 * scripts/cargar-penas.mjs y scripts/cargar-museos.mjs.
 */

const DIA_MS = 24 * 60 * 60 * 1000
const SALTA_OFFSET_MS = 3 * 60 * 60 * 1000

export type FechaPendiente = { dia: string; startUtc: string }

/** Día calendario en Salta ("YYYY-MM-DD") de un instante. */
export function diaSalta(d: Date): string {
  return new Date(d.getTime() - SALTA_OFFSET_MS).toISOString().slice(0, 10)
}

/** Día de la semana en Salta de un "YYYY-MM-DD" (0 = domingo … 6 = sábado). */
export function diaDeLaSemana(dia: string): number {
  return new Date(`${dia}T12:00:00${SALTA_UTC_OFFSET}`).getUTCDay()
}

/** Hora de pared de Salta ("HH:mm") de un día -> instante UTC en ISO. */
export function saltaAUtc(dia: string, hora: string): string {
  return new Date(`${dia}T${hora}:00${SALTA_UTC_OFFSET}`).toISOString()
}

/**
 * Fechas a generar: los próximos `horizonteDias` días (hoy incluido) que caen
 * en `dias` (0 = domingo … 6 = sábado), sin las de `yaCargadas` (días
 * "YYYY-MM-DD" de Salta). Se saltea hoy si la hora ya pasó.
 */
export function fechasPendientes(args: {
  ahora: Date
  dias: readonly number[]
  hora: string
  horizonteDias: number
  yaCargadas: Iterable<string>
}): FechaPendiente[] {
  const { ahora, dias, hora, horizonteDias } = args
  const ya = new Set(args.yaCargadas)
  const out: FechaPendiente[] = []
  for (let i = 0; i < horizonteDias; i++) {
    const dia = diaSalta(new Date(ahora.getTime() + i * DIA_MS))
    if (!dias.includes(diaDeLaSemana(dia))) continue
    const startUtc = saltaAUtc(dia, hora)
    if (new Date(startUtc).getTime() <= ahora.getTime()) continue
    if (ya.has(dia)) continue
    out.push({ dia, startUtc })
  }
  return out
}

/** Slug de peñas (igual que cargar-penas.mjs). */
export function slugPenas(s: string): string {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/ /g, '-').slice(0, 90)
}

/** Slug de museos (igual que cargar-museos.mjs y generateSlug del cron de scrape). */
export function slugMuseos(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 100)
}
