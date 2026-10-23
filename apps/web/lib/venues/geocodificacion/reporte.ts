/**
 * Reporte de una corrida de geocodificación: CSV para revisar a mano, un
 * resumen por estado, y el link de OpenStreetMap de cada ubicación.
 *
 * Puro: no toca el sistema de archivos (el script decide dónde escribe el
 * CSV que devuelve `aCsv`).
 */

/** Una fila de reporte: cualquier objeto plano (los valores van a texto; `null`/`undefined` quedan vacíos). */
export type FilaCsv = Record<string, string | number | boolean | null | undefined>

/**
 * `true` si `recortado` (ya sin espacios al principio) es un número escrito
 * como texto, por ejemplo `"-24.7883"`. Sirve para la única excepción de
 * `neutralizarFormula`: un string que arranca con `-` pero es un número no
 * se toca (`lat`/`lon` en este reporte son siempre negativos: Salta está al
 * sur y al oeste).
 */
function esNumeroComoTexto(recortado: string): boolean {
  return Number.isFinite(Number(recortado))
}

/**
 * Neutraliza la inyección de fórmulas (CSV injection): Excel y Google
 * Sheets interpretan como el inicio de una fórmula un campo que arranca con
 * `=`, `+`, `@` o `-` — y en este reporte `nombre` y
 * `direccion` salen de `venues` (scrapers, un campo libre del admin de
 * Instagram) y `display_name` viene de Nominatim: es dato externo, no
 * instrucción, y no tiene que poder ejecutar nada en la planilla de quien
 * abre el CSV.
 *
 * Si después de recortar los espacios del principio el texto arranca con uno
 * de esos caracteres, se le antepone un apóstrofo (`'`): la mayoría de las
 * planillas lo muestran como texto plano, sin interpretarlo. `-` es un caso
 * aparte: también puede abrir una fórmula (`-1+1`, `-=cmd`), pero `lat` y
 * `lon` llegan en este reporte siempre negativos — si `-24.7883` llegara
 * como string, prefijarlo a ciegas lo arruinaría. Por eso un `-` inicial
 * solo se neutraliza si el resto del texto **no** es un número válido
 * (`esNumeroComoTexto`); un `-24.7883` (sea `number` o `string`) queda
 * intacto, un `-1+1` o un `-=cmd` queda neutralizado.
 *
 * Solo aplica a `string`: un `number` (el caso real de `lat`/`lon` en el
 * reporte) nunca pasa por acá, ver `escaparCampoCsv`.
 */
function neutralizarFormula(texto: string): string {
  const recortado = texto.trimStart()
  if (recortado.length === 0) return texto

  // El tab y el retorno de carro, que también abren fórmula en una planilla,
  // no hace falta chequearlos: `trimStart()` ya los sacó, así que un
  // "\t=1+1" llega acá como "=1+1" y entra por el `=`.
  const primero = recortado[0]
  const abreFormula = primero === '=' || primero === '+' || primero === '@'
  const guionQueNoEsNumero = primero === '-' && !esNumeroComoTexto(recortado)

  return abreFormula || guionQueNoEsNumero ? `'${texto}` : texto
}

/**
 * Un campo de una fila, listo para un renglón de CSV: a texto, con la
 * fórmula neutralizada (solo si es `string`; ver `neutralizarFormula`) y
 * después, si hace falta, entre comillas (RFC 4180) — en ese orden: el
 * apóstrofo de la neutralización queda adentro de las comillas si el campo
 * las necesita.
 */
function escaparCampoCsv(valor: string | number | boolean | null | undefined): string {
  if (valor === null || valor === undefined) return ''
  // `number` y `boolean` no son dato externo (son el resultado de nuestro
  // propio cálculo: coordenadas, place_rank, importance): no se neutralizan.
  if (typeof valor !== 'string') return String(valor)

  const texto = neutralizarFormula(valor)
  if (/["\n,]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`
  }
  return texto
}

/**
 * CSV (RFC 4180: comillas y comas escapadas, líneas separadas por CRLF) de
 * `filas`. Las columnas son las claves de la primera fila, en su orden; si
 * `filas` está vacío, devuelve una cadena vacía.
 *
 * Cada campo que sea `string` pasa primero por `neutralizarFormula`: este
 * reporte se abre en una planilla (Excel, Google Sheets) y varias columnas
 * (`nombre`, `direccion`, `display_name`) son dato externo que no tiene que
 * poder ejecutar nada ahí. Los `number` (`lat`, `lon`, `place_rank`,
 * `importance`) no se tocan.
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
