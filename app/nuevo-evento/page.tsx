import { getCategories, getVenues } from "@/lib/data"
import { EventForm } from "@/components/event-form"

export default async function NuevoEventoPage() {
  const [categories, venues] = await Promise.all([
    getCategories(),
    getVenues(),
  ])

  return <EventForm categories={categories} venues={venues} />
}
