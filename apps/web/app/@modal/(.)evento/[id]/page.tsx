import { getEventById } from "@/lib/data"
import { getCategories } from "@/lib/data"
import { EventModalWrapper } from "@/components/event-modal-wrapper"
import { createClient } from "@/lib/supabase/server"
import { parseOrigin } from "@/lib/metricas/links"
import { esEventoFavorito } from "@/lib/favoritos/es-favorito"
import { leerAsistencia } from "@/lib/asistencia-lectura"
import { debenMostrarseBotonesAsistencia } from "@/lib/asistencia-visibilidad"
import { obtenerSeguimientoDeEvento } from "@/lib/actions/radar"

interface ModalEventPageProps {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ o?: string | string[] }>
}

export default async function ModalEventPage({ params, searchParams }: ModalEventPageProps) {
  const { id } = await params
  const sp = (await searchParams) ?? {}
  const origin = parseOrigin(Array.isArray(sp.o) ? sp.o[0] : sp.o)
  const supabase = await createClient()

  const [event, categories, userResult, seguimiento] = await Promise.all([
    getEventById(id),
    getCategories(),
    supabase.auth.getUser(),
    obtenerSeguimientoDeEvento(id),
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

  // "Voy": solo se lee la asistencia si el evento está PUBLISHED (misma
  // función que la ficha). Si la lectura falla, el modal sigue sin el
  // botón de Voy (la fila de ♥ Guardar/Compartir se dibuja igual: el
  // `console.error` ya quedó dentro de `leerAsistencia`). R56 (56-a,
  // QPS-196): el MISMO cliente y el MISMO auth.getUser() de arriba, sin
  // crear un segundo cliente ni volver a autenticar.
  const resultadoAsistencia = debenMostrarseBotonesAsistencia(event.status)
    ? await leerAsistencia(supabase, user?.id ?? null, id)
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
      seguimiento={seguimiento}
      haySesion={!!user}
    />
  )
}
