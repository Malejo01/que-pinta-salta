import { getEvents, getCategories } from "@/lib/data"
import { getActiveFlyers } from "@/lib/instagram/data"
import { HomeContent } from "@/components/home-content"

export default async function HomePage() {
  const [events, categories, flyers] = await Promise.all([
    getEvents(),
    getCategories(),
    getActiveFlyers(),
  ])
  const serverNowISO = new Date().toISOString()

  return (
    <HomeContent 
      events={events} 
      categories={categories}
      serverNowISO={serverNowISO}
      flyers={flyers}
    />
  )
}
