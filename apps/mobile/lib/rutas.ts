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

/**
 * Qué se guarda en `user_favorites` (R69, 69-a, QPS-353): el tipo decide la
 * columna (`event` → `event_id`, `cinema` → `cinema_movie_id`, `flyer` →
 * `instagram_flyer_id`, igual que `toggleFavorite` de la web) y el `id` es
 * SIEMPRE el uuid pelado, nunca `movie-…`/`ig-…`.
 */
export type TipoFavorito = 'event' | 'cinema' | 'flyer'
export interface ObjetivoFavorito {
  tipo: TipoFavorito
  id: string
}

/**
 * El objetivo del corazón de un item de la portada, Buscar o Favoritos (R69,
 * 69-a). Misma derivación del id que `rutaDeEvento`. Para película y flyer, si
 * lo que queda tras sacar el prefijo no es un uuid devuelve `null` (sin
 * corazón): a la base nunca va un id raro. Para un evento, el id tal cual.
 */
export function objetivoDeFavorito(
  item: Pick<DisplayEvent, 'id' | 'isCinemaMovie' | 'isInstagramFlyer' | 'flyerId'>,
): ObjetivoFavorito | null {
  if (item.isCinemaMovie) {
    const id = item.id.replace(/^movie-/, '')
    return esUuid(id) ? { tipo: 'cinema', id } : null
  }
  if (item.isInstagramFlyer) {
    const id = item.flyerId || item.id.replace(/^ig-/, '')
    return esUuid(id) ? { tipo: 'flyer', id } : null
  }
  return { tipo: 'event', id: item.id }
}

/** `true` solo si no es película ni flyer: compartir es de eventos reales (el corazón va para los tres tipos, ver `objetivoDeFavorito`). */
export function esEventoReal(item: Pick<DisplayEvent, 'isCinemaMovie' | 'isInstagramFlyer'>): boolean {
  return !item.isCinemaMovie && !item.isInstagramFlyer
}
