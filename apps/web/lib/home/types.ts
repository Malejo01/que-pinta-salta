/**
 * Tipos de la portada (ex `components/home-content.tsx`): sin React ni next/*.
 */
import type { Event, Category, Venue } from "@/lib/types"

export type EventWithRelations = Event & { category: Category; venue: Venue | null }

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
