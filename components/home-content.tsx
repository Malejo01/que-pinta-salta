"use client"

import { useMemo } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Image from "next/image"
import type { Event, Category, Venue, EventCategory } from "@/lib/types"
import { categoryLabels } from "@/lib/types"
import { Navbar } from "@/components/navbar"
import { MobileNav } from "@/components/mobile-nav"
import { HeroCarousel } from "@/components/hero-carousel"
import { FiltersBar, DateFilter } from "@/components/filters-bar"
import { CategoryRow } from "@/components/category-row"
import Link from "next/link"
import { formatEventTime } from "@/lib/date-format"

type EventWithRelations = Event & { category: Category; venue: Venue | null }

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
    category: event.category.slug as EventCategory,
    price: event.is_free ? "gratis" as const : event.price_min,
    image: event.image_url || '/placeholder.svg?height=600&width=400',
    description: event.description || event.short_description || '',
    address: event.venue?.address || '',
    ticketUrl: event.ticket_url || undefined,
    noiseLevel: event.noise_level || 3,
    vibe: event.age_restriction >= 18 ? "adultos" as const : "familiar" as const,
    isFeatured: event.is_featured,
  }
}

export type DisplayEvent = ReturnType<typeof transformEvent>

interface HomeContentProps {
  events: EventWithRelations[]
  featuredEvents: EventWithRelations[]
  categories: Category[]
  serverNowISO: string
}

export function HomeContent({ events, featuredEvents, categories, serverNowISO }: HomeContentProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  
  const searchQuery = searchParams.get("search") || ""
  const selectedDate = searchParams.get("date") as DateFilter | null
  const selectedCategory = searchParams.get("category") as EventCategory | null

  const transformedFeatured = useMemo(() => 
    featuredEvents.map(transformEvent),
    [featuredEvents]
  )

  const filteredEvents = useMemo(() => {
    let filtered = events.map(transformEvent)

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        event => 
          event.title.toLowerCase().includes(query) ||
          event.venue.toLowerCase().includes(query)
      )
    }

    if (selectedDate) {
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
  }, [events, searchQuery, selectedDate, selectedCategory, serverNowISO])

  const eventsByCategory = useMemo(() => {
    const cats = categories.map(cat => ({
      category: cat.slug as EventCategory,
      title: cat.name,
      events: filteredEvents.filter(event => event.category === cat.slug)
    }))
    return cats
  }, [categories, filteredEvents])

  const clearFilters = () => {
    router.push("/", { scroll: false })
  }

  const hasFilters = searchQuery || selectedDate || selectedCategory
  const showCategoryRows = !selectedCategory && eventsByCategory.some(cat => cat.events.length > 0)
  const showFilteredGrid = selectedCategory && filteredEvents.length > 0

  return (
    <div className="min-h-screen bg-background pb-20 sm:pb-0">
      <Navbar />
      
      <main>
        {!hasFilters && transformedFeatured.length > 0 && (
          <HeroCarousel 
            events={transformedFeatured} 
          />
        )}

        <FiltersBar />

        {showCategoryRows && (
          <div className="py-4">
            {eventsByCategory.map(({ category, title, events }) => (
              <CategoryRow
                key={category}
                category={category}
                title={title}
                events={events}
              />
            ))}
          </div>
        )}

        {showFilteredGrid && (
          <div className="container mx-auto px-4 py-8">
            <h2 className="mb-6 text-2xl font-bold text-foreground">
              {categoryLabels[selectedCategory]} ({filteredEvents.length})
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
