/**
 * Normalización de la dirección de un lugar antes de mandarla a Nominatim
 * (R53-b): errores de tipeo frecuentes, abreviaturas y tildes de las calles
 * comunes, y la separación en calle + número para la búsqueda estructurada.
 *
 * Sin inventar: solo se corrige lo que está en las listas de abajo. Lo que
 * no se reconoce va como vino.
 *
 * Puro: sin red, sin base, sin sistema de archivos.
 */

/** Correcciones de tipeo y abreviaturas, en este orden. */
const CORRECCIONES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bjhon\b/gi, 'John'],
  [/\b(?:avda|av)\.\s*/gi, 'Avenida '],
  [/\b(?:avda|av)\s+/gi, 'Avenida '],
  [/\bgral\.\s*/gi, 'General '],
]

/**
 * Calles comunes de Salta escritas sin tilde -> con tilde. Solo coinciden
 * palabras enteras escritas SIN la tilde: si ya vienen bien, no se tocan.
 */
const TILDES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bsan martin\b/gi, 'San Martín'],
  [/\bguemes\b/gi, 'Güemes'],
  [/\bzuviria\b/gi, 'Zuviría'],
  [/\bcordoba\b/gi, 'Córdoba'],
  [/\bentre rios\b/gi, 'Entre Ríos'],
  [/\btucuman\b/gi, 'Tucumán'],
  [/\bituzaingo\b/gi, 'Ituzaingó'],
  [/\bleguizamon\b/gi, 'Leguizamón'],
  [/\bdean funes\b/gi, 'Deán Funes'],
  [/\bpueyrredon\b/gi, 'Pueyrredón'],
  [/\bbolivar\b/gi, 'Bolívar'],
  [/\bperu\b/gi, 'Perú'],
  [/\bhipolito yrigoyen\b/gi, 'Hipólito Yrigoyen'],
  [/\bvicente lopez\b/gi, 'Vicente López'],
  [/\bespana\b/gi, 'España'],
  [/\bejercito del norte\b/gi, 'Ejército del Norte'],
  [/\bmonsenor\b/gi, 'Monseñor'],
  [/\bpatron costas\b/gi, 'Patrón Costas'],
  [/\basuncion\b/gi, 'Asunción'],
]

/** Partes que sobran al final de una dirección: la ciudad o el país ya van en la consulta. */
const COLAS_SOBRANTES = /^(salta|salta capital|capital|argentina|provincia de salta)$/i

/**
 * La dirección lista para consultar: espacios colapsados, sin las colas
 * ", Salta" / ", Argentina" / ", Capital", con las correcciones de tipeo y
 * las tildes de las calles comunes. `""` si no queda nada.
 *
 *   "San martin 484"                -> "San Martín 484"
 *   "Avenida Jhon F. Kennedy"       -> "Avenida John F. Kennedy"
 *   "Av. Uruguay 750, Salta"        -> "Avenida Uruguay 750"
 *   "Balcarce 875, Salta, Argentina" -> "Balcarce 875"
 */
export function normalizarDireccion(direccion: string): string {
  const partes = direccion
    .split(',')
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 0)
  while (partes.length > 0 && COLAS_SOBRANTES.test(partes[partes.length - 1])) partes.pop()

  let texto = partes.join(', ')
  for (const [regex, reemplazo] of [...CORRECCIONES, ...TILDES]) texto = texto.replace(regex, reemplazo)
  return texto.replace(/\s+/g, ' ').trim()
}

/** Calles que terminan en un número que NO es de puerta ("Ruta 9", "Ruta Nacional 51", "km 1600"). */
const CALLE_CON_NUMERO_QUE_NO_ES_PUERTA = /\b(ruta|ruta nacional|ruta provincial|rn|rp|km|kilometro|kilómetro)$/i

/**
 * Calle y número de puerta, si la dirección (ya normalizada) tiene esa forma
 * en su primer tramo antes de una coma: "Necochea 719", "Avenida Uruguay 750",
 * "San Martín N° 484". De un rango ("Marcelino Freyre 1438-1498") se usa el
 * primer número. `null` si no hay número de puerta ("s/n", "Ruta 9", solo la
 * calle, solo un número).
 */
export function calleYNumero(direccionNormalizada: string): { calle: string; numero: string } | null {
  const tramo = direccionNormalizada.split(',')[0].trim()
  if (/\bs\s*\/\s*n\b/i.test(tramo)) return null

  const m = tramo.match(/^(.+?)\s+(?:n[°º]\s*|nro\.?\s*|#\s*)?(\d{1,5})(?:\s*[-–/]\s*\d{1,5})?$/i)
  if (!m) return null

  const calle = m[1].trim()
  if (!/\p{L}/u.test(calle)) return null
  if (CALLE_CON_NUMERO_QUE_NO_ES_PUERTA.test(calle)) return null
  return { calle, numero: m[2] }
}
