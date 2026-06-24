"use client"

import Image from "next/image"
import Link from "next/link"
import { Instagram } from "lucide-react"
import type { FlyerWithAccount } from "@/lib/instagram-config"
import { INSTAGRAM_ENGINE_CONFIG } from "@/lib/instagram-config"

interface FlyerGridProps {
  flyers: FlyerWithAccount[]
}

export function FlyerGrid({ flyers }: FlyerGridProps) {
  if (!flyers.length) return null

  return (
    <section className="py-6">
      <div className="container mx-auto px-4">
        {/* Header de la sección */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-foreground sm:text-2xl">
              {INSTAGRAM_ENGINE_CONFIG.SECTION_TITLE}
            </h2>
            <Instagram className="size-5 text-pink-500" />
          </div>
          <p className="hidden text-sm text-muted-foreground sm:block">
            {INSTAGRAM_ENGINE_CONFIG.SECTION_SUBTITLE}
          </p>
        </div>

        {/* Grilla horizontal scrolleable (estilo Netflix) */}
        <div className="relative -mx-4 px-4">
          <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide sm:gap-4">
            {flyers.map((flyer) => (
              <Link
                key={flyer.id}
                href={`/flyer/${flyer.id}`}
                className="flex-none"
              >
                <div className="group relative aspect-square w-[160px] cursor-pointer overflow-hidden rounded-xl bg-card shadow-lg transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 sm:w-[200px]">
                  {/* Imagen del flyer */}
                  <Image
                    src={flyer.storage_image_url || flyer.original_image_url || '/placeholder.svg?height=400&width=400'}
                    alt={`Flyer de ${flyer.account.display_name}`}
                    fill
                    sizes="(max-width: 640px) 160px, 200px"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />

                  {/* Overlay gradiente */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 transition-opacity duration-300 group-hover:opacity-90" />

                  {/* Badge Instagram */}
                  <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 backdrop-blur-sm">
                    <Instagram className="size-3 text-pink-400" />
                  </div>

                  {/* Info del boliche */}
                  <div className="absolute bottom-0 left-0 right-0 p-3">
                    <p className="mb-0.5 text-sm font-bold leading-tight text-white drop-shadow-lg">
                      {flyer.account.display_name}
                    </p>
                    <p className="text-xs text-white/70">
                      {getRelativeDate(flyer.published_at)}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/**
 * Convierte un timestamp ISO a fecha relativa en español.
 */
function getRelativeDate(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return "Hoy"
  if (diffDays === 1) return "Ayer"
  if (diffDays < 7) return `Hace ${diffDays} días`
  if (diffDays < 14) return "Hace 1 semana"
  return `Hace ${Math.floor(diffDays / 7)} semanas`
}
