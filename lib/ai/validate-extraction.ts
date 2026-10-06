// Controles deterministas sobre la salida del modelo ("el modelo extrae, el código decide").
// Funciones puras, sin red ni base: se testean con fixtures inventados.

/** Hora de pared de Salta que se usa cuando no hay hora confiable (solo la fecha). */
export const DEFAULT_START_TIME = '00:00'

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

// Condicionantes que vuelven "parcial" una entrada gratuita (se aplican sobre texto normalizado, sin tildes).
const FREE_CONDITIONAL_PATTERNS: RegExp[] = [
  /\bhasta\s+(las|la|el|hs|\d)/,
  /\bfree\s+hasta\b/,
  /\bgratis\s+hasta\b/,
  /\bdamas\b/,
  /\bcon\s+lista\b/,
  /\bantes\s+de\b/,
  /\bfree\s+antes\b/,
]

/** True si el texto trae condicionantes de gratuidad parcial ("free hasta las 1", "damas free", etc.). */
export function hasFreeConditionals(...texts: Array<string | null | undefined>): boolean {
  const joined = normalize(texts.filter((t): t is string => !!t).join('\n'))
  return FREE_CONDITIONAL_PATTERNS.some((re) => re.test(joined))
}

/**
 * Precio confiable. `0` solo si el modelo dijo 0 y ni el caption ni el texto del flyer
 * traen condicionantes. Cualquier valor no numérico o negativo pasa a null.
 */
export function validatePrice(
  price: number | null | undefined,
  caption: string | null | undefined,
  flyerText?: string | null
): number | null {
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) return null
  if (price === 0 && hasFreeConditionals(caption, flyerText)) return null
  return price
}

// Patrones genéricos de hora (sin el "a las" suelto: tiene que llevar número).
const TIME_PATTERNS: RegExp[] = [
  /\b\d{1,2}(:\d{2})?\s*(hs|h|am|pm)\b/i,
  /\b\d{1,2}:\d{2}\b/,
  /\ba\s+las\s+\d{1,2}\b/i,
  /\b\d{1,2}\s*horas\b/i,
]

// Horas de cierre o de condición ("hasta las 2am", "antes de las 23"): no son hora de inicio.
const CLOSING_TIME_FRAGMENT =
  /\b(hasta|antes\s+de)\s+(las\s+|la\s+|el\s+)?\d{1,2}(:\d{2})?(\s*(hs|h|am|pm|horas)\b)?/gi

function stripClosingTimes(text: string): string {
  return text.replace(CLOSING_TIME_FRAGMENT, ' ')
}

/** True si el texto contiene algún patrón de hora de inicio (ignora "hasta <hora>" y "antes de las <hora>"). */
export function hasTimePattern(text: string | null | undefined): boolean {
  if (!text) return false
  const cleaned = stripClosingTimes(text)
  return TIME_PATTERNS.some((re) => re.test(cleaned))
}

/**
 * True si la hora HH:MM aparece escrita literalmente en el texto (sin contar horas de cierre).
 * Acepta "HH:MM", "HH.MM", "HHhs", "HH hs", "HH h", "a las HH", hora sin cero inicial y am/pm.
 * Con minutos distintos de 00 exige que aparezcan los minutos.
 */
export function textMentionsTime(text: string | null | undefined, hhmm: string): boolean {
  if (!text) return false
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm)
  if (!m) return false
  const h = Number(m[1])
  const min = m[2]
  const cleaned = stripClosingTimes(text)
  const H = h < 10 ? `0?${h}` : String(h)
  const h12 = h % 12 === 0 ? 12 : h % 12
  const H12 = h12 < 10 ? `0?${h12}` : String(h12)
  const meridian = h < 12 ? 'am' : 'pm'
  const pre = String.raw`(?<![\d:.])`

  const patterns: string[] = []
  if (min === '00') {
    patterns.push(String.raw`${pre}${H}[:.]00(?!\d)`)
    patterns.push(String.raw`${pre}${H}\s*(?:hs|h|horas)\b(?!\s*\d)`)
    patterns.push(String.raw`\ba\s+las\s+${H}(?!\d|[:.]\d)`)
    patterns.push(String.raw`${pre}${H12}(?:[:.]00)?\s*${meridian}\b`)
  } else {
    patterns.push(String.raw`${pre}${H}[:.]${min}(?!\d)`)
    patterns.push(String.raw`${pre}${H}\s*(?:hs|h)\s*${min}(?!\d)`)
    patterns.push(String.raw`${pre}${H12}[:.]${min}\s*${meridian}\b`)
  }
  return patterns.some((p) => new RegExp(p, 'i').test(cleaned))
}

/**
 * Hora (HH:MM, hora de pared de Salta) a usar. La hora del modelo es confiable SOLO si
 * aparece literalmente en el caption o en el texto del flyer (textMentionsTime); si no, es
 * inventada o distinta de la escrita: 00:00. Devuelve también si es confiable (para decidir
 * auto-publicación).
 */
export function validateStartTime(
  startTime: string | null | undefined,
  caption: string | null | undefined,
  flyerText?: string | null
): { time: string; reliable: boolean } {
  const valid = typeof startTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(startTime.trim())
  if (!valid) return { time: DEFAULT_START_TIME, reliable: false }
  const t = startTime!.trim()
  if (!textMentionsTime(caption, t) && !textMentionsTime(flyerText, t)) {
    return { time: DEFAULT_START_TIME, reliable: false }
  }
  return { time: t, reliable: true }
}
