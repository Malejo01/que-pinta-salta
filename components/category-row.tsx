"use client"

import { createElement, useRef } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { EventCard } from "@/components/event-card"
import { Button } from "@/components/ui/button"
import { getCategoryIcon } from "@/lib/category-icons"
import type { DisplayEvent } from "@/components/home-content"

interface CategoryRowProps {
  category: string
  title: string
  events: DisplayEvent[]
  userFavorites?: string[]
  onOpenMovie?: (movie: DisplayEvent) => void
}

export function CategoryRow({ 
  category, 
  title, 
  events, 
  userFavorites = [],
  onOpenMovie,
}: CategoryRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = direction === "left" ? -400 : 400
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" })
    }
  }

  if (events.length === 0) return null

  const iconComponent = getCategoryIcon(category)

  return (
    <section className="py-8">
      <div className="container mx-auto px-4">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {createElement(iconComponent, { className: "size-5 text-primary" })}
            <h2 className="text-xl font-bold text-foreground">{title}</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {events.length}
            </span>
          </div>
          <Link 
            href={`/?category=${category}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            Ver todos
          </Link>
        </div>

        <div className="group relative">
          <Button
            variant="ghost"
            size="icon"
            className="absolute -left-2 top-1/2 z-10 hidden size-10 -translate-y-1/2 rounded-full bg-background/80 shadow-lg backdrop-blur transition-opacity hover:bg-background group-hover:flex"
            onClick={() => scroll("left")}
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
                />
              </motion.div>
            ))}
          </motion.div>

          <Button
            variant="ghost"
            size="icon"
            className="absolute -right-2 top-1/2 z-10 hidden size-10 -translate-y-1/2 rounded-full bg-background/80 shadow-lg backdrop-blur transition-opacity hover:bg-background group-hover:flex"
            onClick={() => scroll("right")}
          >
            <ChevronRight className="size-5" />
          </Button>
        </div>
      </div>
    </section>
  )
}
