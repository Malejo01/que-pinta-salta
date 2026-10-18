import { formatSaltaClock, formatSaltaDayKey, saltaWallClockToUtcISO } from '../date-format'
import { hasRealTime } from './dedup-key'

/**
 * Sufijo de fecha (y hora, si la hay) para el slug de un evento, en hora de
 * Salta: `YYYY-MM-DD-HHmm` con hora real, o solo `YYYY-MM-DD` sin ella (el
 * placeholder de "sin hora" es 00:00 de Salta, ver `hasRealTime`).
 *
 * Un `string` se interpreta como hora de pared de Salta sin zona (así la
 * entregan las ticketeras: "2026-10-20 21:00:00") y se convierte primero con
 * `saltaWallClockToUtcISO`. Esa función es inofensiva si el string ya trae
 * zona explícita (`Z` o un offset), así que da igual si ya es un instante.
 * Un `Date` se usa tal cual: ya es un instante.
 *
 * Nunca lanza: vacío, `null`, `undefined` o una fecha inválida devuelven ''.
 * `formatSaltaDayKey`/`formatSaltaClock` usan `Intl.DateTimeFormat`, que
 * lanza `RangeError` con un `Date` inválido, así que la validez se chequea
 * antes de llamarlas.
 */
export function sufijoSlugFechaHora(inicio: string | Date | null | undefined): string {
  if (!inicio) return ''

  const instante = typeof inicio === 'string' ? saltaWallClockToUtcISO(inicio) : inicio
  if (typeof instante === 'string' && !instante) return ''
  if (Number.isNaN(new Date(instante).getTime())) return ''

  const dia = formatSaltaDayKey(instante)
  if (!hasRealTime(instante)) return dia

  const hora = formatSaltaClock(instante).replace(':', '')
  return `${dia}-${hora}`
}

/**
 * `baseSlug` con el sufijo de fecha/hora agregado (`-${sufijo}`), o
 * `baseSlug` sin cambios si `sufijoSlugFechaHora` no pudo calcular nada.
 */
export function slugConFechaHora(baseSlug: string, inicio: string | Date | null | undefined): string {
  const sufijo = sufijoSlugFechaHora(inicio)
  return sufijo ? `${baseSlug}-${sufijo}` : baseSlug
}
