/**
 * Fecha de vigencia de las páginas legales para el `lastModified` del
 * sitemap (B2). `components/legal/vigencia.ts` la guarda como texto para
 * mostrarla («23 de octubre de 2026»), y es de otra zona: acá se lee sin
 * tocarla.
 */

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/**
 * «23 de octubre de 2026» → las 00:00 de ese día en Salta (UTC−3). `null`
 * si el texto no tiene esa forma (por ejemplo un «[COMPLETAR…]»): quien
 * llama decide el respaldo.
 */
export function fechaDeTextoEnCastellano(texto: string): Date | null {
  const m = /^\s*(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})\s*$/i.exec(texto)
  if (!m) return null
  const dia = Number(m[1])
  // «setiembre» también es correcto en castellano.
  const nombreMes = m[2].toLowerCase() === 'setiembre' ? 'septiembre' : m[2].toLowerCase()
  const mes = MESES.indexOf(nombreMes)
  const anio = Number(m[3])
  if (mes < 0 || dia < 1 || dia > 31) return null

  const fecha = new Date(
    `${anio}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}T00:00:00-03:00`
  )
  // Un «31 de febrero» da una fecha inválida o corrida al mes siguiente: afuera.
  if (Number.isNaN(fecha.getTime()) || fecha.getUTCDate() !== dia) return null
  return fecha
}
