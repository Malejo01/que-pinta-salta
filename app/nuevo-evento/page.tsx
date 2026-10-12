import { getCategories, getVenues } from "@/lib/data"
import { EventForm } from "@/components/event-form"
import { createClient } from "@/lib/supabase/server"
import { PUBLIC_EVENT_ROW_SELECT } from "@/lib/events/public-select"

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
    // Columnas explícitas (QPS-106): el resultado va como prop a un
    // componente cliente, así que no viajan merge_audit, dedup_key,
    // ai_metadata ni created_by. Los permisos no cambian: los pone RLS.
    const { data } = await supabase
      .from("events")
      .select(PUBLIC_EVENT_ROW_SELECT)
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
