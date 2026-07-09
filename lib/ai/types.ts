export type GeminiCategorySlug =
  | 'penas'
  | 'humor'
  | 'infantil'
  | 'ballet'
  | 'recitales'
  | 'teatro'
  | 'boliches'
  | 'cine'
  | 'ferias'
  | 'talleres'
  | 'deportes'
  | 'congresos'
  | 'automovilismo'
  | 'espectaculos'

export interface GeminiExtractionResult {
  title: string
  date: string | null // YYYY-MM-DD
  start_time: string | null // HH:MM
  price: number | null
  venue_name: string | null
  category_slug: GeminiCategorySlug
  artists: string[]
}

export interface AIProcessingResult {
  success: boolean
  error?: string
  extractedData?: GeminiExtractionResult
  eventId?: string
  action?: 'insert' | 'update' | 'skip'
}
