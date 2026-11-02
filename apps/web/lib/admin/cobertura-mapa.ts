/**
 * Cuántos eventos próximos puede dibujar el mapa, para el encabezado de
 * /admin/lugares. Puro: sin Next ni Supabase. Usa el MISMO criterio que el mapa
 * (`ubicacionDelEvento`): coordenadas del lugar propio del evento que caen en
 * Salta; PostgREST puede devolver un `numeric` como texto.
 */
import { ubicacionDelEvento, type EventoParaMapa, type VenueParaMapa } from '@qps/core/mapa/pines'

/** Lo mínimo de un evento para contarlo: el lugar propio, con sus coordenadas. */
export interface EventoParaCobertura {
  venue?: VenueParaMapa | null
}

export interface CoberturaMapa {
  /** Eventos que el mapa puede dibujar. */
  conUbicacion: number
  /** Todos los eventos considerados. */
  total: number
  /** Entero redondeado, o `null` si no hay eventos (no se divide por cero). */
  porcentaje: number | null
}

export function coberturaDelMapa(eventos: EventoParaCobertura[]): CoberturaMapa {
  const total = eventos.length
  // `ubicacionDelEvento` solo lee `venue`; el resto de EventoParaMapa no importa acá.
  const conUbicacion = eventos.filter((evento) => ubicacionDelEvento(evento as EventoParaMapa) !== null).length
  return {
    conUbicacion,
    total,
    porcentaje: total === 0 ? null : Math.round((conUbicacion / total) * 100),
  }
}

/** «N de M eventos próximos con ubicación (X %)», o «Sin eventos próximos» si M = 0. */
export function textoCoberturaMapa(cobertura: CoberturaMapa): string {
  if (cobertura.total === 0 || cobertura.porcentaje === null) return 'Sin eventos próximos'
  return `${cobertura.conUbicacion} de ${cobertura.total} eventos próximos con ubicación (${cobertura.porcentaje} %)`
}
