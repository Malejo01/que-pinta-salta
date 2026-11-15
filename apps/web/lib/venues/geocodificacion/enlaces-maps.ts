/**
 * Q7-2: coordenadas de un lugar sacadas de los links de Google Maps que traen
 * sus eventos (`ticket_url`, la descripción o las fuentes de
 * `ticket_sources`).
 *
 * SOLO se parsea el texto del link: no se le pide nada a Google (ni la API ni
 * la página, ni para resolver un link corto). Un link corto
 * (`maps.app.goo.gl/…`, `goo.gl/maps/…`) no trae coordenadas en el texto: se
 * cuenta en el reporte y se deja pasar.
 *
 * Qué formas dan un pin (confianza alta, si cae en la ciudad del lugar):
 *   - `…/data=…!3d-24.78!4d-65.41…`  (el pin del lugar en un link de `place`)
 *   - `?q=-24.78,-65.41`, `?query=…`, `?destination=…`, `?daddr=…` (también `loc:`)
 *   - `/maps/place/-24.78,-65.41`, `/maps/search/-24.78,+-65.41`
 * Qué formas son solo el centro del mapa (confianza «revisar»):
 *   - `/@-24.78,-65.41,17z` sin `!3d!4d`, `?ll=…`, `?center=…`, `?sll=…`
 *
 * Puro: sin red, sin base, sin sistema de archivos.
 */

import { distanciaMetros } from '@qps/core/lugares/permanentes'
import { coordenadasEnSalta } from '@qps/core/mapa/zona'
import { enZona, type Zona } from './localidades'

/** Lo que se puede leer de un link de Google Maps. */
export type LecturaEnlaceMaps =
  | { tipo: 'coordenadas'; lat: number; lng: number; precision: 'pin' | 'centro'; enlace: string }
  | { tipo: 'lugar'; nombre: string; enlace: string }
  | { tipo: 'corto'; enlace: string }

/** Prefijo de `geocode_sugerencia_texto` de una sugerencia que salió de un link (y no de Nominatim). */
export const PREFIJO_SUGERENCIA_ENLACE = 'Link de Google Maps de un evento'

/** Qué tan cerca tienen que estar los pines de dos links para que cuenten como el mismo lugar. */
export const DISTANCIA_ACUERDO_ENLACES_METROS = 300

/** Tope de caracteres de un texto a barrer (una descripción gigante no tiene que trabar la corrida). */
const MAX_TEXTO = 20_000

const NUMERO = String.raw`(-?\d{1,3}(?:\.\d+)?)`
const PAR = new RegExp(String.raw`^\s*(?:loc:)?\s*${NUMERO}\s*,\s*\+?${NUMERO}\s*$`)
const PIN_DATA = new RegExp(String.raw`!3d${NUMERO}!4d${NUMERO}`)
const ARROBA = new RegExp(String.raw`/@${NUMERO},${NUMERO}(?:,|$|/|\?)`)
const PARAMS_PIN = ['q', 'query', 'destination', 'daddr'] as const
const PARAMS_CENTRO = ['ll', 'center', 'sll'] as const

/** `true` si el host es de Google Maps (o un acortador de Maps). */
function esHostDeMaps(url: URL): 'largo' | 'corto' | null {
  const host = url.hostname.toLowerCase()
  if (host === 'maps.app.goo.gl') return 'corto'
  if (host === 'goo.gl' && url.pathname.startsWith('/maps')) return 'corto'
  // google.com, google.com.ar, maps.google.com, www.google.com.ar, …
  if (!/(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host)) return null
  if (host.startsWith('maps.') || url.pathname.startsWith('/maps')) return 'largo'
  return null
}

function decodificar(texto: string): string {
  try {
    return decodeURIComponent(texto.replace(/\+/g, ' '))
  } catch {
    return texto
  }
}

function par(texto: string | null): { lat: number; lng: number } | null {
  if (!texto) return null
  const m = decodificar(texto).match(PAR)
  if (!m) return null
  const lat = Number(m[1])
  const lng = Number(m[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}

/**
 * Lo que dice un link, o `null` si no es de Google Maps (o no se puede leer).
 * No valida que el punto esté en Salta: eso lo decide `propuestaPorEnlaces`.
 */
export function leerEnlaceMaps(enlace: string): LecturaEnlaceMaps | null {
  let url: URL
  try {
    url = new URL(enlace)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const tipoHost = esHostDeMaps(url)
  if (tipoHost === null) return null
  if (tipoHost === 'corto') return { tipo: 'corto', enlace }

  const ruta = url.pathname
  const rutaDecodificada = decodificar(ruta)

  // 1. El pin de un link de `place` (`!3d<lat>!4d<lng>`), en la ruta o en `data=`.
  const pin = `${rutaDecodificada}${decodificar(url.search)}`.match(PIN_DATA)
  if (pin) {
    const coordenadas = par(`${pin[1]},${pin[2]}`)
    if (coordenadas) return { tipo: 'coordenadas', ...coordenadas, precision: 'pin', enlace }
  }

  // 2. Un parámetro que marca un punto (`?q=lat,lng`, `?query=…`, `?destination=…`).
  for (const nombre of PARAMS_PIN) {
    const coordenadas = par(url.searchParams.get(nombre))
    if (coordenadas) return { tipo: 'coordenadas', ...coordenadas, precision: 'pin', enlace }
  }

  // 3. `/maps/place/<lat>,<lng>` o `/maps/search/<lat>,<lng>`.
  const segmento = rutaDecodificada.match(/\/maps\/(?:place|search)\/([^/]+)/)
  if (segmento) {
    const coordenadas = par(segmento[1])
    if (coordenadas) return { tipo: 'coordenadas', ...coordenadas, precision: 'pin', enlace }
  }

  // 4. Solo el centro del mapa: `/@lat,lng,zoom` o `?ll=…`.
  const arroba = rutaDecodificada.match(ARROBA)
  if (arroba) {
    const coordenadas = par(`${arroba[1]},${arroba[2]}`)
    if (coordenadas) return { tipo: 'coordenadas', ...coordenadas, precision: 'centro', enlace }
  }
  for (const nombre of PARAMS_CENTRO) {
    const coordenadas = par(url.searchParams.get(nombre))
    if (coordenadas) return { tipo: 'coordenadas', ...coordenadas, precision: 'centro', enlace }
  }

  // 5. Un `place` con nombre y sin coordenadas (un nombre tiene letras: unas
  // coordenadas inválidas no son un nombre).
  const nombre = (segmento?.[1] ?? url.searchParams.get('q') ?? url.searchParams.get('query') ?? '').replace(/\s+/g, ' ').trim()
  if (/\p{L}/u.test(nombre) && !/^loc:/i.test(nombre)) return { tipo: 'lugar', nombre, enlace }

  return null
}

/** Los links `http(s)` de un texto libre (descripción, caption), sin repetir. */
export function enlacesEnTexto(texto: string | null | undefined): string[] {
  if (!texto) return []
  const encontrados = texto.slice(0, MAX_TEXTO).match(/https?:\/\/[^\s<>"'()[\]{}]+/gi) ?? []
  // Puntuación que suele quedar pegada al final de un link en un texto.
  const limpios = encontrados.map((e) => e.replace(/[.,;:!?…]+$/, ''))
  return [...new Set(limpios)]
}

/** Todos los strings de un JSON (p. ej. `ticket_sources`), sin importar la forma. */
function stringsDe(valor: unknown, profundidad = 0): string[] {
  if (profundidad > 4) return []
  if (typeof valor === 'string') return [valor]
  if (Array.isArray(valor)) return valor.flatMap((v) => stringsDe(v, profundidad + 1))
  if (valor && typeof valor === 'object') return Object.values(valor).flatMap((v) => stringsDe(v, profundidad + 1))
  return []
}

/** Lo mínimo de un evento que hace falta para buscarle links de Maps. */
export interface EventoConEnlaces {
  id: string
  venue_id: string | null
  ticket_url: string | null
  description: string | null
  ticket_sources?: unknown
}

/** Las lecturas de Maps de un evento, en orden: `ticket_url`, fuentes y descripción. Sin repetir links. */
export function lecturasDeEvento(evento: EventoConEnlaces): LecturaEnlaceMaps[] {
  const enlaces = [
    ...enlacesEnTexto(evento.ticket_url),
    ...stringsDe(evento.ticket_sources).flatMap((s) => enlacesEnTexto(s)),
    ...enlacesEnTexto(evento.description),
  ]
  const lecturas: LecturaEnlaceMaps[] = []
  for (const enlace of new Set(enlaces)) {
    const lectura = leerEnlaceMaps(enlace)
    if (lectura) lecturas.push(lectura)
  }
  return lecturas
}

/** La propuesta para un lugar a partir de los links de sus eventos. */
export type PropuestaPorEnlaces =
  | { confianza: 'alta'; lat: number; lng: number; enlace: string; links: number }
  | { confianza: 'revisar'; lat: number; lng: number; enlace: string; links: number; motivo: string }

/**
 * Junta las lecturas de los eventos de un lugar y decide:
 *   - `alta`: hay al menos un pin dentro de la ciudad del lugar (`zona`) y
 *     todos los pines de la ciudad están a menos de 300 m del primero;
 *   - `revisar`: los pines no coinciden, el pin cae en la provincia pero fuera
 *     de la ciudad, o solo hay centros de mapa (`/@…`);
 *   - `null`: ningún link con coordenadas en la provincia.
 * Las coordenadas fuera de la provincia se ignoran. Un `lugar` (nombre sin
 * coordenadas) o un link `corto` nunca dan propuesta.
 */
export function propuestaPorEnlaces(lecturas: LecturaEnlaceMaps[], zona: Zona): PropuestaPorEnlaces | null {
  const conCoordenadas = lecturas.filter(
    (l): l is Extract<LecturaEnlaceMaps, { tipo: 'coordenadas' }> =>
      l.tipo === 'coordenadas' && coordenadasEnSalta(l.lat, l.lng)
  )
  if (conCoordenadas.length === 0) return null

  const pinesEnCiudad = conCoordenadas.filter((l) => l.precision === 'pin' && enZona(zona, l.lat, l.lng))
  const links = conCoordenadas.length
  if (pinesEnCiudad.length > 0) {
    const [primero] = pinesEnCiudad
    const coinciden = pinesEnCiudad.every(
      (l) => distanciaMetros(primero, l) < DISTANCIA_ACUERDO_ENLACES_METROS
    )
    if (coinciden) return { confianza: 'alta', lat: primero.lat, lng: primero.lng, enlace: primero.enlace, links: pinesEnCiudad.length }
    return {
      confianza: 'revisar',
      lat: primero.lat,
      lng: primero.lng,
      enlace: primero.enlace,
      links,
      motivo: 'los links de los eventos marcan puntos distintos',
    }
  }

  const [mejor] = [...conCoordenadas].sort((a, b) => (a.precision === 'pin' ? 0 : 1) - (b.precision === 'pin' ? 0 : 1))
  return {
    confianza: 'revisar',
    lat: mejor.lat,
    lng: mejor.lng,
    enlace: mejor.enlace,
    links,
    motivo: mejor.precision === 'pin' ? 'el link marca un punto fuera de la ciudad del lugar' : 'el link solo trae el centro del mapa',
  }
}

/** Cuántos links cortos (sin coordenadas en el texto) hay en las lecturas: van al reporte. */
export function cuantosCortos(lecturas: LecturaEnlaceMaps[]): number {
  return lecturas.filter((l) => l.tipo === 'corto').length
}

/** El texto de la sugerencia guardada en `venues.geocode_sugerencia_texto`. */
export function textoSugerenciaEnlace(links: number): string {
  return `${PREFIJO_SUGERENCIA_ENLACE} (confianza alta${links > 1 ? `, ${links} links coinciden` : ''})`
}

/** `true` si una sugerencia guardada salió de un link de Maps (y no de Nominatim). */
export function esSugerenciaDeEnlace(texto: string | null | undefined): boolean {
  return typeof texto === 'string' && texto.startsWith(PREFIJO_SUGERENCIA_ENLACE)
}
