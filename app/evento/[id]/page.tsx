import { notFound } from "next/navigation"
import { getEventById } from "@/lib/data"
import { EventDetailPage } from "@/components/event-detail-page"

interface EventPageProps {
  params: Promise<{ id: string }>
}

export default async function EventPage({ params }: EventPageProps) {
  const { id } = await params
  const event = await getEventById(id)

  if (!event) {
    notFound()
  }

  return <EventDetailPage event={event} />
}
