import Image from "next/image"
import Link from "next/link"
import { Calendar, MapPin, Clock, Volume2, Users, ExternalLink, Navigation, ArrowLeft } from "lucide-react"
import { categoryLabels, vibeLabels, EventCategory, Event, Category, Venue } from "@/lib/types"
import { Navbar } from "@/components/navbar"
import { MobileNav } from "@/components/mobile-nav"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { getCategoryIcon } from "@/lib/category-icons"

type EventWithRelations = Event & { category: Category; venue: Venue | null }

interface EventDetailPageProps {
  event: EventWithRelations
}

export function EventDetailPage({ event }: EventDetailPageProps) {
  const startDate = new Date(event.start_date)
  const displayEvent = {
    id: event.id,
    title: event.title,
    venue: event.venue?.name || 'Lugar por confirmar',
    date: startDate.toISOString().split('T')[0],
    time: startDate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
    category: event.category.slug as EventCategory,
    price: event.is_free ? "gratis" as const : event.price_min,
    image: event.image_url || '/placeholder.svg?height=600&width=400',
    description: event.description || event.short_description || '',
    address: event.venue?.address || '',
    ticketUrl: event.ticket_url || undefined,
    noiseLevel: event.noise_level || 3,
    vibe: event.age_restriction >= 18 ? "adultos" as const : "familiar" as const,
  }

  const formattedDate = new Date(displayEvent.date).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(displayEvent.address || displayEvent.venue)}`
  const Icon = getCategoryIcon(displayEvent.category)

  return (
    <div className="min-h-screen bg-background pb-20 sm:pb-0">
      <Navbar />
      
      <main className="container mx-auto px-4 py-8">
        <Link 
          href="/"
          className="mb-6 inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Volver a eventos
        </Link>

        <div className="grid gap-8 lg:grid-cols-2">
          <div className="relative aspect-[3/4] overflow-hidden rounded-2xl lg:aspect-[4/5]">
            <Image
              src={displayEvent.image}
              alt={displayEvent.title}
              fill
              className="object-cover"
              priority
            />
            <Badge className="absolute left-4 top-4 bg-primary text-primary-foreground">
              <Icon className="mr-1 size-3" />
              {categoryLabels[displayEvent.category as keyof typeof categoryLabels] || displayEvent.category}
            </Badge>
          </div>

          <div className="flex flex-col">
            <h1 className="mb-4 text-3xl font-bold text-foreground lg:text-4xl">
              {displayEvent.title}
            </h1>

            <div className="mb-6 space-y-4">
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
                  className="flex-1 max-w-xs"
                />
                <span className="text-sm text-muted-foreground">{displayEvent.noiseLevel}/5</span>
              </div>
            </div>

            <p className="mb-8 flex-1 text-muted-foreground">{displayEvent.description}</p>

            <div className="mb-6 rounded-xl bg-muted p-6">
              <p className="mb-1 text-sm text-muted-foreground">Precio de entrada</p>
              <p className="text-3xl font-bold text-foreground">
                {displayEvent.price === "gratis" 
                  ? "Entrada Gratuita" 
                  : `$${displayEvent.price.toLocaleString("es-AR")}`}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button 
                size="lg"
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                asChild
              >
                <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer">
                  <Navigation className="mr-2 size-4" />
                  Como llegar
                </a>
              </Button>
              
              {displayEvent.ticketUrl && (
                <Button size="lg" variant="outline" className="flex-1" asChild>
                  <a href={displayEvent.ticketUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 size-4" />
                    Comprar tickets
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>
      </main>

      <MobileNav />
    </div>
  )
}
