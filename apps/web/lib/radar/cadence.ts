export type RadarFrequency = 'weekly' | 'biweekly' | 'monthly' | 'disabled'

const DAY_MS = 86_400_000

/** Días mínimos desde el último envío para que le toque de nuevo (el cron corre los jueves). */
export const BIWEEKLY_MIN_DAYS = 13
export const MONTHLY_MIN_DAYS = 27

/**
 * ¿Le toca el Radar a este usuario en esta corrida?
 * weekly: siempre. biweekly: sin envío previo o 13 días o más. monthly: sin envío previo o 27 o más.
 * disabled (o valor desconocido): nunca.
 */
export function isDue(frequency: string, lastSentAt: string | Date | null | undefined, now: Date = new Date()): boolean {
  if (frequency === 'weekly') return true
  const minDays = frequency === 'biweekly' ? BIWEEKLY_MIN_DAYS : frequency === 'monthly' ? MONTHLY_MIN_DAYS : null
  if (minDays === null) return false
  if (!lastSentAt) return true
  const last = lastSentAt instanceof Date ? lastSentAt.getTime() : Date.parse(lastSentAt)
  if (Number.isNaN(last)) return true
  return now.getTime() - last >= minDays * DAY_MS
}
