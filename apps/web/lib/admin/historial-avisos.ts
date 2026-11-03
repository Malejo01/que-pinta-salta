/**
 * Q5-14 · El historial de avisos del equipo por día de Salta, con los
 * teléfonos SIN cuenta aparte (R82: `notification_sends.user_id` nulo).
 * Puro: solo cuenta; ningún id sale de acá.
 */
import { formatSaltaDayKey } from '@/lib/date-format'

export const MAX_DIAS_MOSTRADOS = 10

export function agruparHistorialAvisoEquipo(
  filas: readonly { sent_at: string; user_id: string | null }[],
): { dia: string; personas: number; sinCuenta: number }[] {
  const porDia = new Map<string, { personas: number; sinCuenta: number }>()
  for (const fila of filas) {
    const dia = formatSaltaDayKey(fila.sent_at)
    const actual = porDia.get(dia) ?? { personas: 0, sinCuenta: 0 }
    actual.personas++
    if (fila.user_id === null) actual.sinCuenta++
    porDia.set(dia, actual)
  }
  return [...porDia.entries()]
    .map(([dia, c]) => ({ dia, personas: c.personas, sinCuenta: c.sinCuenta }))
    .sort((a, b) => (a.dia < b.dia ? 1 : -1))
    .slice(0, MAX_DIAS_MOSTRADOS)
}
