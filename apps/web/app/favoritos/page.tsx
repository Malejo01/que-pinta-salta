import { createClient } from "@/lib/supabase/server"
import { getCategories } from "@/lib/data"
import { redirect } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { MobileNav } from "@/components/mobile-nav"
import { FavoritosList } from "./favoritos-list"
import { applyVigenciaPrefilter } from "@/lib/events/vigencia"
import { PUBLIC_EVENT_SELECT } from "@/lib/events/public-select"
import { armarFavoritos, idsDeFavoritos } from "@qps/core/favoritos/armar"
import type { Event, Category, Venue, CinemaMovie } from "@/lib/types"
import type { FlyerWithAccount } from "@/lib/instagram-config"

export const metadata = {
  title: "Mis Favoritos — Qué Pinta Salta",
  description: "Los eventos, boliches y películas que guardaste para armar tu propia agenda en Salta.",
}

export default async function FavoritosPage() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (!user || authError) {
    redirect("/auth/login?next=/favoritos")
  }

  // 1. Obtener la lista de favoritos de la base de datos
  const { data: favorites, error: dbError } = await supabase
    .from("user_favorites")
    .select(`
      event_id,
      instagram_flyer_id,
      cinema_movie_id
    `)
    .eq("user_id", user.id)

  if (dbError) {
    console.error("[FavoritosPage] Error obteniendo favoritos de BD:", dbError)
  }

  const { eventIds, flyerIds, movieIds } = idsDeFavoritos(favorites ?? [])

  // 2. Fetch paralelos de los detalles de los elementos guardados (filtrando solo activos y futuros)
  const now = new Date()
  const [eventsRes, flyersRes, moviesRes, categories] = await Promise.all([
    eventIds.length > 0
      ? applyVigenciaPrefilter(supabase
          .from("events")
          .select(PUBLIC_EVENT_SELECT)
          .in("id", eventIds)
          .eq("status", "PUBLISHED"), now)
      : Promise.resolve({ data: [] }),
    flyerIds.length > 0
      ? supabase
          .from("instagram_flyers")
          .select("*, account:instagram_accounts(*)")
          .in("id", flyerIds)
          .eq("status", "ACTIVE")
      : Promise.resolve({ data: [] }),
    movieIds.length > 0
      ? supabase
          .from("cinema_movies")
          .select("*")
          .in("id", movieIds)
          .eq("is_currently_showing", true)
      : Promise.resolve({ data: [] }),
    getCategories()
  ])

  // 3. La regla de /favoritos (eventos PUBLISHED y vigentes —sin categoría
  // incluida, como "Sin categorizar"—, flyers ACTIVE y películas en
  // cartel, agrupadas en "flexibles" + por día) vive en
  // packages/core/src/favoritos/armar.ts: la usan la web y la app, con el
  // mismo resultado (test de equivalencia de la R29).
  // PUBLIC_EVENT_SELECT es un string armado en runtime (no un literal), así
  // que supabase-js no puede inferir con él el tipo de la fila: "as unknown
  // as" en vez de "as" (ver el comentario en lib/events/public-select.ts).
  const favoriteEvents = (eventsRes.data || []) as unknown as (Event & { category: Category | null; venue: Venue | null })[]
  const favoriteFlyers = (flyersRes.data || []) as unknown as FlyerWithAccount[]
  const favoriteMovies = (moviesRes.data || []) as unknown as CinemaMovie[]
  const categoryNameBySlug = new Map(categories.map(c => [c.slug, c.name]))

  const { flexibles, porDia } = armarFavoritos(
    { eventos: favoriteEvents, flyers: favoriteFlyers, peliculas: favoriteMovies, categoryNameBySlug },
    now,
  )

  return (
    <div className="min-h-screen bg-background pb-page sm:pb-0">
      <Navbar />

      <main className="container mx-auto px-4 py-8">
        <FavoritosList flexibles={flexibles} porDia={porDia} />
      </main>

      <MobileNav />
    </div>
  )
}
