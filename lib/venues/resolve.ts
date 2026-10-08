import type { SupabaseClient } from '@supabase/supabase-js'
import { venueDisplayName, venueNormalize, venueSanitize } from './normalize'

/**
 * Punto único de resolución de venues.
 *
 * Dado un string crudo de cualquier fuente (NorteTicket, EntradaUno, Alpogo,
 * flyers de Instagram, carga manual), devuelve el `venue_id` canónico.
 *
 * La resolución real corre en Postgres (`resolve_venue_id`, ver
 * supabase/migrations/20261002190000_venue_canonical.sql) por tres razones:
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
  /**
   * Se llama cuando la RPC devuelve error (además del log). La función sigue
   * devolviendo null: el llamador decide cómo hacer visible la falla.
   */
  onError?: (rawName: string, message: string) => void
}

/**
 * Colapsa saltos de línea y espacios repetidos a un solo espacio, sin bordes.
 */
function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * Formateador único de errores de venue: `venue: <nombre>: <mensaje>`,
 * recortado a 200 caracteres (job_runs.errors guarda strings cortos).
 * Usado por toda ruta de ingesta que resuelve venues (scraper de ticketeras,
 * flyers de Instagram) para que el error tenga siempre la misma forma.
 */
export function formatVenueError(rawName: string, message: string): string {
  const name = collapseWhitespace(rawName)
  const msg = collapseWhitespace(message)
  return `venue: ${name}: ${msg}`.slice(0, 200)
}

/**
 * Deduplica por mensaje los errores de venue y, si hay más de 5 distintos,
 * deja los primeros 5 más un resumen (job_runs.errors guarda 20 como máximo).
 * El total cuenta mensajes únicos, no lugares: el mismo venue puede fallar
 * con mensajes distintos, y un mensaje puede repetirse para varios eventos.
 */
export function summarizeVenueErrors(errors: string[]): string[] {
  const unique = [...new Set(errors)]
  if (unique.length <= 5) return unique
  return [...unique.slice(0, 5), `venue: ${unique.length} mensajes de lugar sin resolver en total`]
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
  const clean = venueSanitize(rawVenueName)
  if (!clean) return null

  // El centinela no debe crear ni resolver un venue: se corta acá para no
  // ensuciar el registro canónico ni la cola de revisión.
  if (isPlaceholderVenue(clean)) return null

  // La RPC normalmente devuelve { error }, pero una falla de red (fetch
  // rechazado) hace que supabase.rpc() rechace la promesa en vez de resolver
  // con error: se captura acá para que resolveVenueId nunca lance (QPS-051).
  let data: unknown = null
  let errorMessage: string | null = null
  try {
    const resp = await supabase.rpc('resolve_venue_id', {
      p_raw: clean,
      p_source: options.source ?? null,
      p_autocreate: options.autocreate ?? false,
      p_threshold: options.threshold ?? 0.62,
    })
    data = resp.data
    errorMessage = resp.error?.message ?? null
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err)
  }

  if (errorMessage) {
    console.error(
      `[venues:resolveVenueId] fallo resolviendo ${JSON.stringify(rawVenueName)}:`,
      errorMessage
    )
    options.onError?.(clean, errorMessage)
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
    const clean = venueSanitize(raw)
    if (!clean) continue
    const key = venueNormalize(venueDisplayName(clean))
    if (key && !byKey.has(key)) byKey.set(key, clean)
  }

  const out = new Map<string, string | null>()
  // Secuencial a propósito: en paralelo, dos nombres del mismo cluster pueden
  // crear la fila canónica dos veces antes de que la otra la vea.
  for (const [key, raw] of byKey) {
    out.set(key, await resolveVenueId(supabase, raw, options))
  }
  return out
}
