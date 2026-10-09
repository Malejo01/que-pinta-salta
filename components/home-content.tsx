"use client"

import { useMemo, useState, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Image from "next/image"
import type { Category, CinemaMovie } from "@/lib/types"
import type { FlyerWithAccount } from "@/lib/instagram-config"
import { Navbar } from "@/components/navbar"
import { MobileNav } from "@/components/mobile-nav"
import { HeroCarousel } from "@/components/hero-carousel"
import { FiltersBar, DateFilter } from "@/components/filters-bar"
import { CategoryRow } from "@/components/category-row"
import { EventCard } from "@/components/event-card"
import { MovieModal } from "@/components/movie-modal"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { AdSenseBanner } from "@/components/adsense-banner"
import { Film } from "lucide-react"
import type { DisplayEvent, EventWithRelations } from "@/lib/home/types"
import { buildDisplayData } from "@/lib/home/transform"
import { sortCategories, selectCarouselEvents } from "@/lib/home/carousel"
import { filterEvents, groupByCategory, selectTodayRow } from "@/lib/home/filters"
import { nextHomeUrl, shouldReplaceUrl } from "@/lib/home/url-sync"

export type { DisplayEvent } from "@/lib/home/types"
export { transformEvent } from "@/lib/home/transform"

interface HomeContentProps {
  events: EventWithRelations[]
  categories: Category[]
  serverNowISO: string
  favoriteCategorySlugs?: string[]
  flyers?: FlyerWithAccount[]
  cinemaMovies?: CinemaMovie[]
  userFavorites?: string[]
}

export function HomeContent({
  events,
  categories,
  serverNowISO,
  favoriteCategorySlugs = [],
  flyers = [],
  cinemaMovies = [],
  userFavorites = [],
}: HomeContentProps) {
  const searchParams = useSearchParams()
  const router = useRouter()

  // Estado para la película seleccionada que se mostrará en el modal
  const [selectedMovie, setSelectedMovie] = useState<DisplayEvent | null>(null)

  // Inicializar estado local de filtros a partir de la URL (solo en la carga inicial)
  const [search, setSearch] = useState(() => searchParams.get("search") || "")
  const [date, setDate] = useState<DateFilter | null>(() => searchParams.get("date") as DateFilter | null)
  const [category, setCategory] = useState<string | null>(() => searchParams.get("category"))
  const [establishment, setEstablishment] = useState(() => searchParams.get("establishment") || "")
  const [location, setLocation] = useState(() => searchParams.get("location") || "")
  const [dateExact, setDateExact] = useState<string | null>(() => searchParams.get("dateExact"))
  const [instagram, setInstagram] = useState(() => searchParams.get("instagram") !== "false")

  // Efecto para sincronizar silenciosamente el estado de los filtros con la URL del navegador
  useEffect(() => {
    const nextUrl = nextHomeUrl({ search, date, category, establishment, location, dateExact, instagram })
    const currentUrl = window.location.pathname + window.location.search

    // Si la URL actual ya es la que corresponde (pasa en el primer montaje), no tocar el
    // historial: `replaceState(null, ...)` pisaría el `state` que Next.js le puso a esta
    // entrada antes de que su propio parche de `history.replaceState` esté activo (los
    // efectos del hijo corren antes que los del padre `AppRouter`). Eso dejaba la entrada
    // `/` con `state = null` y rompía el `popstate` al volver atrás desde un modal.
    // Ver ops/rondas/18-imagenes-rendimiento/repro-18f.md (tarea 18-f).
    if (!shouldReplaceUrl(currentUrl, nextUrl)) return

    // Actualizar la URL de forma shallow (silenciosa), sin recargar componentes del servidor
    // ni relanzar peticiones, conservando el estado que Next.js ya le haya puesto.
    window.history.replaceState(window.history.state, "", nextUrl)
  }, [search, date, category, establishment, location, dateExact, instagram])

  // Sincronizar el estado local cuando cambian los query parameters en la URL (por ejemplo, al hacer click en el logo o navegar atrás/adelante)
  useEffect(() => {
    const urlSearch = searchParams.get("search") || ""
    const urlDate = searchParams.get("date") as DateFilter | null
    const urlCategory = searchParams.get("category")
    const urlEstablishment = searchParams.get("establishment") || ""
    const urlLocation = searchParams.get("location") || ""
    const urlDateExact = searchParams.get("dateExact")
    const urlInstagram = searchParams.get("instagram") !== "false"

    setSearch(urlSearch)
    setDate(urlDate)
    setCategory(urlCategory)
    setEstablishment(urlEstablishment)
    setLocation(urlLocation)
    setDateExact(urlDateExact)
    setInstagram(urlInstagram)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const categoryNameBySlug = useMemo(() => {
    return new Map(categories.map((category) => [category.slug, category.name]))
  }, [categories])

  // Instante único para esta renderización: lo que antes era `new Date(serverNowISO)`
  // dentro de cada useMemo, ahora se calcula una vez y se pasa a las funciones puras.
  const now = useMemo(() => new Date(serverNowISO), [serverNowISO])

  const displayData = useMemo(
    () => buildDisplayData(events, flyers, cinemaMovies, categoryNameBySlug, now),
    [events, flyers, cinemaMovies, categoryNameBySlug, now]
  )

  const allDisplayEvents = displayData.all
  const todayDisplayEvents = displayData.today
  const saltaTodayStr = displayData.saltaTodayStr

  const sortedCategories = useMemo(() => {
    return sortCategories(categories, allDisplayEvents, now, favoriteCategorySlugs)
  }, [categories, allDisplayEvents, now, favoriteCategorySlugs])

  const carouselEvents = useMemo(() => {
    return selectCarouselEvents(allDisplayEvents, sortedCategories, now)
  }, [allDisplayEvents, sortedCategories, now])

  const filteredEvents = useMemo(() => {
    return filterEvents(
      allDisplayEvents,
      todayDisplayEvents,
      saltaTodayStr,
      search,
      establishment,
      location,
      dateExact,
      date,
      category,
      instagram
    )
  }, [
    allDisplayEvents,
    todayDisplayEvents,
    saltaTodayStr,
    search,
    establishment,
    location,
    dateExact,
    date,
    category,
    instagram,
  ])

  const eventsByCategory = useMemo(() => {
    return groupByCategory(sortedCategories, filteredEvents, date, dateExact, now)
  }, [sortedCategories, filteredEvents, date, dateExact, now])

  // Fila "Hoy en Salta" (solo home sin filtros): eventos de hoy por hora.
  const todayRowEvents = useMemo(
    () => selectTodayRow(todayDisplayEvents, saltaTodayStr, now),
    [todayDisplayEvents, saltaTodayStr, now]
  )

  const clearFilters = () => {
    setSearch("")
    setDate(null)
    setCategory(null)
    setEstablishment("")
    setLocation("")
    setDateExact(null)
    setInstagram(true)
  }

  const hasFilters = Boolean(
    search ||
    date ||
    dateExact ||
    category ||
    establishment ||
    location
  )
  const showCategoryRows = !category && eventsByCategory.some(cat => cat.events.length > 0)
  const showFilteredGrid = category && filteredEvents.length > 0
  const filteredTitle = category
    ? categoryNameBySlug.get(category) ?? category
    : "Resultados filtrados"

  return (
    <div className="min-h-screen bg-background pb-20 sm:pb-0">
      <Navbar />

      <main>
        <h1 className="sr-only">Que pinta Salta - Agenda de Eventos, Peñas y Boliches en Salta Capital</h1>
        {!hasFilters && carouselEvents.length > 0 && (
          <HeroCarousel
            events={carouselEvents}
          />
        )}

        <FiltersBar
          categories={sortedCategories}
          filters={{
            search,
            date,
            category,
            establishment,
            location,
            dateExact,
            instagram,
          }}
          onFilterChange={(updates) => {
            if (updates.search !== undefined) setSearch(updates.search)
            if (updates.date !== undefined) setDate(updates.date)
            if (updates.category !== undefined) setCategory(updates.category)
            if (updates.establishment !== undefined) setEstablishment(updates.establishment)
            if (updates.location !== undefined) setLocation(updates.location)
            if (updates.dateExact !== undefined) setDateExact(updates.dateExact)
            if (updates.instagram !== undefined) setInstagram(updates.instagram)
          }}
        />


        {!hasFilters && allDisplayEvents.length > 0 && (
          <div className="pt-4">
            {todayRowEvents.length > 0 ? (
              <CategoryRow
                category="hoy"
                title="Hoy en Salta"
                events={todayRowEvents}
                userFavorites={userFavorites}
                onOpenMovie={setSelectedMovie}
                onSeeAll={() => setDate("hoy")}
                origin="hoy"
              />
            ) : (
              <section className="py-4">
                <div className="container mx-auto px-4">
                  <div className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-foreground">Hoy en Salta</h2>
                      <p className="text-sm text-muted-foreground">
                        Hoy no hay eventos cargados. Mirá qué viene en los próximos días.
                      </p>
                    </div>
                    <Button onClick={() => setDate("semana")} className="font-bold">
                      Ver esta semana
                    </Button>
                  </div>
                </div>
              </section>
            )}
          </div>
        )}

        {showCategoryRows && (
          <div className="py-4 space-y-6">
            {eventsByCategory.map(({ category: catSlug, title, events }, index) => (
              <motion.div
                key={catSlug}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="space-y-6"
              >
                <CategoryRow
                  category={catSlug}
                  title={title}
                  events={events}
                  userFavorites={userFavorites}
                  onOpenMovie={setSelectedMovie}
                  onSeeAll={setCategory}
                  origin="fila"
                />

                {/* 1. Banner de Radar después de la segunda categoría */}
                {index === 1 && !hasFilters && (
                  <div className="container mx-auto px-4 py-2">
                    <div className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col sm:flex-row justify-between items-center gap-4 shadow-lg">
                      <div className="space-y-1 text-center sm:text-left">
                        <h3 className="text-xl font-bold text-white">¡No te pierdas ningún evento!</h3>
                        <p className="text-sm text-zinc-400">
                          Elegí tus categorías favoritas y recibí la agenda del fin de semana directamente en tu correo.
                        </p>
                      </div>
                      <Button asChild className="bg-primary hover:bg-primary/95 text-primary-foreground font-bold px-6 py-4 rounded-xl shadow-md transition-transform duration-200 hover:scale-105 cursor-pointer">
                        <Link href="/radar" className="flex items-center gap-2">
                          Configurar mi Radar 📡
                        </Link>
                      </Button>
                    </div>
                  </div>
                )}

                {/* 2. Banner de Publicidad/Anunciar después de la cuarta categoría */}
                {index === 3 && !hasFilters && (
                  <div className="container mx-auto px-4 py-2">
                    <AdSenseBanner slot="home-middle-banner" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}

        {showFilteredGrid && (
          <div className="container mx-auto px-4 py-8">
            <h2 className="mb-6 text-2xl font-bold text-foreground">
              {filteredTitle} ({filteredEvents.length})
            </h2>
            <motion.div
              layout
              className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
            >
              <AnimatePresence mode="popLayout">
                {filteredEvents.map(event => (
                  <motion.div
                    key={event.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.3 }}
                  >
                    <EventCard
                      className="w-full sm:w-full max-w-[200px] mx-auto"
                      event={event}
                      isFavorite={userFavorites.includes(event.id)}
                      onOpenMovie={setSelectedMovie}
                      origin="fila"
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          </div>
        )}

        {filteredEvents.length === 0 && hasFilters && (
          <div className="relative overflow-hidden">
            {/* Patrón de fondo de marca */}
            <div
              className="pointer-events-none absolute inset-0 bg-repeat opacity-[0.07] dark:opacity-[0.04] dark:invert dark:hue-rotate-180"
              style={{ backgroundImage: "url('/brand/patron-claro.png')", backgroundSize: "320px" }}
            />
            <div className="container mx-auto px-4 py-20 text-center relative">
              <p className="text-lg text-muted-foreground">
                No se encontraron eventos con los filtros seleccionados.
              </p>
              <button
                onClick={clearFilters}
                className="mt-4 text-primary hover:underline font-semibold"
              >
                Limpiar filtros
              </button>
            </div>
          </div>
        )}

        {filteredEvents.length === 0 && !hasFilters && (
          <div className="relative overflow-hidden min-h-[300px] flex items-center justify-center">
            {/* Patrón de fondo de marca */}
            <div
              className="pointer-events-none absolute inset-0 bg-repeat opacity-[0.07] dark:opacity-[0.04] dark:invert dark:hue-rotate-180"
              style={{ backgroundImage: "url('/brand/patron-claro.png')", backgroundSize: "320px" }}
            />
            <div className="container mx-auto px-4 py-16 text-center relative flex flex-col items-center gap-4">
              <Image
                src="/brand/logo-circular.png"
                alt="Que pinta Salta"
                width={80}
                height={80}
                className="opacity-30"
              />
              <p className="text-lg text-muted-foreground">
                No hay eventos disponibles en este momento.
              </p>
            </div>
          </div>
        )}
      </main>

      <MobileNav />



      {/* Modal para visualizar los horarios de la película */}
      {selectedMovie && (
        <MovieModal
          movie={selectedMovie}
          isFavorite={userFavorites.includes(selectedMovie.id)}
          onClose={() => setSelectedMovie(null)}
        />
      )}
    </div>
  )
}
