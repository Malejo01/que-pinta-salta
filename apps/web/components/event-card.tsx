"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { Calendar, MapPin, Instagram, Film } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { InsigniaDestacado } from "@/components/insignia-destacado"
import { cn } from "@/lib/utils"
import { formatEventDateShort } from "@/lib/date-format"
import { FavoriteButton } from "@/components/favorite-button"
import { ShareButton } from "@/components/share-button"
import { FlyerImage } from "@/components/flyer-image"
import { useDonation } from "@/components/donation-context"
import type { DisplayEvent } from "@/components/home-content"
import { eventHref, type MetricOrigin } from "@/lib/metricas/links"
import { summarizeOccurrences } from "@/lib/events/occurrences-summary"
import type { MovieShowings } from "@/lib/types"

interface EventCardProps {
  event: DisplayEvent
  isFavorite?: boolean
  /** El corazón confirmó un cambio (QPS-158): el padre sincroniza su lista de favoritos. */
  onToggleFavorite?: (eventId: string, favorited: boolean) => void
  onOpenMovie?: (movie: DisplayEvent) => void
  className?: string
  /** Desde dónde se llegó al evento; viaja como `?o=` para medir vistas. */
  origin?: MetricOrigin
}

export function EventCard({ event, isFavorite, onToggleFavorite, onOpenMovie, className, origin }: EventCardProps) {
  const [imgSrc, setImgSrc] = useState<string>(event.image || "/placeholder.jpg")
  const [failedImage, setFailedImage] = useState<string | null>(null)
  const { openDonationModal } = useDonation()

  useEffect(() => {
    setImgSrc(event.image || "/placeholder.jpg")
  }, [event.image])

  // Eventos sin flyer (o con imagen rota): fallback de marca en vez del placeholder.
  // Flyers de Instagram y películas conservan su comportamiento.
  const showBrandFallback =
    !event.isInstagramFlyer &&
    !event.isCinemaMovie &&
    (failedImage === event.image || !event.image || event.image.startsWith("/placeholder"))

  const formattedDate = formatEventDateShort(event.date)

  const formattedPrice = event.price === "gratis" 
    ? "Gratis" 
    : event.price === "confirmar"
    ? null
    : `$${event.price.toLocaleString("es-AR")}`

  const linkHref = event.isInstagramFlyer && event.flyerId
    ? `/flyer/${event.flyerId}`
    : eventHref(event.id, origin)

  // Pie de card siempre visible para eventos con varias funciones (QPS-024);
  // el cine tiene su propio overlay de horarios y no usa esta línea.
  //
  // `new Date()` en el render da un instante distinto en el servidor (momento
  // del pedido) y en el cliente (momento de la hidratación), así que el texto
  // puede diferir si una función queda en el medio. El `<p>` de abajo lleva
  // `suppressHydrationWarning`: lo único que cambia es su texto, nunca si el
  // elemento existe o no (`summarizeOccurrences` devuelve null solo cuando hay
  // una sola ocurrencia, y eso es igual en los dos lados).
  const hasSeveralOccurrences =
    !event.isCinemaMovie && !!event.occurrences && event.occurrences.length > 1
  const occurrencesSummary = hasSeveralOccurrences
    ? summarizeOccurrences(event.occurrences!, new Date())
    : null

  const handleClick = (e: React.MouseEvent) => {
    if (event.isCinemaMovie && onOpenMovie) {
      e.preventDefault()
      e.stopPropagation()
      onOpenMovie(event)
    }
  }

  // QPS-159: un solo mecanismo de compartir (Web Share API / portapapeles en
  // `ShareButton`), ya no un link de WhatsApp armado a mano. El id de
  // `DisplayEvent` no siempre es el uuid de `events` (`movie-…`, `ig-…`), así
  // que acá sí armamos la URL según el tipo — lo que cambió es cómo se
  // comparte (`shareEvent`), no la URL de destino.
  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "https://quepintasalta.com.ar"
  const shareUrl = event.isCinemaMovie
    ? `${currentOrigin}/cines`
    : event.isInstagramFlyer && event.flyerId
    ? `${currentOrigin}/flyer/${event.flyerId}`
    : `${currentOrigin}${eventHref(event.id)}`

  // Se mantiene el modal de donación de hoy, pero solo si se compartió de
  // verdad o se copió el link (ver `ShareButton`/`shareEvent`), no si se
  // canceló el diálogo nativo.
  const handleShared = () => {
    setTimeout(() => {
      openDonationModal("¡Gracias por compartir! Si Qué Pinta Salta te ayuda a organizar tu finde, ¿nos invitás un cafecito para fondear el desarrollo de la App móvil oficial?")
    }, 800)
  }

  return (
    <Link href={event.isCinemaMovie ? "#" : linkHref} onClick={handleClick}>
      <motion.div
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.98 }}
        className={cn(
          "group/card relative aspect-[2/3] w-[180px] shrink-0 cursor-pointer overflow-hidden rounded-xl bg-card shadow-lg hover:shadow-2xl hover:shadow-primary/10 sm:w-[200px] transition-all duration-300",
          event.isFeatured && "ring-1 ring-amber-500/50 hover:ring-amber-500",
          className
        )}
      >
        {showBrandFallback ? (
          <div
            aria-hidden
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-primary px-4 text-center text-primary-foreground"
          >
            <span className="text-5xl font-extrabold leading-none opacity-90">
              {(event.categoryName || "Q").charAt(0).toUpperCase()}
            </span>
            <span className="text-xs font-bold uppercase tracking-wider opacity-80">
              Qué Pinta Salta
            </span>
          </div>
        ) : (
          <FlyerImage
            variant={400}
            src={imgSrc}
            alt={event.title}
            fill
            className="object-cover transition-transform duration-300 group-hover/card:scale-105"
            onError={() => {
              if (event.isInstagramFlyer || event.isCinemaMovie) {
                setImgSrc("/placeholder.jpg")
              } else {
                setFailedImage(event.image)
              }
            }}
          />
        )}

        {/* Hover overlay con horarios de cine */}
        {event.isCinemaMovie && event.showings && (
          <div className="absolute inset-0 bg-black/95 p-3 opacity-0 group-hover/card:opacity-100 transition-all duration-300 flex flex-col justify-between z-20 text-white overflow-y-auto scrollbar-hide">
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-primary border-b border-primary/20 pb-1 flex items-center gap-1.5">
                <Film className="size-3.5" />
                Funciones Hoy
              </h4>
              <div className="space-y-2">
                {Object.entries(event.showings as MovieShowings).map(([cinemaKey, details]) => (
                  <div key={cinemaKey} className="space-y-0.5">
                    <p className="text-[10px] font-bold text-zinc-300 truncate">
                      {details.name}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {details.formats.flatMap((f) => f.times).slice(0, 5).map((time: string, tIdx: number) => (
                        <span 
                          key={tIdx} 
                          className="bg-zinc-800 text-zinc-200 text-[11px] px-1 py-0.5 rounded border border-zinc-700/30"
                        >
                          {time}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-zinc-400 text-center italic mt-2 border-t border-zinc-800/80 pt-1">
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
                      <span className="bg-zinc-850 text-zinc-300 border border-zinc-700/20 px-1 py-0.5 rounded text-[11px] font-semibold">
                        {occ.time || "Sin hora"}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
            <p className="text-[11px] text-zinc-400 text-center italic mt-2 border-t border-zinc-800/80 pt-1">
              Click para ver detalles
            </p>
          </div>
        )}
        
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
        
        <FavoriteButton 
          itemId={event.id}
          type={event.isCinemaMovie ? 'cinema' : (event.isInstagramFlyer ? 'flyer' : 'event')}
          initialIsFavorite={!!isFavorite}
          onChange={onToggleFavorite ? (favorited) => onToggleFavorite(event.id, favorited) : undefined}
          className="absolute right-2 top-2 z-30 sm:opacity-0 sm:group-hover/card:opacity-100 transition-all duration-350"
        />

        <ShareButton
          eventId={event.id}
          title={event.title}
          url={shareUrl}
          onShared={handleShared}
          className="absolute right-12 top-2 z-30 sm:opacity-0 sm:group-hover/card:opacity-100 duration-350"
        />

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

        <InsigniaDestacado visible={event.isFeatured} className="absolute left-2 top-8" />

        <div className="absolute bottom-0 left-0 right-0 p-3 text-white transition-all duration-300 group-hover/card:-translate-y-1">
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
              {event.time && <span className="ml-1">{event.time}</span>}
            </div>
          </div>

          {/* "+3 fechas · 12 oct 21:00" (~24 caracteres) entra en un renglón a 11 px
              en una card de 180 px. `line-clamp-1` lo acota ahí: si alguna vez el
              formato crece, se corta en lugar de empujar el precio fuera de la card. */}
          {occurrencesSummary && (
            <p
              suppressHydrationWarning
              className="mt-1 line-clamp-1 text-[11px] leading-snug text-white/70"
            >
              {occurrencesSummary}
            </p>
          )}

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
