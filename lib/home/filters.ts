/**
 * Filtrado, agrupado por categoría y fila "Hoy en Salta" de la portada.
 * Movido de `components/home-content.tsx`, sin cambiar comportamiento.
 * Sin React ni next/*.
 */
import type { Category } from "@/lib/types"
import type { DateFilter } from "@/components/filters-bar"
import { arrangeRowsForToday, selectTodayEvents } from "@/lib/event-display"
import type { DisplayEvent } from "./types"
import { parseLocalDate } from "./transform"

// U+0300–U+036F: las marcas diacríticas combinantes que deja `normalize("NFD")`.
// Se arma con los códigos en vez de un rango literal para no dejar caracteres
// invisibles en el fuente; es el mismo rango que usa el resto del repo.
const COMBINING_MARKS = new RegExp(
  `[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`,
  "g",
)

export function normalizeFilterText(value: string) {
  return value.toLowerCase().normalize("NFD").replace(COMBINING_MARKS, "").trim()
}

// Cuerpo del useMemo `filteredEvents` de `HomeContent`.
export function filterEvents(
  allDisplayEvents: DisplayEvent[],
  todayDisplayEvents: DisplayEvent[],
  saltaTodayStr: string,
  search: string,
  establishment: string,
  location: string,
  dateExact: string | null,
  date: DateFilter | null,
  category: string | null,
  instagram: boolean
): DisplayEvent[] {
  // "Hoy" incluye lo que ya empezó hoy; el resto de la agenda, solo lo futuro.
  let filtered = date === "hoy" && !dateExact ? todayDisplayEvents : allDisplayEvents

  if (search) {
    const query = normalizeFilterText(search)
    filtered = filtered.filter(
      event =>
        normalizeFilterText(event.title).includes(query) ||
        normalizeFilterText(event.venue).includes(query)
    )
  }

  if (establishment) {
    const query = normalizeFilterText(establishment)
    filtered = filtered.filter((event) => normalizeFilterText(event.venue).includes(query))
  }

  if (location) {
    const query = normalizeFilterText(location)
    filtered = filtered.filter((event) => normalizeFilterText(event.address).includes(query))
  }

  if (dateExact) {
    filtered = filtered.filter((event) => event.date === dateExact)
  } else if (date) {
    const today = parseLocalDate(saltaTodayStr)

    filtered = filtered.filter(event => {
      const eventDate = parseLocalDate(event.date)

      switch (date) {
        case "hoy":
          return event.date === saltaTodayStr
        case "semana": {
          const weekFromNow = new Date(today)
          weekFromNow.setDate(weekFromNow.getDate() + 7)
          return eventDate >= today && eventDate <= weekFromNow
        }
        case "mes": {
          const monthFromNow = new Date(today)
          monthFromNow.setMonth(monthFromNow.getMonth() + 1)
          return eventDate >= today && eventDate <= monthFromNow
        }
        case "tendencias":
          return event.isFeatured
        default:
          return true
      }
    })
  }

  // CORRECCIÓN URGENTE: Aplicar el filtro de categoría seleccionada
  if (category) {
    filtered = filtered.filter((event) => event.category === category)
  }

  if (!instagram) {
    filtered = filtered.filter(event => !event.isInstagramFlyer)
  }

  // Ordenamiento inteligente: flyers de Instagram primero, luego eventos normales
  return [...filtered].sort((a, b) => {
    const aIsIg = a.isInstagramFlyer ? 1 : 0
    const bIsIg = b.isInstagramFlyer ? 1 : 0
    if (bIsIg !== aIsIg) {
      return bIsIg - aIsIg // 1 (IG) antes que 0 (normal)
    }
    return new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime()
  })
}

export interface CategoryEventsRow {
  category: string
  title: string
  events: DisplayEvent[]
}

// Cuerpo del useMemo `eventsByCategory` de `HomeContent`.
export function groupByCategory(
  sortedCategories: Category[],
  filteredEvents: DisplayEvent[],
  date: DateFilter | null,
  dateExact: string | null,
  now: Date
): CategoryEventsRow[] {
  const categoryOrderIndex = new Map(
    sortedCategories.map((category, index) => [category.slug, index])
  )

  const cats = sortedCategories.map(cat => ({
    category: cat.slug,
    title: cat.name,
    events: filteredEvents.filter(event => event.category === cat.slug)
  }))

  // Este es el orden que efectivamente se ve en la home: por cantidad de
  // eventos de cada fila (con los filtros aplicados), de mayor a menor.
  // `sortedCategories` (favoritos del usuario, después volumen próximo y
  // alfabético) sólo desempata.
  const byCount = cats.sort((a, b) => {
    const countDiff = b.events.length - a.events.length
    if (countDiff !== 0) return countDiff

    return (categoryOrderIndex.get(a.category) ?? 0) - (categoryOrderIndex.get(b.category) ?? 0)
  })

  // Con "Hoy": Cine al final y cada fila ordenada por hora.
  return date === "hoy" && !dateExact ? arrangeRowsForToday(byCount, now.getTime()) : byCount
}

// Cuerpo del useMemo `todayRowEvents` de `HomeContent`: fila "Hoy en Salta"
// (solo home sin filtros), eventos de hoy por hora.
export function selectTodayRow(
  todayDisplayEvents: DisplayEvent[],
  saltaTodayStr: string,
  now: Date
): DisplayEvent[] {
  return selectTodayEvents(todayDisplayEvents, saltaTodayStr, now.getTime())
}
