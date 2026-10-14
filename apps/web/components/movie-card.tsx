'use client'

import { CinemaMovie } from '@/lib/types'
import Image from 'next/image'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Ticket, Film, Calendar } from 'lucide-react'

interface MovieCardProps {
  movie: CinemaMovie
}

export function MovieCard({ movie }: MovieCardProps) {
  // Encontrar cuántas salas tienen la película disponible
  const cinemasCount = Object.keys(movie.showings).length

  return (
    <div className="group relative flex flex-col rounded-2xl border border-zinc-800/60 bg-zinc-900/40 p-4 backdrop-blur-md transition-all duration-300 hover:border-primary/30 hover:bg-zinc-900/60 hover:shadow-2xl hover:shadow-primary/5">
      {/* Poster del film con zoom y efectos premium */}
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-zinc-950 border border-zinc-800">
        {movie.poster_url ? (
          <Image
            src={movie.poster_url}
            alt={movie.title}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-cover object-center transition-transform duration-500 group-hover:scale-105 group-hover:brightness-110"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-zinc-900 text-zinc-600">
            <Film className="size-12 stroke-[1.5]" />
            <span className="mt-2 text-xs">Sin Poster</span>
          </div>
        )}
        
        {/* Badge flotante con cantidad de cines */}
        <div className="absolute top-3 right-3 z-10">
          <Badge className="bg-black/70 hover:bg-black/80 text-white font-medium border border-zinc-700/50 backdrop-blur-md px-2.5 py-1 text-xs">
            {cinemasCount} {cinemasCount === 1 ? 'Cine' : 'Cines'}
          </Badge>
        </div>
      </div>

      {/* Título de la película */}
      <div className="mt-4 flex flex-col gap-1 min-h-[3.5rem]">
        <h3 className="text-lg font-bold tracking-tight text-zinc-100 group-hover:text-primary transition-colors duration-300 line-clamp-2">
          {movie.title}
        </h3>
      </div>

      <div className="mt-2 border-t border-zinc-800/80 pt-3 flex-1 flex flex-col justify-end">
        {/* Accordion para desplegar los cines y horarios */}
        {cinemasCount > 0 ? (
          <Accordion type="single" collapsible className="w-full">
            {Object.entries(movie.showings).map(([cinemaKey, details], idx) => (
              <AccordionItem 
                key={cinemaKey} 
                value={cinemaKey}
                className="border-b border-zinc-800/50 last:border-none"
              >
                <AccordionTrigger className="py-2 text-sm font-semibold text-zinc-300 hover:text-white hover:no-underline transition-colors">
                  <span className="flex items-center gap-2 text-left">
                    <span className="size-1.5 rounded-full bg-primary" />
                    {details.name}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-3 pt-1">
                  <div className="space-y-3">
                    {/* Formatos y sus Horarios */}
                    <div className="flex flex-col gap-2">
                      {details.formats.map((format, fIdx) => (
                        <div key={fIdx} className="flex flex-col gap-1.5 rounded-lg bg-zinc-950/40 p-2 border border-zinc-800/40">
                          <span className="text-xs font-semibold text-zinc-400">
                            {format.type}
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {format.times.map((time, tIdx) => (
                              <span 
                                key={tIdx} 
                                className="inline-flex items-center justify-center rounded-md bg-zinc-800/70 hover:bg-zinc-800 text-zinc-200 hover:text-white font-medium border border-zinc-700/30 px-2 py-1 text-xs transition-colors shadow-sm"
                              >
                                {time}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Botón de Compra */}
                    {details.booking_url && (
                      <Button 
                        asChild 
                        variant="secondary" 
                        size="sm" 
                        className="w-full gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 hover:text-white font-medium text-xs rounded-lg"
                      >
                        <a 
                          href={details.booking_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                        >
                          <Ticket className="size-3.5 text-primary" />
                          Comprar Entradas
                        </a>
                      </Button>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <p className="text-xs text-zinc-500 italic mt-2 text-center flex items-center justify-center gap-1">
            Sin funciones para hoy
          </p>
        )}
      </div>
    </div>
  )
}
