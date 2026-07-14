"use client"

import { useDeferredValue, useMemo, useState, useEffect } from "react"
import Link from "next/link"
import { ArrowLeft, Search } from "lucide-react"
import { EventCategory, categoryLabels } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Navbar } from "@/components/navbar"
import { MobileNav } from "@/components/mobile-nav"
import { EventCard } from "@/components/event-card"
import { EventModal } from "@/components/event-modal"
import { getCategoryIcon } from "@/lib/category-icons"
import { createClient } from "@/lib/supabase/client"
import { transformEvent, type DisplayEvent } from "@/components/home-content"

const categories = Object.entries(categoryLabels) as [EventCategory, string][]

export function BuscarContent() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedEvent, setSelectedEvent] = useState<DisplayEvent | null>(null)
  const [favorites, setFavorites] = useState<string[]>([])
  const [events, setEvents] = useState<DisplayEvent[]>([])
  const [loading, setLoading] = useState(true)
  const deferredSearchQuery = useDeferredValue(searchQuery)

  useEffect(() => {
    const supabase = createClient()
    const nowIso = new Date().toISOString()
    
    async function loadEvents() {
      const { data, error } = await supabase
        .from('events')
        .select(`
          *,
          category:categories(*),
          venue:venues(*)
        `)
        .eq('status', 'PUBLISHED')
        .gte('start_date', nowIso)
        .order('start_date', { ascending: true })

      if (!error && data) {
        const validEvents = data.filter((e: any) => e.category)
        setEvents(validEvents.map(e => transformEvent(e as any)))
      }
      setLoading(false)
    }
    
    loadEvents()
  }, [])

  const filteredEvents = useMemo(() => {
    if (!deferredSearchQuery) return []
    const query = deferredSearchQuery.toLowerCase()
    return events.filter(
      event => 
        event.title.toLowerCase().includes(query) ||
        event.venue.toLowerCase().includes(query) ||
        event.description.toLowerCase().includes(query)
    )
  }, [deferredSearchQuery, events])

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
              {categories.map(([value, label]) => {
                const Icon = getCategoryIcon(value)
                const count = events.filter(e => e.category === value).length
                return (
                  <Link
                    key={value}
                    href={`/?category=${value}`}
                    className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted"
                  >
                    <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="size-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{label}</p>
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
      
      <MobileNav />
    </div>
  )
}
