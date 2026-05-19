import { getEvents, getFeaturedEvents, getCategories } from "@/lib/data"
import { HomeContent } from "@/components/home-content"

export default async function HomePage() {
  const [events, featuredEvents, categories] = await Promise.all([
    getEvents(),
    getFeaturedEvents(),
    getCategories(),
  ])
  const serverNowISO = new Date().toISOString()

  return (
    <HomeContent 
      events={events} 
      featuredEvents={featuredEvents}
      categories={categories}
      serverNowISO={serverNowISO}
    />
  )
}
