// Database types matching Supabase schema
export type UserRole = 'USER' | 'ADMIN' | 'COLLABORATOR'
export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'PAST' | 'PENDING'
export type NotificationType = 'EMAIL' | 'PUSH' | 'WHATSAPP'

export interface Category {
  id: string
  name: string
  slug: string
  icon: string | null
  color: string | null
  created_at: string
}

export interface Venue {
  id: string
  /** Nombre canónico. Las variantes viven en `venue_aliases`. */
  name: string
  address: string
  latitude: number | null
  longitude: number | null
  google_maps_url: string | null
  phone: string | null
  capacity: number | null
  created_at: string
  slug?: string | null
  /** NULL = esta fila es canónica. No NULL = duplicado absorbido. */
  canonical_venue_id?: string | null
  merged_at?: string | null
  /** Centinela que no es un lugar real ("Lugar no especificado"). */
  is_placeholder?: boolean
  updated_at?: string
}

export interface VenueAlias {
  id: string
  venue_id: string
  alias: string
  alias_normalized: string
  source: 'manual' | 'migration' | 'ingest'
  created_at: string
  created_by: string | null
}

export type VenueReviewStatus = 'pending' | 'resolved' | 'rejected'

export interface VenueReviewItem {
  id: string
  raw_name: string
  normalized: string
  source: string | null
  legacy_venue_id: string | null
  suggested_venue_id: string | null
  similarity: number | null
  occurrences: number
  status: VenueReviewStatus
  resolved_venue_id: string | null
  notes: string | null
  created_at: string
  reviewed_at: string | null
  reviewed_by: string | null
}

export interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  role: UserRole
  favorite_categories: string[]
  notification_preferences: NotificationType[]
  contact_type?: 'whatsapp' | 'instagram' | 'facebook' | null
  contact_value?: string | null
  created_at: string
  updated_at: string
}

export interface TicketSource {
  source: string
  url: string
  price_min?: number
}

export interface Event {
  id: string
  title: string
  slug: string
  description: string | null
  short_description: string | null
  category_id: string | null
  venue_id: string | null
  scrape_source_key?: string | null
  classification_source?: 'manual' | 'alias' | 'scraper' | null
  image_url: string | null
  gallery_urls: string[]
  start_date: string
  end_date: string | null
  is_recurring: boolean
  recurrence_rule: string | null
  price_min: number
  price_max: number | null
  is_free: boolean
  ticket_url: string | null
  ticket_sources?: TicketSource[] | null
  is_commercial?: boolean
  age_restriction: number
  tags: string[]
  status: EventStatus
  is_featured: boolean
  view_count: number
  created_by: string | null
  created_at: string
  updated_at: string
  ai_metadata?: any | null
  // Joined relations
  category?: Category
  venue?: Venue
}

export interface Favorite {
  id: string
  user_id: string
  event_id: string
  created_at: string
}

export interface EventView {
  id: string
  event_id: string
  user_id: string | null
  ip_address: string | null
  user_agent: string | null
  viewed_at: string
}

// Legacy type aliases for backwards compatibility
export type EventCategory = "penas" | "boliches" | "teatro" | "ferias" | "talleres" | "cine" | "museos" | "alternativo"

export const categoryLabels: Record<EventCategory, string> = {
  penas: "Peñas",
  boliches: "Boliches",
  teatro: "Teatro",
  ferias: "Ferias",
  talleres: "Talleres",
  cine: "Cine",
  museos: "Museos",
  alternativo: "Alternativo",
}

export type EventVibe = "familiar" | "adultos" | "exterior"

export const vibeLabels: Record<EventVibe, string> = {
  familiar: "Familiar",
  adultos: "Adultos",
  exterior: "Al Aire Libre",
}

// Cinema Types
export interface ShowingTime {
  type: string;
  times: string[];
}

export interface CinemaShowingsDetails {
  name: string;
  booking_url: string;
  formats: ShowingTime[];
}

export interface MovieShowings {
  [cinemaKey: string]: CinemaShowingsDetails;
}

export interface CinemaMovie {
  id: string;
  slug: string;
  title: string;
  poster_url: string | null;
  is_currently_showing: boolean;
  showings: MovieShowings;
  created_at: string;
  updated_at: string;
}

