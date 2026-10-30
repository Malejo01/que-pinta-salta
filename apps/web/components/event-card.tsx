"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { Calendar, MapPin, Instagram, Film } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { InsigniaDestacado } from "@/components/insignia-destacado"
import { cn } from "@/lib/utils"
import { fechaCorta, fechaDeFuncion, hora, precio, resumenFunciones } from "@/lib/i18n/fechas"
import { langDeCategoria } from "@/lib/i18n"
import { useIdioma, useTextos } from "@/lib/i18n/use-idioma"
import { rutaEn } from "@/lib/i18n/rutas"
import { FavoriteButton } from "@/components/favorite-button"
import { ShareButton } from "@/components/share-button"
import { FlyerImage } from "@/components/flyer-image"
import { pistasDeCarga, type CargaImagen } from "@/lib/images/carga"
import { useDonation } from "@/components/donation-context"
import type { DisplayEvent } from "@/components/home-content"
import { eventHref, type MetricOrigin } from "@/lib/metricas/links"
import type { MovieShowings } from "@/lib/types"

interface EventCardProps {
  event: DisplayEvent
  isFavorite?: boolean
  /** El corazón confirmó un cambio (QPS-158): el padre sincroniza su lista de favoritos. */
  onToggleFavorite?: (eventId: string, favorited: boolean) => void
  onOpenMovie?: (movie: DisplayEvent) => void
  className?: string
  /** Desde dónde se llegó al evento; viaja como `?o=` para medir vistas. */
  origin?: MetricOrigin
  /**
   * B3: cómo carga el flyer (ver `lib/images/carga.ts`). Por defecto lazy,
   * como siempre; /favoritos pide carga ansiosa para las primeras tarjetas de
   * la primera grilla, que son el LCP de la página.
   */
  carga?: CargaImagen
}

/** Máximo de ítems en las capas de hover (tarjeta de ~270-300 px de alto). */
const MAX_CINES = 3
const MAX_FUNCIONES = 4

export function EventCard({ event, isFavorite, onToggleFavorite, onOpenMovie, className, origin, carga = "diferida" }: EventCardProps) {
  const [imgSrc, setImgSrc] = useState<string>(event.image || "/placeholder.jpg")
  const [failedImage, setFailedImage] = useState<string | null>(null)
  const { openDonationModal } = useDonation()
  const idioma = useIdioma()
  const t = useTextos().portada

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza la imagen si cambia el evento
    setImgSrc(event.image || "/placeholder.jpg")
  }, [event.image])

  // Eventos sin flyer (o con imagen rota): fallback de marca en vez del placeholder.
  // Flyers de Instagram y películas conservan su comportamiento.
  const showBrandFallback =
    !event.isInstagramFlyer &&
    !event.isCinemaMovie &&
    (failedImage === event.image || !event.image || event.image.startsWith("/placeholder"))

  const formattedDate = fechaCorta(idioma, event.date)

  const formattedPrice = event.price === "gratis" 
    ? t.gratis 
    : event.price === "confirmar"
    ? null
    : precio(idioma, event.price)

  const linkHref = event.isInstagramFlyer && event.flyerId
    ? `/flyer/${event.flyerId}`
    : rutaEn(idioma, eventHref(event.id, origin))

  // Pie de card siempre visible para eventos con varias funciones (QPS-024);
  // el cine tiene su propio overlay de horarios y no usa esta línea.
  //
  // `new Date()` en el render da un instante distinto en el servidor (momento
  // del pedido) y en el cliente (momento de la hidratación), así que el texto
  // puede diferir si una función queda en el medio. El `<p>` de abajo lleva
  // `suppressHydrationWarning`: lo único que cambia es su texto, nunca si el
  // elemento existe o no (`summarizeOccurrences` devuelve null solo cuando hay
  // una sola ocurrencia, y eso es igual en los dos lados).
  const hasSeveralOccurrences =
    !event.isCinemaMovie && !!event.occurrences && event.occurrences.length > 1
  const occurrencesSummary = hasSeveralOccurrences
    ? resumenFunciones(idioma, event.occurrences!, new Date())
    : null

  // Las capas de hover cortan lo que no entra: se muestran pocos ítems y el resto
  // va como "+N más", para que el pie ("Click para…") quede siempre visible.
  const cinesTodos =
    event.isCinemaMovie && event.showings ? Object.entries(event.showings as MovieShowings) : []
  const cinesVisibles = cinesTodos.slice(0, MAX_CINES)
  const cinesOcultos = cinesTodos.length - cinesVisibles.length

  const handleClick = (e: React.MouseEvent) => {
    if (event.isCinemaMovie && onOpenMovie) {
      e.preventDefault()
      e.stopPropagation()
      onOpenMovie(event)
    }
  }

  // QPS-159: un solo mecanismo de compartir (Web Share API / portapapeles en
  // `ShareButton`), ya no un link de WhatsApp armado a mano. El id de
  // `DisplayEvent` no siempre es el uuid de `events` (`movie-…`, `ig-…`), así
  // que acá sí armamos la URL según el tipo — lo que cambió es cómo se
  // comparte (`shareEvent`), no la URL de destino.
  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "https://quepintasalta.com.ar"
  const shareUrl = event.isCinemaMovie
    ? `${currentOrigin}/cines`
    : event.isInstagramFlyer && event.flyerId
    ? `${currentOrigin}/flyer/${event.flyerId}`
    : `${currentOrigin}${rutaEn(idioma, eventHref(event.id))}`

  // Se mantiene el modal de donación de hoy, pero solo si se compartió de
  // verdad o se copió el link (ver `ShareButton`/`shareEvent`), no si se
  // canceló el diálogo nativo.
  const handleShared = () => {
    setTimeout(() => {
      openDonationModal(t.graciasPorCompartir)
    }, 800)
  }

  return (
    <Link href={event.isCinemaMovie ? "#" : linkHref} onClick={handleClick}>
      <motion.div
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.98 }}
        className={cn(
          "group/card relative aspect-[2/3] w-[180px] shrink-0 cursor-pointer overflow-hidden rounded-xl bg-card shadow-lg hover:shadow-2xl hover:shadow-primary/10 sm:w-[200px] transition-all duration-300",
          event.isFeatured && "ring-1 ring-amber-500/50 hover:ring-amber-500",
          className
        )}
      >
        {showBrandFallback ? (
          <div
            aria-hidden
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-primary px-4 text-center text-primary-foreground"
          >
            <span className="text-5xl font-extrabold leading-none opacity-90">
              {(event.categoryName || "Q").charAt(0).toUpperCase()}
            </span>
            <span className="text-xs font-bold uppercase tracking-wider opacity-80">
              Qué Pinta Salta
            </span>
          </div>
        ) : (
          <FlyerImage
            variant={400}
            src={imgSrc}
            alt={event.title}
            lang={idioma === "es" ? undefined : "es"}
            fill
            className="object-cover transition-transform duration-300 group-hover/card:scale-105"
            {...pistasDeCarga(carga)}
            onError={() => {
              if (event.isInstagramFlyer || event.isCinemaMovie) {
                setImgSrc("/placeholder.jpg")
              } else {
                setFailedImage(event.image)
              }
            }}
          />
        )}

        {/* Hover overlay con horarios de cine */}
        {event.isCinemaMovie && event.showings && (
          // 77-a1: capa solo de mouse (aparece con hover). `aria-hidden` + `overflow-hidden`
          // (antes `overflow-y-auto`): sin región con scroll inalcanzable con teclado ni
          // encabezado `h4` suelto; el lector de pantalla lee el título y el modal tiene los horarios.
          <div aria-hidden="true" className="absolute inset-0 bg-black/95 p-3 opacity-0 group-hover/card:opacity-100 transition-all duration-300 flex flex-col justify-between z-20 text-white overflow-hidden">
            <div className="min-h-0 flex-1 space-y-3 overflow-hidden">
              <p className="text-xs font-bold text-[#F0585D] border-b border-primary/20 pb-1 flex items-center gap-1.5">
                <Film className="size-3.5" />
                {t.funcionesHoy}
              </p>
              <div className="space-y-2">
                {cinesVisibles.map(([cinemaKey, details]) => (
                  <div key={cinemaKey} className="space-y-0.5">
                    <p className="text-[11px] font-bold text-zinc-300 truncate">
                      {details.name}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {details.formats.flatMap((f) => f.times).slice(0, 5).map((time: string, tIdx: number) => (
                        <span 
                          key={tIdx} 
                          className="bg-zinc-800 text-zinc-200 text-[11px] px-1 py-0.5 rounded border border-zinc-700/30"
                        >
                          {hora(idioma, time)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                {cinesOcultos > 0 && (
                  <p className="text-[11px] font-semibold text-zinc-300">{t.masItems(cinesOcultos)}</p>
                )}
              </div>
            </div>
            <p className="shrink-0 text-[11px] text-zinc-400 text-center italic mt-2 border-t border-zinc-800/80 pt-1">
              {t.clickHorarios}
            </p>
          </div>
        )}

        {/* Hover overlay para eventos con múltiples fechas/horarios */}
        {!event.isCinemaMovie && event.occurrences && event.occurrences.length > 1 && (
          // 77-a1: igual que la capa de cine (aria-hidden, sin scroll). Muestra hasta
          // MAX_FUNCIONES y "+N más"; el resto de las funciones está en la ficha.
          <div aria-hidden="true" className="absolute inset-0 bg-black/95 p-3 opacity-0 group-hover/card:opacity-100 transition-all duration-300 flex flex-col justify-between z-20 text-white overflow-hidden">
            <div className="min-h-0 flex-1 space-y-3 overflow-hidden">
              <p className="text-xs font-bold text-[#F0585D] border-b border-primary/20 pb-1 flex items-center gap-1.5">
                <Calendar className="size-3.5" />
                {t.proximasFunciones}
              </p>
              <div className="space-y-1.5 pr-1">
                {event.occurrences.slice(0, MAX_FUNCIONES).map((occ, idx) => {
                  const formattedOccDate = fechaDeFuncion(idioma, occ.date)
                  return (
                    <div key={idx} className="flex justify-between items-center text-[11px] py-1 border-b border-zinc-800/40 last:border-none">
                      <span className="font-medium text-zinc-200">
                        {formattedOccDate}
                      </span>
                      <span className="bg-zinc-850 text-zinc-300 border border-zinc-700/20 px-1 py-0.5 rounded text-[11px] font-semibold">
                        {occ.time ? hora(idioma, occ.time) : t.sinHora}
                      </span>
                    </div>
                  )
                })}
                {event.occurrences.length > MAX_FUNCIONES && (
                  <p className="text-[11px] font-semibold text-zinc-300">
                    {t.masItems(event.occurrences.length - MAX_FUNCIONES)}
                  </p>
                )}
              </div>
            </div>
            <p className="shrink-0 text-[11px] text-zinc-400 text-center italic mt-2 border-t border-zinc-800/80 pt-1">
              {t.clickDetalles}
            </p>
          </div>
        )}
        
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
        
        <FavoriteButton 
          itemId={event.id}
          type={event.isCinemaMovie ? 'cinema' : (event.isInstagramFlyer ? 'flyer' : 'event')}
          initialIsFavorite={!!isFavorite}
          onChange={onToggleFavorite ? (favorited) => onToggleFavorite(event.id, favorited) : undefined}
          className="absolute right-2 top-2 z-30 sm:opacity-0 sm:group-hover/card:opacity-100 sm:focus-visible:opacity-100 transition-all duration-350"
        />

        <ShareButton
          eventId={event.id}
          title={event.title}
          url={shareUrl}
          onShared={handleShared}
          className="absolute right-12 top-2 z-30 sm:opacity-0 sm:group-hover/card:opacity-100 sm:focus-visible:opacity-100 duration-350"
        />

        <Badge 
          variant="secondary" 
          lang={langDeCategoria(idioma, event.category)}
          className="absolute left-2 top-2 bg-primary text-primary-foreground"
        >
          {event.categoryName}
        </Badge>

        {event.isInstagramFlyer && (
          <div className="absolute right-2 top-12 flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 backdrop-blur-sm z-30">
            <Instagram className="size-3 text-pink-400" />
          </div>
        )}

        <InsigniaDestacado visible={event.isFeatured} className="absolute left-2 top-8" />

        <div className="absolute bottom-0 left-0 right-0 p-3 text-white transition-all duration-300 group-hover/card:-translate-y-1">
          {/* El título viene de la fuente, en castellano: en /en va con lang="es". */}
          <h3 lang={idioma === "es" ? undefined : "es"} className="mb-1 line-clamp-2 text-sm font-semibold leading-tight">
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
              {event.time && <span className="ml-1">{hora(idioma, event.time)}</span>}
            </div>
          </div>

          {/* "+3 fechas · 12 oct 21:00" (~24 caracteres) entra en un renglón a 11 px
              en una card de 180 px. `line-clamp-1` lo acota ahí: si alguna vez el
              formato crece, se corta en lugar de empujar el precio fuera de la card. */}
          {occurrencesSummary && (
            <p
              suppressHydrationWarning
              className="mt-1 line-clamp-1 text-[11px] leading-snug text-white/70"
            >
              {occurrencesSummary}
            </p>
          )}

          {formattedPrice && (
            <div className="mt-2 flex items-center justify-between">
              <span className={cn(
                "text-sm font-bold",
                event.price === "gratis" ? "text-green-400" : "text-white"
              )}>
                {formattedPrice}
              </span>
            </div>
          )}
        </div>
      </motion.div>
    </Link>
  )
}
