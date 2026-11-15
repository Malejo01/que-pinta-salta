/**
 * Q7-2: qué hace una corrida de geocodificación, antes de pedir nada.
 *
 *   1. Links de Google Maps: a cada lugar sin coordenadas se le buscan links
 *      de Maps en sus eventos (`./enlaces-maps`). Si dan un pin seguro
 *      (confianza alta), el lugar queda con esa sugerencia para confirmar en
 *      /admin/lugares y NO se le pide nada a Nominatim. No depende del
 *      intento anterior: no cuesta ningún pedido.
 *   2. Nominatim: el resto, con la regla de cada modo (la programada no
 *      repite un lugar intentado hace menos de 30 días ni uno con sugerencia
 *      pendiente), primero los que tienen eventos próximos publicados (de más
 *      a menos) y recortados al tope.
 *
 * Con `prioridadEventos` (o `todos`) entran también los lugares sin eventos
 * próximos, después de los que tienen. Sin eso, solo los que tienen.
 *
 * Puro: sin red, sin base. No importa `./nominatim` (lista cerrada de
 * `tests/venues/geocodificacion/no-programado.test.ts`).
 */

import { consultasParaLugar, describirConsulta } from './consultas'
import {
  cuantosCortos,
  esSugerenciaDeEnlace,
  propuestaPorEnlaces,
  type LecturaEnlaceMaps,
  type PropuestaPorEnlaces,
} from './enlaces-maps'
import { localidadDelLugar } from './localidades'
import { lugaresAGeocodificar, ordenarPorEventosProximos, type VenueParaGeocodificar } from './plan'
import { sinIntentoReciente } from './programado'

export interface OpcionesDelPlan {
  programado: boolean
  prioridadEventos: boolean
  todos: boolean
  rehacerNominatim: boolean
  limite: number
}

/** Un lugar que se resuelve (como sugerencia) por los links de sus eventos. */
export interface LugarPorEnlace {
  lugar: VenueParaGeocodificar
  propuesta: Extract<PropuestaPorEnlaces, { confianza: 'alta' }>
}

/** Por qué un lugar elegible no entra a Nominatim en esta corrida. */
export type MotivoAfuera = 'intento-reciente' | 'sugerencia-pendiente' | 'sin-eventos' | 'tope'

export interface PlanDeCorrida {
  elegibles: VenueParaGeocodificar[]
  /** Con coordenadas pero sin `geocode_source`: solo van al reporte. */
  paraRevisarPrevios: VenueParaGeocodificar[]
  /** Se resuelven por link (sugerencia de confianza alta), sin pedir nada a Nominatim. */
  porEnlace: LugarPorEnlace[]
  /** Los links que no alcanzan para una propuesta segura: solo van al reporte. */
  enlacesParaRevisar: Map<string, Extract<PropuestaPorEnlaces, { confianza: 'revisar' }>>
  /** Links cortos (`maps.app.goo.gl`) por lugar: no se resuelven (sería pedirle a Google). */
  enlacesCortos: Map<string, number>
  /** Los que se le piden a Nominatim, en orden y ya recortados al tope. */
  aNominatim: VenueParaGeocodificar[]
  /** Cuántos elegibles quedan afuera de Nominatim y por qué. */
  afuera: Record<MotivoAfuera, number>
}

/**
 * Arma el plan. `lecturasPorLugar` son las lecturas de Maps de los eventos de
 * cada lugar canónico (las arma el script con `lecturasDeEvento`).
 */
export function planDeCorrida({
  venues,
  conteoEventos,
  lecturasPorLugar,
  opciones,
  ahora,
}: {
  venues: VenueParaGeocodificar[]
  conteoEventos: Map<string, number>
  lecturasPorLugar: Map<string, LecturaEnlaceMaps[]>
  opciones: OpcionesDelPlan
  ahora: Date
}): PlanDeCorrida {
  const { elegibles, paraRevisarPrevios } = lugaresAGeocodificar(venues, { rehacerNominatim: opciones.rehacerNominatim })
  const afuera: Record<MotivoAfuera, number> = { 'intento-reciente': 0, 'sugerencia-pendiente': 0, 'sin-eventos': 0, tope: 0 }

  const conEventos = (v: VenueParaGeocodificar) => (conteoEventos.get(v.id) ?? 0) > 0
  const incluyeSinEventos = opciones.todos || opciones.prioridadEventos || opciones.programado
  const universo = incluyeSinEventos ? elegibles : elegibles.filter(conEventos)
  afuera['sin-eventos'] = elegibles.length - universo.length

  // 1. Links de Maps: solo lugares sin coordenadas y sin una sugerencia por link ya pendiente.
  const porEnlace: LugarPorEnlace[] = []
  const enlacesParaRevisar = new Map<string, Extract<PropuestaPorEnlaces, { confianza: 'revisar' }>>()
  const enlacesCortos = new Map<string, number>()
  for (const lugar of universo) {
    if (lugar.latitude !== null) continue
    const lecturas = lecturasPorLugar.get(lugar.id) ?? []
    if (lecturas.length === 0) continue
    const cortos = cuantosCortos(lecturas)
    if (cortos > 0) enlacesCortos.set(lugar.id, cortos)
    if (esSugerenciaDeEnlace(lugar.geocode_sugerencia_texto)) continue
    const zona = localidadDelLugar({ nombre: lugar.name, direccion: lugar.address }).zona
    const propuesta = propuestaPorEnlaces(lecturas, zona)
    if (propuesta?.confianza === 'alta') porEnlace.push({ lugar, propuesta })
    else if (propuesta) enlacesParaRevisar.set(lugar.id, propuesta)
  }
  const resueltos = new Set(porEnlace.map((p) => p.lugar.id))

  // 2. Nominatim: el resto, con las reglas del modo.
  let candidatos = universo.filter((v) => !resueltos.has(v.id) && !esSugerenciaDeEnlace(v.geocode_sugerencia_texto))
  if (opciones.programado) {
    const permitidos = new Set(sinIntentoReciente(candidatos, ahora).map((v) => v.id))
    for (const v of candidatos) {
      if (permitidos.has(v.id)) continue
      if (v.geocode_sugerencia_lat !== null && v.geocode_sugerencia_lat !== undefined) afuera['sugerencia-pendiente']++
      else afuera['intento-reciente']++
    }
    candidatos = candidatos.filter((v) => permitidos.has(v.id))
  }
  const ordenados = ordenarPorEventosProximos(candidatos, conteoEventos)
  const aNominatim = ordenados.slice(0, opciones.limite)
  afuera.tope = ordenados.length - aNominatim.length

  return {
    elegibles,
    paraRevisarPrevios,
    porEnlace: [...porEnlace].sort(
      (a, b) =>
        (conteoEventos.get(b.lugar.id) ?? 0) - (conteoEventos.get(a.lugar.id) ?? 0) ||
        a.lugar.name.localeCompare(b.lugar.name, 'es')
    ),
    enlacesParaRevisar,
    enlacesCortos,
    aNominatim,
    afuera,
  }
}

/** Una línea del listado en seco (`--seco`): qué haría la corrida con un lugar. */
export interface LineaEnSeco {
  orden: number
  nombre: string
  eventos: number
  accion: string
  detalle: string
}

/**
 * El listado de `--seco`: primero los que se resuelven por link, después los
 * que irían a Nominatim (con sus consultas, en orden). No pide nada.
 */
export function listadoEnSeco(plan: PlanDeCorrida, conteoEventos: Map<string, number>): LineaEnSeco[] {
  const lineas: LineaEnSeco[] = []
  let orden = 1
  for (const { lugar, propuesta } of plan.porEnlace) {
    lineas.push({
      orden: orden++,
      nombre: lugar.name,
      eventos: conteoEventos.get(lugar.id) ?? 0,
      accion: 'sugerencia por link de Maps (alta)',
      detalle: `${propuesta.lat}, ${propuesta.lng} · ${propuesta.links} link(s)`,
    })
  }
  for (const lugar of plan.aNominatim) {
    const consultas = consultasParaLugar({ nombre: lugar.name, direccion: lugar.address })
    const revisar = plan.enlacesParaRevisar.get(lugar.id)
    lineas.push({
      orden: orden++,
      nombre: lugar.name,
      eventos: conteoEventos.get(lugar.id) ?? 0,
      accion: `Nominatim (hasta ${consultas.length} consultas)`,
      detalle:
        consultas.map(describirConsulta).join(' → ') + (revisar ? ` · link para revisar: ${revisar.motivo}` : ''),
    })
  }
  return lineas
}

/** Cuántos pedidos a Nominatim puede hacer el plan, como mucho (sin reintentos). */
export function pedidosMaximos(plan: PlanDeCorrida): number {
  return plan.aNominatim.reduce((total, lugar) => total + consultasParaLugar({ nombre: lugar.name, direccion: lugar.address }).length, 0)
}
