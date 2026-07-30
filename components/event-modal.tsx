"use client"

import Image from "next/image"
import { createElement } from "react"
import { Calendar, MapPin, Clock, Users, ExternalLink, Navigation } from "lucide-react"
import { categoryLabels, vibeLabels, EventCategory } from "@/lib/types"

// Display event type (transformed from database)
interface DisplayEvent {
  id: string
  title: string
  venue: string
  date: string
  time: string
  category: string
  price: number | "gratis" | "confirmar"
  image: string
  description: string
  address: string
  ticketUrl?: string
  isFeatured?: boolean
  vibe?: string
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

interface EventModalProps {
  event: Event | null
  open: boolean
  onClose: () => void
}

export function EventModal({ event, open, onClose }: EventModalProps) {
  if (!event) return null

  const formattedDate = formatEventDate(event.date, true)

  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.address || event.venue)}`
  const iconComponent = getCategoryIcon(event.category as EventCategory)

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto p-0">
        <div className="relative aspect-[3/2] w-full">
          <Image
            src={event.image}
            alt={event.title}
            fill
            className="object-cover"
          />
          <Badge className="absolute left-4 top-4 bg-primary text-primary-foreground">
            {createElement(iconComponent, { className: "mr-1 size-3" })}
            {categoryLabels[event.category as keyof typeof categoryLabels] || event.category}
          </Badge>
        </div>

        <div className="p-6">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-2xl">{event.title}</DialogTitle>
          </DialogHeader>

          <div className="mb-6 space-y-3">
            <div className="flex items-center gap-3 text-muted-foreground">
              <Calendar className="size-5 text-primary" />
              <span className="capitalize">{formattedDate}</span>
            </div>
            
            <div className="flex items-center gap-3 text-muted-foreground">
              <Clock className="size-5 text-primary" />
              <span>{event.time} hs</span>
            </div>
            
            <div className="flex items-center gap-3 text-muted-foreground">
              <MapPin className="size-5 text-primary" />
              <div>
                <p className="font-medium text-foreground">{event.venue}</p>
                <p className="text-sm">{event.address}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 text-muted-foreground">
              <Users className="size-5 text-primary" />
              <span>{vibeLabels[event.vibe as keyof typeof vibeLabels] || event.vibe}</span>
            </div>
          </div>

          <p className="mb-6 text-muted-foreground">{event.description}</p>

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
            <Button 
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
              asChild
            >
              <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer">
                <Navigation className="mr-2 size-4" />
                Como llegar
              </a>
            </Button>
            
            {event.ticketUrl && (
              <Button variant="outline" className="flex-1" asChild>
                <a href={event.ticketUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 size-4" />
                  Comprar tickets
                </a>
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
