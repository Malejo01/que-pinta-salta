// Tipos de la app. La fuente de verdad del esquema es lib/database.types.ts,
// generado con `npm run db:types` (supabase gen types) y verificado por el CI.
//
// - Enums: salen directo del tipo Database.
// - Category y Venue: son la fila tal cual (Tables<...>).
// - Event y Profile siguen escritas a mano: en la base casi todas sus columnas
//   tienen default pero no NOT NULL, así que la fila generada es `| null` en
//   todo, y la app asume valores (los inserts siempre los mandan o usan el
//   default). Para que no se desfasen, SchemaChecks (al final) falla en
//   compilación si declaran una columna que no existe en la tabla.
import type { Database, Tables } from './database.types'

type PublicEnums = Database['public']['Enums']

export type UserRole = PublicEnums['user_role']
export type EventStatus = PublicEnums['event_status']
export type NotificationType = PublicEnums['notification_type']

export type Category = Tables<'categories'>
export type Venue = Tables<'venues'>

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

// Slug de una fila de `categories`. No es una unión cerrada: la tabla tiene 16
// (penas, boliches, teatro, ferias, talleres, cine, recitales, automovilismo,
// congresos, ballet, humor, infantil, deportes, espectaculos, museos,
// alternativo) y el admin crea más desde la ficha del evento (createCategory).
export type EventCategory = Category['slug']

// Nombres de las 8 categorías originales. El nombre real de cada categoría está
// en categories.name; los que usan este mapa caen al slug si no lo encuentran.
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

// La fila de cinema_movies con `showings` (jsonb) tipado.
export type CinemaMovie = Omit<Tables<'cinema_movies'>, 'showings'> & {
  showings: MovieShowings
}

// ---------------------------------------------------------------------------
// Chequeo de esquema en compilación: cada interfaz escrita a mano solo puede
// declarar columnas que existen en su tabla (más las relaciones que se traen
// con joins). Si alguien borra o renombra una columna y regenera los tipos,
// esto deja de compilar.
// ---------------------------------------------------------------------------
type PublicTable = keyof Database['public']['Tables']
type UnknownColumns<I, T extends PublicTable, Joins extends PropertyKey = never> =
  Exclude<keyof I, keyof Tables<T> | Joins>
type OnlyKnownColumns<I, T extends PublicTable, Joins extends PropertyKey = never> =
  [UnknownColumns<I, T, Joins>] extends [never] ? true : { columnasQueNoExisten: UnknownColumns<I, T, Joins>; tabla: T }
type Expect<T extends true> = T

export type SchemaChecks = [
  Expect<OnlyKnownColumns<Event, 'events', 'category' | 'venue'>>,
  Expect<OnlyKnownColumns<Profile, 'profiles'>>,
]

