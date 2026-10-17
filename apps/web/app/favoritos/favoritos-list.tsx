"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { ArrowLeft, Heart, MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EventCard } from "@/components/event-card"
import { MovieModal } from "@/components/movie-modal"
import { useDonation } from "@/components/donation-context"
import type { DisplayEvent } from "@/components/home-content"

// El agrupado ("Plan flexible" + por día) ya lo calcula `armarFavoritos`
// (packages/core/src/favoritos/armar.ts, compartida con la app): este
// componente solo recibe el resultado y lo pinta, sin volver a agrupar nada.
interface GrupoPorDia {
  dia: string
  items: DisplayEvent[]
}

interface FavoritosListProps {
  flexibles: DisplayEvent[]
  porDia: GrupoPorDia[]
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

export function FavoritosList({ flexibles, porDia }: FavoritosListProps) {
  const [selectedMovie, setSelectedMovie] = useState<DisplayEvent | null>(null)
  const { openDonationModal } = useDonation()

  // El total y la lista plana (para compartir) se derivan del resultado ya
  // armado por `armarFavoritos`: ni el orden ni el agrupado se recalculan acá.
  const { totalFavoritos, initialFavorites } = useMemo(() => {
    const datedItems = porDia.flatMap(grupo => grupo.items)
    return {
      totalFavoritos: flexibles.length + datedItems.length,
      initialFavorites: [...datedItems, ...flexibles],
    }
  }, [flexibles, porDia])

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

  if (totalFavoritos === 0) {
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
            Todavía no tenés favoritos
          </h2>
          <p className="mb-6 max-w-sm text-sm text-muted-foreground px-4">
            Explorá la cartelera de eventos, peñas, boliches o cines y tocá el corazón para guardarlos en tu agenda personal.
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
            Tenés {totalFavoritos} {totalFavoritos === 1 ? 'guardado' : 'guardados'}
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
      {flexibles.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-px bg-zinc-800 flex-1" />
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest px-2">
              Plan flexible / Sin fecha definida ({flexibles.length})
            </h3>
            <div className="h-px bg-zinc-800 flex-1" />
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {flexibles.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                isFavorite={true}
                onOpenMovie={setSelectedMovie}
                origin="favoritos"
                className="w-full sm:w-full max-w-[200px] mx-auto"
              />
            ))}
          </div>
        </div>
      )}

      {/* 2. Agenda Cronológica */}
      {porDia.map(({ dia, items }) => {
        return (
          <div key={dia} className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-px bg-primary/20 flex-1" />
              <h3 className="text-xs font-extrabold text-primary uppercase tracking-widest px-2 bg-primary/5 py-1 rounded-md border border-primary/10">
                {formatHeaderDate(dia)} ({items.length})
              </h3>
              <div className="h-px bg-primary/20 flex-1" />
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {items.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  isFavorite={true}
                  onOpenMovie={setSelectedMovie}
                  origin="favoritos"
                  className="w-full sm:w-full max-w-[200px] mx-auto"
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
