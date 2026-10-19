/**
 * Reporte de una corrida de geocodificación: CSV para revisar a mano, un
 * resumen por estado, y el link de OpenStreetMap de cada ubicación.
 *
 * Puro: no toca el sistema de archivos (el script decide dónde escribe el
 * CSV que devuelve `aCsv`).
 */

/** Una fila de reporte: cualquier objeto plano (los valores van a texto; `null`/`undefined` quedan vacíos). */
export type FilaCsv = Record<string, string | number | boolean | null | undefined>

function escaparCampoCsv(valor: string | number | boolean | null | undefined): string {
  const texto = valor === null || valor === undefined ? '' : String(valor)
  if (/["\n,]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`
  }
  return texto
}

/**
 * CSV (RFC 4180: comillas y comas escapadas, líneas separadas por CRLF) de
 * `filas`. Las columnas son las claves de la primera fila, en su orden; si
 * `filas` está vacío, devuelve una cadena vacía.
 */
export function aCsv(filas: FilaCsv[]): string {
  if (filas.length === 0) return ''

  const columnas = Object.keys(filas[0])
  const encabezado = columnas.map(escaparCampoCsv)
  const lineas = filas.map((fila) => columnas.map((columna) => escaparCampoCsv(fila[columna])))

  return [encabezado, ...lineas].map((linea) => linea.join(',')).join('\r\n')
}

/** Cuántas filas hay por cada valor de `estado`. */
export function resumen(filas: Array<{ estado: string }>): Record<string, number> {
  const totales: Record<string, number> = {}
  for (const fila of filas) {
    totales[fila.estado] = (totales[fila.estado] ?? 0) + 1
  }
  return totales
}

/** Link a OpenStreetMap centrado en `(lat, lng)`, con zoom 18 (nivel de calle/edificio). */
export function urlOpenStreetMap(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`
}
