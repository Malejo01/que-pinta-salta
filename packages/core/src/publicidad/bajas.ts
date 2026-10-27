/**
 * Pausa del push patrocinado por bajas (R58): si demasiados destinatarios
 * apagan los avisos en las 48 h posteriores al envío, se pausa el producto.
 * Solo cantidades, nunca quién.
 */

/**
 * `true` solo si hay destinatarios y la proporción de bajas supera el umbral
 * (estrictamente mayor). Con destinatarios nulo o 0, `false`.
 */
export function debePausar(entrada: {
  destinatarios: number | null | undefined
  bajas: number | null | undefined
  umbral: number
}): boolean {
  const { destinatarios, bajas, umbral } = entrada
  if (!destinatarios || destinatarios <= 0) return false
  if (bajas === null || bajas === undefined || !Number.isFinite(bajas)) return false
  return bajas / destinatarios > umbral
}

/** "dd/mm" de una fecha 'AAAA-MM-DD' (o ISO), sobre el texto. */
function diaMes(fecha: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(fecha)
  return m ? `${m[2]}/${m[1]}` : fecha
}

function porcentaje(umbral: number): string {
  return `${Number((umbral * 100).toFixed(1)).toLocaleString('es-AR')}%`
}

/**
 * El texto de `push_patrocinado_pausa_motivo`: solo números y la fecha.
 * Ejemplo: "Bajas en 48 h: 7 de 200 (umbral 2%), campaña del 12/11".
 * `fecha` es 'AAAA-MM-DD' (o un ISO: se lee el día del texto).
 */
export function motivoPausa(entrada: {
  bajas: number
  destinatarios: number
  umbral: number
  fecha: string
}): string {
  const { bajas, destinatarios, umbral, fecha } = entrada
  return `Bajas en 48 h: ${bajas} de ${destinatarios} (umbral ${porcentaje(umbral)}), campaña del ${diaMes(fecha)}`
}
