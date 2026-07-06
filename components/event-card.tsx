"use client"

import Image from "next/image"
import Link from "next/link"
import { motion } from "framer-motion"
import { Calendar, MapPin, Instagram, Film, Share2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatEventDateShort } from "@/lib/date-format"
import { FavoriteButton } from "@/components/favorite-button"
import type { DisplayEvent } from "@/components/home-content"

interface EventCardProps {
  event: DisplayEvent
  isFavorite?: boolean
  onToggleFavorite?: (eventId: string) => void
  onOpenMovie?: (movie: DisplayEvent) => void
}

export function EventCard({ event, isFavorite, onToggleFavorite, onOpenMovie }: EventCardProps) {
  const formattedDate = formatEventDateShort(event.date)

  const formattedPrice = event.price === "gratis" 
    ? "Gratis" 
    : event.price === "confirmar"
    ? null
    : `$${event.price.toLocaleString("es-AR")}`

  const linkHref = event.isInstagramFlyer && event.flyerId
    ? `/flyer/${event.flyerId}`
    : `/evento/${event.id}`

  const handleClick = (e: React.MouseEvent) => {
    if (event.isCinemaMovie && onOpenMovie) {
      e.preventDefault()
      e.stopPropagation()
      onOpenMovie(event)
    }
  }

  const handleShareClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const currentOrigin = typeof window !== "undefined" ? window.location.origin : "https://quepintasalta.com.ar"
    let message = ""

    if (event.isCinemaMovie) {
      message = `¡Che! Mirá esta película en Salta: *${event.title}* 🎬\n🔗 ${currentOrigin}/cines`
    } else if (event.isInstagramFlyer) {
      message = `¡Che! Mirá este flyer en Salta: *${event.title}* (en ${event.venue}) 🍻\n🔗 ${currentOrigin}/flyer/${event.flyerId}`
    } else {
      const formattedOccDate = formatEventDateShort(event.date)
      message = `¡Che! Mirá este evento en Salta: *${event.title}* (${formattedOccDate} en ${event.venue}) 📅\n🔗 ${currentOrigin}/evento/${event.id}`
    }

    const encodedText = encodeURIComponent(message)
    const url = `https://api.whatsapp.com/send?text=${encodedText}`
    window.open(url, "_blank")
  }

  return (
    <Link href={event.isCinemaMovie ? "#" : linkHref} onClick={handleClick}>
      <motion.div
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.98 }}
        className={cn(
          "group/card relative aspect-[2/3] w-[180px] shrink-0 cursor-pointer overflow-hidden rounded-xl bg-card shadow-lg sm:w-[200px] transition-all",
          event.isFeatured && "ring-1 ring-amber-500/50 hover:ring-amber-500"
        )}
      >
        <Image
          src={event.image}
          alt={event.title}
          fill
          className="object-cover transition-transform duration-300 group-hover/card:scale-105"
        />

        {/* Hover overlay con horarios de cine */}
        {event.isCinemaMovie && event.showings && (
          <div className="absolute inset-0 bg-black/95 p-3 opacity-0 group-hover/card:opacity-100 transition-all duration-300 flex flex-col justify-between z-20 text-white overflow-y-auto scrollbar-hide">
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-primary border-b border-primary/20 pb-1 flex items-center gap-1.5">
                <Film className="size-3.5" />
                Funciones Hoy
              </h4>
              <div className="space-y-2">
                {Object.entries(event.showings).map(([cinemaKey, details]: [string, any]) => (
                  <div key={cinemaKey} className="space-y-0.5">
                    <p className="text-[10px] font-bold text-zinc-300 truncate">
                      {details.name}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {details.formats.flatMap((f: any) => f.times).slice(0, 5).map((time: string, tIdx: number) => (
                        <span 
                          key={tIdx} 
                          className="bg-zinc-800 text-zinc-200 text-[9px] px-1 py-0.5 rounded border border-zinc-700/30"
                        >
                          {time}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-[9px] text-zinc-400 text-center italic mt-2 border-t border-zinc-800/80 pt-1">
              Click para ver horarios y comprar
            </p>
          </div>
        )}

        {/* Hover overlay para eventos con múltiples fechas/horarios */}
        {!event.isCinemaMovie && event.occurrences && event.occurrences.length > 1 && (
          <div className="absolute inset-0 bg-black/95 p-3 opacity-0 group-hover/card:opacity-100 transition-all duration-300 flex flex-col justify-between z-20 text-white overflow-y-auto scrollbar-hide">
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-primary border-b border-primary/20 pb-1 flex items-center gap-1.5">
                <Calendar className="size-3.5" />
                Próximas Funciones
              </h4>
              <div className="space-y-1.5 max-h-[120px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
                {event.occurrences.map((occ, idx) => {
                  const dateObj = new Date(occ.date + 'T00:00:00')
                  const formattedOccDate = dateObj.toLocaleDateString("es-AR", {
                    day: "numeric",
                    month: "short"
                  })
                  return (
                    <div key={idx} className="flex justify-between items-center text-[10px] py-1 border-b border-zinc-800/40 last:border-none">
                      <span className="font-medium text-zinc-200">
                        {formattedOccDate}
                      </span>
                      <span className="bg-zinc-850 text-zinc-300 border border-zinc-700/20 px-1 py-0.5 rounded text-[9px] font-semibold">
                        {occ.time || "Sin hora"}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
            <p className="text-[9px] text-zinc-400 text-center italic mt-2 border-t border-zinc-800/80 pt-1">
              Click para ver detalles
            </p>
          </div>
        )}
        
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
        
        <FavoriteButton 
          itemId={event.id}
          type={event.isCinemaMovie ? 'cinema' : (event.isInstagramFlyer ? 'flyer' : 'event')}
          initialIsFavorite={!!isFavorite}
          className="absolute right-2 top-2 z-30"
        />

        <button
          onClick={handleShareClick}
          className="absolute right-11 top-2 z-30 flex size-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md transition-all hover:scale-110 active:scale-95 cursor-pointer"
          title="Compartir en WhatsApp"
        >
          <Share2 className="size-4 hover:text-emerald-400 text-zinc-100" />
        </button>

        <Badge 
          variant="secondary" 
          className="absolute left-2 top-2 bg-primary text-primary-foreground"
        >
          {event.categoryName}
        </Badge>

        {event.isInstagramFlyer && (
          <div className="absolute right-2 top-12 flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 backdrop-blur-sm z-30">
            <Instagram className="size-3 text-pink-400" />
          </div>
        )}

        {event.isFeatured && (
          <Badge 
            className="absolute left-2 top-8 bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-bold flex items-center gap-0.5 shadow-md border-none text-[10px] py-0 px-1.5"
          >
            ★ Destacado
          </Badge>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
          <h3 className="mb-1 line-clamp-2 text-sm font-semibold leading-tight">
            {event.title}
          </h3>
          
          <div className="mb-2 flex items-center gap-1 text-xs text-white/80">
            <MapPin className="size-3" />
            <span className="line-clamp-1">{event.venue}</span>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-xs text-white/80">
              <Calendar className="size-3" />
              <span>{formattedDate}</span>
              <span className="ml-1">{event.time}</span>
            </div>
          </div>
          
          {formattedPrice && (
            <div className="mt-2 flex items-center justify-between">
              <span className={cn(
                "text-sm font-bold",
                event.price === "gratis" ? "text-green-400" : "text-white"
              )}>
                {formattedPrice}
              </span>
            </div>
          )}
        </div>
      </motion.div>
    </Link>
  )
}
