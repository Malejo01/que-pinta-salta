/**
 * Consultas de geocodificación para un lugar: qué pedirle a Nominatim y en
 * qué orden, y la URL exacta del pedido.
 *
 * R53-b: cada lugar se busca primero adentro de su ciudad (Salta Capital, o
 * la localidad del interior que mencione: ver `localidades.ts`), con la
 * dirección antes que el nombre; recién si eso no da nada, una sola búsqueda
 * en toda la provincia, cuyo resultado siempre va a revisar.
 *
 * Puro: no importa `@supabase/*`, no toca el sistema de archivos ni llama al
 * `fetch` global. `nominatim.ts` es quien hace el pedido de red.
 */

import { CONTACTO_EMAIL } from '@qps/core/contacto'
import { ZONA_SALTA } from '@qps/core/mapa/zona'
import { calleYNumero, normalizarDireccion } from './direccion'
import { localidadDelLugar, type Localidad, type Zona } from './localidades'

/** User-Agent exigido por la política de uso de Nominatim: identifica el sitio y un contacto real. */
export const USER_AGENT = `QuePintaSalta/1.0 (geocodificación de lugares; +https://www.quepintasalta.com.ar; ${CONTACTO_EMAIL})`

/** Referer del pedido: la política de Nominatim lo pide junto con el User-Agent. */
export const REFERER = 'https://www.quepintasalta.com.ar'

/** Política de uso de Nominatim que este cliente tiene que cumplir (máx. 1 pedido/segundo, etc.). */
export const URL_POLITICA = 'https://operations.osmfoundation.org/policies/nominatim/'

/** Direcciones que llegan de las fuentes pero no aportan nada para geocodificar (ya normalizadas). */
const DIRECCIONES_INUTILES = new Set(['salta', 'salta capital', 'a confirmar', 'sin direccion'])

/**
 * Clave de comparación: minúsculas, sin tildes, espacios colapsados y
 * recortados. No toca puntuación (una consulta real lleva comas).
 *
 *   "Balcarce, Salta, Argentina"  -> "balcarce, salta, argentina"
 *   "  Güemes   "                 -> "guemes"
 */
export function normalizarConsulta(q: string): string {
  return q
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * `false` si `address` no aporta nada para geocodificar: vacía, igual al
 * nombre del lugar (normalizada), o una de las direcciones placeholder que
 * mandan las fuentes ("Salta", "Salta Capital", "A confirmar", "Sin
 * dirección").
 */
export function direccionUtil(address: string | null | undefined, nombre: string | null | undefined): boolean {
  if (!address) return false
  const direccionNorm = normalizarConsulta(address)
  if (direccionNorm.length === 0) return false
  if (direccionNorm === normalizarConsulta(nombre ?? '')) return false
  if (DIRECCIONES_INUTILES.has(direccionNorm)) return false
  return true
}

/**
 * Dónde se busca:
 *   - `'ciudad'`: adentro del rectángulo de la ciudad del lugar, con
 *     `bounded=1` (Nominatim no devuelve nada de afuera). Puede ser alta.
 *   - `'provincia'`: toda la provincia, sin `bounded` (el rectángulo solo
 *     orienta). Último recurso: su resultado nunca es alta.
 */
export type AlcanceConsulta = 'ciudad' | 'provincia'

interface ConsultaComun {
  alcance: AlcanceConsulta
  /** El rectángulo de la búsqueda: el de la ciudad, o `ZONA_SALTA` para la provincia. */
  zona: Zona
  /** Nombre de la ciudad (o "provincia de Salta"), para el reporte. */
  donde: string
}

/** Búsqueda estructurada de Nominatim: `street=<número> <calle>&city=…&state=Salta&country=Argentina`. */
export interface ConsultaEstructurada extends ConsultaComun {
  tipo: 'estructurada'
  calle: string
  numero: string
  ciudad: string
}

/** Búsqueda de texto libre (`q=`). */
export interface ConsultaLibre extends ConsultaComun {
  tipo: 'libre'
  q: string
  /** La dirección sin número de puerta: a lo sumo da la calle, así que su resultado siempre va a revisar. */
  soloCalle?: boolean
}

export type ConsultaGeocodificacion = ConsultaEstructurada | ConsultaLibre

/** Una consulta libre en toda la provincia (sin `bounded`). */
function consultaProvincia(q: string): ConsultaLibre {
  return { tipo: 'libre', q, alcance: 'provincia', zona: ZONA_SALTA, donde: 'provincia de Salta' }
}

/**
 * Las consultas de un lugar, en orden, sin repetidas (por `claveDeConsulta`):
 *
 *   1. Si la dirección (normalizada: `normalizarDireccion`) es calle +
 *      número: búsqueda estructurada en la ciudad del lugar.
 *   2. "nombre, <ciudad>" en la ciudad ("La Metro, Salta Capital").
 *   3. "nombre" solo, en la ciudad.
 *   4. Si la dirección sirve pero no tiene número ("Avenida John F.
 *      Kennedy"): "dirección, <ciudad>" en la ciudad (`soloCalle`).
 *   5. Último recurso, en toda la provincia: "dirección, Salta, Argentina"
 *      si la dirección sirve, si no "nombre, Salta, Argentina".
 *
 * La 1 y la 4 se excluyen entre sí: nunca son más de 4 consultas.
 *
 * La ciudad es Salta Capital salvo que el nombre o la dirección mencionen
 * otra localidad conocida (`localidadDelLugar`).
 */
export function consultasParaLugar({
  nombre,
  direccion,
}: {
  nombre: string
  direccion?: string | null
}): ConsultaGeocodificacion[] {
  const localidad: Localidad = localidadDelLugar({ nombre, direccion })
  const enCiudad = { alcance: 'ciudad' as const, zona: localidad.zona, donde: localidad.nombre }

  const direccionNormalizada = direccionUtil(direccion, nombre) && direccion ? normalizarDireccion(direccion) : ''
  const conNumero = direccionNormalizada ? calleYNumero(direccionNormalizada) : null

  const candidatas: ConsultaGeocodificacion[] = []
  if (conNumero) {
    candidatas.push({ tipo: 'estructurada', calle: conNumero.calle, numero: conNumero.numero, ciudad: localidad.ciudad, ...enCiudad })
  }
  candidatas.push({ tipo: 'libre', q: `${nombre}, ${localidad.nombre}`, ...enCiudad })
  candidatas.push({ tipo: 'libre', q: nombre, ...enCiudad })
  if (direccionNormalizada && !conNumero) {
    candidatas.push({ tipo: 'libre', q: `${direccionNormalizada}, ${localidad.ciudad}`, soloCalle: true, ...enCiudad })
  }
  candidatas.push(consultaProvincia(`${direccionNormalizada || nombre}, Salta, Argentina`))

  const vistas = new Set<string>()
  const consultas: ConsultaGeocodificacion[] = []
  for (const candidata of candidatas) {
    const clave = claveDeConsulta(candidata)
    if (vistas.has(clave)) continue
    vistas.add(clave)
    consultas.push(candidata)
  }
  return consultas
}

/** El rectángulo en el orden que pide Nominatim: `lngMin,latMax,lngMax,latMin`. */
function viewbox(zona: Zona): string {
  return `${zona.lngMin},${zona.latMax},${zona.lngMax},${zona.latMin}`
}

/**
 * Clave de caché (y de "ya la probé") de una consulta: el tipo, el texto y
 * DÓNDE se busca. La misma frase acotada a la capital y suelta en la
 * provincia dan resultados distintos, así que no pueden compartir entrada.
 * El prefijo `v2` deja afuera las entradas de la caché de la R53, que se
 * pidieron con otro rectángulo.
 */
export function claveDeConsulta(consulta: ConsultaGeocodificacion): string {
  const texto =
    consulta.tipo === 'estructurada'
      ? `street=${consulta.numero} ${consulta.calle}; city=${consulta.ciudad}`
      : `q=${consulta.q}${consulta.soloCalle ? '; solo calle' : ''}`
  return normalizarConsulta(`v2 | ${consulta.tipo} | ${texto} | ${consulta.alcance} ${viewbox(consulta.zona)}`)
}

/** La consulta en una línea legible, para la columna `consulta` del reporte. */
export function describirConsulta(consulta: ConsultaGeocodificacion): string {
  const texto =
    consulta.tipo === 'estructurada'
      ? `${consulta.calle} ${consulta.numero}, ${consulta.ciudad} (estructurada)`
      : `${consulta.q}${consulta.soloCalle ? ' (sin número)' : ''}`
  return consulta.alcance === 'ciudad' ? `${texto} [en ${consulta.donde}]` : `${texto} [toda la provincia]`
}

/**
 * URL del pedido de búsqueda a Nominatim, en español y con los parámetros
 * que pide la política de uso (`email`). Alcance `'ciudad'`: `viewbox` de la
 * ciudad y `bounded=1`. Alcance `'provincia'`: `viewbox` de la provincia, sin
 * `bounded`. La estructurada manda `street`/`city`/`state`/`country` (y no
 * `q`: Nominatim no acepta las dos formas juntas).
 */
export function urlDeBusqueda(consulta: ConsultaGeocodificacion, { email }: { email: string }): string {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  const params = new URLSearchParams([['format', 'jsonv2']])
  if (consulta.tipo === 'estructurada') {
    params.append('street', `${consulta.numero} ${consulta.calle}`)
    params.append('city', consulta.ciudad)
    params.append('state', 'Salta')
    params.append('country', 'Argentina')
  } else {
    params.append('q', consulta.q)
  }
  params.append('limit', '3')
  params.append('countrycodes', 'ar')
  params.append('viewbox', viewbox(consulta.zona))
  if (consulta.alcance === 'ciudad') params.append('bounded', '1')
  params.append('addressdetails', '1')
  params.append('accept-language', 'es')
  params.append('email', email)
  url.search = params.toString()
  return url.toString()
}
