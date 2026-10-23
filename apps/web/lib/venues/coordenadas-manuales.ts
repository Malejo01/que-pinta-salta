/**
 * Ubicación manual de un lugar (R53, tarea 53-c): parsea lo que un admin
 * pega en /admin/lugares (coordenadas sueltas o un link de OpenStreetMap) y
 * construye los dos links de OpenStreetMap que ve esa página.
 *
 * Puro: sin imports de Next ni de Supabase. La única dependencia es
 * `coordenadasEnSalta` de @qps/core/mapa/zona (creada en esta misma ronda,
 * R53/R54/R55, ver docstring de ese archivo).
 *
 * Un link de Google Maps se rechaza con un mensaje propio (decisión de la
 * ronda, 18/10): los términos de uso de Google restringen extraer datos de
 * sus mapas, así que no se intenta leer coordenadas de ahí.
 */
import { coordenadasEnSalta } from '@qps/core/mapa/zona'

export type CoordenadasParseadas = { lat: number; lng: number }
export type ErrorCoordenadas = { error: string }

const MENSAJE_FORMATO = 'Pegá las coordenadas como -24.7883, -65.4106 o un link de OpenStreetMap'
const MENSAJE_GOOGLE =
  'Los links de Google Maps no se aceptan. Si ya tenés las coordenadas, pegalas como -24.7883, -65.4106.'
const MENSAJE_FUERA_DE_ZONA =
  'Ese punto queda fuera de Salta: revisá que no estén invertidas la latitud y la longitud.'

// Decimales con punto (nunca coma): "-24.7883, -65.4106" / "-24.7883;-65.4106" / "-24.7883 -65.4106".
const COORDS_RE = /^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/

const GOOGLE_HOST_RE = /^(www\.)?google\.[a-z.]+$/

/**
 * `true` si el host es de Google Maps: google.<tld> o www.google.<tld> con
 * el pathname empezando en "/maps" (cubre cualquier dominio de país, por
 * ejemplo www.google.com.ar, que es el que arma Google Maps abierto desde
 * Argentina), más maps.google.*, goo.gl/maps y maps.app.goo.gl.
 */
function esUrlDeGoogleMaps(url: URL): boolean {
  const host = url.hostname.toLowerCase()
  if (host === 'maps.app.goo.gl') return true
  if (host.startsWith('maps.google.')) return true
  if ((host === 'goo.gl' || host === 'www.goo.gl') && url.pathname.startsWith('/maps')) return true
  if (GOOGLE_HOST_RE.test(host) && url.pathname.startsWith('/maps')) return true
  return false
}

function esUrlDeOpenStreetMap(url: URL): boolean {
  return url.hostname.toLowerCase().endsWith('openstreetmap.org')
}

/** Extrae lat/lng de un link de OSM, por `?mlat=&mlon=` o por `#map=<zoom>/<lat>/<lng>`. */
function coordenadasDesdeUrlOsm(url: URL): CoordenadasParseadas | null {
  const mlat = url.searchParams.get('mlat')
  const mlon = url.searchParams.get('mlon')
  if (mlat !== null && mlon !== null) {
    const lat = Number(mlat)
    const lng = Number(mlon)
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng }
  }

  const hash = url.hash.replace(/^#/, '')
  const match = /map=\d+(?:\.\d+)?\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/.exec(hash)
  if (match) {
    const lat = Number(match[1])
    const lng = Number(match[2])
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng }
  }

  return null
}

/**
 * Acepta coordenadas sueltas (coma, punto y coma o espacio como separador,
 * decimales con punto) o un link de openstreetmap.org. Un link de Google
 * Maps se rechaza con su propio mensaje. Si parsea pero el punto queda
 * fuera de la provincia de Salta, se rechaza también (probable lat/lng
 * invertidas).
 */
export function parsearCoordenadas(texto: unknown): CoordenadasParseadas | ErrorCoordenadas {
  if (typeof texto !== 'string') return { error: MENSAJE_FORMATO }

  const trimmed = texto.trim()
  if (!trimmed) return { error: MENSAJE_FORMATO }

  let url: URL | null = null
  try {
    url = new URL(trimmed)
  } catch {
    url = null
  }

  let coords: CoordenadasParseadas | null = null

  if (url) {
    if (esUrlDeGoogleMaps(url)) return { error: MENSAJE_GOOGLE }
    if (esUrlDeOpenStreetMap(url)) coords = coordenadasDesdeUrlOsm(url)
    if (!coords) return { error: MENSAJE_FORMATO }
  } else {
    const match = COORDS_RE.exec(trimmed)
    if (!match) return { error: MENSAJE_FORMATO }
    coords = { lat: Number(match[1]), lng: Number(match[2]) }
  }

  if (!coordenadasEnSalta(coords.lat, coords.lng)) return { error: MENSAJE_FUERA_DE_ZONA }

  return coords
}

/** Link para VER un punto ya conocido en OpenStreetMap, con zoom 18 (nivel de calle/edificio). */
export function urlVerEnOsm(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`
}

/**
 * Link para BUSCAR un lugar en OpenStreetMap (lo abre la persona en el
 * navegador): no es una llamada a la API de Nominatim, así que no hay
 * límite de uso que respetar acá.
 */
export function urlBuscarEnOsm(nombre: string, direccion: string | null): string {
  const query = direccion ? `${nombre}, ${direccion}` : nombre
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(query)}`
}
