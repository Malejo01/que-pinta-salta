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
import { formatEventTime } from "@/lib/date-format"
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

  return [...categories].sort((a, b) => {
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
}

// Transform database event to display format
export function transformEvent(event: EventWithRelations): DisplayEvent {
  const startDate = new Date(event.start_date)
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    venue: event.venue?.name || 'Lugar por confirmar',
    date: startDate.toISOString().split('T')[0],
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
    date: publishedDate.toISOString().split('T')[0],
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
}

export function HomeContent({
  events,
  categories,
  serverNowISO,
  favoriteCategorySlugs = [],
  flyers = [],
  cinemaMovies = [],
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

  const categoryNameBySlug = useMemo(() => {
    return new Map(categories.map((category) => [category.slug, category.name]))
  }, [categories])

  const allDisplayEvents = useMemo(() => {
    const eventItems = events
      .filter((event) => event.category)
      .map(transformEvent)
    
    // Transformar flyers de Instagram y mezclarlos con los eventos
    const flyerItems = flyers.map((flyer) => transformFlyer(flyer, categoryNameBySlug))

    // Transformar películas de cine y mezclarlas con los eventos
    const movieItems = (cinemaMovies || []).map((movie): DisplayEvent => {
      const showCount = Object.keys(movie.showings || {}).length
      return {
        id: `movie-${movie.id}`,
        slug: movie.slug,
        title: movie.title,
        venue: `${showCount} ${showCount === 1 ? 'Cine' : 'Cines'} de Salta`,
        date: new Date().toISOString().split('T')[0], // Se proyecta hoy
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
    
    return [...eventItems, ...flyerItems, ...movieItems]
  }, [events, flyers, cinemaMovies, categoryNameBySlug])

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
      const today = new Date(serverNowISO)
      today.setHours(0, 0, 0, 0)
      
      filtered = filtered.filter(event => {
        const eventDate = new Date(event.date)
        eventDate.setHours(0, 0, 0, 0)
        
        switch (date) {
          case "hoy":
            return eventDate.getTime() === today.getTime()
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

    return cats.sort((a, b) => {
      const countDiff = b.events.length - a.events.length
      if (countDiff !== 0) return countDiff

      return (categoryOrderIndex.get(a.category) ?? 0) - (categoryOrderIndex.get(b.category) ?? 0)
    })
  }, [sortedCategories, filteredEvents])

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
  const showCategoryRows = !hasFilters && eventsByCategory.some(cat => cat.events.length > 0)
  const showFilteredGrid = hasFilters && filteredEvents.length > 0
  const filteredTitle = category
    ? categoryNameBySlug.get(category) ?? category
    : "Resultados filtrados"

  return (
    <div className="min-h-screen bg-background pb-20 sm:pb-0">
      <Navbar />
      
      <main>
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
              <div key={catSlug} className="space-y-6">
                <CategoryRow
                  category={catSlug}
                  title={title}
                  events={events}
                  onOpenMovie={setSelectedMovie}
                />
                {index === 1 && (
                  <div className="container mx-auto px-4 py-2">
                    <AdSenseBanner slot="home-middle-banner" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {showFilteredGrid && (
          <div className="container mx-auto px-4 py-8">
            <h2 className="mb-6 text-2xl font-bold text-foreground">
              {filteredTitle} ({filteredEvents.length})
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 justify-items-center">
              {filteredEvents.map(event => (
                <EventCard 
                  key={event.id} 
                  event={event} 
                  onOpenMovie={setSelectedMovie}
                />
              ))}
            </div>
          </div>
        )}

        {filteredEvents.length === 0 && hasFilters && (
          <div className="container mx-auto px-4 py-16 text-center">
            <p className="text-lg text-muted-foreground">
              No se encontraron eventos con los filtros seleccionados.
            </p>
            <button
              onClick={clearFilters}
              className="mt-4 text-primary hover:underline"
            >
              Limpiar filtros
            </button>
          </div>
        )}

        {filteredEvents.length === 0 && !hasFilters && (
          <div className="container mx-auto px-4 py-16 text-center">
            <p className="text-lg text-muted-foreground">
              No hay eventos disponibles en este momento.
            </p>
          </div>
        )}
      </main>

      <MobileNav />

      {/* Modal para visualizar los horarios de la película */}
      {selectedMovie && (
        <MovieModal 
          movie={selectedMovie} 
          onClose={() => setSelectedMovie(null)} 
        />
      )}
    </div>
  )
}
