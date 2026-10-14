/**
 * Transformación de datos crudos (eventos, flyers de Instagram, películas) al
 * formato de la portada (`DisplayEvent`). Movido de `components/home-content.tsx`,
 * sin cambiar comportamiento. Sin React ni next/*.
 */
import type { CinemaMovie } from "../types"
import type { FlyerWithAccount } from "../instagram-config"
import {
  ageChip,
  cleanDescription,
  formatEventTimeDisplay,
  isRelevantToday,
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
  // Para "Hoy": lo de hoy aunque ya haya empezado (museos 10:00). Si el
  // servidor solo mandó futuros, coincide con la agenda general de hoy.
  const todayEventItems = groupEventItems(
    events.filter(
      (event) =>
        formatDateInSalta(new Date(event.start_date)) === saltaTodayStr &&
        isRelevantToday(
          { startDateTime: event.start_date, endDateTime: event.end_date, category: event.category?.slug },
          nowMs
        )
    )
  )

  // Transformar flyers de Instagram y mezclarlos con los eventos
  const flyerItems = flyers.map((flyer) => transformFlyer(flyer, categoryNameBySlug))

  // Transformar películas de cine y mezclarlas con los eventos
  const movieItems = (cinemaMovies || []).map((movie): DisplayEvent => {
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
      startDateTime: movie.created_at, // for ordering
      isFeatured: false,
      isCinemaMovie: true,
      showings: movie.showings,
    }
  })

  return {
    all: [...finalEventItems, ...flyerItems, ...movieItems],
    today: [...todayEventItems, ...flyerItems, ...movieItems],
    saltaTodayStr,
  }
}
