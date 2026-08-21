import type { JobSchedule } from './types'

/**
 * Salta es UTC-3 fijo y sin horario de verano, igual que asume
 * `SALTA_UTC_OFFSET` en `lib/date-format.ts`. Con offset fijo alcanza con
 * correr el reloj y leer los getters UTC; no hace falta Intl.
 */
const SALTA_OFFSET_MINUTES = -180

/**
 * Tolerancia al evaluar si un job "ya cumplió" su intervalo.
 *
 * Sin esto el scheduler se atrasa un tick entero cada vez: si la corrida de
 * las 12:00:30 tarda unos segundos y el siguiente tick llega 12:00:10 más
 * tarde, la diferencia queda apenas por debajo del intervalo, el job se
 * saltea y recién corre un tick después. Un job "cada 6 h" pasaría a correr
 * cada 12.
 */
const DUE_TOLERANCE_MINUTES = 10

export interface SaltaParts {
  hour: number
  /** 0 = domingo … 6 = sábado */
  dayOfWeek: number
  isoDay: string
}

export function toSaltaParts(date: Date): SaltaParts {
  const shifted = new Date(date.getTime() + SALTA_OFFSET_MINUTES * 60_000)
  return {
    hour: shifted.getUTCHours(),
    dayOfWeek: shifted.getUTCDay(),
    isoDay: shifted.toISOString().slice(0, 10),
  }
}

export interface DueCheck {
  due: boolean
  reason: string
  minutesSinceLastSuccess: number | null
}

/**
 * Decide si un job corresponde correr en este tick.
 *
 * El scheduler no guarda "próxima ejecución": la deriva de la última corrida
 * exitosa registrada en `job_runs`. Así un deploy, un tick perdido o un
 * reinicio no descolocan el calendario, y un job que viene fallando reintenta
 * en el siguiente tick en vez de esperar su turno nominal.
 */
export function isDue(
  schedule: JobSchedule,
  lastSuccessAt: Date | null,
  now: Date = new Date(),
): DueCheck {
  const { hour, dayOfWeek } = toSaltaParts(now)

  const minutesSinceLastSuccess = lastSuccessAt
    ? (now.getTime() - lastSuccessAt.getTime()) / 60_000
    : null

  if (schedule.daysOfWeekSalta && !schedule.daysOfWeekSalta.includes(dayOfWeek)) {
    return {
      due: false,
      reason: `fuera del día previsto (hoy es ${dayOfWeek} en Salta, se espera ${schedule.daysOfWeekSalta.join('/')})`,
      minutesSinceLastSuccess,
    }
  }

  if (schedule.hoursSalta && !schedule.hoursSalta.includes(hour)) {
    return {
      due: false,
      reason: `fuera de la ventana horaria (son las ${hour}:00 en Salta, se espera ${schedule.hoursSalta.join('/')}:00)`,
      minutesSinceLastSuccess,
    }
  }

  if (minutesSinceLastSuccess === null) {
    return { due: true, reason: 'sin corridas exitosas previas', minutesSinceLastSuccess }
  }

  if (minutesSinceLastSuccess + DUE_TOLERANCE_MINUTES < schedule.everyMinutes) {
    return {
      due: false,
      reason: `corrió hace ${Math.round(minutesSinceLastSuccess)} min y el intervalo es de ${schedule.everyMinutes} min`,
      minutesSinceLastSuccess,
    }
  }

  return {
    due: true,
    reason: `pasaron ${Math.round(minutesSinceLastSuccess)} min desde la última corrida exitosa`,
    minutesSinceLastSuccess,
  }
}

/** "hace 3 h 12 min", "hace 2 días", "nunca". */
export function humanizeAge(minutes: number | null): string {
  if (minutes === null) return 'nunca'
  if (minutes < 1) return 'recién'
  if (minutes < 60) return `hace ${Math.floor(minutes)} min`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    const rest = Math.floor(minutes % 60)
    return rest > 0 ? `hace ${hours} h ${rest} min` : `hace ${hours} h`
  }

  const days = Math.floor(hours / 24)
  const restHours = hours % 24
  const dayLabel = days === 1 ? 'día' : 'días'
  return restHours > 0 ? `hace ${days} ${dayLabel} y ${restHours} h` : `hace ${days} ${dayLabel}`
}
