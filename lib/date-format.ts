const DEFAULT_TIME_ZONE = 'America/Argentina/Salta'

/**
 * Argentina no aplica horario de verano desde 2009, así que el offset es fijo.
 * Si algún día volviera a aplicarse, esto tendría que resolverse por fecha.
 */
export const SALTA_UTC_OFFSET = '-03:00'

const HAS_EXPLICIT_ZONE = /(Z|[+-]\d{2}:?\d{2})$/

function normalizeLocaleOutput(value: string) {
  return value.replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim()
}

function toDate(input: string | Date) {
  if (input instanceof Date) return input
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return new Date(`${input}T00:00:00${SALTA_UTC_OFFSET}`)
  }
  return new Date(input)
}

/**
 * Convierte una hora de pared de Salta al instante UTC real.
 *
 * Las fuentes (ticketeras, flyers, formularios con <input type="datetime-local">)
 * entregan la hora tal como se lee en el cartel, sin zona: "2026-08-07T21:00:00".
 * Guardar ese string crudo en una columna timestamptz hace que Postgres lo
 * interprete como UTC y el evento termine tres horas corrido.
 *
 * Si el valor ya trae zona explícita (Z u offset) se respeta tal cual, así que
 * aplicar esta función dos veces sobre el mismo dato es inofensivo.
 */
export function saltaWallClockToUtcISO(value: string): string {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return trimmed

  if (HAS_EXPLICIT_ZONE.test(trimmed)) {
    return new Date(trimmed).toISOString()
  }

  let normalized = trimmed.replace(' ', 'T')
  if (!normalized.includes('T')) normalized = `${normalized}T00:00:00`
  if (/T\d{2}:\d{2}$/.test(normalized)) normalized = `${normalized}:00`

  const parsed = new Date(`${normalized}${SALTA_UTC_OFFSET}`)
  if (Number.isNaN(parsed.getTime())) return trimmed

  return parsed.toISOString()
}

/** Igual que saltaWallClockToUtcISO pero devuelve Date. */
export function saltaWallClockToDate(value: string): Date {
  return new Date(saltaWallClockToUtcISO(value))
}

/**
 * Día calendario en Salta, formato "YYYY-MM-DD".
 * Reemplaza a los `.split('T')[0]` y `.toISOString().split('T')[0]`, que
 * devuelven el día UTC y corren la fecha en eventos de la noche.
 */
export function formatSaltaDayKey(input: string | Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DEFAULT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(toDate(input))
}

/** Hora de pared en Salta, formato "HH:mm" en 24 horas. */
export function formatSaltaClock(input: string | Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: DEFAULT_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(toDate(input))
}

/** Partes separadas, para editores con inputs de fecha y hora por separado. */
export function splitSaltaDateTime(input: string | Date): { day: string; time: string } {
  return { day: formatSaltaDayKey(input), time: formatSaltaClock(input) }
}

/** Valor para <input type="datetime-local">, expresado en hora de Salta. */
export function formatSaltaInputValue(input: string | Date): string {
  const { day, time } = splitSaltaDateTime(input)
  return `${day}T${time}`
}

export function formatEventTime(input: string | Date) {
  const formatted = new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: DEFAULT_TIME_ZONE,
  }).format(toDate(input))

  return normalizeLocaleOutput(formatted)
}

export function formatEventDate(input: string | Date, withYear = false) {
  const formatted = new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(withYear ? { year: 'numeric' as const } : {}),
    timeZone: DEFAULT_TIME_ZONE,
  }).format(toDate(input))

  return normalizeLocaleOutput(formatted)
}

export function formatEventDateShort(input: string | Date) {
  const formatted = new Intl.DateTimeFormat('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: DEFAULT_TIME_ZONE,
  }).format(toDate(input))

  return normalizeLocaleOutput(formatted)
}
