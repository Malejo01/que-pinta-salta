// Favoritos de eventos, flyers de Instagram y películas (R27, tarea 27-b;
// paridad con la web, R29, tarea 29-a: F13). Con sesión: las tres columnas
// de `user_favorites` (`event_id`, `instagram_flyer_id`, `cinema_movie_id`)
// del usuario, y los detalles de cada una con el mismo select público que la
// web, pasados por `armarFavoritos` de `@qps/core/favoritos/armar` — la
// misma regla que usa `/favoritos` de la web (status, vigencia, agrupado),
// así que ni acá ni en la web se repite esa lógica. El `user_id` que recibe
// cada función es siempre el que la pantalla leyó de `useSession()`, nunca
// un parámetro de ruta. Marcar es un `insert` con `{ user_id, event_id }`;
// desmarcar es un `delete` filtrado por `user_id` y `event_id`; un `23505`
// (ya estaba marcado) cuenta como éxito, no como error.
import { PUBLIC_EVENT_SELECT } from '@qps/core/events/public-select'
import { applyVigenciaPrefilter } from '@qps/core/events/vigencia'
import { armarFavoritos, idsDeFavoritos, type EventoFavorito } from '@qps/core/favoritos/armar'
import type { DisplayEvent } from '@qps/core/home/types'
import type { CinemaMovie } from '@qps/core/types'
import type { FlyerWithAccount } from '@qps/core/instagram-config'
import { obtenerCategorias } from '@/lib/datos/eventos'
import { MENSAJE_SIN_CONFIGURACION } from '@/lib/mensajes'
import { supabase } from '@/lib/supabase'

export { MENSAJE_SIN_CONFIGURACION }
export const MENSAJE_ERROR_RED = 'No pudimos cargar tus favoritos. Revisá tu conexión.'
export const MENSAJE_ERROR_GUARDAR = 'No pudimos guardar el favorito. Probá de nuevo.'

export type ResultadoFavoritos = { ok: true; eventos: DisplayEvent[] } | { ok: false; error: string }
export type ResultadoFavorito = { ok: true; marcado: boolean } | { ok: false; error: string }
export type ResultadoMarcarFavorito = { ok: true } | { ok: false; error: string }

/** A dónde navega cada item de favoritos al tocarlo: evento, película (R28) o flyer de Instagram. */
export function rutaDeFavorito(item: DisplayEvent): string {
  if (item.isCinemaMovie) return `/pelicula/${item.id.replace(/^movie-/, '')}`
  if (item.isInstagramFlyer && item.flyerId) return `/flyer/${item.flyerId}`
  return `/evento/${item.id}`
}

/**
 * Los favoritos de `userId`: las tres columnas de `user_favorites`, y los
 * eventos (PUBLISHED + vigentes), flyers (ACTIVE) y películas (en cartel)
 * correspondientes, armados con `armarFavoritos` (flexibles primero,
 * después por día — el layout de la web, "Mi Agenda", es 29-i). Sin
 * favoritos de ningún tipo, `eventos: []` sin pedir nada más a la red.
 */
export async function obtenerFavoritos(userId: string): Promise<ResultadoFavoritos> {
  if (!supabase) return { ok: false, error: MENSAJE_SIN_CONFIGURACION }

  try {
    const { data: filas, error: errorFavoritos } = await supabase
      .from('user_favorites')
      .select('event_id, instagram_flyer_id, cinema_movie_id')
      .eq('user_id', userId)

    if (errorFavoritos) return { ok: false, error: MENSAJE_ERROR_RED }

    const { eventIds, flyerIds, movieIds } = idsDeFavoritos(filas ?? [])

    if (eventIds.length === 0 && flyerIds.length === 0 && movieIds.length === 0) {
      return { ok: true, eventos: [] }
    }

    const ahora = new Date()

    const [eventosRes, flyersRes, moviesRes, categoriasRes] = await Promise.all([
      eventIds.length > 0
        ? applyVigenciaPrefilter(
            supabase.from('events').select(PUBLIC_EVENT_SELECT).in('id', eventIds).eq('status', 'PUBLISHED'),
            ahora,
          )
        : Promise.resolve({ data: [] as unknown[], error: null }),
      flyerIds.length > 0
        ? supabase
            .from('instagram_flyers')
            .select('*, account:instagram_accounts(*)')
            .in('id', flyerIds)
            .eq('status', 'ACTIVE')
        : Promise.resolve({ data: [] as unknown[], error: null }),
      movieIds.length > 0
        ? supabase.from('cinema_movies').select('*').in('id', movieIds).eq('is_currently_showing', true)
        : Promise.resolve({ data: [] as unknown[], error: null }),
      obtenerCategorias(),
    ])

    if (eventosRes.error || flyersRes.error || moviesRes.error) return { ok: false, error: MENSAJE_ERROR_RED }
    // El texto es siempre el de esta pantalla (no el de `obtenerCategorias`,
    // pensado para Buscar): nunca se mezclan los mensajes de dos módulos.
    if (!categoriasRes.ok) return { ok: false, error: MENSAJE_ERROR_RED }

    const categoryNameBySlug = new Map(categoriasRes.categorias.map((c) => [c.slug, c.name]))

    // PUBLIC_EVENT_SELECT es un string armado en runtime (no un literal), así
    // que supabase-js no puede inferir con él el tipo de la fila: "as unknown
    // as" en vez de "as" (mismo patrón que lib/datos/eventos.ts).
    const eventos = (eventosRes.data ?? []) as unknown as EventoFavorito[]
    const flyers = (flyersRes.data ?? []) as unknown as FlyerWithAccount[]
    const peliculas = (moviesRes.data ?? []) as unknown as CinemaMovie[]

    const { flexibles, porDia } = armarFavoritos({ eventos, flyers, peliculas, categoryNameBySlug }, ahora)

    // La pantalla de Favoritos de la app (29-i la convierte al layout "Mi
    // Agenda" de la web) muestra por ahora una lista simple, en el orden de
    // armarFavoritos: flexibles primero, después por día.
    return { ok: true, eventos: [...flexibles, ...porDia.flatMap((grupo) => grupo.items)] }
  } catch {
    return { ok: false, error: MENSAJE_ERROR_RED }
  }
}

/** Si `eventId` está entre los favoritos de `userId` (para el botón de la ficha). */
export async function obtenerEsFavorito(eventId: string, userId: string): Promise<ResultadoFavorito> {
  if (!supabase) return { ok: false, error: MENSAJE_SIN_CONFIGURACION }

  try {
    const { data, error } = await supabase
      .from('user_favorites')
      .select('event_id')
      .eq('user_id', userId)
      .eq('event_id', eventId)
      .maybeSingle()

    if (error) return { ok: false, error: MENSAJE_ERROR_RED }

    return { ok: true, marcado: Boolean(data) }
  } catch {
    return { ok: false, error: MENSAJE_ERROR_RED }
  }
}

/**
 * Marca `eventId` como favorito de `userId`: `insert({ user_id, event_id })`.
 * Un `23505` (la unique de `user_favorites` por `user_id` + `event_id`: ya
 * estaba marcado) cuenta como éxito.
 */
export async function marcarFavorito(eventId: string, userId: string): Promise<ResultadoMarcarFavorito> {
  if (!supabase) return { ok: false, error: MENSAJE_SIN_CONFIGURACION }

  try {
    const { error } = await supabase.from('user_favorites').insert({ user_id: userId, event_id: eventId })
    if (error && error.code !== '23505') return { ok: false, error: MENSAJE_ERROR_GUARDAR }
    return { ok: true }
  } catch {
    return { ok: false, error: MENSAJE_ERROR_GUARDAR }
  }
}

/** Desmarca `eventId` de los favoritos de `userId`: `delete` filtrado por `user_id` y `event_id`. */
export async function desmarcarFavorito(eventId: string, userId: string): Promise<ResultadoMarcarFavorito> {
  if (!supabase) return { ok: false, error: MENSAJE_SIN_CONFIGURACION }

  try {
    const { error } = await supabase.from('user_favorites').delete().eq('user_id', userId).eq('event_id', eventId)
    if (error) return { ok: false, error: MENSAJE_ERROR_GUARDAR }
    return { ok: true }
  } catch {
    return { ok: false, error: MENSAJE_ERROR_GUARDAR }
  }
}
