"use client"

import { createElement } from "react"
import { Calendar, MapPin, Clock, Users, ExternalLink, Navigation } from "lucide-react"
import { vibeLabels, EventCategory } from "@/lib/types"

// Display event type (transformed from database)
interface DisplayEvent {
  id: string
  title: string
  venue: string
  date: string
  time: string
  category: string
  /** Nombre de la categoría (categories.name); si falta se muestra el slug. */
  categoryName?: string
  price: number | "gratis" | "confirmar"
  image: string
  description: string
  address: string
  ticketUrl?: string
  isFeatured?: boolean
  vibe?: string | null
  /** Estado del evento: gate de "Voy / Me interesa". Flyers y películas no lo tienen. */
  status?: string
}

type Event = DisplayEvent
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getCategoryIcon } from "@/lib/category-icons"
import { formatEventDate } from "@/lib/date-format"
import { capitalizeFirst, cleanDescription } from "@/lib/event-display"
import { ViewBeacon } from "@/components/view-beacon"
import { goHref, urlComoLlegar, type MetricOrigin } from "@/lib/metricas/links"
import { FlyerImage } from "@/components/flyer-image"
import { FavoriteButton } from "@/components/favorite-button"
import { BotonesAsistenciaDiferidos } from "@/components/botones-asistencia-diferidos"

interface EventModalProps {
  event: Event | null
  open: boolean
  onClose: () => void
  /** Desde dónde se abrió el modal, para medir la vista. */
  origin?: MetricOrigin
  /** Si el evento ya es favorito del usuario (lista traída una sola vez por /buscar). */
  isFavorite?: boolean
  /** El corazón del modal confirmó un cambio (QPS-158): /buscar actualiza la tarjeta de abajo. */
  onFavoriteChange?: (eventId: string, favorited: boolean) => void
  /** Si hay sesión (la lee /buscar en el servidor): para "Voy / Me interesa". */
  haySesion?: boolean
}

export function EventModal({ event, open, onClose, origin = "directo", isFavorite = false, onFavoriteChange, haySesion = false }: EventModalProps) {
  if (!event) return null

  const formattedDate = formatEventDate(event.date, true)
  const description = cleanDescription(event.description)

  // La misma URL que la ficha (QPS-130); null sin dirección ni lugar: no hay botón (QPS-137).
  const googleMapsUrl = urlComoLlegar({ address: event.address, venue: event.venue })
  const iconComponent = getCategoryIcon(event.category as EventCategory)

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto p-0">
        <ViewBeacon eventId={event.id} origin={origin} />
        <div className="relative aspect-[3/2] w-full">
          <FlyerImage
            variant={800}
            src={event.image}
            alt={event.title}
            fill
            className="object-cover"
          />
          <Badge className="absolute left-4 top-4 bg-primary text-primary-foreground">
            {createElement(iconComponent, { className: "mr-1 size-3" })}
            {event.categoryName || event.category}
          </Badge>
        </div>

        <div className="p-6">
          <DialogHeader className="mb-4">
            <div className="flex items-start justify-between gap-4">
              <DialogTitle className="text-2xl flex-1">{event.title}</DialogTitle>
              <FavoriteButton
                itemId={event.id}
                type="event"
                initialIsFavorite={isFavorite}
                onChange={onFavoriteChange ? (favorited) => onFavoriteChange(event.id, favorited) : undefined}
                className="size-10 flex-shrink-0 bg-muted/40 hover:bg-muted text-foreground"
              />
            </div>
          </DialogHeader>

          <div className="mb-6 space-y-3">
            <div className="flex items-center gap-3 text-muted-foreground">
              <Calendar className="size-5 text-primary" />
              <span>{capitalizeFirst(formattedDate)}</span>
            </div>
            
            {event.time && (
              <div className="flex items-center gap-3 text-muted-foreground">
                <Clock className="size-5 text-primary" />
                <span>{event.time} hs</span>
              </div>
            )}
            
            <div className="flex items-center gap-3 text-muted-foreground">
              <MapPin className="size-5 text-primary" />
              <div>
                <p className="font-medium text-foreground">{event.venue}</p>
                <p className="text-sm">{event.address}</p>
              </div>
            </div>

            {event.vibe && vibeLabels[event.vibe as keyof typeof vibeLabels] && (
              <div className="flex items-center gap-3 text-muted-foreground">
                <Users className="size-5 text-primary" />
                <span>{vibeLabels[event.vibe as keyof typeof vibeLabels]}</span>
              </div>
            )}
          </div>

          {description && (
            <p className="mb-6 text-muted-foreground">{description}</p>
          )}

          {event.price !== "confirmar" && (
            <div className="mb-6 rounded-lg bg-muted p-4">
              <p className="mb-1 text-sm text-muted-foreground">Precio de entrada</p>
              <p className="text-2xl font-bold text-foreground">
                {event.price === "gratis" 
                  ? "Entrada Gratuita" 
                  : `$${event.price.toLocaleString("es-AR")}`}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            {googleMapsUrl && (
              <Button
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                asChild
              >
                <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer">
                  <Navigation className="mr-2 size-4" />
                  Cómo llegar
                </a>
              </Button>
            )}

            {event.ticketUrl && (
              <Button variant="outline" className="flex-1" asChild>
                <a href={goHref(event.id, "ficha")} target="_blank" rel="nofollow noopener noreferrer">
                  <ExternalLink className="mr-2 size-4" />
                  Comprar tickets
                </a>
              </Button>
            )}
          </div>

          <BotonesAsistenciaDiferidos
            eventId={event.id}
            status={event.status}
            abierto={open}
            haySesion={haySesion}
            className="mt-6"
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
