"use client"

import { createElement, useRef } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { EventCard } from "@/components/event-card"
import { Button } from "@/components/ui/button"
import { getCategoryIcon } from "@/lib/category-icons"
import type { DisplayEvent } from "@/components/home-content"
import type { MetricOrigin } from "@/lib/metricas/links"
import { rutaEn } from "@/lib/i18n/rutas"
import { useIdioma, useTextos } from "@/lib/i18n/use-idioma"
import { langDeCategoria } from "@/lib/i18n"

interface CategoryRowProps {
  category: string
  title: string
  events: DisplayEvent[]
  userFavorites?: string[]
  onOpenMovie?: (movie: DisplayEvent) => void
  onSeeAll?: (category: string) => void
  /** Origen de medición de los links a cada evento. */
  origin?: MetricOrigin
}

export function CategoryRow({ 
  category, 
  title, 
  events, 
  userFavorites = [],
  onOpenMovie,
  onSeeAll,
  origin,
}: CategoryRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const idioma = useIdioma()
  const t = useTextos().portada

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = direction === "left" ? -400 : 400
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" })
    }
  }

  if (events.length === 0) return null

  const iconComponent = getCategoryIcon(category)

  return (
    <section className="py-4">
      <div className="container mx-auto px-4">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {createElement(iconComponent, { className: "size-5 text-primary" })}
            {/* "hoy" no es una categoría: su título sale del diccionario. */}
            <h2 lang={category === "hoy" ? undefined : langDeCategoria(idioma, category)} className="text-xl font-bold text-foreground">{title}</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {events.length}
            </span>
          </div>
          {onSeeAll ? (
            <button
              onClick={(e) => {
                e.preventDefault()
                onSeeAll(category)
              }}
              /* Área de toque de 44px de alto sin mover el texto: padding vertical
                 compensado con margen negativo igual (técnica "padding con margen
                 negativo"). El ancho visible (~67px) ya supera los 44px mínimos. */
              className="text-sm font-medium text-primary dark:text-[#F0585D] hover:underline cursor-pointer bg-transparent border-0 p-0 py-3 -my-3"
            >
              {t.verTodos}
            </button>
          ) : (
            <Link
              href={rutaEn(idioma, `/?category=${category}`)}
              className="text-sm font-medium text-primary dark:text-[#F0585D] hover:underline py-3 -my-3"
            >
              {t.verTodos}
            </Link>
          )}
        </div>

        <div className="group relative">
          <Button
            variant="ghost"
            size="icon"
            /* Área de toque de 44x44 sin agrandar el círculo de 40px: pseudo-elemento
               invisible con la técnica de la Ronda 12 (after:absolute after:-inset-…). */
            className="absolute -left-2 top-1/2 z-10 hidden size-10 -translate-y-1/2 rounded-full bg-background/80 shadow-lg backdrop-blur transition-opacity after:absolute after:-inset-0.5 hover:bg-background group-hover:flex"
            onClick={() => scroll("left")}
            aria-label={t.desplazarIzquierda}
          >
            <ChevronLeft className="size-5" />
          </Button>

          <motion.div
            ref={scrollRef}
            className="scrollbar-hide flex gap-5 overflow-x-auto pb-4"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {events.map((event, index) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
              >
                <EventCard 
                  event={event} 
                  isFavorite={userFavorites.includes(event.id)}
                  onOpenMovie={onOpenMovie} 
                  origin={origin}
                />
              </motion.div>
            ))}
          </motion.div>

          <Button
            variant="ghost"
            size="icon"
            /* Misma técnica que la flecha izquierda: área de toque de 44x44 sin tocar el dibujo. */
            className="absolute -right-2 top-1/2 z-10 hidden size-10 -translate-y-1/2 rounded-full bg-background/80 shadow-lg backdrop-blur transition-opacity after:absolute after:-inset-0.5 hover:bg-background group-hover:flex"
            onClick={() => scroll("right")}
            aria-label={t.desplazarDerecha}
          >
            <ChevronRight className="size-5" />
          </Button>
        </div>
      </div>
    </section>
  )
}
