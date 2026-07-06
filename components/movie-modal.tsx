"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Ticket, Film, Calendar, Building2 } from "lucide-react"
import Image from "next/image"
import type { DisplayEvent } from "@/components/home-content"
import type { MovieShowings } from "@/lib/types"
import { FavoriteButton } from "@/components/favorite-button"

interface MovieModalProps {
  movie: DisplayEvent
  isFavorite?: boolean
  onClose: () => void
}

export function MovieModal({ movie, isFavorite = false, onClose }: MovieModalProps) {
  const cinemasCount = movie.showings ? Object.keys(movie.showings).length : 0

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto p-0 bg-zinc-950 text-zinc-100 border-zinc-800/80">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 p-6">
          {/* Columna del Poster */}
          <div className="md:col-span-2 flex flex-col items-center">
            <div className="relative aspect-[2/3] w-full max-w-[240px] overflow-hidden rounded-xl border border-zinc-800/80 shadow-2xl bg-zinc-900">
              {movie.image ? (
                <Image
                  src={movie.image}
                  alt={movie.title}
                  fill
                  sizes="(max-width: 768px) 100vw, 240px"
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center bg-zinc-900 text-zinc-600">
                  <Film className="size-16 stroke-[1.5]" />
                  <span className="mt-2 text-xs">Sin Poster</span>
                </div>
              )}
            </div>
          </div>

          {/* Columna de Detalles y Horarios */}
          <div className="md:col-span-3 flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary uppercase tracking-wider mb-2">
                  <Film className="size-3" />
                  Cartelera de Cine
                </span>
                <DialogHeader className="text-left flex flex-row items-start justify-between gap-4">
                  <DialogTitle className="text-2xl font-extrabold text-white tracking-tight flex-1">
                    {movie.title}
                  </DialogTitle>
                  <FavoriteButton 
                    itemId={movie.id}
                    type="cinema"
                    initialIsFavorite={isFavorite}
                    className="size-10 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-100 flex-shrink-0"
                  />
                </DialogHeader>
              </div>

              {/* Listado de cines y horarios */}
              <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
                {movie.showings && cinemasCount > 0 ? (
                  Object.entries(movie.showings as MovieShowings).map(([cinemaKey, details]) => (
                    <div 
                      key={cinemaKey}
                      className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-4 space-y-3 backdrop-blur-xs"
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-zinc-200 text-sm flex items-center gap-2">
                          <Building2 className="size-4 text-primary" />
                          {details.name}
                        </h4>
                        
                        {details.booking_url && (
                          <Button 
                            asChild 
                            variant="secondary" 
                            size="sm" 
                            className="bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-[11px] h-7 rounded-md px-2.5 shadow-sm transition-all"
                          >
                            <a 
                              href={details.booking_url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="flex items-center gap-1"
                            >
                              <Ticket className="size-3" />
                              Comprar
                            </a>
                          </Button>
                        )}
                      </div>

                      <div className="space-y-2">
                        {details.formats.map((format, fIdx) => (
                          <div 
                            key={fIdx} 
                            className="flex flex-col gap-1 rounded-lg bg-zinc-950/40 p-2.5 border border-zinc-800/40"
                          >
                            <span className="text-[11px] font-semibold text-zinc-400">
                              {format.type}
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {format.times.map((time, tIdx) => (
                                <span 
                                  key={tIdx} 
                                  className="inline-flex items-center justify-center rounded-md bg-zinc-800 text-zinc-200 font-medium px-2 py-1 text-xs border border-zinc-700/20"
                                >
                                  {time}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-zinc-500 italic">No hay funciones disponibles para hoy.</p>
                )}
              </div>
            </div>

            <div className="text-center md:text-left text-xs text-zinc-500 border-t border-zinc-800/80 pt-3 flex items-center gap-2">
              <Calendar className="size-4" />
              <span>Horarios actualizados para hoy</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
