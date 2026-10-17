import { getEventById } from "@/lib/data"
import { getCategories } from "@/lib/data"
import { EventModalWrapper } from "@/components/event-modal-wrapper"
import { createClient } from "@/lib/supabase/server"
import { parseOrigin } from "@/lib/metricas/links"
import { esEventoFavorito } from "@/lib/favoritos/es-favorito"
import { obtenerAsistencia } from "@/lib/asistencia"
import { debenMostrarseBotonesAsistencia } from "@/lib/asistencia-visibilidad"

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

  // "Voy" / "Me interesa": solo se lee la asistencia si el evento está
  // PUBLISHED (misma función que la ficha). Si la lectura falla, el modal
  // sigue sin los botones.
  const resultadoAsistencia = debenMostrarseBotonesAsistencia(event.status)
    ? await obtenerAsistencia(id)
    : null
  const cantidadesAsistencia = resultadoAsistencia?.ok ? resultadoAsistencia.cantidades : undefined
  const marcaAsistencia = resultadoAsistencia?.ok ? resultadoAsistencia.propia : null

  return (
    <EventModalWrapper
      event={event}
      isAdmin={isAdmin}
      categories={categories}
      origin={origin}
      isFavorite={isFavorite}
      cantidadesAsistencia={cantidadesAsistencia}
      marcaAsistencia={marcaAsistencia}
      haySesion={!!user}
    />
  )
}
