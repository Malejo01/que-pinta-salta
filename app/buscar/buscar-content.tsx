"use client"

import { useDeferredValue, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Search } from "lucide-react"
import { categoryLabels } from "@/lib/types"
import type { EventCategory, Category, CinemaMovie } from "@/lib/types"
import type { FlyerWithAccount } from "@/lib/instagram-config"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Navbar } from "@/components/navbar"
import { MobileNav } from "@/components/mobile-nav"
import { EventCard } from "@/components/event-card"
import { EventModal } from "@/components/event-modal"
import { MovieModal } from "@/components/movie-modal"
import { getCategoryIcon } from "@/lib/category-icons"
import { transformEvent, type DisplayEvent } from "@/components/home-content"

function formatDateInSalta(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Salta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date)
}

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
    isInstagramFlyer: true,
    flyerId: flyer.id,
    instagramPostUrl: flyer.ig_post_url,
    instagramUsername: flyer.account.username,
  }
}

interface BuscarContentProps {
  events: any[] 
  categories: Category[]
  serverNowISO: string
  flyers: FlyerWithAccount[]
  cinemaMovies: CinemaMovie[]
  userFavorites: string[]
}

export function BuscarContent({
  events,
  categories,
  serverNowISO,
  flyers,
  cinemaMovies,
  userFavorites
}: BuscarContentProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedEvent, setSelectedEvent] = useState<DisplayEvent | null>(null)
  const [selectedMovie, setSelectedMovie] = useState<DisplayEvent | null>(null)
  const [favorites, setFavorites] = useState<string[]>(userFavorites)
  const deferredSearchQuery = useDeferredValue(searchQuery)

  const categoryNameBySlug = useMemo(() => {
    return new Map(categories.map((category) => [category.slug, category.name]))
  }, [categories])

  const allDisplayEvents = useMemo(() => {
    const eventItems = events
      .filter((event) => event.category)
      .map(transformEvent)
    
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

    const flyerItems = flyers.map((flyer) => transformFlyer(flyer, categoryNameBySlug))

    const movieItems = (cinemaMovies || []).map((movie): DisplayEvent => {
      const showCount = Object.keys(movie.showings || {}).length
      const saltaTodayStr = formatDateInSalta(new Date(serverNowISO))
      return {
        id: `movie-${movie.id}`,
        slug: movie.slug,
        title: movie.title,
        venue: `${showCount} ${showCount === 1 ? 'Cine' : 'Cines'} de Salta`,
        date: saltaTodayStr,
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
    
    return [...finalEventItems, ...flyerItems, ...movieItems]
  }, [events, flyers, cinemaMovies, categoryNameBySlug, serverNowISO])

  const filteredEvents = useMemo(() => {
    if (!deferredSearchQuery) return []
    const query = deferredSearchQuery.toLowerCase()
    return allDisplayEvents.filter(
      event => 
        event.title.toLowerCase().includes(query) ||
        event.venue.toLowerCase().includes(query) ||
        event.description.toLowerCase().includes(query)
    )
  }, [deferredSearchQuery, allDisplayEvents])

  const handleToggleFavorite = (eventId: string) => {
    setFavorites(prev => 
      prev.includes(eventId)
        ? prev.filter(id => id !== eventId)
        : [...prev, eventId]
    )
  }

  return (
    <div className="min-h-screen bg-background pb-20 sm:pb-0">
      <Navbar />
      
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Button variant="ghost" asChild className="mb-4">
            <Link href="/">
              <ArrowLeft className="mr-2 size-4" />
              Volver
            </Link>
          </Button>
          <h1 className="text-3xl font-bold text-foreground">Buscar eventos</h1>
        </div>

        <div className="relative mb-8">
          <Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar por evento, lugar o descripcion..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-12 pl-11 text-lg"
            autoFocus
          />
        </div>

        {!searchQuery && (
          <div>
            <h2 className="mb-4 text-lg font-semibold text-foreground">
              Explorar por categoria
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {categories.map((category) => {
                const Icon = getCategoryIcon(category.slug as any)
                const count = allDisplayEvents.filter(e => e.category === category.slug).length
                return (
                  <Link
                    key={category.slug}
                    href={`/?category=${category.slug}`}
                    className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted"
                  >
                    <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="size-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{category.name}</p>
                      <p className="text-sm text-muted-foreground">{count} eventos</p>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {searchQuery && filteredEvents.length > 0 && (
          <div>
            <p className="mb-4 text-muted-foreground">
              {filteredEvents.length} resultado{filteredEvents.length !== 1 && "s"} para &quot;{searchQuery}&quot;
            </p>
            <div className="flex flex-wrap gap-4">
              {filteredEvents.map(event => (
                <EventCard
                  key={event.id}
                  event={event}
                  isFavorite={favorites.includes(event.id)}
                  onToggleFavorite={handleToggleFavorite}
                  onOpenMovie={setSelectedMovie}
                />
              ))}
            </div>
          </div>
        )}

        {searchQuery && filteredEvents.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-lg text-muted-foreground">
              No se encontraron eventos para &quot;{searchQuery}&quot;
            </p>
          </div>
        )}
      </main>

      <EventModal
        event={selectedEvent}
        open={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
      
      {selectedMovie && (
        <MovieModal 
          movie={selectedMovie} 
          isFavorite={favorites.includes(selectedMovie.id)}
          onClose={() => setSelectedMovie(null)} 
        />
      )}

      <MobileNav />
    </div>
  )
}
