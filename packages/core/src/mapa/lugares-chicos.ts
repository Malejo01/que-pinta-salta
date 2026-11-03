/**
 * Q5-2 · La capa «Lugares para chicos» de /mapa (propuesta §4): lo que dibuja
 * el mapa y la lista a partir de las filas publicadas de
 * `lugares_permanentes` con su venue. Puro: sin React, Next ni Supabase.
 *
 * Misma regla que `pines.ts`: el GeoJSON lleva SOLO ids (`venueId`, `tipo`),
 * nada de texto ajeno; nombre, horarios y contacto los dibuja la lista en
 * React. Las coordenadas pasan por `aCoordenada` y `coordenadasEnSalta`.
 */
import { aCoordenada } from './pines'
import { coordenadasEnSalta } from './zona'
import {
  TIPOS_LUGAR,
  distanciaMetros,
  esAccesoLugar,
  esTipoLugar,
  horariosSeguros,
  type AccesoLugar,
  type HorariosLugar,
  type TechadoLugar,
  type TipoLugarPermanente,
} from '../lugares/permanentes'

/** Lo que necesita la capa de un lugar (sin `cargado_por` / `verificado_por`). */
export interface LugarChicosMapa {
  id: string
  venueId: string
  nombre: string
  direccion: string
  slug: string | null
  lat: number
  lng: number
  tipo: TipoLugarPermanente
  descripcion: string | null
  edadMin: number | null
  edadMax: number | null
  horarios: HorariosLugar
  acceso: AccesoLugar
  notaPrecio: string | null
  techado: TechadoLugar | null
  tieneRampa: boolean | null
  tieneBanoAdaptado: boolean | null
  tieneCambiador: boolean | null
  telefono: string | null
  web: string | null
  instagram: string | null
  verificadoAt: string | null
  /** Vino de OpenStreetMap: se muestra la atribución ODbL. */
  deOsm: boolean
}

/** La fila como llega de PostgREST (`venue` embebido puede venir como objeto o lista). */
export interface FilaLugarChicos {
  id: string
  venue_id: string
  tipo: string
  estado: string
  descripcion_corta: string | null
  edad_min: number | null
  edad_max: number | null
  horarios: unknown
  acceso: string
  nota_precio: string | null
  techado: string | null
  tiene_rampa: boolean | null
  tiene_bano_adaptado: boolean | null
  tiene_cambiador: boolean | null
  contacto_telefono: string | null
  contacto_web: string | null
  contacto_instagram: string | null
  osm_ref: string | null
  verificado_at: string | null
  venue:
    | { name: string; address: string; slug?: string | null; latitude: unknown; longitude: unknown; canonical_venue_id?: string | null }
    | { name: string; address: string; slug?: string | null; latitude: unknown; longitude: unknown; canonical_venue_id?: string | null }[]
    | null
}

const TECHADOS = new Set(['techado', 'aire_libre', 'mixto'])

/** Solo `https?://` (la base ya lo exige; se vuelve a mirar porque va a un `href`). */
function urlSegura(valor: string | null): string | null {
  if (!valor) return null
  return /^https?:\/\//i.test(valor) ? valor : null
}

/**
 * Las filas publicadas → lugares de la capa: descarta lo que no está
 * publicado, no tiene ubicación dentro de Salta o tiene un tipo desconocido.
 * Con `soloGratis`, solo `acceso = 'gratis'` (§4.2). Orden por tipo y nombre.
 */
export function armarLugaresChicos(filas: readonly FilaLugarChicos[], opciones: { soloGratis?: boolean } = {}): LugarChicosMapa[] {
  const lugares: LugarChicosMapa[] = []
  const vistos = new Set<string>()
  for (const fila of filas) {
    if (fila.estado !== 'publicado' || !esTipoLugar(fila.tipo) || !esAccesoLugar(fila.acceso)) continue
    if (opciones.soloGratis && fila.acceso !== 'gratis') continue
    const venue = Array.isArray(fila.venue) ? fila.venue[0] : fila.venue
    if (!venue || venue.canonical_venue_id) continue
    const lat = aCoordenada(venue.latitude)
    const lng = aCoordenada(venue.longitude)
    if (lat === null || lng === null || !coordenadasEnSalta(lat, lng)) continue
    if (vistos.has(fila.venue_id)) continue
    vistos.add(fila.venue_id)
    lugares.push({
      id: fila.id,
      venueId: fila.venue_id,
      nombre: venue.name,
      direccion: venue.address,
      slug: venue.slug ?? null,
      lat,
      lng,
      tipo: fila.tipo,
      descripcion: fila.descripcion_corta,
      edadMin: fila.edad_min,
      edadMax: fila.edad_max,
      horarios: horariosSeguros(fila.horarios),
      acceso: fila.acceso,
      notaPrecio: fila.nota_precio,
      techado: fila.techado && TECHADOS.has(fila.techado) ? (fila.techado as TechadoLugar) : null,
      tieneRampa: fila.tiene_rampa,
      tieneBanoAdaptado: fila.tiene_bano_adaptado,
      tieneCambiador: fila.tiene_cambiador,
      telefono: fila.contacto_telefono,
      web: urlSegura(fila.contacto_web),
      instagram: urlSegura(fila.contacto_instagram),
      verificadoAt: fila.verificado_at,
      deOsm: fila.osm_ref !== null,
    })
  }
  return lugares.sort(
    (a, b) => TIPOS_LUGAR.indexOf(a.tipo) - TIPOS_LUGAR.indexOf(b.tipo) || a.nombre.localeCompare(b.nombre, 'es'),
  )
}

export interface ColeccionLugaresChicos {
  type: 'FeatureCollection'
  features: {
    type: 'Feature'
    geometry: { type: 'Point'; coordinates: [number, number] }
    properties: { venueId: string; tipo: TipoLugarPermanente }
  }[]
}

/** GeoJSON de la capa: solo `venueId` y `tipo` (un valor de un CHECK, no texto ajeno). */
export function lugaresChicosAGeoJson(lugares: readonly LugarChicosMapa[]): ColeccionLugaresChicos {
  return {
    type: 'FeatureCollection',
    features: lugares.map((l) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [l.lng, l.lat] },
      properties: { venueId: l.venueId, tipo: l.tipo },
    })),
  }
}

/** Con un origen (posición o barrio), ordena por distancia en línea recta. Sin origen, deja el orden. */
export function ordenarPorDistancia<T extends { lat: number; lng: number }>(
  lugares: readonly T[],
  origen: { lat: number; lng: number } | null,
): (T & { metros: number | null })[] {
  if (!origen) return lugares.map((l) => ({ ...l, metros: null }))
  return lugares
    .map((l) => ({ ...l, metros: distanciaMetros(origen, l) }))
    .sort((a, b) => a.metros - b.metros)
}

/** Id del bloque en la lista: otro prefijo que el de los lugares con eventos (`lugar-`). */
export function idBloqueLugarChicos(venueId: string): string {
  return `chicos-${venueId}`
}
