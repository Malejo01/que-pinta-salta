import { getEventById } from "@/lib/data"
import { getCategories } from "@/lib/data"
import { EventModalWrapper } from "@/components/event-modal-wrapper"
import { createClient } from "@/lib/supabase/server"

interface ModalEventPageProps {
  params: Promise<{ id: string }>
}

export default async function ModalEventPage({ params }: ModalEventPageProps) {
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
    return null
  }

  return <EventModalWrapper event={event} isAdmin={isAdmin} categories={categories} />
}
