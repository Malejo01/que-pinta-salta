import { notFound } from "next/navigation"
import { getEventById } from "@/lib/data"
import { getCategories } from "@/lib/data"
import { EventDetailPage } from "@/components/event-detail-page"
import { createClient } from "@/lib/supabase/server"

interface EventPageProps {
  params: Promise<{ id: string }>
}

export default async function EventPage({ params }: EventPageProps) {
  const { id } = await params
  const supabase = await createClient()

  const [event, categories, userResult] = await Promise.all([
    getEventById(id),
    getCategories(),
    supabase.auth.getUser(),
  ])

  let isAdmin = false
  const user = userResult.data.user

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    isAdmin = profile?.role === 'ADMIN'
  }

  if (!event) {
    notFound()
  }

  return <EventDetailPage event={event} isAdmin={isAdmin} categories={categories} />
}
