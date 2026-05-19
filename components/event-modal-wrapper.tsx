"use client"

import { useRouter } from "next/navigation"
import { createElement } from "react"
import Image from "next/image"
import { Calendar, MapPin, Clock, Volume2, Users, ExternalLink, Navigation } from "lucide-react"
import { categoryLabels, vibeLabels, EventCategory, Event, Category, Venue } from "@/lib/types"
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
import { formatEventDate, formatEventTime } from "@/lib/date-format"

type EventWithRelations = Event & { category: Category; venue: Venue | null }

interface EventModalWrapperProps {
  event: EventWithRelations
}

export function EventModalWrapper({ event }: EventModalWrapperProps) {
  const router = useRouter()
  
  const startDate = new Date(event.start_date)
  const displayEvent = {
    id: event.id,
    title: event.title,
    venue: event.venue?.name || 'Lugar por confirmar',
    date: startDate.toISOString().split('T')[0],
    time: formatEventTime(startDate),
    category: event.category.slug as EventCategory,
    price: event.is_free ? "gratis" as const : event.price_min,
    image: event.image_url || '/placeholder.svg?height=600&width=400',
    description: event.description || event.short_description || '',
    address: event.venue?.address || '',
    ticketUrl: event.ticket_url || undefined,
    noiseLevel: event.noise_level || 3,
    vibe: event.age_restriction >= 18 ? "adultos" as const : "familiar" as const,
  }

  const formattedDate = formatEventDate(displayEvent.date, true)

  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(displayEvent.address || displayEvent.venue)}`
  const iconComponent = getCategoryIcon(displayEvent.category)

  const handleClose = () => {
    router.back()
  }

  return (
    <Dialog open onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto p-0">
        <div className="relative aspect-[3/2] w-full">
          <Image
            src={displayEvent.image}
            alt={displayEvent.title}
            fill
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
          <Badge className="absolute left-4 top-4 bg-primary text-primary-foreground">
            {createElement(iconComponent, { className: "mr-1 size-3" })}
            {categoryLabels[displayEvent.category as keyof typeof categoryLabels] || displayEvent.category}
          </Badge>
        </div>

        <div className="p-6">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-2xl">{displayEvent.title}</DialogTitle>
          </DialogHeader>

          <div className="mb-6 space-y-3">
            <div className="flex items-center gap-3 text-muted-foreground">
              <Calendar className="size-5 text-primary" />
              <span className="capitalize">{formattedDate}</span>
            </div>
            
            <div className="flex items-center gap-3 text-muted-foreground">
              <Clock className="size-5 text-primary" />
              <span>{displayEvent.time} hs</span>
            </div>
            
            <div className="flex items-center gap-3 text-muted-foreground">
              <MapPin className="size-5 text-primary" />
              <div>
                <p className="font-medium text-foreground">{displayEvent.venue}</p>
                <p className="text-sm">{displayEvent.address}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 text-muted-foreground">
              <Users className="size-5 text-primary" />
              <span>{vibeLabels[displayEvent.vibe as keyof typeof vibeLabels] || displayEvent.vibe}</span>
            </div>
          </div>

          <div className="mb-6">
            <div className="mb-2 flex items-center gap-2">
              <Volume2 className="size-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Nivel de ruido</span>
            </div>
            <div className="flex items-center gap-3">
              <Slider
                value={[displayEvent.noiseLevel]}
                max={5}
                step={1}
                disabled
                className="flex-1"
              />
              <span className="text-sm text-muted-foreground">{displayEvent.noiseLevel}/5</span>
            </div>
          </div>

          <p className="mb-6 text-muted-foreground">{displayEvent.description}</p>

          <div className="mb-6 rounded-lg bg-muted p-4">
            <p className="mb-1 text-sm text-muted-foreground">Precio de entrada</p>
            <p className="text-2xl font-bold text-foreground">
              {displayEvent.price === "gratis" 
                ? "Entrada Gratuita" 
                : `$${displayEvent.price.toLocaleString("es-AR")}`}
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
            
            {displayEvent.ticketUrl && (
              <Button variant="outline" className="flex-1" asChild>
                <a href={displayEvent.ticketUrl} target="_blank" rel="noopener noreferrer">
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
