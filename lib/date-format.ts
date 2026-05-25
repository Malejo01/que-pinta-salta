const DEFAULT_TIME_ZONE = 'America/Argentina/Salta'

function normalizeLocaleOutput(value: string) {
  return value.replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim()
}

function toDate(input: string | Date) {
  return input instanceof Date ? input : new Date(input)
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
