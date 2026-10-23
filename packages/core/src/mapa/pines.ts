/**
 * El filtro de `/mapa` (R54, web) y los pines por lugar. Puro: sin React,
 * Next ni Supabase, ni lectura del reloj (`ahora` siempre entra por
 * parámetro). La R55 (mapa en la app) importa este archivo tal cual.
 */
import { formatSaltaDayKey, saltaWallClockToDate } from '../date-format'
import { ventanaDeAtajo } from '../home/atajos'
import { estimatedEnd, isVigente } from '../events/vigencia'
import { coordenadasEnSalta } from './zona'

/** Cuántos días para adelante acepta `?dia=` (desde hoy, en hora de Salta). */
export const DIAS_MAXIMOS_FECHA_MAPA = 60

export type FiltroMapa = { tipo: 'hoy' } | { tipo: 'finde' } | { tipo: 'fecha'; dia: string }

/** Lo mínimo que necesita un lugar para tener un pin en el mapa. */
export interface VenueParaMapa {
  id: string
  name: string
  address: string
  /** `unknown`: PostgREST puede devolver un `numeric` como texto (ver `aCoordenada`). */
  latitude: unknown
  longitude: unknown
}

/** Lo mínimo que necesita un evento para el mapa. Lo cumplen `EventWithRelations` de la web y lo que trae la app, sin cast. */
export interface EventoParaMapa {
  id: string
  title: string
  start_date: string
  end_date?: string | null
  category?: { slug: string } | null
  venue?: VenueParaMapa | null
}

/** Un evento dentro de un pin: solo lo que la lista y el mapa dibujan (nada de texto scrapeado de más). */
export interface EventoDelPin {
  id: string
  titulo: string
  inicio: string
  categoria: string | null
}

/** Un lugar con eventos, listo para dibujar en el mapa y en la lista. */
export interface PinLugar {
  venueId: string
  nombre: string
  direccion: string
  lat: number
  lng: number
  eventos: EventoDelPin[]
}

/** `YYYY-MM-DD` +/- `dias` días de calendario (no depende de ninguna zona horaria: opera sobre el día-clave). */
function sumarDiasADiaKey(diaKey: string, dias: number): string {
  const fecha = new Date(`${diaKey}T00:00:00Z`)
  fecha.setUTCDate(fecha.getUTCDate() + dias)
  return fecha.toISOString().slice(0, 10)
}

/** `true` si `dia` tiene la forma `AAAA-MM-DD` y es una fecha real del calendario (rechaza `2026-02-31`, `2026-13-01`). */
function esFechaDeCalendarioValida(dia: string): boolean {
  const coincidencia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia)
  if (!coincidencia) return false
  const anio = Number(coincidencia[1])
  const mes = Number(coincidencia[2])
  const diaDelMes = Number(coincidencia[3])
  if (mes < 1 || mes > 12) return false
  if (diaDelMes < 1 || diaDelMes > 31) return false
  const fecha = new Date(Date.UTC(anio, mes - 1, diaDelMes))
  // Si el día no existe (ej. 31 de febrero), Date corrige la fecha "de más" y
  // el roundtrip deja de coincidir con lo que se pidió.
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === diaDelMes
}

/**
 * El filtro de `/mapa` a partir de los query params. `fecha` exige un `dia`
 * `AAAA-MM-DD` real del calendario, entre hoy y hoy + `DIAS_MAXIMOS_FECHA_MAPA`
 * días (en hora de Salta). Cualquier otra cosa (sin parámetros, `cuando`
 * desconocido, `dia` mal formado, inexistente o fuera de rango) cae en
 * `{ tipo: 'hoy' }`: nunca tira una excepción.
 */
export function parsearFiltroMapa(params: { cuando?: string | null; dia?: string | null }, ahora: Date): FiltroMapa {
  if (params.cuando === 'finde') return { tipo: 'finde' }

  if (params.cuando === 'fecha' && params.dia && esFechaDeCalendarioValida(params.dia)) {
    const hoyKey = formatSaltaDayKey(ahora)
    const maxKey = sumarDiasADiaKey(hoyKey, DIAS_MAXIMOS_FECHA_MAPA)
    // Comparación de strings: válida porque las tres fechas tienen la misma
    // forma de ancho fijo AAAA-MM-DD, donde el orden lexicográfico coincide
    // con el orden cronológico.
    if (params.dia >= hoyKey && params.dia <= maxKey) {
      return { tipo: 'fecha', dia: params.dia }
    }
  }

  return { tipo: 'hoy' }
}

/** Ventana de tiempo (instantes reales) del filtro, para `ahora`. */
export function ventanaDeFiltroMapa(filtro: FiltroMapa, ahora: Date): { desde: Date; hasta: Date } {
  if (filtro.tipo === 'fecha') {
    return {
      desde: saltaWallClockToDate(`${filtro.dia}T00:00:00`),
      hasta: saltaWallClockToDate(`${filtro.dia}T23:59:59.999`),
    }
  }
  return ventanaDeAtajo(filtro.tipo, ahora)
}

/**
 * `true` si `evento` cae en `filtro` para el instante `ahora`. La misma regla
 * para `hoy`, `finde` y `fecha`: el evento tiene que estar vigente
 * (`isVigente`) y, o bien su inicio cae en la ventana (`ventanaDeFiltroMapa`),
 * o bien empezó antes de la ventana (dura varios días: un festival que arrancó
 * anteayer) y su fin estimado (`estimatedEnd`) llega hasta el principio de la
 * ventana. Para `hoy`/`finde` es `eventoEnAtajo` más ese arrastre: el mapa
 * muestra lo que sigue en curso (la portada, `atajos.ts`, no cambia).
 */
export function eventoEnFiltroMapa(evento: EventoParaMapa, filtro: FiltroMapa, ahora: Date): boolean {
  if (!isVigente(evento, ahora)) return false

  const inicio = new Date(evento.start_date)
  if (Number.isNaN(inicio.getTime())) return false

  const { desde, hasta } = ventanaDeFiltroMapa(filtro, ahora)
  if (inicio.getTime() >= desde.getTime() && inicio.getTime() <= hasta.getTime()) return true

  // Evento de varios días que ya empezó antes de ese día, pero sigue vigente
  // durante él (su fin estimado llega hasta el principio de la ventana).
  if (inicio.getTime() < desde.getTime() && estimatedEnd(evento).getTime() >= desde.getTime()) return true

  return false
}

/**
 * Convierte lo que venga de la base (o de un formulario) a coordenada:
 * número finito, o string numérico (PostgREST puede mandar un `numeric` como
 * texto). Cualquier otra cosa, `null`. Ojo con `Number('')`, que da `0`: un
 * string vacío no es la coordenada 0.
 */
export function aCoordenada(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null
  if (typeof valor === 'string') {
    const texto = valor.trim()
    if (texto === '') return null
    const numero = Number(texto)
    return Number.isFinite(numero) ? numero : null
  }
  return null
}

/** Eventos del pin por inicio y, si empatan, por id (orden estable y total). */
function compararEventosDelPin(a: EventoDelPin, b: EventoDelPin): number {
  const porInicio = new Date(a.inicio).getTime() - new Date(b.inicio).getTime()
  if (porInicio !== 0) return porInicio
  if (a.id < b.id) return -1
  if (a.id > b.id) return 1
  return 0
}

/**
 * Pines por el inicio de su primer evento (ya ordenados) y, si empatan, por
 * nombre; si todavía empatan (mismo nombre, mismo primer inicio: dos lugares
 * homónimos), por `venueId`, para que el orden sea total y estable sin
 * depender del orden de entrada.
 */
function compararPines(a: PinLugar, b: PinLugar): number {
  const porInicio = new Date(a.eventos[0].inicio).getTime() - new Date(b.eventos[0].inicio).getTime()
  if (porInicio !== 0) return porInicio
  const porNombre = a.nombre.localeCompare(b.nombre)
  if (porNombre !== 0) return porNombre
  if (a.venueId < b.venueId) return -1
  if (a.venueId > b.venueId) return 1
  return 0
}

/**
 * Arma los pines del mapa: uno por lugar, con sus eventos que caen en
 * `filtro` para `ahora`. Un `id` repetido cuenta una sola vez. Un evento sin
 * lugar, o con coordenadas que no caen en `coordenadasEnSalta`, no tiene pin:
 * suma a `sinUbicacion` (un evento que no entra en el filtro no suma a nada).
 */
export function armarPinesDelMapa(
  eventos: EventoParaMapa[],
  filtro: FiltroMapa,
  ahora: Date
): { pines: PinLugar[]; sinUbicacion: number } {
  const vistos = new Set<string>()
  const porLugar = new Map<string, PinLugar>()
  let sinUbicacion = 0

  for (const evento of eventos) {
    if (vistos.has(evento.id)) continue
    if (!eventoEnFiltroMapa(evento, filtro, ahora)) continue
    vistos.add(evento.id)

    const venue = evento.venue
    const lat = venue ? aCoordenada(venue.latitude) : null
    const lng = venue ? aCoordenada(venue.longitude) : null

    if (!venue || lat === null || lng === null || !coordenadasEnSalta(lat, lng)) {
      sinUbicacion += 1
      continue
    }

    const eventoDelPin: EventoDelPin = {
      id: evento.id,
      titulo: evento.title,
      inicio: evento.start_date,
      categoria: evento.category?.slug ?? null,
    }

    const pinExistente = porLugar.get(venue.id)
    if (pinExistente) {
      pinExistente.eventos.push(eventoDelPin)
    } else {
      porLugar.set(venue.id, {
        venueId: venue.id,
        nombre: venue.name,
        direccion: venue.address,
        lat,
        lng,
        eventos: [eventoDelPin],
      })
    }
  }

  const pines = [...porLugar.values()]
  for (const pin of pines) pin.eventos.sort(compararEventosDelPin)
  pines.sort(compararPines)

  return { pines, sinUbicacion }
}

/** Una `Feature` GeoJSON de punto, sin tipar toda la librería geojson (que no es una dependencia del proyecto). */
interface FeatureDePunto {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: { venueId: string; cantidad: number }
}

/** Un `FeatureCollection` GeoJSON de puntos. */
export interface ColeccionDePines {
  type: 'FeatureCollection'
  features: FeatureDePunto[]
}

/**
 * Pines a GeoJSON para la fuente del mapa. Coordenadas en el orden de
 * GeoJSON (`[lng, lat]`: al revés del que usa la gente). `properties` lleva
 * solo `venueId` y `cantidad`: nada de títulos ni nombres de lugares, porque
 * son texto scrapeado de terceros y el mapa no dibuja texto ajeno (sin
 * `Popup.setHTML`; el detalle lo muestra la lista, en React).
 */
export function pinesAGeoJson(pines: PinLugar[]): ColeccionDePines {
  return {
    type: 'FeatureCollection',
    features: pines.map((pin) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [pin.lng, pin.lat] },
      properties: { venueId: pin.venueId, cantidad: pin.eventos.length },
    })),
  }
}
