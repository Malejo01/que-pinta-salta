import { getCategories, getVenues } from "@/lib/data"
import { EventForm } from "@/components/event-form"
import { createClient } from "@/lib/supabase/server"

export default async function NuevoEventoPage({
  searchParams,
}: {
  searchParams: Promise<{ cloneId?: string; editId?: string }>
}) {
  const [categories, venues] = await Promise.all([
    getCategories(),
    getVenues(),
  ])

  let initialData = null
  const resolvedParams = await searchParams
  const cloneId = resolvedParams?.cloneId
  const editId = resolvedParams?.editId
  const targetId = cloneId || editId

  if (targetId) {
    const supabase = await createClient()
    const { data } = await supabase
      .from("events")
      .select("*")
      .eq("id", targetId)
      .single()
    if (data) {
      initialData = data
    }
  }

  return (
    <EventForm 
      categories={categories} 
      venues={venues} 
      initialData={initialData} 
      cloneId={cloneId}
      editId={editId}
    />
  )
}
