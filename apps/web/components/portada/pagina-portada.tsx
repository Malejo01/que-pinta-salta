import { getEvents, getCategories } from "@/lib/data"
import { getActiveFlyers } from "@/lib/instagram/data"
import { HomeContent } from "@/components/home-content"
import { createClient } from "@/lib/supabase/server"
import { getUserFavorites } from "@/lib/actions/favorites"
import { JsonLd } from "@/components/json-ld"
import { grafoJsonLd, organizacionJsonLd, sitioWebJsonLd, type NodoJsonLd } from "@/lib/seo/json-ld"
import { eventosParaListaDeLaPortada, listaDeEventosJsonLd } from "@/lib/seo/listas"
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
  const now = new Date()
  const serverNowISO = now.toISOString()

  // B2: quién publica el sitio, el sitio con su búsqueda y los próximos
  // eventos de la agenda, en un solo @graph. Sin eventos no va el ItemList.
  // Solo en `/`: el WebSite es es-AR y su búsqueda va a la portada en castellano.
  const listaDeEventos = idioma === "es" ? listaDeEventosJsonLd(eventosParaListaDeLaPortada(events, now)) : null
  const nodos: NodoJsonLd[] = [organizacionJsonLd(), sitioWebJsonLd(), ...(listaDeEventos ? [listaDeEventos] : [])]

  return (
    <>
      {idioma === "es" && <JsonLd data={grafoJsonLd(nodos)} />}
      <HomeContent
        idioma={idioma}
        events={events}
        categories={categories}
        serverNowISO={serverNowISO}
        flyers={flyers}
        cinemaMovies={cinemaMovies || []}
        userFavorites={userFavorites}
      />
    </>
  )
}
