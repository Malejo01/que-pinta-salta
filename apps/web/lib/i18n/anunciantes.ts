/**
 * /anunciantes en inglés: formatos fijos que la página arma a partir de datos
 * (números, precios, fecha de vigencia, pie y aviso del tarifario). No toca
 * `lib/anunciantes/**` ni `@qps/core`: replica en inglés la misma lógica y,
 * si un texto del tarifario no tiene un formato conocido, devuelve `null` (la
 * página lo muestra tal cual, en castellano y con `lang="es"`).
 *
 * Puro: sin React ni next/*.
 */
import type { PrecioPublicidad } from '@qps/core/publicidad/precios'

const MESES_ES = [
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

const MESES_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** "noviembre 2026" -> "November 2026"; `null` si no es "<mes> <año>". */
export function vigenciaEnIngles(vigencia: string): string | null {
  const partes = /^([a-záéíóúñ]+) (\d{4})$/.exec(vigencia.trim().toLowerCase())
  if (!partes) return null
  const nombre = partes[1] === 'setiembre' ? 'septiembre' : partes[1]
  const indice = MESES_ES.indexOf(nombre)
  if (indice === -1) return null
  return `${MESES_EN[indice]} ${partes[2]}`
}

function mesEn(mes: string): string | null {
  const n = Number(mes)
  return Number.isInteger(n) && n >= 1 && n <= 12 ? MESES_EN[n - 1] : null
}

/**
 * El pie del tarifario en castellano que esta traducción conoce (el de
 * `PIE_TARIFARIO` de core). Si core cambia el texto, deja de coincidir y la
 * página muestra el pie tal cual, en castellano.
 */
const PIE_ES =
  'Precios en pesos al dólar BNA del 1/11/2026. Se actualizan el 1° de cada mes según la audiencia del sitio y el tipo de cambio; ' +
  'los cambios de tramo se anuncian con 30 días de anticipación. Plan mensual prepago 3 meses: 10% off adicional. ' +
  'Precio fundador para los primeros 10 anunciantes o hasta el 31/01/2027, congelado por 90 días. ' +
  'Pago por transferencia o Mercado Pago antes de la publicación.'

const FECHA_DOLAR = /(dólar BNA del )(\d{1,2})\/(\d{1,2})\/(\d{4})/

/**
 * El pie del tarifario en inglés. El único dato variable del pie es la fecha
 * del dólar (`cargarTarifarioVigente` la reemplaza por la del ciclo vigente);
 * el resto tiene que ser el texto conocido, palabra por palabra.
 */
export function pieEnIngles(pie: string): string | null {
  const fecha = FECHA_DOLAR.exec(pie)
  if (!fecha) return null
  const [, , dia, mes, anio] = fecha
  const nombreMes = mesEn(mes)
  if (!nombreMes) return null
  if (pie !== PIE_ES.replace(FECHA_DOLAR, `$1${dia}/${mes}/${anio}`)) return null
  return (
    `Prices in Argentine pesos at the BNA (Banco de la Nación Argentina) exchange rate of ${nombreMes} ${Number(dia)}, ${anio}. ` +
    'They are updated on the 1st of each month based on the site audience and the exchange rate; ' +
    'tier changes are announced 30 days in advance. Prepaid 3-month monthly plan: an additional 10% off. ' +
    'Founder price for the first 10 advertisers or until January 31, 2027, frozen for 90 days. ' +
    'Payment by bank transfer or Mercado Pago before publication.'
  )
}

/** "Desde el 1/3, los precios pasan al tramo de 1.000 personas." en inglés; `null` si es otro texto. */
export function avisoEnIngles(aviso: string): string | null {
  const partes = /^Desde el (\d{1,2})\/(\d{1,2}), los precios pasan al tramo de (\d{1,3}(?:\.\d{3})*) personas\.$/.exec(aviso)
  if (!partes) return null
  const nombreMes = mesEn(partes[2])
  if (!nombreMes) return null
  const personas = Number(partes[3].replace(/\./g, ''))
  return `Starting ${nombreMes} ${Number(partes[1])}, prices move to the ${personas.toLocaleString('en-US')}-person tier.`
}

/** Las palabras sueltas que usan los precios (vienen del diccionario `anunciantes`). */
export interface PalabrasPrecio {
  gratis: string
  proximamente: string
  reservaPrioridad: string
  porMes: string
}

/** "ARS 14,000" (formato en-US, sin decimales, mismo redondeo que `formatearPesos`). */
function pesosEn(monto: number): string {
  return `ARS ${Math.round(monto).toLocaleString('en-US')}`
}

/** El precio de lista en inglés: "Free", "Coming soon", "ARS 14,000" o "ARS 42,000/month". */
export function precioListaEn(precio: PrecioPublicidad, palabras: PalabrasPrecio): string {
  if (precio.tipo === 'gratis') return palabras.gratis
  if (precio.tipo === 'proximamente') return palabras.proximamente
  return `${pesosEn(precio.listaArs)}${precio.periodo === 'mes' ? palabras.porMes : ''}`
}

/** El precio fundador en inglés: "Free", "Reserve priority", "ARS 10,000" o "ARS 29,500/month". */
export function precioFundadorEn(precio: PrecioPublicidad, palabras: PalabrasPrecio): string {
  if (precio.tipo === 'gratis') return palabras.gratis
  if (precio.tipo === 'proximamente') return palabras.reservaPrioridad
  return `${pesosEn(precio.fundadorArs)}${precio.periodo === 'mes' ? palabras.porMes : ''}`
}

/** "USD 9.2" aproximado del precio de lista, o `null` si no tiene precio en pesos. */
export function usdAproxEn(precio: PrecioPublicidad): string | null {
  if (precio.tipo !== 'pesos') return null
  return `USD ${precio.usdLista.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`
}

/** Como `formatPublicCount` (menos de 5 se oculta), con el número en formato en-US. */
export function conteoPublicoEn(n: number | null): string {
  if (n == null || n < 0) return '—'
  if (n < 5) return '<5'
  return n.toLocaleString('en-US')
}

/** Como `formatRadarSubscribers` (misma regla de redondeo hacia abajo a la decena), en formato en-US. */
export function suscriptosRadarEn(n: number | null): string {
  if (n == null || n < 0) return '—'
  if (n < 5) return '<5'
  if (n < 10) return '5+'
  return `${(Math.floor(n / 10) * 10).toLocaleString('en-US')}+`
}
