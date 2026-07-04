"use client"

import { useMemo } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Image from "next/image"
import type { Event, Category, Venue } from "@/lib/types"
import type { FlyerWithAccount } from "@/lib/instagram-config"
import { Navbar } from "@/components/navbar"
import { MobileNav } from "@/components/mobile-nav"
import { HeroCarousel } from "@/components/hero-carousel"
import { FiltersBar, DateFilter } from "@/components/filters-bar"
import { CategoryRow } from "@/components/category-row"
import { FlyerGrid } from "@/components/flyer-grid"
import Link from "next/link"
import { formatEventTime } from "@/lib/date-format"
import { AdSenseBanner } from "@/components/adsense-banner"

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

// Transform database event to display format
export function transformEvent(event: EventWithRelations) {
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

export type DisplayEvent = ReturnType<typeof transformEvent>

interface HomeContentProps {
  events: EventWithRelations[]
  categories: Category[]
  serverNowISO: string
  favoriteCategorySlugs?: string[]
  flyers?: FlyerWithAccount[]
}

export function HomeContent({
  events,
  categories,
  serverNowISO,
  favoriteCategorySlugs = [],
  flyers = [],
}: HomeContentProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  
  const searchQuery = searchParams.get("search") || ""
  const selectedDate = searchParams.get("date") as DateFilter | null
  const selectedCategory = searchParams.get("category")
  const selectedEstablishment = searchParams.get("establishment") || ""
  const selectedLocation = searchParams.get("location") || ""
  const selectedExactDate = searchParams.get("dateExact")

  const categoryNameBySlug = useMemo(() => {
    return new Map(categories.map((category) => [category.slug, category.name]))
  }, [categories])

  const allDisplayEvents = useMemo(() => {
    return events
      .filter((event) => event.category)
      .map(transformEvent)
  }, [events])

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

    if (searchQuery) {
      const query = normalizeFilterText(searchQuery)
      filtered = filtered.filter(
        event => 
          normalizeFilterText(event.title).includes(query) ||
          normalizeFilterText(event.venue).includes(query)
      )
    }

    if (selectedEstablishment) {
      const query = normalizeFilterText(selectedEstablishment)
      filtered = filtered.filter((event) => normalizeFilterText(event.venue).includes(query))
    }

    if (selectedLocation) {
      const query = normalizeFilterText(selectedLocation)
      filtered = filtered.filter((event) => normalizeFilterText(event.address).includes(query))
    }

    if (selectedExactDate) {
      filtered = filtered.filter((event) => event.date === selectedExactDate)
    } else if (selectedDate) {
      const today = new Date(serverNowISO)
      today.setHours(0, 0, 0, 0)
      
      filtered = filtered.filter(event => {
        const eventDate = new Date(event.date)
        eventDate.setHours(0, 0, 0, 0)
        
        switch (selectedDate) {
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

    if (selectedCategory) {
      filtered = filtered.filter(event => event.category === selectedCategory)
    }

    return filtered
  }, [
    allDisplayEvents,
    searchQuery,
    selectedEstablishment,
    selectedLocation,
    selectedExactDate,
    selectedDate,
    selectedCategory,
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
    router.push("/", { scroll: false })
  }

  const hasFilters = Boolean(
    searchQuery ||
    selectedDate ||
    selectedExactDate ||
    selectedCategory ||
    selectedEstablishment ||
    selectedLocation
  )
  const showCategoryRows = !hasFilters && eventsByCategory.some(cat => cat.events.length > 0)
  const showFilteredGrid = hasFilters && filteredEvents.length > 0
  const filteredTitle = selectedCategory
    ? categoryNameBySlug.get(selectedCategory) ?? selectedCategory
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

        <FiltersBar categories={sortedCategories} />

        {/* Sección Instagram - Pinta Jodita 🍻 */}
        {!hasFilters && flyers.length > 0 && (
          <FlyerGrid flyers={flyers} />
        )}

        {showCategoryRows && (
          <div className="py-8 space-y-10">
            {eventsByCategory.map(({ category, title, events }, index) => (
              <div key={category} className="space-y-6">
                <CategoryRow
                  category={category}
                  title={title}
                  events={events}
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
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {filteredEvents.map(event => (
                <Link 
                  key={event.id} 
                  href={`/evento/${event.id}`}
                  className="flex justify-center"
                >
                  <div 
                    className="group relative aspect-[2/3] w-full max-w-[200px] cursor-pointer overflow-hidden rounded-xl bg-card shadow-lg"
                  >
                    <Image
                      src={event.image}
                      alt={event.title}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 200px"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                      <h3 className="mb-1 line-clamp-2 text-sm font-semibold leading-tight">
                        {event.title}
                      </h3>
                      <p className="line-clamp-1 text-xs text-white/80">{event.venue}</p>
                      <p className="mt-1 text-sm font-bold">
                        {event.price === "gratis" 
                          ? "Gratis" 
                          : event.price === "confirmar"
                          ? "Precio a confirmar"
                          : `$${event.price.toLocaleString("es-AR")}`}
                      </p>
                    </div>
                  </div>
                </Link>
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
    </div>
  )
}
