"use client"

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Search } from "lucide-react"
import type { Category, CinemaMovie } from "@/lib/types"
import type { EventWithRelations } from "@/lib/home/types"
import type { FlyerWithAccount } from "@/lib/instagram-config"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Navbar } from "@/components/navbar"
import { MobileNav } from "@/components/mobile-nav"
import { EventCard } from "@/components/event-card"
import { EventModal } from "@/components/event-modal"
import { MovieModal } from "@/components/movie-modal"
import { getCategoryIcon } from "@/lib/category-icons"
import { AdSenseBanner } from "@/components/adsense-banner"
import { transformEvent, type DisplayEvent } from "@/components/home-content"
import { filtrarCombinado, type ItemFiltrable } from "@qps/core/home/filtros-combinados"
import { AvisoContenidoEs } from "@/components/aviso-contenido-es"
import { langDeCategoria, textosDe } from "@/lib/i18n"
import type { Idioma } from "@/lib/i18n/idiomas"
import { localizarCategorias, localizarEventos } from "@/lib/i18n/portada"
import { rutaEn } from "@/lib/i18n/rutas"

/** Cuánto se espera a que se deje de tipear para anunciar el contador. */
const ESPERA_ANUNCIO_MS = 700

function formatDateInSalta(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Salta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date)
}

/**
 * Los dos chips de filtro ("Solo gratis" y "Para chicos") comparten estilo:
 * 44 px de alto (h-11), relleno cuando están prendidos y foco visible.
 */
function claseChip(activo: boolean): string {
  return `inline-flex h-11 items-center justify-center rounded-full border px-4 text-sm font-medium transition-colors outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
    activo
      ? "border-primary bg-primary text-primary-foreground"
      : "border-border bg-card text-foreground hover:bg-muted"
  }`
}

function transformFlyer(flyer: FlyerWithAccount, categoryNameBySlug: Map<string, string>): DisplayEvent {
  const publishedDate = new Date(flyer.published_at)
  const categorySlug = flyer.category || flyer.account.default_category || 'boliches'
  return {
    id: `ig-${flyer.id}`,
    slug: `ig-${flyer.id}`,
    title: flyer.account.display_name,
    venue: flyer.venue_name || flyer.account.default_venue_name || flyer.account.display_name,
    date: formatDateInSalta(publishedDate),
    time: '',
    category: categorySlug,
    categoryName: categoryNameBySlug.get(categorySlug) || categorySlug,
    price: flyer.is_free ? "gratis" as const : (flyer.price_min === 0 ? "confirmar" as const : flyer.price_min),
    image: flyer.storage_image_url || flyer.original_image_url || '/placeholder.svg?height=600&width=400',
    description: flyer.caption || '',
    address: '',
    startDateTime: flyer.published_at,
    vibe: "adultos" as const,
    isFeatured: false,
    isInstagramFlyer: true,
    flyerId: flyer.id,
    instagramPostUrl: flyer.ig_post_url,
    instagramUsername: flyer.account.username,
  }
}

interface BuscarContentProps {
  events: EventWithRelations[]
  categories: Category[]
  serverNowISO: string
  flyers: FlyerWithAccount[]
  cinemaMovies: CinemaMovie[]
  userFavorites: string[]
  /** Si hay sesión (la lee /buscar en el servidor): lo usa "Voy / Me interesa" del modal. */
  haySesion?: boolean
  /** Idioma de la interfaz (`/en/buscar` es inglés). Los eventos quedan en castellano. */
  idioma?: Idioma
}

export function BuscarContent({
  events,
  categories,
  serverNowISO,
  flyers,
  cinemaMovies,
  userFavorites,
  haySesion = false,
  idioma = "es"
}: BuscarContentProps) {
  const t = textosDe(idioma).buscar
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedEvent, setSelectedEvent] = useState<DisplayEvent | null>(null)
  const [selectedMovie, setSelectedMovie] = useState<DisplayEvent | null>(null)
  const [favorites, setFavorites] = useState<string[]>(userFavorites)
  const [soloGratisActivo, setSoloGratisActivo] = useState(false)
  const [paraChicosActivo, setParaChicosActivo] = useState(false)
  // "Quitar filtros" (del vacío) devuelve el foco acá: el botón desaparece.
  const soloGratisRef = useRef<HTMLButtonElement>(null)
  const deferredSearchQuery = useDeferredValue(searchQuery)

  const categoryNameBySlug = useMemo(() => {
    return new Map(categories.map((category) => [category.slug, category.name]))
  }, [categories])

  const allDisplayEvents = useMemo(() => {
    const eventItems = events
      .filter((event) => event.category)
      .map(transformEvent)
    
    const groupedEventItemsMap = new Map<string, DisplayEvent>()
    eventItems.forEach(item => {
      const groupKey = `${item.title.toLowerCase().trim()}|${item.venue.toLowerCase().trim()}`
      if (groupedEventItemsMap.has(groupKey)) {
        const existing = groupedEventItemsMap.get(groupKey)!
        const existingDate = new Date(existing.startDateTime).getTime()
        const currentDate = new Date(item.startDateTime).getTime()
        if (currentDate < existingDate) {
          const occurrences = existing.occurrences || [{ id: existing.id, date: existing.date, time: existing.time }]
          occurrences.push({ id: item.id, date: item.date, time: item.time })
          existing.id = item.id
          existing.date = item.date
          existing.time = item.time
          existing.startDateTime = item.startDateTime
          existing.occurrences = occurrences
        } else {
          if (!existing.occurrences) {
            existing.occurrences = [{ id: existing.id, date: existing.date, time: existing.time }]
          }
          existing.occurrences.push({ id: item.id, date: item.date, time: item.time })
        }
      } else {
        groupedEventItemsMap.set(groupKey, {
          ...item,
          occurrences: [{ id: item.id, date: item.date, time: item.time }]
        })
      }
    })
    
    const finalEventItems = Array.from(groupedEventItemsMap.values()).map(item => {
      if (item.occurrences && item.occurrences.length > 1) {
        item.occurrences.sort((a, b) => new Date(a.date + 'T00:00:00').getTime() - new Date(b.date + 'T00:00:00').getTime())
        const first = item.occurrences[0]
        item.id = first.id
        item.date = first.date
        item.time = first.time
      }
      return item
    })

    const flyerItems = flyers.map((flyer) => transformFlyer(flyer, categoryNameBySlug))

    const movieItems = (cinemaMovies || []).map((movie): DisplayEvent => {
      const showCount = Object.keys(movie.showings || {}).length
      const saltaTodayStr = formatDateInSalta(new Date(serverNowISO))
      return {
        id: `movie-${movie.id}`,
        slug: movie.slug,
        title: movie.title,
        venue: `${showCount} ${showCount === 1 ? 'Cine' : 'Cines'} de Salta`,
        date: saltaTodayStr,
        time: '',
        category: 'cine',
        categoryName: 'Cine',
        price: 'confirmar' as const,
        image: movie.poster_url || '/placeholder.svg?height=600&width=400',
        description: '',
        address: '',
        startDateTime: movie.created_at,
        isFeatured: false,
        isCinemaMovie: true,
        showings: movie.showings,
      }
    })
    
    const todos = [...finalEventItems, ...flyerItems, ...movieItems]
    // En inglés se traduce lo que arma el sitio (nombre de la categoría, "N Cines
    // de Salta", "Lugar por confirmar"); títulos y lugares quedan como vienen.
    return idioma === "es" ? todos : localizarEventos(todos, idioma)
  }, [events, flyers, cinemaMovies, categoryNameBySlug, serverNowISO, idioma])
  const localizedCategories = useMemo(() => localizarCategorias(categories, idioma), [categories, idioma])

  // Texto + "Solo gratis" + "Para chicos" (Q3, C2): una sola llamada a
  // `filtrarCombinado` de core, la misma que usa la app (sin fecha ni
  // categoría en Buscar). Los flyers y las películas no traen `tags`: pasan
  // "Para chicos" solo si su categoría es `infantil` (`esParaChicos`).
  const itemsFiltrables = useMemo(
    (): ItemFiltrable[] => allDisplayEvents.map((evento) => ({ evento, paraAtajo: null })),
    [allDisplayEvents]
  )
  const ahora = useMemo(() => new Date(serverNowISO), [serverNowISO])

  // Todo lo de la lista (si se ve, qué trae y qué dice el contador) sale del
  // valor diferido: mientras React no llega a filtrar con lo último que se
  // tipeó, queda la pantalla anterior entera, nunca un contador de "x" con
  // los resultados de otra cosa. Sin texto (o solo espacios) y sin chips, la
  // grilla de categorías; sin texto y con un chip, todos los eventos que
  // pasan el chip (`filtrarCombinado` con texto vacío no filtra por texto).
  const textoBuscado = deferredSearchQuery.trim()
  const hayChip = soloGratisActivo || paraChicosActivo
  const mostrarListaResultados = textoBuscado !== "" || hayChip

  const resultadosMostrados = useMemo(() => {
    if (!mostrarListaResultados) return []
    return filtrarCombinado(
      itemsFiltrables,
      { atajo: null, categoria: null, texto: deferredSearchQuery, soloGratis: soloGratisActivo, paraChicos: paraChicosActivo },
      ahora
    )
  }, [mostrarListaResultados, itemsFiltrables, deferredSearchQuery, soloGratisActivo, paraChicosActivo, ahora])

  const cantidad = resultadosMostrados.length

  // Lo que anuncia la región viva (siempre montada): el contador, o el vacío
  // si no hay resultados, o nada si se ve la grilla. Con texto, los chips van
  // de sufijo (" · gratis · para chicos", como la fecha en la app); sin texto,
  // describen los eventos.
  let anuncio = ""
  if (mostrarListaResultados && cantidad > 0) {
    anuncio = textoBuscado
      ? t.resultados(cantidad, textoBuscado, soloGratisActivo, paraChicosActivo)
      : t.eventosFiltrados(cantidad, soloGratisActivo, paraChicosActivo)
  } else if (mostrarListaResultados) {
    anuncio = textoBuscado
      ? t.sinResultadosParaTexto(textoBuscado, soloGratisActivo, paraChicosActivo)
      : t.sinEventosFiltrados(soloGratisActivo, paraChicosActivo)
  }
  const sinResultados = mostrarListaResultados && cantidad === 0

  // La región viva anuncia el texto cuando se deja de tipear (~700 ms), no en
  // cada tecla («1 resultado para "tit"», «…"tite"»…). Un chip, en cambio, se
  // anuncia al toque: el texto no cambió, así que ya está "quieto".
  const [textoQuieto, setTextoQuieto] = useState(textoBuscado)
  useEffect(() => {
    const espera = window.setTimeout(() => setTextoQuieto(textoBuscado), ESPERA_ANUNCIO_MS)
    return () => window.clearTimeout(espera)
  }, [textoBuscado])
  const [anuncioVivo, setAnuncioVivo] = useState(anuncio)
  if (textoBuscado === textoQuieto && anuncioVivo !== anuncio) setAnuncioVivo(anuncio)

  // Apaga los dos chips (el texto queda) y deja el foco en "Solo gratis":
  // el botón que se tocó se va con el vacío.
  const quitarFiltros = () => {
    setSoloGratisActivo(false)
    setParaChicosActivo(false)
    soloGratisRef.current?.focus()
  }

  // Una sola lista de favoritos para la tarjeta y el modal del mismo evento
  // (QPS-158): cada corazón avisa el estado confirmado por el servidor.
  const handleToggleFavorite = (eventId: string, favorited: boolean) => {
    setFavorites(prev => {
      const sinEste = prev.filter(id => id !== eventId)
      return favorited ? [...sinEste, eventId] : sinEste
    })
  }

  return (
    <div className="min-h-screen bg-background pb-page sm:pb-0">
      <Navbar />
      
      <main id="contenido" tabIndex={-1} className="container mx-auto px-4 py-8 focus:outline-none">
        <div className="mb-6">
          <Button variant="ghost" asChild className="mb-4">
            <Link href={rutaEn(idioma, "/")}>
              <ArrowLeft className="mr-2 size-4" />
              {t.volver}
            </Link>
          </Button>
          <h1 className="text-3xl font-bold text-foreground">{t.titulo}</h1>
          {idioma === "en" && <AvisoContenidoEs className="mt-2" />}
        </div>

        <div className="mb-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder={t.placeholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-12 pl-11 text-lg"
              autoFocus
            />
          </div>
          <div role="group" aria-label={t.filtros} className="mt-3 flex flex-wrap gap-2">
            <button
              ref={soloGratisRef}
              type="button"
              aria-pressed={soloGratisActivo}
              onClick={() => setSoloGratisActivo((activo) => !activo)}
              className={claseChip(soloGratisActivo)}
            >
              {t.soloGratis}
            </button>
            <button
              type="button"
              aria-pressed={paraChicosActivo}
              onClick={() => setParaChicosActivo((activo) => !activo)}
              className={claseChip(paraChicosActivo)}
            >
              {t.paraChicos}
            </button>
          </div>
        </div>

        {!mostrarListaResultados && (
          <div>
            <h2 className="mb-4 text-lg font-semibold text-foreground">
              {t.explorarPorCategoria}
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {localizedCategories
                .map((category) => ({
                  category,
                  count: allDisplayEvents.filter(e => e.category === category.slug).length,
                }))
                .filter(({ count }) => count > 0)
                .map(({ category, count }) => {
                  const Icon = getCategoryIcon(category.slug)
                  return (
                    <Link
                      key={category.slug}
                      href={rutaEn(idioma, `/?category=${category.slug}`)}
                      className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted"
                    >
                      <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                        <Icon className="size-5 text-primary" />
                      </div>
                      <div>
                        <p lang={langDeCategoria(idioma, category.slug)} className="font-medium text-foreground">{category.name}</p>
                        <p className="text-sm text-muted-foreground">{t.eventosEnCategoria(count)}</p>
                      </div>
                    </Link>
                  )
                })}
            </div>
          </div>
        )}

        {/* El contador o el vacío: a la vista, al instante (aria-hidden, porque
            lo dice la región viva de al lado); para el lector de pantalla, una
            región viva siempre montada (vacía con la grilla) que espera a que
            se deje de tipear. `break-words`: un texto largo sin espacios no
            ensancha la página en 360 px. */}
        <div className={sinResultados ? "py-16 text-center" : undefined}>
          <p aria-live="polite" className="sr-only">
            {anuncioVivo}
          </p>
          <p
            aria-hidden="true"
            className={sinResultados ? "text-lg break-words text-muted-foreground" : anuncio ? "mb-4 break-words text-muted-foreground" : undefined}
          >
            {anuncio}
          </p>
          {sinResultados && hayChip && (
            <Button type="button" variant="outline" onClick={quitarFiltros} className="mt-4 h-11 px-4">
              {t.quitarFiltros}
            </Button>
          )}
        </div>

        {mostrarListaResultados && cantidad > 0 && (
          <div className="flex flex-wrap gap-4">
            {resultadosMostrados.map(event => (
              <EventCard
                key={event.id}
                event={event}
                isFavorite={favorites.includes(event.id)}
                onToggleFavorite={handleToggleFavorite}
                onOpenMovie={setSelectedMovie}
                origin="busqueda"
              />
            ))}
          </div>
        )}

        {/* Con 0 resultados el estado vacío es cortito: el banner asomaría
            sin scroll justo debajo de "no se encontraron eventos" (regla del
            pliegue, 360x800). Se oculta en ese caso puntual. */}
        {!sinResultados && (
          <div className="mt-8">
            <AdSenseBanner lugar="buscar" />
          </div>
        )}
      </main>

      <EventModal
        event={selectedEvent}
        open={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
        origin="busqueda"
        isFavorite={!!selectedEvent && favorites.includes(selectedEvent.id)}
        onFavoriteChange={handleToggleFavorite}
        haySesion={haySesion}
      />
      
      {selectedMovie && (
        <MovieModal 
          movie={selectedMovie} 
          isFavorite={favorites.includes(selectedMovie.id)}
          onClose={() => setSelectedMovie(null)} 
        />
      )}

      <MobileNav />
    </div>
  )
}
