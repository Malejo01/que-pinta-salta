/**
 * Tipos de la portada (ex `components/home-content.tsx`): sin React ni next/*.
 */
import type { Event, Category, Venue } from "../types"

export type EventWithRelations = Event & { category: Category; venue: Venue | null }

// QPS-083: vivía en components/filters-bar.tsx. `apps/web/components/filters-bar.tsx`
// lo reexporta con el mismo nombre para no cambiar a sus importadores.
export type DateFilter = "hoy" | "semana" | "mes" | "tendencias"

// Tipo unificado para eventos y flyers de Instagram
export interface DisplayEvent {
  id: string
  slug: string
  title: string
  venue: string
  date: string
  time: string
  category: string
  categoryName: string
  price: "gratis" | "confirmar" | number
  image: string
  description: string
  address: string
  startDateTime: string
  ticketUrl?: string
  /** Solo con dato explícito (age_restriction >= 18); null/undefined = sin chip. */
  vibe?: "adultos" | "familiar" | "exterior" | null
  isFeatured: boolean
  /**
   * `events.featured_until` tal cual (QPS-239): opcional a propósito, no
   * porque sea opcional en la base, sino porque decenas de fixtures de la
   * web y de la app arman un `DisplayEvent` a mano sin este campo; si fuera
   * obligatorio, el typecheck de esos fixtures quedaría en rojo. Flyers de
   * Instagram y películas no lo tienen (nunca se destacan).
   */
  featuredUntil?: string | null
  /** Estado del evento (events.status): lo usa el modal de Buscar para el gate de "Voy / Me interesa". Flyers de Instagram y películas no lo tienen. */
  status?: string
  // Campos opcionales para flyers de Instagram
  isInstagramFlyer?: boolean
  flyerId?: string
  instagramPostUrl?: string
  instagramUsername?: string
  // Campos opcionales para películas de cine
  isCinemaMovie?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- igual que en home-content.tsx antes del movimiento; jsonb de cine
  showings?: any
  // Campos opcionales para consolidar eventos duplicados
  occurrences?: { id: string; date: string; time: string }[]
}
