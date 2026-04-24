"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronLeft, ChevronRight, Calendar, MapPin, Ticket } from "lucide-react"
import { Event } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { categoryLabels } from "@/lib/types"

interface HeroCarouselProps {
  events: Event[]
  onSelectEvent: (event: Event) => void
}

export function HeroCarousel({ events, onSelectEvent }: HeroCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % events.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [events.length])

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev - 1 + events.length) % events.length)
  }

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % events.length)
  }

  if (events.length === 0) return null

  const currentEvent = events[currentIndex]
  const formattedDate = new Date(currentEvent.date).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })

  return (
    <div className="relative h-[400px] w-full overflow-hidden sm:h-[500px]">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="absolute inset-0"
        >
          <Image
            src={currentEvent.image}
            alt={currentEvent.title}
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/80 to-transparent" />
        </motion.div>
      </AnimatePresence>

      <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-10">
        <motion.div
          key={`content-${currentIndex}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="container mx-auto max-w-4xl"
        >
          <Badge className="mb-3 bg-primary text-primary-foreground">
            {categoryLabels[currentEvent.category]}
          </Badge>
          
          <h2 className="mb-3 text-2xl font-bold text-foreground sm:text-4xl">
            {currentEvent.title}
          </h2>
          
          <div className="mb-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground sm:text-base">
            <div className="flex items-center gap-2">
              <Calendar className="size-4 text-primary" />
              <span className="capitalize">{formattedDate} - {currentEvent.time}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="size-4 text-primary" />
              <span>{currentEvent.venue}</span>
            </div>
          </div>
          
          <p className="mb-6 line-clamp-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
            {currentEvent.description}
          </p>
          
          <div className="flex flex-wrap items-center gap-3">
            <Button 
              size="lg" 
              onClick={() => onSelectEvent(currentEvent)}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Ticket className="mr-2 size-4" />
              Ver detalles
            </Button>
            <span className="text-lg font-bold text-foreground">
              {currentEvent.price === "gratis" 
                ? "Entrada Gratuita" 
                : `$${currentEvent.price.toLocaleString("es-AR")}`}
            </span>
          </div>
        </motion.div>
      </div>

      <button
        onClick={goToPrevious}
        className="absolute left-4 top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/50 text-foreground backdrop-blur transition-colors hover:bg-background/80"
        aria-label="Evento anterior"
      >
        <ChevronLeft className="size-6" />
      </button>

      <button
        onClick={goToNext}
        className="absolute right-4 top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/50 text-foreground backdrop-blur transition-colors hover:bg-background/80"
        aria-label="Siguiente evento"
      >
        <ChevronRight className="size-6" />
      </button>

      <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-2">
        {events.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentIndex(index)}
            className={`h-2 rounded-full transition-all ${
              index === currentIndex 
                ? "w-8 bg-primary" 
                : "w-2 bg-foreground/30 hover:bg-foreground/50"
            }`}
            aria-label={`Ir al evento ${index + 1}`}
          />
        ))}
      </div>
    </div>
  )
}
