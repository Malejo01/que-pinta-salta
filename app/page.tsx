import { getEvents, getCategories } from "@/lib/data"
import { getActiveFlyers } from "@/lib/instagram/data"
import { HomeContent } from "@/components/home-content"
import { createClient } from "@/lib/supabase/server"

export default async function HomePage() {
  const supabase = await createClient()

  const [events, categories, flyers, { data: cinemaMovies }] = await Promise.all([
    getEvents(),
    getCategories(),
    getActiveFlyers(),
    supabase
      .from('cinema_movies')
      .select('*')
      .eq('is_currently_showing', true)
      .order('title', { ascending: true })
  ])
  const serverNowISO = new Date().toISOString()

  return (
    <HomeContent 
      events={events} 
      categories={categories}
      serverNowISO={serverNowISO}
      flyers={flyers}
      cinemaMovies={cinemaMovies || []}
    />
  )
}
