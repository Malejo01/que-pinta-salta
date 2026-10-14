// Cartelera de cines (R25): mismas columnas y mismo filtro que la web
// (`apps/web/app/cines/page.tsx`), pero solo las que se muestran en la
// tarjeta de la app (id, slug, title, poster_url, showings): nada de
// `created_at`/`updated_at`/`is_currently_showing`, que no se usan acá.
import type { MovieShowings } from '@qps/core/types'
import { MENSAJE_SIN_CONFIGURACION } from '@/lib/mensajes'
import { supabase } from '@/lib/supabase'

export { MENSAJE_SIN_CONFIGURACION }
export const MENSAJE_ERROR_RED = 'No pudimos cargar la cartelera. Revisá tu conexión.'

export interface Pelicula {
  id: string
  slug: string
  title: string
  poster_url: string | null
  showings: MovieShowings
}

export type ResultadoCines = { ok: true; peliculas: Pelicula[] } | { ok: false; error: string }

/** Películas en cartelera hoy, ordenadas por título (igual que la web). */
export async function obtenerCines(): Promise<ResultadoCines> {
  if (!supabase) {
    return { ok: false, error: MENSAJE_SIN_CONFIGURACION }
  }

  try {
    const { data, error } = await supabase
      .from('cinema_movies')
      .select('id, slug, title, poster_url, showings')
      .eq('is_currently_showing', true)
      .order('title', { ascending: true })

    if (error) {
      return { ok: false, error: MENSAJE_ERROR_RED }
    }

    // `showings` es jsonb (Json en los tipos generados): se castea a la forma
    // concreta MovieShowings, igual que `CinemaMovie` en packages/core/src/types.ts.
    return { ok: true, peliculas: (data ?? []) as unknown as Pelicula[] }
  } catch {
    return { ok: false, error: MENSAJE_ERROR_RED }
  }
}

/**
 * Cantidad de cines donde se puede ver la película (claves de `showings`):
 * lo mismo que cuenta la web (`Object.keys(movie.showings).length` en
 * `lib/home/transform.ts` y `components/movie-card.tsx`).
 */
export function cantidadDeSalas(pelicula: Pelicula): number {
  return Object.keys(pelicula.showings ?? {}).length
}
