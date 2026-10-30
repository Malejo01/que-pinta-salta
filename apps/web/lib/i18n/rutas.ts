/**
 * Rutas en inglés: qué páginas existen bajo `/en` y cómo pasar de un idioma
 * al otro. Puro: sin React ni next/*.
 */
import type { Idioma } from './idiomas'

/**
 * Rutas (en castellano, sin `/en`) que tienen versión en inglés. Un `*` final
 * vale por UN segmento: `/evento/*` es `/evento/<id>` (no `/evento` solo ni
 * `/evento/<id>/otra`). Un link a cualquier otra ruta queda en castellano
 * aunque se esté navegando en inglés.
 */
export const RUTAS_EN_INGLES: readonly string[] = ['/', '/cines', '/mapa', '/buscar', '/evento/*']

const PREFIJO_EN = '/en'

/** Separa "/cines?x=1#a" en { camino: "/cines", resto: "?x=1#a" }. */
function separarCamino(ruta: string): { camino: string; resto: string } {
  const corte = ruta.search(/[?#]/)
  if (corte === -1) return { camino: ruta, resto: '' }
  return { camino: ruta.slice(0, corte), resto: ruta.slice(corte) }
}

/** "/cines/" y "/cines" son la misma ruta; "/" queda "/". */
function sinBarraFinal(camino: string): string {
  if (camino.length > 1 && camino.endsWith('/')) return camino.replace(/\/+$/, '') || '/'
  return camino
}

/** `camino` coincide con una entrada de `RUTAS_EN_INGLES` (exacta, o `prefijo/*` con un segmento). */
function coincideRuta(patron: string, camino: string): boolean {
  if (!patron.endsWith('/*')) return patron === camino
  const prefijo = patron.slice(0, -1)
  if (!camino.startsWith(prefijo)) return false
  const segmento = camino.slice(prefijo.length)
  return segmento.length > 0 && !segmento.includes('/')
}

export function tieneVersionEnIngles(camino: string): boolean {
  const limpio = sinBarraFinal(camino)
  return RUTAS_EN_INGLES.some((patron) => coincideRuta(patron, limpio))
}

/**
 * La ruta en el idioma pedido. En castellano no cambia nada; en inglés le
 * agrega `/en` solo si la ruta está en `RUTAS_EN_INGLES` (si no, la deja en
 * castellano). Respeta `?query` y `#hash`: `rutaEn('en', '/?category=cine')`
 * es `/en?category=cine`.
 */
export function rutaEn(idioma: Idioma, ruta: string): string {
  if (idioma === 'es') return ruta
  const { camino, resto } = separarCamino(ruta)
  if (!tieneVersionEnIngles(camino)) return ruta
  const limpio = sinBarraFinal(camino)
  return (limpio === '/' ? PREFIJO_EN : `${PREFIJO_EN}${limpio}`) + resto
}

/**
 * `hrefLang` para un link interno: en inglés, los links a páginas que solo
 * existen en castellano lo avisan con "es-AR"; si no, nada.
 */
export function hrefLangDestino(idioma: Idioma, ruta: string): 'es-AR' | undefined {
  if (idioma === 'es') return undefined
  return tieneVersionEnIngles(separarCamino(ruta).camino) ? undefined : 'es-AR'
}

/**
 * El idioma de un pathname y la ruta equivalente en castellano. `/en` y
 * `/en/...` son inglés; `/entradas` (o cualquier otra ruta que solo empiece
 * con las letras "en") no.
 */
export function separarIdioma(pathname: string): { idioma: Idioma; ruta: string } {
  if (pathname === PREFIJO_EN || pathname === `${PREFIJO_EN}/`) return { idioma: 'en', ruta: '/' }
  if (pathname.startsWith(`${PREFIJO_EN}/`)) {
    return { idioma: 'en', ruta: pathname.slice(PREFIJO_EN.length) }
  }
  return { idioma: 'es', ruta: pathname }
}

/**
 * Adónde lleva el selector de idioma desde `pathname` (que puede traer
 * `?query` y `#hash`). Si la página no existe en inglés, el destino en inglés
 * es la portada (`/en`), sin la query: la de otra página no le sirve.
 */
export function rutaEnOtroIdioma(pathname: string, destino: Idioma): string {
  const { camino, resto } = separarCamino(pathname)
  const { ruta } = separarIdioma(camino)
  if (destino === 'es') return ruta + resto
  if (!tieneVersionEnIngles(ruta)) return PREFIJO_EN
  return rutaEn('en', ruta + resto)
}
