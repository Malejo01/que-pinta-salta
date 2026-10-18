// El texto del aviso de "mostrando lo último guardado" (R43, plan §7). Puro,
// en hora de Salta: usa `formatSaltaDayKey`/`formatSaltaClock` de
// `@qps/core/date-format`, nunca `Date.getHours()`/`getDay()` de la
// máquina del teléfono.
import { formatSaltaClock, formatSaltaDayKey } from '@qps/core/date-format'

/** Título fijo del aviso (plan §7). La hora de guardado va en una segunda línea, con `textoGuardadoEn`. */
export const TITULO_SIN_CONEXION = 'Sin conexión, mostrando lo último guardado'

/**
 * `formatSaltaDayKey`/`formatSaltaClock` tiran `RangeError` con una fecha
 * inválida. En el uso real esto no debería pasar nunca: `guardadoEn` sale
 * siempre de `leerCache` (`./cache.ts`), que ya descarta cualquier
 * `guardadoEn` inválido o futuro antes de devolver algo. Pero
 * `textoGuardadoEn` no depende de que el llamador se acuerde de esa
 * garantía: valida antes de formatear y, si de verdad llega algo raro
 * (por ejemplo, desde un test o un cambio futuro que se olvide de pasar
 * por `leerCache`), devuelve este texto neutro en vez de romper la pantalla.
 */
export const TEXTO_GUARDADO_INVALIDO = 'Guardado hace un tiempo'

/** `'YYYY-MM-DD'` (el día de ayer, como día de calendario, sin tocar la hora). */
function diaAnteriorKey(diaKey: string): string {
  const fecha = new Date(`${diaKey}T00:00:00Z`)
  fecha.setUTCDate(fecha.getUTCDate() - 1)
  return fecha.toISOString().slice(0, 10)
}

/** `'YYYY-MM-DD'` -> `'DD/MM'`. No vuelve a pasar por `Intl`: ya se obtuvo el día con `formatSaltaDayKey`. */
function comoDiaYMes(diaKey: string): string {
  const [, mes, dia] = diaKey.split('-')
  return `${dia}/${mes}`
}

/**
 * "Guardado hoy a las 14:32", "Guardado ayer a las 21:05" o "Guardado el
 * 15/10 a las 10:00", según cómo se compara el día de Salta de `guardadoEn`
 * con el de `ahora`. Nunca tira (ver `TEXTO_GUARDADO_INVALIDO`): si
 * cualquiera de las dos fechas es inválida, devuelve ese texto neutro en vez
 * de dejar que `formatSaltaDayKey`/`formatSaltaClock` tiren `RangeError`.
 */
export function textoGuardadoEn(guardadoEn: Date, ahora: Date): string {
  if (Number.isNaN(guardadoEn.getTime()) || Number.isNaN(ahora.getTime())) {
    return TEXTO_GUARDADO_INVALIDO
  }

  const diaGuardado = formatSaltaDayKey(guardadoEn)
  const diaAhora = formatSaltaDayKey(ahora)
  const hora = formatSaltaClock(guardadoEn)

  if (diaGuardado === diaAhora) return `Guardado hoy a las ${hora}`
  if (diaGuardado === diaAnteriorKey(diaAhora)) return `Guardado ayer a las ${hora}`
  return `Guardado el ${comoDiaYMes(diaGuardado)} a las ${hora}`
}
