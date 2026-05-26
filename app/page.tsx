import { getEvents, getCategories } from "@/lib/data"
import { HomeContent } from "@/components/home-content"

export default async function HomePage() {
  const [events, categories] = await Promise.all([
    getEvents(),
    getCategories(),
  ])
  const serverNowISO = new Date().toISOString()

  return (
    <HomeContent 
      events={events} 
      categories={categories}
      serverNowISO={serverNowISO}
    />
  )
}
