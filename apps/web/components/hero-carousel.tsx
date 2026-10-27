"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronLeft, ChevronRight, Calendar, MapPin, Ticket } from "lucide-react"
import { fechaLarga, hora, precio } from "@/lib/i18n/fechas"
import { langDeCategoria } from "@/lib/i18n"
import { useIdioma, useTextos } from "@/lib/i18n/use-idioma"
import { rutaEn } from "@/lib/i18n/rutas"
import { capitalizeFirst, cleanDescription } from "@/lib/event-display"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { InsigniaDestacado } from "@/components/insignia-destacado"
import { FlyerImage } from "@/components/flyer-image"
import { eventHref } from "@/lib/metricas/links"
import type { DisplayEvent } from "@/components/home-content"

interface HeroCarouselProps {
  events: DisplayEvent[]
}

export function HeroCarousel({ events }: HeroCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [direction, setDirection] = useState(1) // 1 = next, -1 = prev
  // Solo la diapositiva con la que arranca el carrusel es candidata a `priority`
  // (es la que cuenta para el LCP). Una vez que el usuario o el timer avanzan,
  // deja de aplicar aunque el índice vuelva a 0 en una vuelta completa.
  const [isInitialSlide, setIsInitialSlide] = useState(true)
  const idioma = useIdioma()
  const t = useTextos().portada
  // Título y descripción vienen de las fuentes, en castellano: en /en se
  // marcan con lang="es" para que el lector de pantalla no los lea en inglés.
  const langContenido = idioma === "es" ? undefined : "es"

  useEffect(() => {
    const timer = setInterval(() => {
      setDirection(1)
      setIsInitialSlide(false)
      setCurrentIndex((prev) => (prev + 1) % events.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [events.length])

  const goToPrevious = () => {
    setDirection(-1)
    setIsInitialSlide(false)
    setCurrentIndex((prev) => (prev - 1 + events.length) % events.length)
  }

  const goToNext = () => {
    setDirection(1)
    setIsInitialSlide(false)
    setCurrentIndex((prev) => (prev + 1) % events.length)
  }

  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 40 : -40,
      opacity: 0
    }),
    center: {
      x: 0,
      opacity: 1
    },
    exit: (dir: number) => ({
      x: dir < 0 ? 40 : -40,
      opacity: 0
    })
  }

  if (events.length === 0) return null

  const currentEvent = events[currentIndex]
  const formattedDate = fechaLarga(idioma, currentEvent.date)
  const description = cleanDescription(currentEvent.description)

  return (
    <div className="relative h-[200px] w-full overflow-hidden sm:h-[320px] lg:h-[360px] bg-black">
      <AnimatePresence mode="wait" initial={false} custom={direction}>
        <motion.div
          key={currentIndex}
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{
            x: { type: "spring", stiffness: 300, damping: 30 },
            opacity: { duration: 0.4 }
          }}
          className="absolute inset-0"
        >
          {/* Blurred backdrop with Ken Burns zoom */}
          <div className="absolute inset-0 overflow-hidden select-none pointer-events-none opacity-45">
            <motion.div
              key={`bg-${currentIndex}`}
              initial={{ scale: 1.12 }}
              animate={{ scale: 1.02 }}
              transition={{ duration: 5, ease: "linear" }}
              className="relative h-full w-full"
            >
              <FlyerImage
                variant={800}
                src={currentEvent.image}
                alt=""
                fill
                sizes="100vw"
                className="object-cover blur-2xl"
                loading="lazy"
              />
            </motion.div>
          </div>

          {/* Sharp, unscaled contained event poster */}
          <div className="relative mx-auto flex h-full w-full items-center justify-center p-4">
            <FlyerImage
              variant={800}
              src={currentEvent.image}
              alt={currentEvent.title}
              lang={langContenido}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 80vw, 1200px"
              className="object-contain"
              {...(isInitialSlide ? { priority: true } : { loading: "lazy" as const })}
            />
          </div>

          {/* Dark gradients to ensure readability on any background */}
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/95 via-black/50 to-transparent sm:inset-0 sm:h-auto" />
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
          <Badge lang={langDeCategoria(idioma, currentEvent.category)} className="mb-1 bg-primary text-[10px] text-primary-foreground sm:mb-3 sm:text-xs">
            {currentEvent.categoryName}
          </Badge>
          <InsigniaDestacado visible={currentEvent.isFeatured} className="ml-2 mb-1 sm:mb-3" />

          <h2 lang={langContenido} className="mb-1 line-clamp-2 text-[15px] font-bold leading-tight text-white sm:mb-3 sm:line-clamp-none sm:text-3xl lg:text-[2rem] drop-shadow-md">
            {currentEvent.title}
          </h2>
          
          <div className="mb-2 flex min-w-0 flex-nowrap items-center gap-2 text-xs text-zinc-300 sm:mb-3 sm:flex-wrap sm:gap-3 sm:text-sm drop-shadow-sm">
            <div className="flex min-w-0 items-center gap-1 sm:gap-2">
              <Calendar className="size-3 shrink-0 text-primary sm:size-4" />
              <span className="truncate sm:overflow-visible sm:whitespace-normal">{capitalizeFirst(formattedDate)}{currentEvent.time ? ` - ${hora(idioma, currentEvent.time)}` : ""}</span>
            </div>
            <div className="flex min-w-0 items-center gap-1 sm:gap-2">
              <MapPin className="size-3 shrink-0 text-primary sm:size-4" />
              <span className="truncate sm:overflow-visible sm:whitespace-normal">{currentEvent.venue}</span>
            </div>
          </div>
          
          {description && (
            <div className="hidden sm:block">
              <p lang={langContenido} className="mb-4 line-clamp-2 max-w-2xl text-sm text-zinc-300 drop-shadow-sm">
                {description}
              </p>
            </div>
          )}
          
          <div className="flex flex-nowrap items-center gap-2 sm:flex-wrap sm:gap-3">
            <Button 
              size="sm"
              asChild
              className="h-7 bg-primary px-3 text-xs text-primary-foreground hover:bg-primary/90 sm:h-11 sm:px-8 sm:text-sm"
            >
              <Link href={rutaEn(idioma, eventHref(currentEvent.id, "hero"))}>
                <Ticket className="mr-1 size-3.5 sm:mr-2 sm:size-4" />
                {t.verDetalles}
              </Link>
            </Button>
            {currentEvent.price !== "confirmar" && (
              <span className="max-sm:truncate text-sm font-bold text-white sm:text-base drop-shadow-sm">
                {currentEvent.price === "gratis" 
                  ? t.entradaGratuita 
                  : precio(idioma, currentEvent.price)}
              </span>
            )}
          </div>
        </motion.div>
      </div>

      <button
        onClick={goToPrevious}
        className="absolute left-2 top-6 z-10 hidden size-8 items-center justify-center rounded-full bg-background/20 text-foreground/75 backdrop-blur-sm transition-colors hover:bg-background/35 hover:text-foreground sm:left-4 sm:top-1/2 sm:flex sm:size-10 sm:-translate-y-1/2 sm:bg-background/50 sm:text-foreground sm:backdrop-blur"
        aria-label={t.eventoAnterior}
      >
        <ChevronLeft className="size-4 sm:size-6" />
      </button>

      <button
        onClick={goToNext}
        className="absolute right-2 top-6 z-10 hidden size-8 items-center justify-center rounded-full bg-background/20 text-foreground/75 backdrop-blur-sm transition-colors hover:bg-background/35 hover:text-foreground sm:right-4 sm:top-1/2 sm:flex sm:size-10 sm:-translate-y-1/2 sm:bg-background/50 sm:text-foreground sm:backdrop-blur"
        aria-label={t.siguienteEvento}
      >
        <ChevronRight className="size-4 sm:size-6" />
      </button>

      <div className="absolute right-3 top-3 z-10 flex gap-1.5 sm:bottom-4 sm:left-1/2 sm:right-auto sm:top-auto sm:-translate-x-1/2 sm:gap-2">
        {events.map((_, index) => (
          <button
            key={index}
            onClick={() => {
              setIsInitialSlide(false)
              setCurrentIndex(index)
            }}
            /* Área de toque ampliada con pseudo-elemento invisible; el dot visible no cambia.
               En mobile los dots están aislados arriba a la derecha (right-3 top-3), así que se
               estira 18px arriba y abajo para llegar a 44 de alto. A partir de sm: el contenedor
               pasa a bottom-4 left-1/2, pegado al pie del hero y cerca del bloque de texto y del
               botón "Ver detalles": ahí la zona se acota a 8px para no taparlos. Horizontal:
               siempre la mitad del gap entre dots (3px en mobile, 4px en sm:) para que las zonas
               vecinas no se pisen. */
            className={`relative h-2 rounded-full transition-all after:absolute after:content-[''] after:-left-[3px] after:-right-[3px] after:-top-[18px] after:-bottom-[18px] sm:after:-left-1 sm:after:-right-1 sm:after:-top-2 sm:after:-bottom-2 ${
              index === currentIndex
                ? "w-8 bg-primary"
                : "w-2 bg-foreground/30 hover:bg-foreground/50"
            }`}
            aria-label={t.irAlEvento(index + 1)}
          />
        ))}
      </div>
    </div>
  )
}
