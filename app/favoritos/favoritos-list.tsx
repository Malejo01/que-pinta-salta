"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { ArrowLeft, Heart, MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EventCard } from "@/components/event-card"
import { MovieModal } from "@/components/movie-modal"
import { useDonation } from "@/components/donation-context"
import type { DisplayEvent } from "@/components/home-content"

interface FavoritosListProps {
  initialFavorites: DisplayEvent[]
}

// Formatea fechas locales como "Viernes 10 de Julio" para los encabezados de la agenda
function formatHeaderDate(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.split('-').map(Number)
    const dateObj = new Date(year, month - 1, day)
    
    const weekday = dateObj.toLocaleDateString("es-AR", { weekday: "long" })
    const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1)
    
    const dayNum = dateObj.getDate()
    const monthName = dateObj.toLocaleDateString("es-AR", { month: "long" })
    
    return `${capitalizedWeekday} ${dayNum} de ${monthName}`
  } catch (e) {
    return dateStr
  }
}

export function FavoritosList({ initialFavorites }: FavoritosListProps) {
  const [selectedMovie, setSelectedMovie] = useState<DisplayEvent | null>(null)
  const { openDonationModal } = useDonation()

  // Agrupamiento y ordenamiento de favoritos
  const { flexible, datedGroups, sortedDates } = useMemo(() => {
    const flexible: DisplayEvent[] = []
    const datedGroups: Record<string, DisplayEvent[]> = {}

    initialFavorites.forEach(item => {
      // Películas y flyers se consideran planes flexibles sin una fecha estricta fija
      if (item.isCinemaMovie || item.isInstagramFlyer) {
        flexible.push(item)
      } else {
        const dateStr = item.date // YYYY-MM-DD
        if (!datedGroups[dateStr]) {
          datedGroups[dateStr] = []
        }
        datedGroups[dateStr].push(item)
      }
    })

    // Ordenar fechas cronológicamente
    const sortedDates = Object.keys(datedGroups).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    )

    return { flexible, datedGroups, sortedDates }
  }, [initialFavorites])

  // Lógica para compilar y compartir la agenda por WhatsApp con enlaces a cada evento
  const handleShareWhatsApp = () => {
    const datedEvents = initialFavorites.filter(item => !item.isCinemaMovie && !item.isInstagramFlyer)
    const movies = initialFavorites.filter(item => item.isCinemaMovie)
    const flyers = initialFavorites.filter(item => item.isInstagramFlyer)

    let message = "¡Che! Este es mi plan para el finde en Salta:\n\n"

    if (datedEvents.length > 0) {
      message += "📅 *Eventos:*\n"
      datedEvents.forEach(item => {
        const [_, m, d] = item.date.split('-')
        const url = `${window.location.origin}/evento/${item.id}`
        message += `- *${item.title}* (${d}/${m} en ${item.venue})\n  🔗 ${url}\n`
      })
      message += "\n"
    }

    if (movies.length > 0) {
      message += "🎬 *Cine:*\n"
      movies.forEach(item => {
        const url = `${window.location.origin}/cines`
        message += `- *${item.title}*\n  🔗 ${url}\n`
      })
      message += "\n"
    }

    if (flyers.length > 0) {
      message += "🍻 *Boliches / Salidas:*\n"
      flyers.forEach(item => {
        const url = `${window.location.origin}/flyer/${item.flyerId}`
        message += `- *${item.title}* (en ${item.venue})\n  🔗 ${url}\n`
      })
      message += "\n"
    }

    message += "Organizá tu salida en quepintasalta.com.ar 🎸"

    const encodedText = encodeURIComponent(message)
    const url = `https://api.whatsapp.com/send?text=${encodedText}`
    window.open(url, "_blank")
    
    // Mostramos el modal de donación luego de compartir
    setTimeout(() => {
      openDonationModal("¡Gracias por compartir tu agenda! ¿Nos invitás un cafecito para fondear el desarrollo de la App móvil oficial?")
    }, 800)
  }

  if (initialFavorites.length === 0) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <Button variant="ghost" asChild className="mb-4">
            <Link href="/">
              <ArrowLeft className="mr-2 size-4" />
              Volver
            </Link>
          </Button>
          <h1 className="text-3xl font-bold text-foreground">Mis Favoritos</h1>
          <p className="mt-2 text-muted-foreground">
            Los eventos que guardaste para ver después
          </p>
        </div>

        <div className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/10 backdrop-blur-xs">
          <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-muted/40">
            <Heart className="size-8 text-muted-foreground" />
          </div>
          <h2 className="mb-2 text-xl font-semibold text-foreground">
            No tienes favoritos aún
          </h2>
          <p className="mb-6 max-w-sm text-sm text-muted-foreground px-4">
            Explora la cartelera de eventos, peñas, boliches o cines y toca el corazón para guardarlos en tu agenda personal.
          </p>
          <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold">
            <Link href="/">Explorar eventos</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Encabezado y botón viral */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-850 pb-6">
        <div>
          <Button variant="ghost" asChild className="mb-2 px-0 hover:bg-transparent text-muted-foreground hover:text-foreground">
            <Link href="/">
              <ArrowLeft className="mr-1.5 size-4" />
              Volver al inicio
            </Link>
          </Button>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Mi Agenda de Eventos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tienes {initialFavorites.length} {initialFavorites.length === 1 ? 'elemento guardado' : 'elementos guardados'} organizados para tu salida.
          </p>
        </div>

        <Button
          onClick={handleShareWhatsApp}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl shadow-md transition-all self-start sm:self-auto cursor-pointer"
        >
          <MessageCircle className="size-5 fill-white/10" />
          Compartir agenda por WhatsApp
        </Button>
      </div>

      {/* 1. Planes Flexibles / Sin fecha definida */}
      {flexible.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-px bg-zinc-800 flex-1" />
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest px-2">
              Plan flexible / Sin fecha definida ({flexible.length})
            </h3>
            <div className="h-px bg-zinc-800 flex-1" />
          </div>
          
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 justify-items-center">
            {flexible.map((event) => (
              <EventCard 
                key={event.id} 
                event={event} 
                isFavorite={true}
                onOpenMovie={setSelectedMovie}
              />
            ))}
          </div>
        </div>
      )}

      {/* 2. Agenda Cronológica */}
      {sortedDates.map((dateStr) => {
        const events = datedGroups[dateStr]
        return (
          <div key={dateStr} className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-px bg-primary/20 flex-1" />
              <h3 className="text-xs font-extrabold text-primary uppercase tracking-widest px-2 bg-primary/5 py-1 rounded-md border border-primary/10">
                {formatHeaderDate(dateStr)} ({events.length})
              </h3>
              <div className="h-px bg-primary/20 flex-1" />
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 justify-items-center">
              {events.map((event) => (
                <EventCard 
                  key={event.id} 
                  event={event} 
                  isFavorite={true}
                  onOpenMovie={setSelectedMovie}
                />
              ))}
            </div>
          </div>
        )
      })}

      {/* Modal para visualizar los horarios de las películas de cine */}
      {selectedMovie && (
        <MovieModal 
          movie={selectedMovie} 
          isFavorite={true}
          onClose={() => setSelectedMovie(null)} 
        />
      )}
    </div>
  )
}
