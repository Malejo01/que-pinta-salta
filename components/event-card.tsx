"use client"

import Image from "next/image"
import Link from "next/link"
import { motion } from "framer-motion"
import { Calendar, MapPin, Heart } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatEventDateShort } from "@/lib/date-format"
import type { DisplayEvent } from "@/components/home-content"

interface EventCardProps {
  event: DisplayEvent
  isFavorite?: boolean
  onToggleFavorite?: (eventId: string) => void
}

export function EventCard({ event, isFavorite, onToggleFavorite }: EventCardProps) {
  const formattedDate = formatEventDateShort(event.date)

  const formattedPrice = event.price === "gratis" 
    ? "Gratis" 
    : event.price === "confirmar"
    ? "Precio a confirmar"
    : `$${event.price.toLocaleString("es-AR")}`

  return (
    <Link href={`/evento/${event.id}`}>
      <motion.div
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.98 }}
        className={cn(
          "group relative aspect-[2/3] w-[180px] shrink-0 cursor-pointer overflow-hidden rounded-xl bg-card shadow-lg sm:w-[200px] transition-all",
          event.isFeatured && "ring-1 ring-amber-500/50 hover:ring-amber-500"
        )}
      >
        <Image
          src={event.image}
          alt={event.title}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
        
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
        
        {onToggleFavorite && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 z-10 size-8 rounded-full bg-black/30 text-white hover:bg-black/50"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onToggleFavorite(event.id)
            }}
          >
            <Heart className={cn("size-4", isFavorite && "fill-primary text-primary")} />
          </Button>
        )}

        <Badge 
          variant="secondary" 
          className="absolute left-2 top-2 bg-primary text-primary-foreground"
        >
          {event.categoryName}
        </Badge>

        {event.isFeatured && (
          <Badge 
            className="absolute left-2 top-8 bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-bold flex items-center gap-0.5 shadow-md border-none text-[10px] py-0 px-1.5"
          >
            ★ Destacado
          </Badge>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
          <h3 className="mb-1 line-clamp-2 text-sm font-semibold leading-tight">
            {event.title}
          </h3>
          
          <div className="mb-2 flex items-center gap-1 text-xs text-white/80">
            <MapPin className="size-3" />
            <span className="line-clamp-1">{event.venue}</span>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-xs text-white/80">
              <Calendar className="size-3" />
              <span>{formattedDate}</span>
              <span className="ml-1">{event.time}</span>
            </div>
          </div>
          
          <div className="mt-2 flex items-center justify-between">
            <span className={cn(
              "text-sm font-bold",
              event.price === "gratis" ? "text-green-400" : "text-white"
            )}>
              {formattedPrice}
            </span>
          </div>
        </div>
      </motion.div>
    </Link>
  )
}
