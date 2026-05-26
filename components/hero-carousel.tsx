"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronLeft, ChevronRight, Calendar, MapPin, Ticket } from "lucide-react"
import { categoryLabels } from "@/lib/types"
import { formatEventDate } from "@/lib/date-format"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { DisplayEvent } from "@/components/home-content"

interface HeroCarouselProps {
  events: DisplayEvent[]
}

export function HeroCarousel({ events }: HeroCarouselProps) {
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
  const formattedDate = formatEventDate(currentEvent.date)

  return (
    <div className="relative h-[250px] w-full overflow-hidden sm:h-[320px] lg:h-[360px]">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="absolute inset-0 bg-black"
        >
          <Image
            src={currentEvent.image}
            alt={currentEvent.title}
            fill
            className="scale-125 object-contain sm:scale-130"
            priority
          />
          <div className="absolute inset-0 bg-transparent dark:bg-gradient-to-t dark:from-background/85 dark:via-background/45 dark:to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-black/40" />
        </motion.div>
      </AnimatePresence>

      <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-8">
        <motion.div
          key={`content-${currentIndex}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="container mx-auto max-w-4xl"
        >
          <Badge className="mb-2 bg-primary text-[10px] text-primary-foreground sm:mb-3 sm:text-xs">
            {categoryLabels[currentEvent.category as keyof typeof categoryLabels] || currentEvent.category}
          </Badge>
          
          <h2 className="mb-2 text-lg font-bold leading-tight text-white sm:mb-3 sm:text-3xl lg:text-[2rem]">
            {currentEvent.title}
          </h2>
          
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:mb-3 sm:gap-3 sm:text-sm">
            <div className="flex items-center gap-2">
              <Calendar className="size-3 text-primary sm:size-4" />
              <span className="capitalize">{formattedDate} - {currentEvent.time}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="size-3 text-primary sm:size-4" />
              <span>{currentEvent.venue}</span>
            </div>
          </div>
          
          <p className="mb-3 line-clamp-1 max-w-2xl text-xs text-muted-foreground sm:mb-4 sm:line-clamp-2 sm:text-sm">
            {currentEvent.description}
          </p>
          
          <div className="flex flex-wrap items-center gap-3">
            <Button 
              size="sm"
              asChild
              className="bg-primary text-primary-foreground hover:bg-primary/90 sm:h-11 sm:px-8 sm:text-sm"
            >
              <Link href={`/evento/${currentEvent.id}`}>
                <Ticket className="mr-2 size-4" />
                Ver detalles
              </Link>
            </Button>
            <span className="text-sm font-bold text-foreground sm:text-base">
              {currentEvent.price === "gratis" 
                ? "Entrada Gratuita" 
                : `$${currentEvent.price.toLocaleString("es-AR")}`}
            </span>
          </div>
        </motion.div>
      </div>

      <button
        onClick={goToPrevious}
        className="absolute left-2 top-1/2 z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-background/20 text-foreground/75 backdrop-blur-sm transition-colors hover:bg-background/35 hover:text-foreground sm:left-4 sm:size-10 sm:bg-background/50 sm:text-foreground sm:backdrop-blur"
        aria-label="Evento anterior"
      >
        <ChevronLeft className="size-4 sm:size-6" />
      </button>

      <button
        onClick={goToNext}
        className="absolute right-2 top-1/2 z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-background/20 text-foreground/75 backdrop-blur-sm transition-colors hover:bg-background/35 hover:text-foreground sm:right-4 sm:size-10 sm:bg-background/50 sm:text-foreground sm:backdrop-blur"
        aria-label="Siguiente evento"
      >
        <ChevronRight className="size-4 sm:size-6" />
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
