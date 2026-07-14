import { createClient } from "@supabase/supabase-js"
import type { MetadataRoute } from "next"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://www.quepintasalta.com.ar"
  
  // 1. Rutas estáticas
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/cines`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/buscar`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.5,
    },
  ]

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.warn("[Sitemap] Faltan variables de entorno de Supabase")
    return staticRoutes
  }

  // Instanciamos el cliente anon directamente para evitar usar cookies() en la generación del sitemap
  const supabase = createClient(supabaseUrl, supabaseKey)

  // 2. Rutas dinámicas para Eventos Publicados
  const { data: events, error: eventsError } = await supabase
    .from("events")
    .select("id, updated_at")
    .eq("status", "PUBLISHED")
    .order("start_date", { ascending: false })

  if (eventsError) {
    console.error("[Sitemap] Error cargando eventos para el sitemap:", eventsError)
  }

  const eventRoutes: MetadataRoute.Sitemap = (events || []).map((event) => ({
    url: `${baseUrl}/evento/${event.id}`,
    lastModified: new Date(event.updated_at || new Date()),
    changeFrequency: "daily",
    priority: 0.7,
  }))

  // 3. Rutas dinámicas para Flyers de Instagram Activos
  const { data: flyers, error: flyersError } = await supabase
    .from("instagram_flyers")
    .select("id, published_at")
    .eq("status", "ACTIVE")
    .order("published_at", { ascending: false })

  if (flyersError) {
    console.error("[Sitemap] Error cargando flyers para el sitemap:", flyersError)
  }

  const flyerRoutes: MetadataRoute.Sitemap = (flyers || []).map((flyer) => ({
    url: `${baseUrl}/flyer/${flyer.id}`,
    lastModified: new Date(flyer.published_at || new Date()),
    changeFrequency: "weekly",
    priority: 0.6,
  }))

  return [...staticRoutes, ...eventRoutes, ...flyerRoutes]
}
