"use client"

import { useState, useMemo } from "react"
import { Event, EventCategory, categoryLabels } from "@/lib/types"
import { mockEvents } from "@/lib/events-data"
import { Navbar } from "@/components/navbar"
import { MobileNav } from "@/components/mobile-nav"
import { HeroCarousel } from "@/components/hero-carousel"
import { FiltersBar, DateFilter } from "@/components/filters-bar"
import { CategoryRow } from "@/components/category-row"
import { EventModal } from "@/components/event-modal"

export default function HomePage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedDate, setSelectedDate] = useState<DateFilter | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<EventCategory | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [favorites, setFavorites] = useState<string[]>([])

  const featuredEvents = useMemo(() => 
    mockEvents.filter(event => event.isFeatured),
    []
  )

  const filteredEvents = useMemo(() => {
    let events = mockEvents

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      events = events.filter(
        event => 
          event.title.toLowerCase().includes(query) ||
          event.venue.toLowerCase().includes(query)
      )
    }

    if (selectedDate) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      
      events = events.filter(event => {
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
      events = events.filter(event => event.category === selectedCategory)
    }

    return events
  }, [searchQuery, selectedDate, selectedCategory])

  const eventsByCategory = useMemo(() => {
    const categories = Object.keys(categoryLabels) as EventCategory[]
    return categories.map(category => ({
      category,
      title: categoryLabels[category],
      events: filteredEvents.filter(event => event.category === category)
    }))
  }, [filteredEvents])

  const handleToggleFavorite = (eventId: string) => {
    setFavorites(prev => 
      prev.includes(eventId)
        ? prev.filter(id => id !== eventId)
        : [...prev, eventId]
    )
  }

  const showCategoryRows = !selectedCategory && eventsByCategory.some(cat => cat.events.length > 0)
  const showFilteredGrid = selectedCategory && filteredEvents.length > 0

  return (
    <div className="min-h-screen bg-background pb-20 sm:pb-0">
      <Navbar />
      
      <main>
        {!searchQuery && !selectedDate && !selectedCategory && (
          <HeroCarousel 
            events={featuredEvents} 
            onSelectEvent={setSelectedEvent}
          />
        )}

        <FiltersBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
        />

        {showCategoryRows && (
          <div className="py-4">
            {eventsByCategory.map(({ category, title, events }) => (
              <CategoryRow
                key={category}
                category={category}
                title={title}
                events={events}
                onSelectEvent={setSelectedEvent}
                favorites={favorites}
                onToggleFavorite={handleToggleFavorite}
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
                <div key={event.id} className="flex justify-center">
                  <div 
                    className="group relative aspect-[2/3] w-full max-w-[200px] cursor-pointer overflow-hidden rounded-xl bg-card shadow-lg"
                    onClick={() => setSelectedEvent(event)}
                  >
                    <img
                      src={event.image}
                      alt={event.title}
                      className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
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
                </div>
              ))}
            </div>
          </div>
        )}

        {filteredEvents.length === 0 && (searchQuery || selectedDate || selectedCategory) && (
          <div className="container mx-auto px-4 py-16 text-center">
            <p className="text-lg text-muted-foreground">
              No se encontraron eventos con los filtros seleccionados.
            </p>
            <button
              onClick={() => {
                setSearchQuery("")
                setSelectedDate(null)
                setSelectedCategory(null)
              }}
              className="mt-4 text-primary hover:underline"
            >
              Limpiar filtros
            </button>
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
