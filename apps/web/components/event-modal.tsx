"use client"

import { createElement } from "react"
import { Calendar, MapPin, Clock, Users, ExternalLink, Navigation } from "lucide-react"
import { vibeLabels, EventCategory } from "@/lib/types"
import { fechaLarga, hora, precio } from "@/lib/i18n/fechas"
import { useIdioma, useTextos } from "@/lib/i18n/use-idioma"

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
  /** Estado del evento: gate del botón de Voy (y de Seguir). Flyers y películas no lo tienen. */
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
import { InsigniaDestacado } from "@/components/insignia-destacado"
import { getCategoryIcon } from "@/lib/category-icons"
import { capitalizeFirst, cleanDescription } from "@/lib/event-display"
import { ViewBeacon } from "@/components/view-beacon"
import { goHref, urlComoLlegar, type MetricOrigin } from "@/lib/metricas/links"
import { FlyerImage } from "@/components/flyer-image"
import { BotonesAsistenciaDiferidos, BotonesSeguirDiferidos } from "@/components/botones-asistencia-diferidos"

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
  /** Si hay sesión (la lee /buscar en el servidor): para Voy y Seguir. */
  haySesion?: boolean
}

export function EventModal({ event, open, onClose, origin = "directo", isFavorite = false, onFavoriteChange, haySesion = false }: EventModalProps) {
  // Hoy solo lo usa /buscar (que está solo en castellano): en castellano todo
  // queda como siempre. Antes del `return null` porque son hooks.
  const idioma = useIdioma()
  const textos = useTextos()
  if (!event) return null

  const formattedDate = fechaLarga(idioma, event.date, true)
  const langContenido = idioma === "es" ? undefined : "es"
  const description = cleanDescription(event.description)

  // La misma URL que la ficha (QPS-130); null sin dirección ni lugar: no hay botón (QPS-137).
  const googleMapsUrl = urlComoLlegar({ address: event.address, venue: event.venue })
  const iconComponent = getCategoryIcon(event.category as EventCategory)

  return (
    <Dialog open={open} onOpenChange={onClose}>
      {/* Sin descripción: `aria-describedby={undefined}` (lo que pide Radix) para no dejar una referencia rota. */}
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto p-0" aria-describedby={undefined}>
        <ViewBeacon eventId={event.id} origin={origin} />
        <div className="relative aspect-[3/2] w-full">
          <FlyerImage
            variant={800}
            src={event.image}
            alt={event.title}
            lang={langContenido}
            fill
            className="object-cover"
          />
          <Badge className="absolute left-4 top-4 bg-primary text-primary-foreground">
            {createElement(iconComponent, { className: "mr-1 size-3" })}
            {event.categoryName || event.category}
          </Badge>
          {/*
            Acá SÍ alcanza con `event.isFeatured` tal cual (no se llama a
            `estaDestacado`): este `event` es el `DisplayEvent` local del
            modal (línea 8), lo arma `/buscar` con `isFeatured` ya resuelto
            (y, para flyers/películas, fijado en `false` a mano — ver
            `app/buscar/buscar-content.tsx`), igual que en `event-card.tsx` y
            `hero-carousel.tsx`.
          */}
          <InsigniaDestacado visible={!!event.isFeatured} className="absolute left-4 top-14" />
        </div>

        <div className="p-6">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-2xl" lang={langContenido}>{event.title}</DialogTitle>
          </DialogHeader>

          <div className="mb-6 space-y-3">
            <div className="flex items-center gap-3 text-muted-foreground">
              <Calendar className="size-5 text-primary" />
              <span>{capitalizeFirst(formattedDate)}</span>
            </div>
            
            {event.time && (
              <div className="flex items-center gap-3 text-muted-foreground">
                <Clock className="size-5 text-primary" />
                <span>{textos.ficha.horaDelEvento(hora(idioma, event.time))}</span>
              </div>
            )}
            
            <div className="flex items-center gap-3 text-muted-foreground">
              <MapPin className="size-5 text-primary" />
              <div>
                <p className="font-medium text-foreground" lang={langContenido}>{event.venue}</p>
                <p className="text-sm" lang={langContenido}>{event.address}</p>
              </div>
            </div>

            <BotonesSeguirDiferidos
              eventId={event.id}
              status={event.status}
              abierto={open}
              haySesion={haySesion}
            />

            {event.vibe && vibeLabels[event.vibe as keyof typeof vibeLabels] && (
              <div className="flex items-center gap-3 text-muted-foreground">
                <Users className="size-5 text-primary" />
                <span>{textos.ficha.etiquetasVibe[event.vibe as keyof typeof vibeLabels]}</span>
              </div>
            )}
          </div>

          {description && (
            <p className="mb-6 text-muted-foreground" lang={langContenido}>{description}</p>
          )}

          {event.price !== "confirmar" && (
            <div className="mb-6 rounded-lg bg-muted p-4">
              <p className="mb-1 text-sm text-muted-foreground">{textos.ficha.precioDeEntrada}</p>
              <p className="text-2xl font-bold text-foreground">
                {event.price === "gratis" 
                  ? textos.portada.entradaGratuita 
                  : precio(idioma, event.price)}
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
                  {textos.ficha.comoLlegar}
                </a>
              </Button>
            )}

            {event.ticketUrl && (
              <Button variant="outline" className="flex-1" asChild>
                <a href={goHref(event.id, "ficha")} target="_blank" rel="nofollow noopener noreferrer">
                  <ExternalLink className="mr-2 size-4" />
                  {textos.ficha.comprarTickets}
                </a>
              </Button>
            )}
          </div>

          <BotonesAsistenciaDiferidos
            eventId={event.id}
            titulo={event.title}
            status={event.status}
            abierto={open}
            haySesion={haySesion}
            isFavorite={isFavorite}
            onFavoriteChange={onFavoriteChange}
            className="mt-6"
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
