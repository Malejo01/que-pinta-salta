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
  let isFavorite = false
  const user = userResult.data.user

  if (user) {
    const [profileRes, favoriteRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single(),
      supabase
        .from('user_favorites')
        .select('id')
        .eq('user_id', user.id)
        .eq('event_id', id)
        .maybeSingle()
    ])

    isAdmin = profileRes.data?.role === 'ADMIN'
    isFavorite = !!favoriteRes.data
  }

  if (!event) {
    notFound()
  }

  return (
    <EventDetailPage 
      event={event} 
      isAdmin={isAdmin} 
      categories={categories} 
      isFavorite={isFavorite}
    />
  )
}
