import type { Metadata } from "next"
import { BuscarContent } from "./buscar-content"
import { getEvents, getCategories } from "@/lib/data"
import { getActiveFlyers } from "@/lib/instagram/data"
import { createClient } from "@/lib/supabase/server"
import { getUserFavorites } from "@/lib/actions/favorites"

export const metadata: Metadata = {
  title: "Buscar Eventos en Salta Capital",
  description: "Buscá peñas, recitales, boliches, ferias, talleres y teatro en Salta Capital. Encontrá qué hacer hoy en la ciudad.",
  openGraph: {
    title: "Buscar Eventos en Salta Capital | Qué Pinta Salta",
    description: "Buscá peñas, recitales, boliches, ferias, talleres y teatro en Salta Capital.",
    url: "https://www.quepintasalta.com.ar/buscar",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Buscar Eventos en Salta Capital | Qué Pinta Salta",
    description: "Buscá peñas, recitales, boliches, ferias, talleres y teatro en Salta Capital.",
  },
}

export default async function BuscarPage() {
  const supabase = await createClient()

  const [events, categories, flyers, { data: cinemaMovies }, userFavorites] = await Promise.all([
    getEvents(),
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
    <BuscarContent 
      events={events} 
      categories={categories}
      serverNowISO={serverNowISO}
      flyers={flyers}
      cinemaMovies={cinemaMovies || []}
      userFavorites={userFavorites}
    />
  )
}
