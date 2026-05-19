import { getEventById } from "@/lib/data"
import { EventModalWrapper } from "@/components/event-modal-wrapper"

interface ModalEventPageProps {
  params: Promise<{ id: string }>
}

export default async function ModalEventPage({ params }: ModalEventPageProps) {
  const { id } = await params
  const event = await getEventById(id)

  if (!event) {
    return null
  }

  return <EventModalWrapper event={event} />
}
