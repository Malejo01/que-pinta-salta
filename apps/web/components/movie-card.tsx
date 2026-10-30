'use client'

import { CinemaMovie } from '@/lib/types'
import Image from 'next/image'
import { pistasDeCarga, type CargaImagen } from '@/lib/images/carga'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Ticket, Film, Calendar } from 'lucide-react'
import { useIdioma, useTextos } from '@/lib/i18n/use-idioma'
import { hora } from '@/lib/i18n/fechas'

interface MovieCardProps {
  movie: CinemaMovie
  /**
   * B3: cómo carga el póster (ver `lib/images/carga.ts`). Por defecto lazy;
   * `CinesView` pide `'ansiosa'` para la primera fila y `'prioritaria'` para
   * el primer póster, que es el LCP de /cines.
   */
  carga?: CargaImagen
  /**
   * `id` de la tarjeta, para el ancla `/cines#…` del JSON-LD (B2). Opcional:
   * lo pasa solo la grilla de /cines, así no se repite si la tarjeta se usa
   * en otra página.
   */
  id?: string
}

export function MovieCard({ movie, carga = 'diferida', id }: MovieCardProps) {
  // Encontrar cuántas salas tienen la película disponible
  const cinemasCount = Object.keys(movie.showings).length
  const idioma = useIdioma()
  const t = useTextos().cines

  return (
    <div id={id} className="group relative flex flex-col rounded-2xl border border-border bg-card/40 p-4 backdrop-blur-md transition-all duration-300 hover:border-primary/30 hover:bg-card/60 hover:shadow-2xl hover:shadow-primary/5">
      {/* Poster del film con zoom y efectos premium */}
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-muted border border-border">
        {movie.poster_url ? (
          <Image
            src={movie.poster_url}
            alt={movie.title}
            lang={idioma === 'es' ? undefined : 'es'}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-cover object-center transition-transform duration-500 group-hover:scale-105 group-hover:brightness-110"
            unoptimized
            {...pistasDeCarga(carga)}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-muted text-muted-foreground">
            <Film className="size-12 stroke-[1.5]" />
            <span className="mt-2 text-xs">{t.sinPoster}</span>
          </div>
        )}

        {/* Badge flotante con la cantidad de cines: el fondo y el texto quedan fijos
            (no dependen del tema) porque se superponen al afiche de la película, de
            brillo variable, y necesitan contraste garantizado en los dos modos. */}
        <div className="absolute top-3 right-3 z-10">
          <Badge className="bg-black/70 hover:bg-black/80 text-white font-medium border border-zinc-700/50 backdrop-blur-md px-2.5 py-1 text-xs">
            {t.cantidadCines(cinemasCount)}
          </Badge>
        </div>
      </div>

      {/* Título de la película */}
      <div className="mt-4 flex flex-col gap-1 min-h-[3.5rem]">
        {/* El título viene del cine, en castellano: en /en va con lang="es". */}
        {/* 77-a1: `h2` (la grilla de cartelera cuelga del `h1` de la página; antes saltaba a `h3`). */}
        <h2 lang={idioma === 'es' ? undefined : 'es'} className="text-lg font-bold tracking-tight text-foreground group-hover:text-primary transition-colors duration-300 line-clamp-2">
          {movie.title}
        </h2>
      </div>

      <div className="mt-2 border-t border-border pt-3 flex-1 flex flex-col justify-end">
        {/* Accordion para desplegar los cines y horarios */}
        {cinemasCount > 0 ? (
          <Accordion type="single" collapsible className="w-full">
            {Object.entries(movie.showings).map(([cinemaKey, details], idx) => (
              <AccordionItem
                key={cinemaKey}
                value={cinemaKey}
                className="border-b border-border last:border-none"
              >
                <AccordionTrigger className="py-2 text-sm font-semibold text-muted-foreground hover:text-foreground hover:no-underline transition-colors">
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
                        <div key={fIdx} className="flex flex-col gap-1.5 rounded-lg bg-muted/40 p-2 border border-border">
                          <span className="text-xs font-semibold text-muted-foreground">
                            {format.type}
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {format.times.map((time, tIdx) => (
                              <span
                                key={tIdx}
                                className="inline-flex items-center justify-center rounded-md bg-muted hover:bg-muted/70 text-foreground font-medium border border-border px-2 py-1 text-xs transition-colors shadow-sm"
                              >
                                {hora(idioma, time)}
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
                        className="w-full gap-1.5 font-medium text-xs rounded-lg"
                      >
                        <a
                          href={details.booking_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Ticket className="size-3.5 text-primary" />
                          {t.comprarEntradas}
                        </a>
                      </Button>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <p className="text-xs text-muted-foreground italic mt-2 text-center flex items-center justify-center gap-1">
            {t.sinFuncionesHoy}
          </p>
        )}
      </div>
    </div>
  )
}
