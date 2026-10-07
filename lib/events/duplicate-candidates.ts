/**
 * Candidatos a evento duplicado para revisión manual (QPS-061).
 *
 * Agrupa por `venue_id` y empareja los eventos del mismo lugar que empiezan
 * a menos de `windowHours` horas entre sí. Sin comparar títulos a propósito
 * (criterio de Mauro, 2026-10-06): dos eventos en el mismo lugar casi al
 * mismo horario ya alcanzan para que un humano los mire, y comparar texto
 * sumaba falsos negativos (dos nombres muy distintos del mismo show) sin
 * ahorrar trabajo real de revisión.
 *
 * Esto NO escribe nada ni fusiona: la fusión la hace un admin a mano (ver
 * app/admin/duplicados/page.tsx), siguiendo el mismo mecanismo de
 * lib/events/merged.ts que usa la deduplicación de la ingesta.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { saltaStartOfDayISO } from '@/lib/event-display'
import { mergedIntoId } from '@/lib/events/merged'

const HOUR_MS = 60 * 60 * 1000
const DEFAULT_WINDOW_HOURS = 24
const LOOKAHEAD_DAYS = 60
const QUERY_LIMIT = 500

export type DuplicateCandidateEvent = {
  id: string
  title: string
  start_date: string
  status: string | null
  venue_id: string | null
  scrape_source_key?: string | null
  created_by?: string | null
  ai_metadata?: unknown
  venue?: { name: string | null } | null
}

export type DuplicateCandidatePair = {
  a: DuplicateCandidateEvent
  b: DuplicateCandidateEvent
  hoursApart: number
}

/**
 * Función pura: no toca la red.
 *
 * - Agrupa por `venue_id`; si es `null`, el evento no participa.
 * - Excluye `status === 'CANCELLED'` y lo fusionado a mano
 *   (`ai_metadata.merged_into_event_id`, ver mergedIntoId()).
 * - Devuelve pares `{ a, b, hoursApart }` con menos de `windowHours` horas
 *   de diferencia entre sus `start_date`.
 * - Orden: el par más cercano en el tiempo primero.
 */
export function findDuplicateCandidates(
  events: DuplicateCandidateEvent[],
  options?: { windowHours?: number }
): DuplicateCandidatePair[] {
  const windowMs = (options?.windowHours ?? DEFAULT_WINDOW_HOURS) * HOUR_MS

  const byVenue = new Map<string, DuplicateCandidateEvent[]>()
  for (const event of events) {
    if (!event.venue_id) continue
    if (event.status === 'CANCELLED') continue
    if (mergedIntoId(event) !== null) continue

    const group = byVenue.get(event.venue_id)
    if (group) {
      group.push(event)
    } else {
      byVenue.set(event.venue_id, [event])
    }
  }

  const pairs: DuplicateCandidatePair[] = []
  for (const group of byVenue.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]
        const b = group[j]
        const diffMs = Math.abs(new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
        if (diffMs < windowMs) {
          pairs.push({ a, b, hoursApart: diffMs / HOUR_MS })
        }
      }
    }
  }

  return pairs.sort((p1, p2) => p1.hoursApart - p2.hoursApart)
}

/**
 * Trae eventos PUBLISHED/DRAFT desde el inicio del día de Salta hasta
 * `LOOKAHEAD_DAYS` días y les aplica findDuplicateCandidates().
 *
 * No hay columna `events.source`: la fuente efectiva de una fila se calcula
 * con `scrape_source_key`/`created_by` (ver lib/scraper/source-priority.ts,
 * resolveEventSource/describeSource), así que se traen esas dos columnas en
 * vez de una inexistente.
 */
export async function getDuplicateCandidates(
  supabase: SupabaseClient,
  now: Date = new Date()
): Promise<DuplicateCandidatePair[]> {
  const from = saltaStartOfDayISO(now)
  const to = new Date(now.getTime() + LOOKAHEAD_DAYS * 24 * HOUR_MS).toISOString()

  const { data, error } = await supabase
    .from('events')
    .select('id, title, start_date, status, venue_id, scrape_source_key, created_by, ai_metadata, venue:venues(name)')
    .in('status', ['PUBLISHED', 'DRAFT'])
    .gte('start_date', from)
    .lte('start_date', to)
    .order('start_date', { ascending: true })
    .limit(QUERY_LIMIT)

  if (error) {
    console.error('[duplicate-candidates] Error obteniendo eventos:', error.message)
    return []
  }

  // La relación events -> venues es ambigua para el tipado (hay dos FK a
  // venues: directa y vía venues_canonical), así que el cliente tipado puede
  // devolver `venue` como arreglo en vez de objeto. Se normaliza acá.
  const rows: unknown[] = data ?? []
  const normalized: DuplicateCandidateEvent[] = rows.map((row) => {
    const r = row as Omit<DuplicateCandidateEvent, 'venue'> & {
      venue?: { name: string | null } | { name: string | null }[] | null
    }
    return { ...r, venue: Array.isArray(r.venue) ? r.venue[0] ?? null : r.venue ?? null }
  })

  return findDuplicateCandidates(normalized)
}
