// Cartelera de cines (R25): mismas columnas y mismo filtro que la web
// (`apps/web/app/cines/page.tsx`), pero solo las que se muestran en la
// tarjeta de la app (id, slug, title, poster_url, showings): nada de
// `created_at`/`updated_at`/`is_currently_showing`, que no se usan acá.
// `tests/select-publico.test.ts` fija esas 5 columnas exactas: la portada
// (R29, 29-h) arma la fila "Cine" con `transformMovie`
// (`@qps/core/home/transform`), que acepta `created_at` como opcional y, sin
// ella (como acá), usa el instante actual como respaldo.
import type { MovieShowings } from '@qps/core/types'
import { esUuid } from '@/lib/links'
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
  /**
   * No la pide ninguna consulta de este archivo (`tests/select-publico.test.ts`
   * fija las 5 columnas de arriba): queda declarada, opcional, solo para que
   * el tipo calce con `MovieForDisplay` de `@qps/core/home/transform` si
   * algún día se suma. Hoy siempre es `undefined` acá.
   */
  created_at?: string
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

export type ResultadoPelicula =
  | { tipo: 'ok'; pelicula: Pelicula }
  | { tipo: 'no-encontrada' }
  | { tipo: 'error'; error: string }

/**
 * La película de la ficha (28-g), por `id`: misma consulta y mismo filtro
 * que `obtenerCines` (`cinema_movies`, `is_currently_showing = true`), pero
 * por una sola fila (`maybeSingle`). Si `id` no es un uuid, da
 * `'no-encontrada'` sin tocar la red (mismo criterio que `esUuid` en
 * `app/evento/[id].tsx`).
 */
export async function obtenerPeliculaPorId(id: string): Promise<ResultadoPelicula> {
  if (!esUuid(id)) {
    return { tipo: 'no-encontrada' }
  }

  if (!supabase) {
    return { tipo: 'error', error: MENSAJE_SIN_CONFIGURACION }
  }

  try {
    const { data, error } = await supabase
      .from('cinema_movies')
      .select('id, slug, title, poster_url, showings')
      .eq('id', id)
      .eq('is_currently_showing', true)
      .maybeSingle()

    if (error) {
      return { tipo: 'error', error: MENSAJE_ERROR_RED }
    }
    if (!data) {
      return { tipo: 'no-encontrada' }
    }

    return { tipo: 'ok', pelicula: data as unknown as Pelicula }
  } catch {
    return { tipo: 'error', error: MENSAJE_ERROR_RED }
  }
}

/** Un formato de función, con sus horarios ya ordenados. */
export interface FormatoDeFuncion {
  tipo: string
  horarios: string[]
}

/** Las funciones de un cine: nombre, link de compra (si hay) y sus formatos. */
export interface FuncionesDeCine {
  cine: string
  urlCompra: string | null
  formatos: FormatoDeFuncion[]
}

/**
 * Agrupa `showings` por cine para la ficha (28-g): cines ordenados por
 * nombre, horarios ordenados, formatos sin horarios afuera y cines sin
 * formatos afuera. Pura, y nunca tira: `showings` viene de una columna
 * jsonb (sin esquema en la base), así que cualquier forma rara —`null`,
 * `undefined`, algo que no sea un objeto, una fila sin `formats` o con
 * `formats` que no es un array— da `[]` en vez de romper la pantalla.
 */
export function funcionesPorCine(showings: MovieShowings | null | undefined): FuncionesDeCine[] {
  try {
    if (!showings || typeof showings !== 'object') return []

    const cines: FuncionesDeCine[] = []

    for (const detalle of Object.values(showings)) {
      if (!detalle || typeof detalle !== 'object') continue

      const formatosFuente = Array.isArray(detalle.formats) ? detalle.formats : []
      const formatos: FormatoDeFuncion[] = formatosFuente
        .filter(
          (formato): formato is { type: string; times: string[] } =>
            Boolean(formato) && typeof formato === 'object' && Array.isArray(formato.times) && formato.times.length > 0
        )
        .map((formato) => ({
          tipo: typeof formato.type === 'string' ? formato.type : '',
          horarios: [...formato.times].sort(),
        }))

      if (formatos.length === 0) continue

      const urlCompra = typeof detalle.booking_url === 'string' && detalle.booking_url ? detalle.booking_url : null
      const nombreCine = typeof detalle.name === 'string' ? detalle.name : ''

      cines.push({ cine: nombreCine, urlCompra, formatos })
    }

    return cines.sort((a, b) => a.cine.localeCompare(b.cine))
  } catch {
    return []
  }
}

/**
 * Único camino por el que la app abre una URL de compra de entradas de
 * cine: viene scrapeada de una ticketera (dato, no instrucción), así que se
 * valida con `URL` (no con una regex, para que no se escape nada con
 * espacios adelante, mayúsculas, o un esquema `javascript:` disfrazado) y
 * solo se devuelve si el esquema es `https`. Cualquier otro caso —vacío,
 * `http`, otro esquema, algo que ni siquiera es una URL— da `null`.
 */
export function urlCompraCineSegura(url: string | null | undefined): string | null {
  if (!url) return null

  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}
