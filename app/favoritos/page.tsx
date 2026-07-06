import { createClient } from "@/lib/supabase/server"
import { getCategories } from "@/lib/data"
import { redirect } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { MobileNav } from "@/components/mobile-nav"
import { FavoritosList } from "./favoritos-list"

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

  const eventIds = favorites?.map(f => f.event_id).filter(Boolean) as string[] || []
  const flyerIds = favorites?.map(f => f.instagram_flyer_id).filter(Boolean) as string[] || []
  const movieIds = favorites?.map(f => f.cinema_movie_id).filter(Boolean) as string[] || []

  // 2. Fetch paralelos de los detalles de los elementos guardados (filtrando solo activos y futuros)
  const nowIso = new Date().toISOString()
  const [eventsRes, flyersRes, moviesRes, categories] = await Promise.all([
    eventIds.length > 0 
      ? supabase
          .from("events")
          .select("*, category:categories(*), venue:venues(*)")
          .in("id", eventIds)
          .eq("status", "PUBLISHED")
          .gte("start_date", nowIso)
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

  // Diccionarios de categorías para traducción rápida
  const categoryNameBySlug = new Map(categories.map(c => [c.slug, c.name]))
  const categorySlugById = new Map(categories.map(c => [c.id, c.slug]))
  const categoryNameById = new Map(categories.map(c => [c.id, c.name]))

  // 3. Transformar y normalizar a DisplayEvent compatible con EventCard
  const displayEvents = (eventsRes.data || []).map(event => {
    const startDate = new Date(event.start_date)
    return {
      id: event.id,
      slug: event.slug,
      title: event.title,
      venue: event.venue?.name || 'Lugar por confirmar',
      date: event.start_date.split('T')[0],
      time: event.start_date.split('T')[1]?.substring(0, 5) || '',
      category: categorySlugById.get(event.category_id) || 'uncategorized',
      categoryName: categoryNameById.get(event.category_id) || 'Sin categorizar',
      price: event.is_free ? ("gratis" as const) : (event.price_min === 0 ? ("confirmar" as const) : event.price_min),
      image: event.image_url || '/placeholder.svg?height=600&width=400',
      description: event.description || event.short_description || '',
      address: event.venue?.address || '',
      startDateTime: event.start_date,
      ticketUrl: event.ticket_url || undefined,
      vibe: event.age_restriction >= 18 ? ("adultos" as const) : ("familiar" as const),
      isFeatured: event.is_featured,
    }
  })

  const displayFlyers = (flyersRes.data || []).map(flyer => {
    const publishedDate = new Date(flyer.published_at)
    const categorySlug = flyer.category || flyer.account.default_category || 'boliches'
    return {
      id: `ig-${flyer.id}`,
      slug: `ig-${flyer.id}`,
      title: flyer.account.display_name,
      venue: flyer.venue_name || flyer.account.default_venue_name || flyer.account.display_name,
      date: flyer.published_at.split('T')[0],
      time: '',
      category: categorySlug,
      categoryName: categoryNameBySlug.get(categorySlug) || categorySlug,
      price: flyer.is_free ? ("gratis" as const) : (flyer.price_min === 0 ? ("confirmar" as const) : flyer.price_min),
      image: flyer.storage_image_url || flyer.original_image_url || '/placeholder.svg?height=600&width=400',
      description: flyer.caption || '',
      address: '',
      startDateTime: flyer.published_at,
      vibe: "adultos" as const,
      isFeatured: false,
      isInstagramFlyer: true,
      flyerId: flyer.id,
      instagramPostUrl: flyer.ig_post_url,
      instagramUsername: flyer.account.username,
    }
  })

  const displayMovies = (moviesRes.data || []).map(movie => {
    const showCount = Object.keys(movie.showings || {}).length
    return {
      id: `movie-${movie.id}`,
      slug: movie.slug,
      title: movie.title,
      venue: `${showCount} ${showCount === 1 ? 'Cine' : 'Cines'} de Salta`,
      date: new Date().toISOString().split('T')[0],
      time: '',
      category: 'cine',
      categoryName: 'Cine',
      price: 'confirmar' as const,
      image: movie.poster_url || '/placeholder.svg?height=600&width=400',
      description: '',
      address: '',
      startDateTime: movie.created_at,
      vibe: 'familiar' as const,
      isFeatured: false,
      isCinemaMovie: true,
      showings: movie.showings,
    }
  })

  // Unificar todos los favoritos
  const allFavorites = [...displayEvents, ...displayFlyers, ...displayMovies]

  return (
    <div className="min-h-screen bg-background pb-20 sm:pb-0">
      <Navbar />
      
      <main className="container mx-auto px-4 py-8">
        <FavoritosList initialFavorites={allFavorites} />
      </main>
      
      <MobileNav />
    </div>
  )
}
