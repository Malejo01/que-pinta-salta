/**
 * Transformación de datos crudos (eventos, flyers de Instagram, películas) al
 * formato de la portada (`DisplayEvent`). Movido de `components/home-content.tsx`,
 * sin cambiar comportamiento. Sin React ni next/*.
 */
import type { CinemaMovie, MovieShowings } from "../types"
import type { FlyerWithAccount } from "../instagram-config"
import {
  ageChip,
  cleanDescription,
  formatEventTimeDisplay,
} from "../event-display"
import { isVigente } from "../events/vigencia"
import type { DisplayEvent, EventWithRelations } from "./types"

// Normalizar fechas y zonas horarias para Salta (America/Argentina/Salta)
export function formatDateInSalta(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Salta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date)
}

export function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

// Transform database event to display format
export function transformEvent(event: EventWithRelations): DisplayEvent {
  const startDate = new Date(event.start_date)
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    venue: event.venue?.name || 'Lugar por confirmar',
    date: formatDateInSalta(startDate),
    time: formatEventTimeDisplay(startDate) ?? '',
    category: event.category.slug,
    categoryName: event.category.name,
    price: event.is_free ? "gratis" as const : (event.price_min === 0 ? "confirmar" as const : event.price_min),
    image: event.image_url || '/placeholder.svg?height=600&width=400',
    description: cleanDescription(event.description) ?? cleanDescription(event.short_description) ?? '',
    address: event.venue?.address || '',
    startDateTime: event.start_date,
    ticketUrl: event.ticket_url || undefined,
    vibe: ageChip(event.age_restriction),
    isFeatured: event.is_featured,
  }
}

// Agrupa eventos duplicados por título + lugar y conserva las funciones en `occurrences`.
export function groupEventItems(eventsList: EventWithRelations[]): DisplayEvent[] {
  const eventItems = eventsList
    .filter((event) => event.category)
    .map(transformEvent)

  // Agrupar eventos duplicados por la clave Título + Lugar
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

  return finalEventItems
}

// Transform Instagram flyer to display format
export function transformFlyer(flyer: FlyerWithAccount, categoryNameBySlug: Map<string, string>): DisplayEvent {
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
    // Metadatos de Instagram
    isInstagramFlyer: true,
    flyerId: flyer.id,
    instagramPostUrl: flyer.ig_post_url,
    instagramUsername: flyer.account.username,
  }
}

/**
 * Lo mínimo que necesita `transformMovie`: una variante liviana de
 * `CinemaMovie` para quien no pide todas sus columnas (por ejemplo la app
 * móvil, `lib/datos/cines.ts`, que no trae `is_currently_showing` ni
 * `updated_at`). `created_at` es opcional porque algunos fixtures de prueba
 * no la tienen: sin ella, se usa el instante en que se llama a la función
 * (mismo respaldo que el resto del archivo cuando falta un dato).
 */
export interface MovieForDisplay {
  id: string
  slug: string
  title: string
  poster_url: string | null
  showings: MovieShowings
  created_at?: string | null
}

// Transforma una película de cartelera al formato de la portada (R29, 29-h:
// antes vivía inline en `buildDisplayData`; se saca a una función aparte
// para que la app móvil arme la misma fila "Cine" sin reimplementar el
// mapeo). `category: 'cine'` es el mismo slug que ya existe en `categories`
// (ver el comentario de `EventCategory` en `../types`): por eso
// `groupByCategory` ubica estas películas en su propia fila sin lógica
// extra, tanto acá como en la app.
export function transformMovie(movie: MovieForDisplay, saltaTodayStr: string): DisplayEvent {
  const showCount = Object.keys(movie.showings || {}).length

  return {
    id: `movie-${movie.id}`,
    slug: movie.slug,
    title: movie.title,
    venue: `${showCount} ${showCount === 1 ? 'Cine' : 'Cines'} de Salta`,
    date: saltaTodayStr, // Se proyecta hoy en Salta
    time: '',
    category: 'cine',
    categoryName: 'Cine',
    price: 'confirmar' as const,
    image: movie.poster_url || '/placeholder.svg?height=600&width=400',
    description: '',
    address: '',
    startDateTime: movie.created_at ?? new Date().toISOString(), // for ordering
    isFeatured: false,
    isCinemaMovie: true,
    showings: movie.showings,
  }
}

export interface DisplayData {
  all: DisplayEvent[]
  today: DisplayEvent[]
  saltaTodayStr: string
}

// Cuerpo del useMemo `displayData` de `HomeContent`.
export function buildDisplayData(
  events: EventWithRelations[],
  flyers: FlyerWithAccount[],
  cinemaMovies: CinemaMovie[],
  categoryNameBySlug: Map<string, string>,
  now: Date
): DisplayData {
  const nowMs = now.getTime()
  const saltaTodayStr = formatDateInSalta(now)
  // Agenda general: vigencia única (fin real o estimado >= ahora), la misma
  // que usa el Radar. Lo que empezó hace poco y sigue en curso se muestra.
  const finalEventItems = groupEventItems(
    events.filter((event) => isVigente(event, new Date(nowMs)))
  )
  // Para "Hoy": lo de hoy que sigue vigente (QPS-128: misma vigencia que la
  // agenda general y el Radar, en vez de la regla aparte por categoría).
  const todayEventItems = groupEventItems(
    events.filter(
      (event) =>
        formatDateInSalta(new Date(event.start_date)) === saltaTodayStr &&
        isVigente(event, new Date(nowMs))
    )
  )

  // Transformar flyers de Instagram y mezclarlos con los eventos
  const flyerItems = flyers.map((flyer) => transformFlyer(flyer, categoryNameBySlug))

  // Transformar películas de cine y mezclarlas con los eventos (R29, 29-h:
  // el mapeo en sí ahora es `transformMovie`, de más arriba en este archivo,
  // así la app móvil arma la misma fila "Cine" sin reimplementarlo).
  const movieItems = (cinemaMovies || []).map((movie) => transformMovie(movie, saltaTodayStr))

  return {
    all: [...finalEventItems, ...flyerItems, ...movieItems],
    today: [...todayEventItems, ...flyerItems, ...movieItems],
    saltaTodayStr,
  }
}
