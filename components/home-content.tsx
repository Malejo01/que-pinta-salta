"use client"

import { useMemo, useState, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Image from "next/image"
import type { Event, Category, Venue, CinemaMovie } from "@/lib/types"
import type { FlyerWithAccount } from "@/lib/instagram-config"
import { Navbar } from "@/components/navbar"
import { MobileNav } from "@/components/mobile-nav"
import { HeroCarousel } from "@/components/hero-carousel"
import { FiltersBar, DateFilter } from "@/components/filters-bar"
import { CategoryRow } from "@/components/category-row"
import { EventCard } from "@/components/event-card"
import { MovieModal } from "@/components/movie-modal"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { formatEventTime } from "@/lib/date-format"
import { aplicarOrdenDemo } from "@/lib/config/category-order"
import { AdSenseBanner } from "@/components/adsense-banner"
import { Film } from "lucide-react"

type EventWithRelations = Event & { category: Category; venue: Venue | null }

function normalizeFilterText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
}

function getCategoryPriority(
  categories: Category[],
  events: DisplayEvent[],
  serverNowISO: string,
  favoriteCategorySlugs: string[]
) {
  const now = new Date(serverNowISO).getTime()

  const favoriteIndex = new Map(
    favoriteCategorySlugs.map((slug, index) => [slug, index])
  )

  const upcomingCounts = new Map<string, number>()
  for (const event of events) {
    if (new Date(event.startDateTime).getTime() >= now) {
      upcomingCounts.set(event.category, (upcomingCounts.get(event.category) ?? 0) + 1)
    }
  }

  const ordenNormal = [...categories].sort((a, b) => {
    const aFavoriteIndex = favoriteIndex.get(a.slug)
    const bFavoriteIndex = favoriteIndex.get(b.slug)

    if (aFavoriteIndex !== undefined && bFavoriteIndex !== undefined) {
      return aFavoriteIndex - bFavoriteIndex
    }

    if (aFavoriteIndex !== undefined) return -1
    if (bFavoriteIndex !== undefined) return 1

    const countDiff = (upcomingCounts.get(b.slug) ?? 0) - (upcomingCounts.get(a.slug) ?? 0)
    if (countDiff !== 0) return countDiff

    return a.name.localeCompare(b.name, "es")
  })

  // Cambio TEMPORAL para la demo institucional. Con el flag apagado esto
  // devuelve `ordenNormal` sin tocar. Ver lib/config/category-order.ts.
  return aplicarOrdenDemo(ordenNormal, serverNowISO)
}

// Tipo unificado para eventos y flyers de Instagram
export interface DisplayEvent {
  id: string
  slug: string
  title: string
  venue: string
  date: string
  time: string
  category: string
  categoryName: string
  price: "gratis" | "confirmar" | number
  image: string
  description: string
  address: string
  startDateTime: string
  ticketUrl?: string
  vibe: "adultos" | "familiar" | "exterior"
  isFeatured: boolean
  // Campos opcionales para flyers de Instagram
  isInstagramFlyer?: boolean
  flyerId?: string
  instagramPostUrl?: string
  instagramUsername?: string
  // Campos opcionales para películas de cine
  isCinemaMovie?: boolean
  showings?: any
  // Campos opcionales para consolidar eventos duplicados
  occurrences?: { id: string; date: string; time: string }[]
}

// Normalizar fechas y zonas horarias para Salta (America/Argentina/Salta)
function formatDateInSalta(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Salta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date)
}

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

// Transform database event to display format
export function transformEvent(event: EventWithRelations): DisplayEvent {
  const startDate = new Date(event.start_date)
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    venue: event.venue?.name || 'Lugar por confirmar',
    date: formatDateInSalta(startDate),
    time: formatEventTime(startDate),
    category: event.category.slug,
    categoryName: event.category.name,
    price: event.is_free ? "gratis" as const : (event.price_min === 0 ? "confirmar" as const : event.price_min),
    image: event.image_url || '/placeholder.svg?height=600&width=400',
    description: event.description || event.short_description || '',
    address: event.venue?.address || '',
    startDateTime: event.start_date,
    ticketUrl: event.ticket_url || undefined,
    vibe: event.age_restriction >= 18 ? "adultos" as const : "familiar" as const,
    isFeatured: event.is_featured,
  }
}

// Transform Instagram flyer to display format
function transformFlyer(flyer: FlyerWithAccount, categoryNameBySlug: Map<string, string>): DisplayEvent {
  const publishedDate = new Date(flyer.published_at)
  const categorySlug = flyer.category || flyer.account.default_category || 'boliches'
  return {
    id: `ig-${flyer.id}`,
    slug: `ig-${flyer.id}`,
    title: flyer.account.display_name,
    venue: flyer.venue_name || flyer.account.default_venue_name || flyer.account.display_name,
    date: formatDateInSalta(publishedDate),
    time: '',
    category: categorySlug,
    categoryName: categoryNameBySlug.get(categorySlug) || categorySlug,
    price: flyer.is_free ? "gratis" as const : (flyer.price_min === 0 ? "confirmar" as const : flyer.price_min),
    image: flyer.storage_image_url || flyer.original_image_url || '/placeholder.svg?height=600&width=400',
    description: flyer.caption || '',
    address: '',
    startDateTime: flyer.published_at,
    vibe: "adultos" as const,
    isFeatured: false,
    // Metadatos de Instagram
    isInstagramFlyer: true,
    flyerId: flyer.id,
    instagramPostUrl: flyer.ig_post_url,
    instagramUsername: flyer.account.username,
  }
}

interface HomeContentProps {
  events: EventWithRelations[]
  categories: Category[]
  serverNowISO: string
  favoriteCategorySlugs?: string[]
  flyers?: FlyerWithAccount[]
  cinemaMovies?: CinemaMovie[]
  userFavorites?: string[]
}

export function HomeContent({
  events,
  categories,
  serverNowISO,
  favoriteCategorySlugs = [],
  flyers = [],
  cinemaMovies = [],
  userFavorites = [],
}: HomeContentProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  
  // Estado para la película seleccionada que se mostrará en el modal
  const [selectedMovie, setSelectedMovie] = useState<DisplayEvent | null>(null)
  
  // Inicializar estado local de filtros a partir de la URL (solo en la carga inicial)
  const [search, setSearch] = useState(() => searchParams.get("search") || "")
  const [date, setDate] = useState<DateFilter | null>(() => searchParams.get("date") as DateFilter | null)
  const [category, setCategory] = useState<string | null>(() => searchParams.get("category"))
  const [establishment, setEstablishment] = useState(() => searchParams.get("establishment") || "")
  const [location, setLocation] = useState(() => searchParams.get("location") || "")
  const [dateExact, setDateExact] = useState<string | null>(() => searchParams.get("dateExact"))
  const [instagram, setInstagram] = useState(() => searchParams.get("instagram") !== "false")

  // Efecto para sincronizar silenciosamente el estado de los filtros con la URL del navegador
  useEffect(() => {
    const params = new URLSearchParams()
    if (search) params.set("search", search)
    if (date) params.set("date", date)
    if (category) params.set("category", category)
    if (establishment) params.set("establishment", establishment)
    if (location) params.set("location", location)
    if (dateExact) params.set("dateExact", dateExact)
    if (!instagram) params.set("instagram", "false")

    const nextQuery = params.toString()
    const nextUrl = nextQuery ? `/?${nextQuery}` : "/"
    
    // Actualizar la URL de forma shallow (silenciosa), sin recargar componentes del servidor ni relanzar peticiones
    window.history.replaceState(null, "", nextUrl)
  }, [search, date, category, establishment, location, dateExact, instagram])

  // Sincronizar el estado local cuando cambian los query parameters en la URL (por ejemplo, al hacer click en el logo o navegar atrás/adelante)
  useEffect(() => {
    const urlSearch = searchParams.get("search") || ""
    const urlDate = searchParams.get("date") as DateFilter | null
    const urlCategory = searchParams.get("category")
    const urlEstablishment = searchParams.get("establishment") || ""
    const urlLocation = searchParams.get("location") || ""
    const urlDateExact = searchParams.get("dateExact")
    const urlInstagram = searchParams.get("instagram") !== "false"

    setSearch(urlSearch)
    setDate(urlDate)
    setCategory(urlCategory)
    setEstablishment(urlEstablishment)
    setLocation(urlLocation)
    setDateExact(urlDateExact)
    setInstagram(urlInstagram)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const categoryNameBySlug = useMemo(() => {
    return new Map(categories.map((category) => [category.slug, category.name]))
  }, [categories])

  const allDisplayEvents = useMemo(() => {
    const eventItems = events
      .filter((event) => event.category)
      .map(transformEvent)
    
    // Agrupar eventos duplicados por la clave Título + Lugar
    const groupedEventItemsMap = new Map<string, DisplayEvent>()
    
    eventItems.forEach(item => {
      const groupKey = `${item.title.toLowerCase().trim()}|${item.venue.toLowerCase().trim()}`
      
      if (groupedEventItemsMap.has(groupKey)) {
        const existing = groupedEventItemsMap.get(groupKey)!
        const existingDate = new Date(existing.startDateTime).getTime()
        const currentDate = new Date(item.startDateTime).getTime()
        
        if (currentDate < existingDate) {
          const occurrences = existing.occurrences || [{ id: existing.id, date: existing.date, time: existing.time }]
          occurrences.push({ id: item.id, date: item.date, time: item.time })
          
          existing.id = item.id
          existing.date = item.date
          existing.time = item.time
          existing.startDateTime = item.startDateTime
          existing.occurrences = occurrences
        } else {
          if (!existing.occurrences) {
            existing.occurrences = [{ id: existing.id, date: existing.date, time: existing.time }]
          }
          existing.occurrences.push({ id: item.id, date: item.date, time: item.time })
        }
      } else {
        groupedEventItemsMap.set(groupKey, {
          ...item,
          occurrences: [{ id: item.id, date: item.date, time: item.time }]
        })
      }
    })
    
    const finalEventItems = Array.from(groupedEventItemsMap.values()).map(item => {
      if (item.occurrences && item.occurrences.length > 1) {
        item.occurrences.sort((a, b) => new Date(a.date + 'T00:00:00').getTime() - new Date(b.date + 'T00:00:00').getTime())
        const first = item.occurrences[0]
        item.id = first.id
        item.date = first.date
        item.time = first.time
      }
      return item
    })

    // Transformar flyers de Instagram y mezclarlos con los eventos
    const flyerItems = flyers.map((flyer) => transformFlyer(flyer, categoryNameBySlug))

    // Transformar películas de cine y mezclarlas con los eventos
    const movieItems = (cinemaMovies || []).map((movie): DisplayEvent => {
      const showCount = Object.keys(movie.showings || {}).length
      const saltaTodayStr = formatDateInSalta(new Date(serverNowISO))

      return {
        id: `movie-${movie.id}`,
        slug: movie.slug,
        title: movie.title,
        venue: `${showCount} ${showCount === 1 ? 'Cine' : 'Cines'} de Salta`,
        date: saltaTodayStr, // Se proyecta hoy en Salta
        time: '',
        category: 'cine',
        categoryName: 'Cine',
        price: 'confirmar' as const,
        image: movie.poster_url || '/placeholder.svg?height=600&width=400',
        description: '',
        address: '',
        startDateTime: movie.created_at, // for ordering
        vibe: 'familiar' as const,
        isFeatured: false,
        isCinemaMovie: true,
        showings: movie.showings,
      }
    })
    
    return [...finalEventItems, ...flyerItems, ...movieItems]
  }, [events, flyers, cinemaMovies, categoryNameBySlug, serverNowISO])

  const sortedCategories = useMemo(() => {
    return getCategoryPriority(categories, allDisplayEvents, serverNowISO, favoriteCategorySlugs)
  }, [categories, allDisplayEvents, serverNowISO, favoriteCategorySlugs])

  const carouselEvents = useMemo(() => {
    const now = new Date(serverNowISO).getTime()
    const limit = 6
    
    // 1. Obtener eventos futuros destacados, ordenados por fecha
    const featuredUpcoming = allDisplayEvents
      .filter((event) => event.isFeatured && new Date(event.startDateTime).getTime() >= now)
      .sort((a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime())
      
    // Limitar los destacados al máximo de cupos
    const selectedCarousel = featuredUpcoming.slice(0, limit)
    
    // Si completamos el cupo, los retornamos directamente
    if (selectedCarousel.length >= limit) {
      return selectedCarousel
    }
    
    // Usar Set para evitar duplicados al agregar los fallbacks
    const selectedIds = new Set(selectedCarousel.map(e => e.id))
    
    // 2. Rellenar con la lógica por categoría existente (evitando duplicados)
    const categoryFallbacks = sortedCategories
      .map((category) => {
        return allDisplayEvents
          .filter((event) => event.category === category.slug)
          .filter((event) => new Date(event.startDateTime).getTime() >= now)
          .filter((event) => !selectedIds.has(event.id))
          .sort(
            (a, b) =>
              new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime()
          )[0]
      })
      .filter((event): event is DisplayEvent => Boolean(event))
      
    // Agregar fallbacks al carrusel
    for (const event of categoryFallbacks) {
      if (selectedCarousel.length >= limit) break
      if (!selectedIds.has(event.id)) {
        selectedCarousel.push(event)
        selectedIds.add(event.id)
      }
    }
    
    return selectedCarousel
  }, [allDisplayEvents, sortedCategories, serverNowISO])

  const filteredEvents = useMemo(() => {
    let filtered = allDisplayEvents

    if (search) {
      const query = normalizeFilterText(search)
      filtered = filtered.filter(
        event => 
          normalizeFilterText(event.title).includes(query) ||
          normalizeFilterText(event.venue).includes(query)
      )
    }

    if (establishment) {
      const query = normalizeFilterText(establishment)
      filtered = filtered.filter((event) => normalizeFilterText(event.venue).includes(query))
    }

    if (location) {
      const query = normalizeFilterText(location)
      filtered = filtered.filter((event) => normalizeFilterText(event.address).includes(query))
    }

    if (dateExact) {
      filtered = filtered.filter((event) => event.date === dateExact)
    } else if (date) {
      const saltaTodayStr = formatDateInSalta(new Date(serverNowISO))
      const today = parseLocalDate(saltaTodayStr)
      
      filtered = filtered.filter(event => {
        const eventDate = parseLocalDate(event.date)
        
        switch (date) {
          case "hoy":
            return event.date === saltaTodayStr
          case "semana": {
            const weekFromNow = new Date(today)
            weekFromNow.setDate(weekFromNow.getDate() + 7)
            return eventDate >= today && eventDate <= weekFromNow
          }
          case "mes": {
            const monthFromNow = new Date(today)
            monthFromNow.setMonth(monthFromNow.getMonth() + 1)
            return eventDate >= today && eventDate <= monthFromNow
          }
          case "tendencias":
            return event.isFeatured
          default:
            return true
        }
      })
    }

    // CORRECCIÓN URGENTE: Aplicar el filtro de categoría seleccionada
    if (category) {
      filtered = filtered.filter((event) => event.category === category)
    }

    if (!instagram) {
      filtered = filtered.filter(event => !event.isInstagramFlyer)
    }

    // Ordenamiento inteligente: flyers de Instagram primero, luego eventos normales
    return [...filtered].sort((a, b) => {
      const aIsIg = a.isInstagramFlyer ? 1 : 0
      const bIsIg = b.isInstagramFlyer ? 1 : 0
      if (bIsIg !== aIsIg) {
        return bIsIg - aIsIg // 1 (IG) antes que 0 (normal)
      }
      return new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime()
    })
  }, [
    allDisplayEvents,
    search,
    establishment,
    location,
    dateExact,
    date,
    category,
    instagram,
    serverNowISO,
  ])

  const eventsByCategory = useMemo(() => {
    const categoryOrderIndex = new Map(
      sortedCategories.map((category, index) => [category.slug, index])
    )

    const cats = sortedCategories.map(cat => ({
      category: cat.slug,
      title: cat.name,
      events: filteredEvents.filter(event => event.category === cat.slug)
    }))

    const porVolumen = cats.sort((a, b) => {
      const countDiff = b.events.length - a.events.length
      if (countDiff !== 0) return countDiff

      return (categoryOrderIndex.get(a.category) ?? 0) - (categoryOrderIndex.get(b.category) ?? 0)
    })

    // Este es el orden que efectivamente se ve: el sort de arriba ordena por
    // cantidad de eventos y sólo usa `sortedCategories` para desempatar, así
    // que el flag de la demo tiene que aplicarse acá también o no se nota.
    // Apagado, `aplicarOrdenDemo` devuelve `porVolumen` sin tocar.
    return aplicarOrdenDemo(porVolumen, serverNowISO, (c) => c.category)
  }, [sortedCategories, filteredEvents, serverNowISO])

  const clearFilters = () => {
    setSearch("")
    setDate(null)
    setCategory(null)
    setEstablishment("")
    setLocation("")
    setDateExact(null)
    setInstagram(true)
  }

  const hasFilters = Boolean(
    search ||
    date ||
    dateExact ||
    category ||
    establishment ||
    location
  )
  const showCategoryRows = !category && eventsByCategory.some(cat => cat.events.length > 0)
  const showFilteredGrid = category && filteredEvents.length > 0
  const filteredTitle = category
    ? categoryNameBySlug.get(category) ?? category
    : "Resultados filtrados"

  return (
    <div className="min-h-screen bg-background pb-20 sm:pb-0">
      <Navbar />
      
      <main>
        <h1 className="sr-only">Que pinta Salta - Agenda de Eventos, Peñas y Boliches en Salta Capital</h1>
        {!hasFilters && carouselEvents.length > 0 && (
          <HeroCarousel 
            events={carouselEvents} 
          />
        )}

        <FiltersBar 
          categories={sortedCategories} 
          filters={{
            search,
            date,
            category,
            establishment,
            location,
            dateExact,
            instagram,
          }}
          onFilterChange={(updates) => {
            if (updates.search !== undefined) setSearch(updates.search)
            if (updates.date !== undefined) setDate(updates.date)
            if (updates.category !== undefined) setCategory(updates.category)
            if (updates.establishment !== undefined) setEstablishment(updates.establishment)
            if (updates.location !== undefined) setLocation(updates.location)
            if (updates.dateExact !== undefined) setDateExact(updates.dateExact)
            if (updates.instagram !== undefined) setInstagram(updates.instagram)
          }}
        />


        {showCategoryRows && (
          <div className="py-8 space-y-10">
            {eventsByCategory.map(({ category: catSlug, title, events }, index) => (
              <motion.div
                key={catSlug}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="space-y-6"
              >
                <CategoryRow
                  category={catSlug}
                  title={title}
                  events={events}
                  userFavorites={userFavorites}
                  onOpenMovie={setSelectedMovie}
                  onSeeAll={setCategory}
                />
                
                {/* 1. Banner de Radar después de la segunda categoría */}
                {index === 1 && !hasFilters && (
                  <div className="container mx-auto px-4 py-2">
                    <div className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col sm:flex-row justify-between items-center gap-4 shadow-lg">
                      <div className="space-y-1 text-center sm:text-left">
                        <h3 className="text-xl font-bold text-white">¡No te pierdas ningún evento!</h3>
                        <p className="text-sm text-zinc-400">
                          Elegí tus categorías favoritas y recibí la agenda del fin de semana directamente en tu correo.
                        </p>
                      </div>
                      <Button asChild className="bg-primary hover:bg-primary/95 text-primary-foreground font-bold px-6 py-4 rounded-xl shadow-md transition-transform duration-200 hover:scale-105 cursor-pointer">
                        <Link href="/radar" className="flex items-center gap-2">
                          Configurar mi Radar 📡
                        </Link>
                      </Button>
                    </div>
                  </div>
                )}

                {/* 2. Banner de Publicidad/Anunciar después de la cuarta categoría */}
                {index === 3 && !hasFilters && (
                  <div className="container mx-auto px-4 py-2">
                    <AdSenseBanner slot="home-middle-banner" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}

        {showFilteredGrid && (
          <div className="container mx-auto px-4 py-8">
            <h2 className="mb-6 text-2xl font-bold text-foreground">
              {filteredTitle} ({filteredEvents.length})
            </h2>
            <motion.div 
              layout
              className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 justify-items-center"
            >
              <AnimatePresence mode="popLayout">
                {filteredEvents.map(event => (
                  <motion.div
                    key={event.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.3 }}
                  >
                    <EventCard 
                      event={event} 
                      isFavorite={userFavorites.includes(event.id)}
                      onOpenMovie={setSelectedMovie}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          </div>
        )}

        {filteredEvents.length === 0 && hasFilters && (
          <div className="relative overflow-hidden">
            {/* Patrón de fondo de marca */}
            <div
              className="pointer-events-none absolute inset-0 bg-repeat opacity-[0.07] dark:opacity-[0.04] dark:invert dark:hue-rotate-180"
              style={{ backgroundImage: "url('/brand/patron-claro.png')", backgroundSize: "320px" }}
            />
            <div className="container mx-auto px-4 py-20 text-center relative">
              <p className="text-lg text-muted-foreground">
                No se encontraron eventos con los filtros seleccionados.
              </p>
              <button
                onClick={clearFilters}
                className="mt-4 text-primary hover:underline font-semibold"
              >
                Limpiar filtros
              </button>
            </div>
          </div>
        )}

        {filteredEvents.length === 0 && !hasFilters && (
          <div className="relative overflow-hidden min-h-[300px] flex items-center justify-center">
            {/* Patrón de fondo de marca */}
            <div
              className="pointer-events-none absolute inset-0 bg-repeat opacity-[0.07] dark:opacity-[0.04] dark:invert dark:hue-rotate-180"
              style={{ backgroundImage: "url('/brand/patron-claro.png')", backgroundSize: "320px" }}
            />
            <div className="container mx-auto px-4 py-16 text-center relative flex flex-col items-center gap-4">
              <Image
                src="/brand/logo-circular.png"
                alt="Que pinta Salta"
                width={80}
                height={80}
                className="opacity-30"
              />
              <p className="text-lg text-muted-foreground">
                No hay eventos disponibles en este momento.
              </p>
            </div>
          </div>
        )}
      </main>

      <MobileNav />



      {/* Modal para visualizar los horarios de la película */}
      {selectedMovie && (
        <MovieModal 
          movie={selectedMovie} 
          isFavorite={userFavorites.includes(selectedMovie.id)}
          onClose={() => setSelectedMovie(null)} 
        />
      )}
    </div>
  )
}
