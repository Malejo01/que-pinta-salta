/**
 * Q5-1 · Importador de lugares para chicos desde OpenStreetMap (lógica pura).
 *
 * Decisión 2 de Mauro (docs/tanda-q5/README.md): para arrancar, un importador
 * desde OSM que deja los lugares como BORRADOR para que un admin los verifique.
 * Nada se publica sin verificación (la base lo exige con
 * `lugares_permanentes_publicado_check`).
 *
 * Reglas de uso de OSM (licencia ODbL y política de Overpass):
 *  - Solo desde el script `scripts/importar-lugares-chicos.ts`, a mano. Nunca
 *    desde el navegador ni en cada request (lo fija un detector).
 *  - UNA consulta a Overpass por corrida (todo Salta Capital en un pedido), con
 *    User-Agent propio, caché en disco y como mínimo 1 segundo entre pedidos.
 *  - Atribución «© colaboradores de OpenStreetMap» donde se muestren los datos
 *    (`ATRIBUCION_OSM` de @qps/core/lugares/permanentes).
 *
 * Nada de este archivo hace red ni toca la base: arma la consulta, interpreta
 * la respuesta y decide qué hacer con cada candidato.
 */
import { distanciaMetros, type TipoLugarPermanente } from '@qps/core/lugares/permanentes'

export const URL_OVERPASS = 'https://overpass-api.de/api/interpreter'
export const USER_AGENT_OVERPASS =
  'QuePintaSalta/1.0 (importador de lugares para chicos, corrida manual; +https://www.quepintasalta.com.ar)'
/** Política: como mínimo 1 segundo entre pedidos. */
export const INTERVALO_MIN_MS = 1000
/** Una corrida por semana alcanza: la caché dura 7 días. */
export const VIGENCIA_CACHE_MS = 7 * 24 * 60 * 60 * 1000

/** Salta Capital (aproximado, con un margen chico): sur, oeste, norte, este. */
export const BBOX_SALTA_CAPITAL = { sur: -24.88, oeste: -65.5, norte: -24.7, este: -65.33 } as const

const NOMBRE_INFANTIL = 'infantil|niñ|chic|kids|peque|pelotero|juegos'

/**
 * La consulta Overpass QL. Tipos que mapean a la propuesta:
 *  - leisure=playground                         → plaza_juegos
 *  - leisure=indoor_play                         → pelotero
 *  - amenity=events_venue con nombre infantil    → salon_juegos
 *  - museum / arts_centre / library / theatre con nombre infantil → espacio_cultural_infantil
 * Solo con `name` (sin nombre no hay cómo verificarlo ni cómo mostrarlo).
 */
export function consultaOverpass(bbox = BBOX_SALTA_CAPITAL): string {
  const b = `${bbox.sur},${bbox.oeste},${bbox.norte},${bbox.este}`
  return [
    '[out:json][timeout:60];',
    '(',
    `  nwr["leisure"="playground"]["name"](${b});`,
    `  nwr["leisure"="indoor_play"]["name"](${b});`,
    `  nwr["amenity"="events_venue"]["name"~"${NOMBRE_INFANTIL}",i](${b});`,
    `  nwr["tourism"="museum"]["name"~"${NOMBRE_INFANTIL}",i](${b});`,
    `  nwr["amenity"~"^(arts_centre|library|theatre)$"]["name"~"${NOMBRE_INFANTIL}",i](${b});`,
    ');',
    'out center tags;',
  ].join('\n')
}

export type ElementoOsm = {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

export type CandidatoOsm = {
  osmRef: string
  nombre: string
  direccion: string
  lat: number
  lng: number
  tipo: TipoLugarPermanente
}

export function tipoDesdeTags(tags: Record<string, string>): TipoLugarPermanente | null {
  if (tags.leisure === 'playground') return 'plaza_juegos'
  if (tags.leisure === 'indoor_play') return 'pelotero'
  if (tags.amenity === 'events_venue') return 'salon_juegos'
  if (tags.tourism === 'museum' || ['arts_centre', 'library', 'theatre'].includes(tags.amenity ?? '')) {
    return 'espacio_cultural_infantil'
  }
  return null
}

function enBbox(lat: number, lng: number, bbox = BBOX_SALTA_CAPITAL): boolean {
  return lat >= bbox.sur && lat <= bbox.norte && lng >= bbox.oeste && lng <= bbox.este
}

/** Interpreta la respuesta de Overpass. Descarta lo que no tiene nombre, tipo o coordenadas dentro de Capital. */
export function candidatosDesdeOverpass(respuesta: unknown): { candidatos: CandidatoOsm[]; descartados: number } {
  const elementos = (respuesta as { elements?: unknown } | null)?.elements
  if (!Array.isArray(elementos)) return { candidatos: [], descartados: 0 }
  const vistos = new Set<string>()
  const candidatos: CandidatoOsm[] = []
  let descartados = 0
  for (const crudo of elementos as ElementoOsm[]) {
    const tags = crudo?.tags ?? {}
    const nombre = (tags.name ?? '').trim().slice(0, 200)
    const lat = crudo.lat ?? crudo.center?.lat
    const lng = crudo.lon ?? crudo.center?.lon
    const tipo = tipoDesdeTags(tags)
    const osmRef = `${crudo.type}/${crudo.id}`
    if (
      !nombre ||
      !tipo ||
      typeof lat !== 'number' ||
      typeof lng !== 'number' ||
      !enBbox(lat, lng) ||
      !/^(node|way|relation)\/\d+$/.test(osmRef) ||
      vistos.has(osmRef)
    ) {
      descartados++
      continue
    }
    vistos.add(osmRef)
    const calle = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ').trim()
    candidatos.push({
      osmRef,
      nombre,
      direccion: calle ? `${calle}, Salta` : 'Salta Capital (dirección a confirmar)',
      lat,
      lng,
      tipo,
    })
  }
  return { candidatos, descartados }
}

/** Igual que `public.venue_normalize`: minúsculas, sin tildes, solo letras y números. */
export function normalizarNombre(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'plaza', 'plazoleta', 'salta', 'parque'])

/** Parecido de nombres por palabras (Dice), sin las palabras genéricas. 0 a 1. */
export function parecidoDeNombres(a: string, b: string): number {
  const pa = new Set(normalizarNombre(a).split(' ').filter((p) => p && !PALABRAS_VACIAS.has(p)))
  const pb = new Set(normalizarNombre(b).split(' ').filter((p) => p && !PALABRAS_VACIAS.has(p)))
  if (pa.size === 0 || pb.size === 0) return normalizarNombre(a) === normalizarNombre(b) ? 1 : 0
  let comunes = 0
  for (const p of pa) if (pb.has(p)) comunes++
  return (2 * comunes) / (pa.size + pb.size)
}

export type VenueExistente = {
  id: string
  name: string
  latitude: number | null
  longitude: number | null
  tieneFicha: boolean
}

export type DecisionImportacion =
  | { accion: 'ya_importado'; candidato: CandidatoOsm }
  | { accion: 'ya_tiene_ficha'; candidato: CandidatoOsm; venueId: string; venueNombre: string }
  | { accion: 'usar_venue'; candidato: CandidatoOsm; venueId: string; venueNombre: string; metros: number | null }
  | { accion: 'crear_venue'; candidato: CandidatoOsm }

/** Cerca y con nombre parecido = el mismo lugar. */
export const RADIO_MISMO_LUGAR_M = 150
export const PARECIDO_MINIMO = 0.5

/**
 * Deduplica un candidato contra lo que ya hay: primero por `osm_ref` (ya se
 * importó), después contra los venues canónicos por proximidad y nombre
 * (≤ 150 m y parecido ≥ 0,5), o por el mismo nombre normalizado (el índice
 * único `venues_canonical_norm_key` rechazaría el alta igual).
 */
export function decidirCandidato(
  candidato: CandidatoOsm,
  venues: VenueExistente[],
  osmRefsExistentes: Set<string>,
): DecisionImportacion {
  if (osmRefsExistentes.has(candidato.osmRef)) return { accion: 'ya_importado', candidato }
  const norm = normalizarNombre(candidato.nombre)
  let mejor: { v: VenueExistente; metros: number | null; puntaje: number } | null = null
  for (const v of venues) {
    const mismoNombre = normalizarNombre(v.name) === norm
    const metros =
      v.latitude !== null && v.longitude !== null
        ? distanciaMetros({ lat: candidato.lat, lng: candidato.lng }, { lat: Number(v.latitude), lng: Number(v.longitude) })
        : null
    const parecido = parecidoDeNombres(candidato.nombre, v.name)
    const cercaYParecido = metros !== null && metros <= RADIO_MISMO_LUGAR_M && parecido >= PARECIDO_MINIMO
    if (!mismoNombre && !cercaYParecido) continue
    const puntaje = (mismoNombre ? 1 : 0) + parecido + (metros !== null ? 1 - Math.min(metros, 1000) / 1000 : 0)
    if (!mejor || puntaje > mejor.puntaje) mejor = { v, metros, puntaje }
  }
  if (!mejor) return { accion: 'crear_venue', candidato }
  if (mejor.v.tieneFicha) return { accion: 'ya_tiene_ficha', candidato, venueId: mejor.v.id, venueNombre: mejor.v.name }
  return { accion: 'usar_venue', candidato, venueId: mejor.v.id, venueNombre: mejor.v.name, metros: mejor.metros === null ? null : Math.round(mejor.metros) }
}

/** Decide todos, sin crear dos venues para el mismo nombre dentro de la misma corrida. */
export function planDeImportacion(
  candidatos: CandidatoOsm[],
  venues: VenueExistente[],
  osmRefsExistentes: Set<string>,
): DecisionImportacion[] {
  const nombresNuevos = new Set<string>()
  const venuesUsados = new Set<string>()
  const plan: DecisionImportacion[] = []
  for (const c of candidatos) {
    const d = decidirCandidato(c, venues, osmRefsExistentes)
    if (d.accion === 'crear_venue') {
      const n = normalizarNombre(c.nombre)
      if (nombresNuevos.has(n)) continue // dos objetos OSM con el mismo nombre: queda el primero
      nombresNuevos.add(n)
    }
    if (d.accion === 'usar_venue') {
      if (venuesUsados.has(d.venueId)) continue
      venuesUsados.add(d.venueId)
    }
    plan.push(d)
  }
  return plan
}

export function urlOsm(osmRef: string): string {
  return `https://www.openstreetmap.org/${osmRef}`
}

export function resumenDelPlan(plan: DecisionImportacion[]): Record<DecisionImportacion['accion'], number> {
  const r = { ya_importado: 0, ya_tiene_ficha: 0, usar_venue: 0, crear_venue: 0 }
  for (const d of plan) r[d.accion]++
  return r
}
