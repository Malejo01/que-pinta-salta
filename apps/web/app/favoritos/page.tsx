import { createClient } from "@/lib/supabase/server"
import { getCategories } from "@/lib/data"
import { redirect } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { MobileNav } from "@/components/mobile-nav"
import { FavoritosList } from "./favoritos-list"
import { applyVigenciaPrefilter } from "@/lib/events/vigencia"
import { PUBLIC_EVENT_SELECT } from "@/lib/events/public-select"
import { armarFavoritos, idsDeFavoritos } from "@qps/core/favoritos/armar"
import { idsDeEventosVoy, separarMisEventos } from "@qps/core/favoritos/mis-eventos"
import type { Event, Category, Venue, CinemaMovie } from "@/lib/types"
import type { FlyerWithAccount } from "@/lib/instagram-config"
import type { Metadata } from "next"

// B2: sin la marca (la agrega la plantilla del layout). `noindex, follow`:
// es una página privada; sin sesión redirige al ingreso.
export const metadata: Metadata = {
  title: "Mis eventos",
  description: "Los eventos, boliches y películas que guardaste para armar tu propia agenda en Salta.",
  robots: { index: false, follow: true },
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

  // 1.b Los ids de evento marcados con ✓ Voy (R47, QPS-197): la RLS del dueño
  // ya acota `event_attendance` a las filas propias, así que el select no
  // pide `user_id` ni filtra por él. Si SOLO esta lectura falla, no tiramos
  // abajo la página entera: seguimos con `idsVoy` vacío (Guardados sigue
  // andando) — misma decisión que tomó la app en `lib/favoritos.ts`.
  const { data: filasVoy, error: errorVoy } = await supabase
    .from("event_attendance")
    .select("event_id, kind")
    .eq("kind", "voy")

  if (errorVoy) {
    console.error("[FavoritosPage] Error obteniendo eventos con Voy:", errorVoy)
  }

  const idsVoy = errorVoy ? [] : idsDeEventosVoy(filasVoy ?? [])

  const { eventIds: eventIdsFavoritos, flyerIds, movieIds } = idsDeFavoritos(favorites ?? [])
  // Los ids de Voy se unen a los de favoritos ANTES de pedir los eventos: así
  // un Voy viejo sin su fila de favorito (datos de antes del backfill) igual
  // entra en la consulta de `events` y aparece en la sección Voy.
  const eventIds = [...new Set([...eventIdsFavoritos, ...idsVoy])]

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

  const armado = armarFavoritos(
    { eventos: favoriteEvents, flyers: favoriteFlyers, peliculas: favoriteMovies, categoryNameBySlug },
    now,
  )

  // 4. Separar en "Voy" (✓, social) y "Guardados" (♥, el resto) con la
  // misma función de core que usa la app (`@qps/core/favoritos/mis-eventos`).
  //
  // Corrección al encargo original de esta tarea: NO se pasa el tercer
  // parámetro `extrasVoy`. Como `idsVoy` ya se unió a `eventIds` ANTES de
  // pedir los eventos (más arriba), cualquier evento con Voy que siga
  // vigente y PUBLISHED ya está dentro de `armado`: pasar además `extrasVoy`
  // sería un segundo camino para lo mismo.
  const { voy, guardados } = separarMisEventos(armado, idsVoy)

  return (
    <div className="min-h-screen bg-background pb-page sm:pb-0">
      <Navbar />

      <main className="container mx-auto px-4 py-8">
        <FavoritosList voy={voy} flexibles={guardados.flexibles} porDia={guardados.porDia} />
      </main>

      <MobileNav />
    </div>
  )
}
