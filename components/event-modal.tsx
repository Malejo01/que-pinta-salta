"use client"

import Image from "next/image"
import { Calendar, MapPin, Clock, Volume2, Users, ExternalLink, Navigation } from "lucide-react"
import { categoryLabels, vibeLabels, EventCategory } from "@/lib/types"

// Display event type (transformed from database)
interface DisplayEvent {
  id: string
  title: string
  venue: string
  date: string
  time: string
  category: string
  price: number | "gratis"
  image: string
  description: string
  address: string
  ticketUrl?: string
  noiseLevel: number
  vibe: string
  isFeatured?: boolean
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
import { Slider } from "@/components/ui/slider"
import { getCategoryIcon } from "@/lib/category-icons"

interface EventModalProps {
  event: Event | null
  open: boolean
  onClose: () => void
}

export function EventModal({ event, open, onClose }: EventModalProps) {
  if (!event) return null

  const formattedDate = new Date(event.date).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.address || event.venue)}`
  const Icon = getCategoryIcon(event.category as EventCategory)

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
          <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
          <Badge className="absolute left-4 top-4 bg-primary text-primary-foreground">
            <Icon className="mr-1 size-3" />
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

          <div className="mb-6">
            <div className="mb-2 flex items-center gap-2">
              <Volume2 className="size-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Nivel de ruido</span>
            </div>
            <div className="flex items-center gap-3">
              <Slider
                value={[event.noiseLevel]}
                max={100}
                step={1}
                disabled
                className="flex-1"
              />
              <span className="text-sm text-muted-foreground">{event.noiseLevel}%</span>
            </div>
          </div>

          <p className="mb-6 text-muted-foreground">{event.description}</p>

          <div className="mb-6 rounded-lg bg-muted p-4">
            <p className="mb-1 text-sm text-muted-foreground">Precio de entrada</p>
            <p className="text-2xl font-bold text-foreground">
              {event.price === "gratis" 
                ? "Entrada Gratuita" 
                : `$${event.price.toLocaleString("es-AR")}`}
            </p>
          </div>

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
