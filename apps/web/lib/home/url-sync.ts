/**
 * Sincronización silenciosa de los filtros de la portada con la URL.
 * Movido de `components/home-content.tsx`, sin cambiar la lógica de armado
 * de la URL. Puro: sin React ni next/*.
 *
 * Ver `ops/rondas/18-imagenes-rendimiento/repro-18f.md` (tarea 18-f): la
 * causa de que el modal del flyer/evento no cerrara al volver atrás era que
 * este efecto llamaba a `window.history.replaceState(null, ...)` también en
 * el primer montaje, pisando el `state` que Next.js le había puesto a la
 * entrada `/` del historial. `shouldReplaceUrl` evita tocar el historial
 * cuando la URL ya es la que corresponde (el caso del primer montaje).
 */

export interface HomeUrlFilters {
  search: string
  date: string | null
  category: string | null
  establishment: string
  location: string
  dateExact: string | null
  instagram: boolean
}

/** Arma la URL de la portada a partir de los filtros, igual que antes. */
export function nextHomeUrl(filters: HomeUrlFilters): string {
  const { search, date, category, establishment, location, dateExact, instagram } = filters
  const params = new URLSearchParams()
  if (search) params.set("search", search)
  if (date) params.set("date", date)
  if (category) params.set("category", category)
  if (establishment) params.set("establishment", establishment)
  if (location) params.set("location", location)
  if (dateExact) params.set("dateExact", dateExact)
  if (!instagram) params.set("instagram", "false")

  const nextQuery = params.toString()
  return nextQuery ? `/?${nextQuery}` : "/"
}

/** `false` si la URL actual y la siguiente ya son iguales: no hay nada para reemplazar. */
export function shouldReplaceUrl(currentUrl: string, nextUrl: string): boolean {
  return currentUrl !== nextUrl
}
