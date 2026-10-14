// Favoritos de eventos (R27, tarea 27-b). Con sesión: `user_favorites`
// (columna `event_id`) del usuario, y los eventos por esos ids con el mismo
// select público y la misma vigencia que el resto de la app
// (`PUBLIC_EVENT_SELECT`, `status = 'PUBLISHED'`, `isVigente` de
// `@qps/core`). El `user_id` que recibe cada función es siempre el que la
// pantalla leyó de `useSession()`, nunca un parámetro de ruta. Marcar es un
// `insert` con `{ user_id, event_id }`; desmarcar es un `delete` filtrado
// por `user_id` y `event_id`; un `23505` (ya estaba marcado) cuenta como
// éxito, no como error.
import { PUBLIC_EVENT_SELECT } from '@qps/core/events/public-select'
import { isVigente } from '@qps/core/events/vigencia'
import { transformEvent } from '@qps/core/home/transform'
import type { DisplayEvent, EventWithRelations } from '@qps/core/home/types'
import { MENSAJE_SIN_CONFIGURACION } from '@/lib/mensajes'
import { supabase } from '@/lib/supabase'

export { MENSAJE_SIN_CONFIGURACION }
export const MENSAJE_ERROR_RED = 'No pudimos cargar tus favoritos. Revisá tu conexión.'
export const MENSAJE_ERROR_GUARDAR = 'No pudimos guardar el favorito. Probá de nuevo.'

export type ResultadoFavoritos = { ok: true; eventos: DisplayEvent[] } | { ok: false; error: string }
export type ResultadoFavorito = { ok: true; marcado: boolean } | { ok: false; error: string }
export type ResultadoMarcarFavorito = { ok: true } | { ok: false; error: string }

/**
 * Los eventos favoritos de `userId`: primero los `event_id` propios de
 * `user_favorites`, después esos eventos con el select público, acotados a
 * `status = 'PUBLISHED'` y vigentes (`isVigente`, con categoría — mismo
 * filtro que `obtenerEventosDeAtajo`). Sin favoritos, `eventos: []` sin
 * pedir nada más a la red.
 */
export async function obtenerFavoritos(userId: string): Promise<ResultadoFavoritos> {
  if (!supabase) return { ok: false, error: MENSAJE_SIN_CONFIGURACION }

  try {
    const { data: filas, error: errorFavoritos } = await supabase
      .from('user_favorites')
      .select('event_id')
      .eq('user_id', userId)
      .not('event_id', 'is', null)

    if (errorFavoritos) return { ok: false, error: MENSAJE_ERROR_RED }

    const ids = (filas ?? [])
      .map((fila) => fila.event_id)
      .filter((id): id is string => typeof id === 'string')

    if (ids.length === 0) return { ok: true, eventos: [] }

    const { data, error } = await supabase
      .from('events')
      .select(PUBLIC_EVENT_SELECT)
      .in('id', ids)
      .eq('status', 'PUBLISHED')

    if (error) return { ok: false, error: MENSAJE_ERROR_RED }

    // PUBLIC_EVENT_SELECT es un string armado en runtime (no un literal), así
    // que supabase-js no puede inferir con él el tipo de la fila: "as unknown
    // as" en vez de "as" (mismo patrón que lib/datos/eventos.ts).
    const filasEventos = (data ?? []) as unknown as EventWithRelations[]
    const vigentes = filasEventos.filter((fila) => Boolean(fila.category) && isVigente(fila, new Date()))

    return { ok: true, eventos: vigentes.map(transformEvent) }
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
