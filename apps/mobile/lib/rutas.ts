// A dónde lleva cada item de la portada, Buscar y Favoritos (R67, 67-a: F6 de
// la beta). Antes `TarjetaEvento` siempre iba a `/evento/<id>`, y para una
// película (`movie-<uuid>`) o un flyer (`ig-<id>`) la ficha de evento
// redirigía a Inicio. La regla vive acá, pura (sin React ni expo-router),
// para que la usen la tarjeta, el Hero y la defensa de la ficha.
import type { DisplayEvent } from '@qps/core/home/types'
import { esUuid } from '@/lib/links'

/** Ruta de la ficha de un item: película (R28), flyer de Instagram o evento. */
export function rutaDeEvento(item: Pick<DisplayEvent, 'id' | 'isCinemaMovie' | 'isInstagramFlyer' | 'flyerId'>): string {
  if (item.isCinemaMovie) return `/pelicula/${item.id.replace(/^movie-/, '')}`
  if (item.isInstagramFlyer) return `/flyer/${item.flyerId || item.id.replace(/^ig-/, '')}`
  return `/evento/${item.id}`
}

/**
 * Defensa de la ficha de evento: si llega un id con prefijo de película o de
 * flyer seguido de un uuid, la ruta correcta; para cualquier otra cosa,
 * `null`. El id puede venir de un deep link: detrás del prefijo solo se
 * acepta un uuid (`esUuid`, lo mismo que exigen las dos fichas), nunca un
 * pedazo de ruta.
 */
export function rutaPorPrefijo(id: string): string | null {
  if (id.startsWith('movie-') && esUuid(id.slice('movie-'.length))) return `/pelicula/${id.slice('movie-'.length)}`
  if (id.startsWith('ig-') && esUuid(id.slice('ig-'.length))) return `/flyer/${id.slice('ig-'.length)}`
  return null
}

/** `true` solo si no es película ni flyer: favorito y compartir son de eventos reales. */
export function esEventoReal(item: Pick<DisplayEvent, 'isCinemaMovie' | 'isInstagramFlyer'>): boolean {
  return !item.isCinemaMovie && !item.isInstagramFlyer
}
