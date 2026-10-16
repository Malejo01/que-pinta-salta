import { getEventById } from "@/lib/data"
import { getCategories } from "@/lib/data"
import { EventModalWrapper } from "@/components/event-modal-wrapper"
import { createClient } from "@/lib/supabase/server"
import { parseOrigin } from "@/lib/metricas/links"
import { esEventoFavorito } from "@/lib/favoritos/es-favorito"

interface ModalEventPageProps {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ o?: string | string[] }>
}

export default async function ModalEventPage({ params, searchParams }: ModalEventPageProps) {
  const { id } = await params
  const sp = (await searchParams) ?? {}
  const origin = parseOrigin(Array.isArray(sp.o) ? sp.o[0] : sp.o)
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
    const [profileRes, favoriteResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single(),
      esEventoFavorito(supabase, user.id, id)
    ])

    isAdmin = profileRes.data?.role === 'ADMIN'
    isFavorite = favoriteResult
  }

  if (!event) {
    return null
  }

  return (
    <EventModalWrapper
      event={event}
      isAdmin={isAdmin}
      categories={categories}
      origin={origin}
      isFavorite={isFavorite}
    />
  )
}
