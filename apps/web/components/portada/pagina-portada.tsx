import { getEvents, getCategories } from "@/lib/data"
import { getActiveFlyers } from "@/lib/instagram/data"
import { HomeContent } from "@/components/home-content"
import { createClient } from "@/lib/supabase/server"
import { getUserFavorites } from "@/lib/actions/favorites"
import type { Idioma } from "@/lib/i18n/idiomas"

/**
 * La portada entera (datos + contenido), compartida por `/` y `/en` (Q3).
 * Antes vivía en el cuerpo de `app/page.tsx`; se movió acá sin cambios para
 * que la versión en inglés no la duplique. Cada página pone su metadata.
 */
export async function PaginaPortada({ idioma }: { idioma: Idioma }) {
  const supabase = await createClient()

  const [events, categories, flyers, { data: cinemaMovies }, userFavorites] = await Promise.all([
    getEvents({ includeStartedToday: true }),
    getCategories(),
    getActiveFlyers(),
    supabase
      .from('cinema_movies')
      .select('*')
      .eq('is_currently_showing', true)
      .order('title', { ascending: true }),
    getUserFavorites()
  ])
  const serverNowISO = new Date().toISOString()

  return (
    <HomeContent 
      idioma={idioma}
      events={events} 
      categories={categories}
      serverNowISO={serverNowISO}
      flyers={flyers}
      cinemaMovies={cinemaMovies || []}
      userFavorites={userFavorites}
    />
  )
}
