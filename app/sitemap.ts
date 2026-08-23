import { createClient } from "@supabase/supabase-js"
import type { MetadataRoute } from "next"

const baseUrl = "https://www.quepintasalta.com.ar"

/**
 * Sin esto el sitemap se prerenderiza una sola vez y las consultas a Supabase
 * quedan congeladas en el Data Cache de Next, que sobrevive entre deploys.
 * Se detectó en la auditoría: el build servía 423 URLs con lastmod de hacía
 * más de un mes, cuando en la base ya había 907. Con revalidate el sitemap se
 * regenera cada hora y el cache de los fetch caduca con él.
 */
export const revalidate = 3600

/** Fecha más reciente de una lista, ignorando nulls y valores inválidos. */
function latest(dates: (string | null | undefined)[], fallback: Date): Date {
  const times = dates
    .map((d) => (d ? new Date(d).getTime() : NaN))
    .filter((t) => !Number.isNaN(t))

  return times.length ? new Date(Math.max(...times)) : fallback
}

/** Cuántos días hacia atrás sigue anunciándose un evento ya pasado. */
const SITEMAP_PAST_DAYS = 30

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  const sitemapCutoff = new Date(now.getTime() - SITEMAP_PAST_DAYS * 24 * 60 * 60 * 1000)

  const staticRoute = (
    path: string,
    lastModified: Date,
    changeFrequency: "daily" | "weekly",
    priority: number,
  ) => ({ url: `${baseUrl}${path}`, lastModified, changeFrequency, priority })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.warn("[Sitemap] Faltan variables de entorno de Supabase")
    return [
      staticRoute("", now, "daily", 1.0),
      staticRoute("/cines", now, "daily", 0.8),
      staticRoute("/buscar", now, "weekly", 0.5),
    ]
  }

  // Instanciamos el cliente anon directamente para evitar usar cookies() en la generación del sitemap
  const supabase = createClient(supabaseUrl, supabaseKey)

  const [eventsRes, flyersRes, moviesRes] = await Promise.all([
    // Sólo eventos vigentes: los futuros más una cola de 30 días.
    //
    // Sin el filtro el sitemap listaba los 824 publicados, de los cuales 744
    // ya habían pasado: 90% del crawl budget en páginas de eventos vencidos.
    // La cola de 30 días existe porque un evento recién pasado todavía recibe
    // búsquedas ("¿cómo estuvo…?") y sacarlo del sitemap el día después
    // desperdicia el posicionamiento que acaba de ganar.
    //
    // Las páginas siguen existiendo y respondiendo 200; sólo dejan de
    // anunciarse para rastreo.
    supabase
      .from("events")
      .select("id, updated_at")
      .eq("status", "PUBLISHED")
      .gte("start_date", sitemapCutoff.toISOString())
      .order("start_date", { ascending: false }),
    supabase
      .from("instagram_flyers")
      .select("id, published_at")
      .eq("status", "ACTIVE")
      .order("published_at", { ascending: false }),
    supabase
      .from("cinema_movies")
      .select("updated_at")
      .eq("is_currently_showing", true),
  ])

  if (eventsRes.error) {
    console.error("[Sitemap] Error cargando eventos para el sitemap:", eventsRes.error)
  }
  if (flyersRes.error) {
    console.error("[Sitemap] Error cargando flyers para el sitemap:", flyersRes.error)
  }
  if (moviesRes.error) {
    console.error("[Sitemap] Error cargando cartelera para el sitemap:", moviesRes.error)
  }

  const events = eventsRes.data || []
  const flyers = flyersRes.data || []
  const movies = moviesRes.data || []

  // 1. Rutas dinámicas para Eventos Publicados
  const eventRoutes: MetadataRoute.Sitemap = events.map((event) => ({
    url: `${baseUrl}/evento/${event.id}`,
    lastModified: new Date(event.updated_at || now),
    changeFrequency: "daily",
    priority: 0.7,
  }))

  // 2. Rutas dinámicas para Flyers de Instagram Activos
  const flyerRoutes: MetadataRoute.Sitemap = flyers.map((flyer) => ({
    url: `${baseUrl}/flyer/${flyer.id}`,
    lastModified: new Date(flyer.published_at || now),
    changeFrequency: "weekly",
    priority: 0.6,
  }))

  // 3. Rutas estáticas. El lastmod sale del contenido que efectivamente listan:
  //    un `new Date()` fijo le dice a los crawlers que todo cambió recién,
  //    y terminan ignorando el campo.
  const eventsUpdatedAt = latest(events.map((e) => e.updated_at), now)
  const homeUpdatedAt = latest(
    [...events.map((e) => e.updated_at), ...flyers.map((f) => f.published_at)],
    now,
  )
  const cinemaUpdatedAt = latest(movies.map((m) => m.updated_at), now)

  const staticRoutes: MetadataRoute.Sitemap = [
    staticRoute("", homeUpdatedAt, "daily", 1.0),
    staticRoute("/cines", cinemaUpdatedAt, "daily", 0.8),
    staticRoute("/buscar", eventsUpdatedAt, "weekly", 0.5),
  ]

  return [...staticRoutes, ...eventRoutes, ...flyerRoutes]
}
