import type { SupabaseClient } from '@supabase/supabase-js'
import { venueDisplayName, venueNormalize } from './normalize'

/**
 * Punto único de resolución de venues.
 *
 * Dado un string crudo de cualquier fuente (NorteTicket, EntradaUno, Alpogo,
 * flyers de Instagram, carga manual), devuelve el `venue_id` canónico.
 *
 * La resolución real corre en Postgres (`resolve_venue_id`, ver
 * supabase/migrations/20260821_venue_canonical.sql) por tres razones:
 *  - un único árbitro para todas las rutas de ingesta,
 *  - el match usa índices sobre venue_normalize()/venue_core_key(),
 *  - insertar el venue faltante y encolarlo para revisión pasa a ser atómico,
 *    lo que evita que dos scrapers en paralelo creen la misma fila dos veces.
 *
 * Orden de intentos dentro de la función SQL:
 *   1. alias exacto normalizado
 *   2. nombre canónico exacto normalizado
 *   3. fila legacy ya absorbida -> se sigue el puntero canónico
 *   4. core key (sin artículo ni sufijo de ciudad), sólo si es inequívoca
 *   5. fuzzy por trigramas: NO resuelve, sólo sugiere hacia venue_review_queue
 */

export type ResolveVenueOptions = {
  /** Etiqueta de la fuente, para la cola de revisión. Ej: 'norteticket'. */
  source?: string
  /**
   * Crear el venue si no hubo ningún match.
   * La ingesta lo usa en TRUE: un evento sin venue_id no se puede deduplicar
   * (findDuplicateEvent compara venue_id + fecha), y eso es peor que un venue
   * de más. El string queda igual encolado para curaduría.
   */
  autocreate?: boolean
  /** Umbral de similitud para la SUGERENCIA fuzzy. No afecta la resolución. */
  threshold?: number
}

/** Strings que las fuentes usan como "no sé dónde es". No son lugares. */
const PLACEHOLDERS = new Set(['lugar no especificado', 'sin lugar', 'a confirmar'])

export function isPlaceholderVenue(raw: string | null | undefined): boolean {
  return PLACEHOLDERS.has(venueNormalize(venueDisplayName(raw)))
}

export async function resolveVenueId(
  supabase: SupabaseClient,
  rawVenueName: string | null | undefined,
  options: ResolveVenueOptions = {}
): Promise<string | null> {
  if (!rawVenueName || !rawVenueName.trim()) return null

  // El centinela no debe crear ni resolver un venue: se corta acá para no
  // ensuciar el registro canónico ni la cola de revisión.
  if (isPlaceholderVenue(rawVenueName)) return null

  const { data, error } = await supabase.rpc('resolve_venue_id', {
    p_raw: rawVenueName.trim(),
    p_source: options.source ?? null,
    p_autocreate: options.autocreate ?? false,
    p_threshold: options.threshold ?? 0.62,
  })

  if (error) {
    console.error(
      `[venues:resolveVenueId] fallo resolviendo ${JSON.stringify(rawVenueName)}:`,
      error.message
    )
    return null
  }

  return (data as string | null) ?? null
}

/**
 * Resuelve muchos nombres crudos de una pasada, deduplicando por clave
 * normalizada. Útil en un scrape donde 40 eventos comparten 6 lugares:
 * evita 40 round-trips y evita que dos llamadas concurrentes creen el mismo
 * venue dos veces.
 */
export async function resolveVenueIds(
  supabase: SupabaseClient,
  rawNames: (string | null | undefined)[],
  options: ResolveVenueOptions = {}
): Promise<Map<string, string | null>> {
  const byKey = new Map<string, string>()
  for (const raw of rawNames) {
    if (!raw || !raw.trim()) continue
    const key = venueNormalize(venueDisplayName(raw))
    if (key && !byKey.has(key)) byKey.set(key, raw.trim())
  }

  const out = new Map<string, string | null>()
  // Secuencial a propósito: en paralelo, dos nombres del mismo cluster pueden
  // crear la fila canónica dos veces antes de que la otra la vea.
  for (const [key, raw] of byKey) {
    out.set(key, await resolveVenueId(supabase, raw, options))
  }
  return out
}
