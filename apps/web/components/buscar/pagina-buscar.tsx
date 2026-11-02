import { BuscarContent } from "@/app/buscar/buscar-content"
import { getEvents, getCategories } from "@/lib/data"
import { getActiveFlyers } from "@/lib/instagram/data"
import { createClient } from "@/lib/supabase/server"
import { getUserFavorites } from "@/lib/actions/favorites"
import type { Idioma } from "@/lib/i18n/idiomas"

/**
 * La página de búsqueda entera (datos + contenido), compartida por `/buscar` y
 * `/en/buscar`. Antes vivía en el cuerpo de `app/buscar/page.tsx`; se movió acá
 * sin cambios. Cada página pone su metadata.
 */
export async function PaginaBuscar({ idioma }: { idioma: Idioma }) {
  const supabase = await createClient()

  const [events, categories, flyers, { data: cinemaMovies }, userFavorites, userResult] = await Promise.all([
    getEvents(),
    getCategories(),
    getActiveFlyers(),
    supabase
      .from('cinema_movies')
      .select('*')
      .eq('is_currently_showing', true)
      .order('title', { ascending: true }),
    getUserFavorites(),
    supabase.auth.getUser(),
  ])
  const serverNowISO = new Date().toISOString()

  return (
    <BuscarContent
      idioma={idioma}
      events={events}
      categories={categories}
      serverNowISO={serverNowISO}
      flyers={flyers}
      cinemaMovies={cinemaMovies || []}
      userFavorites={userFavorites}
      haySesion={!!userResult.data.user}
    />
  )
}
