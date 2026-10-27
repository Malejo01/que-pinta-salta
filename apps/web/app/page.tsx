import { getEvents, getCategories } from "@/lib/data"
import { getActiveFlyers } from "@/lib/instagram/data"
import { HomeContent } from "@/components/home-content"
import { createClient } from "@/lib/supabase/server"
import { getUserFavorites } from "@/lib/actions/favorites"
import { JsonLd } from "@/components/json-ld"
import { grafoJsonLd, organizacionJsonLd, sitioWebJsonLd, type NodoJsonLd } from "@/lib/seo/json-ld"
import { eventosParaListaDeLaPortada, listaDeEventosJsonLd } from "@/lib/seo/listas"
import type { Metadata } from "next"

// Canónica acá y no en el layout: en el layout la heredarían todas las páginas
// que no declaran la suya, y quedarían todas apuntando a la portada.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
}

export default async function HomePage() {
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
  const listaDeEventos = listaDeEventosJsonLd(eventosParaListaDeLaPortada(events, now))
  const nodos: NodoJsonLd[] = [organizacionJsonLd(), sitioWebJsonLd(), ...(listaDeEventos ? [listaDeEventos] : [])]

  return (
    <>
      <JsonLd data={grafoJsonLd(nodos)} />
      <HomeContent 
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
