/**
 * Orden de categorías y selección del carrusel de la portada. Movido de
 * `components/home-content.tsx`, sin cambiar comportamiento. Sin React ni next/*.
 */
import type { Category } from "../types"
import type { DisplayEvent } from "./types"

export function getCategoryPriority(
  categories: Category[],
  events: DisplayEvent[],
  now: Date,
  favoriteCategorySlugs: string[]
) {
  const nowMs = now.getTime()

  const favoriteIndex = new Map(
    favoriteCategorySlugs.map((slug, index) => [slug, index])
  )

  const upcomingCounts = new Map<string, number>()
  for (const event of events) {
    if (new Date(event.startDateTime).getTime() >= nowMs) {
      upcomingCounts.set(event.category, (upcomingCounts.get(event.category) ?? 0) + 1)
    }
  }

  return [...categories].sort((a, b) => {
    const aFavoriteIndex = favoriteIndex.get(a.slug)
    const bFavoriteIndex = favoriteIndex.get(b.slug)

    if (aFavoriteIndex !== undefined && bFavoriteIndex !== undefined) {
      return aFavoriteIndex - bFavoriteIndex
    }

    if (aFavoriteIndex !== undefined) return -1
    if (bFavoriteIndex !== undefined) return 1

    const countDiff = (upcomingCounts.get(b.slug) ?? 0) - (upcomingCounts.get(a.slug) ?? 0)
    if (countDiff !== 0) return countDiff

    return a.name.localeCompare(b.name, "es")
  })
}

// Cuerpo del useMemo `sortedCategories` de `HomeContent`.
export function sortCategories(
  categories: Category[],
  allDisplayEvents: DisplayEvent[],
  now: Date,
  favoriteCategorySlugs: string[]
): Category[] {
  return getCategoryPriority(categories, allDisplayEvents, now, favoriteCategorySlugs)
}

// Cuerpo del useMemo `carouselEvents` de `HomeContent`.
export function selectCarouselEvents(
  allDisplayEvents: DisplayEvent[],
  sortedCategories: Category[],
  now: Date
): DisplayEvent[] {
  const nowMs = now.getTime()
  const limit = 6

  // 1. Obtener eventos futuros destacados, ordenados por fecha
  const featuredUpcoming = allDisplayEvents
    .filter((event) => event.isFeatured && new Date(event.startDateTime).getTime() >= nowMs)
    .sort((a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime())

  // Limitar los destacados al máximo de cupos
  const selectedCarousel = featuredUpcoming.slice(0, limit)

  // Si completamos el cupo, los retornamos directamente
  if (selectedCarousel.length >= limit) {
    return selectedCarousel
  }

  // Usar Set para evitar duplicados al agregar los fallbacks
  const selectedIds = new Set(selectedCarousel.map(e => e.id))

  // 2. Rellenar con la lógica por categoría existente (evitando duplicados)
  const categoryFallbacks = sortedCategories
    .map((category) => {
      return allDisplayEvents
        .filter((event) => event.category === category.slug)
        .filter((event) => new Date(event.startDateTime).getTime() >= nowMs)
        .filter((event) => !selectedIds.has(event.id))
        .sort(
          (a, b) =>
            new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime()
        )[0]
    })
    .filter((event): event is DisplayEvent => Boolean(event))

  // Agregar fallbacks al carrusel
  for (const event of categoryFallbacks) {
    if (selectedCarousel.length >= limit) break
    if (!selectedIds.has(event.id)) {
      selectedCarousel.push(event)
      selectedIds.add(event.id)
    }
  }

  return selectedCarousel
}
