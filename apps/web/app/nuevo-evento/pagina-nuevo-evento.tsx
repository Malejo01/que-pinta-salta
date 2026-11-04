import { getCategories, getVenues } from "@/lib/data"
import { EventForm } from "@/components/event-form"
import { createClient } from "@/lib/supabase/server"
import { PUBLIC_EVENT_ROW_SELECT } from "@/lib/events/public-select"
import type { Idioma } from "@/lib/i18n/idiomas"
import { localizarCategorias } from "@/lib/i18n/portada"

export interface PaginaNuevoEventoProps {
  searchParams: Promise<{ cloneId?: string; editId?: string }>
  idioma: Idioma
}

/**
 * Q6-2: la página de `/nuevo-evento` y `/en/nuevo-evento` (compartida). La
 * sesión la pide el middleware (`lib/supabase/proxy.ts`), que en inglés manda
 * a /en/auth/login. En inglés, las categorías llevan su nombre del
 * diccionario (por slug); los lugares, el de la base.
 */
export async function PaginaNuevoEvento({ searchParams, idioma }: PaginaNuevoEventoProps) {
  const [categorias, venues] = await Promise.all([
    getCategories(),
    getVenues(),
  ])
  const categories = localizarCategorias(categorias, idioma)

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
      idioma={idioma}
    />
  )
}
