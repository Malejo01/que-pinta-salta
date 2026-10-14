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
 * Esto NO escribe nada: la fusión y el descarte los hace un admin a mano
 * desde app/admin/duplicados/page.tsx, que llama a lib/admin/duplicate-actions.ts
 * (`merge_events()` en la base, ver supabase/migrations/20261011120000_merge_events.sql).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { cleanDescription, saltaStartOfDayISO } from '@/lib/event-display'
import { mergedIntoId } from '@/lib/events/merged'
import { hasRealTime, ticketUrlsOf } from '@/lib/scraper/dedup-key'
import { formatSaltaDayKey } from '@/lib/date-format'

const HOUR_MS = 60 * 60 * 1000
const DEFAULT_WINDOW_HOURS = 24
const LOOKAHEAD_DAYS = 60
const QUERY_LIMIT = 500
const DISMISSED_LIMIT = 100

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
  // Columnas agregadas para defaultKeeper() (QPS-061, Ronda 19 / 19-c).
  image_url?: string | null
  ticket_url?: string | null
  ticket_sources?: unknown
  description?: string | null
  price_min?: number | null
  created_at?: string | null
}

export type DuplicateCandidatePair = {
  a: DuplicateCandidateEvent
  b: DuplicateCandidateEvent
  hoursApart: number
}

/** Orden canónico de un par de ids (event_a < event_b, como exige el CHECK de duplicate_dismissals). */
export function orderPair(aId: string, bId: string): [string, string] {
  return aId < bId ? [aId, bId] : [bId, aId]
}

/** Clave de un par para el Set de pares descartados: "<menor>|<mayor>". */
export function pairKey(aId: string, bId: string): string {
  const [first, second] = orderPair(aId, bId)
  return `${first}|${second}`
}

/**
 * Función pura: no toca la red.
 *
 * - Agrupa por `venue_id`; si es `null`, el evento no participa.
 * - Excluye `status === 'CANCELLED'` y lo fusionado a mano
 *   (`ai_metadata.merged_into_event_id`, ver mergedIntoId()).
 * - Excluye los pares marcados como "no son el mismo evento" (`options.dismissed`,
 *   claves "<menor>|<mayor>" con pairKey()), si se pasa ese parámetro.
 * - Devuelve pares `{ a, b, hoursApart }` con menos de `windowHours` horas
 *   de diferencia entre sus `start_date`.
 * - Orden: el par más cercano en el tiempo primero.
 */
export function findDuplicateCandidates(
  events: DuplicateCandidateEvent[],
  options?: { windowHours?: number; dismissed?: Set<string> }
): DuplicateCandidatePair[] {
  const windowMs = (options?.windowHours ?? DEFAULT_WINDOW_HOURS) * HOUR_MS
  const dismissed = options?.dismissed

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
        if (dismissed?.has(pairKey(a.id, b.id))) continue
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
    .select(
      'id, title, start_date, status, venue_id, scrape_source_key, created_by, ai_metadata, image_url, ticket_url, ticket_sources, description, price_min, created_at, venue:venues(name)'
    )
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

  // Pares que un admin ya marcó como "no son el mismo evento"
  // (duplicate_dismissals, ver app/admin/duplicados/page.tsx). Falla abierta
  // a propósito: si esta consulta falla (timeout, RLS, tabla todavía sin
  // aplicar en algún entorno), se loguea y se muestran los pares igual, sin
  // filtrar. Esto es solo una lista de revisión manual, no una escritura: es
  // preferible mostrar de más (un admin vuelve a mirar un par ya descartado)
  // a que un error ajeno tire abajo toda la página.
  let dismissed = new Set<string>()
  try {
    const { data: dismissedRows, error: dismissedError } = await supabase
      .from('duplicate_dismissals')
      .select('event_a, event_b')

    if (dismissedError) {
      console.error('[duplicate-candidates] Error obteniendo duplicate_dismissals:', dismissedError.message)
    } else {
      dismissed = new Set(
        ((dismissedRows ?? []) as Array<{ event_a: string; event_b: string }>).map((row) =>
          pairKey(row.event_a, row.event_b)
        )
      )
    }
  } catch (err) {
    console.error('[duplicate-candidates] Excepción obteniendo duplicate_dismissals:', err)
  }

  return findDuplicateCandidates(normalized, { dismissed })
}

type KeeperEvent = Pick<
  DuplicateCandidateEvent,
  | 'id'
  | 'status'
  | 'venue_id'
  | 'start_date'
  | 'image_url'
  | 'ticket_url'
  | 'ticket_sources'
  | 'description'
  | 'price_min'
  | 'created_at'
>

/** Puntaje de datos de un evento: un punto por cada dato presente. */
function dataScore(e: KeeperEvent): number {
  let score = 0
  if (e.image_url) score++
  if (ticketUrlsOf({ ticket_url: e.ticket_url, ticket_sources: e.ticket_sources }).size > 0) score++
  if (cleanDescription(e.description) !== null) score++
  if (hasRealTime(e.start_date)) score++
  if (e.price_min !== null && e.price_min !== undefined) score++
  if (e.venue_id) score++
  return score
}

/**
 * Pura. Id del evento que queda por defecto al fusionar `a` y `b` (el admin
 * puede cambiarlo en el selector "Queda: A / B"):
 *
 *  1. El `PUBLISHED`, si solo uno de los dos lo está.
 *  2. Si no, el de mayor puntaje de datos (imagen, link de compra, descripción,
 *     hora distinta de 00:00 en Salta, precio informado, venue): un punto por
 *     cada uno.
 *  3. Si empatan en puntaje, el de `created_at` más viejo.
 *  4. Si sigue el empate, el de menor id.
 */
export function defaultKeeper(a: KeeperEvent, b: KeeperEvent): string {
  const aPublished = a.status === 'PUBLISHED'
  const bPublished = b.status === 'PUBLISHED'
  if (aPublished !== bPublished) return aPublished ? a.id : b.id

  const scoreA = dataScore(a)
  const scoreB = dataScore(b)
  if (scoreA !== scoreB) return scoreA > scoreB ? a.id : b.id

  const createdA = a.created_at ? new Date(a.created_at).getTime() : NaN
  const createdB = b.created_at ? new Date(b.created_at).getTime() : NaN
  if (!Number.isNaN(createdA) && !Number.isNaN(createdB) && createdA !== createdB) {
    return createdA < createdB ? a.id : b.id
  }

  return a.id < b.id ? a.id : b.id
}

export type CanMergeResult = { ok: true } | { ok: false; reason: string }

type MergeCheckEvent = Pick<DuplicateCandidateEvent, 'id' | 'status' | 'ai_metadata'>

/**
 * Pura. Mismas reglas que valida `merge_events()`
 * (supabase/migrations/20261011120000_merge_events.sql), para avisar en la UI
 * antes de llamar al RPC: ya fusionado (ciclo u otro destino), `CANCELLED`, o
 * el descartado `PUBLISHED` con el que queda sin publicar. La que manda
 * siempre es la base: esto solo evita intentos que ya se sabe que van a
 * fallar.
 */
export function canMerge(keep: MergeCheckEvent, drop: MergeCheckEvent): CanMergeResult {
  if (keep.id === drop.id) {
    return { ok: false, reason: 'No se puede fusionar un evento consigo mismo' }
  }

  const keepMergedInto = mergedIntoId(keep)
  const dropMergedInto = mergedIntoId(drop)

  if (keepMergedInto === drop.id) {
    return { ok: false, reason: 'El evento que queda ya está fusionado hacia el que se quiere descartar' }
  }
  if (keepMergedInto) {
    return { ok: false, reason: 'El evento que queda ya fue fusionado hacia otro evento' }
  }
  if (dropMergedInto) {
    return { ok: false, reason: 'El evento que se descarta ya fue fusionado hacia otro evento' }
  }
  if (keep.status === 'CANCELLED' || drop.status === 'CANCELLED') {
    return { ok: false, reason: 'No se puede fusionar un evento cancelado' }
  }
  if (drop.status === 'PUBLISHED' && keep.status !== 'PUBLISHED') {
    return {
      ok: false,
      reason: 'El evento que se descarta está publicado y el que queda no: publicá primero el que queda',
    }
  }

  return { ok: true }
}

export type DismissedPairEvent = { id: string; title: string; start_date: string } | null

export type DismissedPair = {
  eventA: DismissedPairEvent
  eventB: DismissedPairEvent
  decidedAt: string
}

/**
 * Pares marcados como "no son el mismo evento" (`duplicate_dismissals`), con
 * los títulos y la fecha de los dos eventos para la sección plegada
 * "Marcados como distintos" de app/admin/duplicados/page.tsx. No trae
 * `decided_by`. Del más reciente al más viejo, hasta 100.
 */
export async function getDismissedPairs(supabase: SupabaseClient): Promise<DismissedPair[]> {
  const { data, error } = await supabase
    .from('duplicate_dismissals')
    .select('event_a, event_b, decided_at')
    .order('decided_at', { ascending: false })
    .limit(DISMISSED_LIMIT)

  if (error) {
    console.error('[duplicate-candidates] Error obteniendo pares descartados:', error.message)
    return []
  }

  const rows = (data ?? []) as Array<{ event_a: string; event_b: string; decided_at: string }>
  if (rows.length === 0) return []

  const ids = Array.from(new Set(rows.flatMap((row) => [row.event_a, row.event_b])))

  const { data: events, error: eventsError } = await supabase.from('events').select('id, title, start_date').in('id', ids)

  if (eventsError) {
    console.error('[duplicate-candidates] Error obteniendo eventos de pares descartados:', eventsError.message)
    return []
  }

  const byId = new Map(
    ((events ?? []) as Array<{ id: string; title: string; start_date: string }>).map((e) => [e.id, e])
  )

  return rows.map((row) => ({
    eventA: byId.get(row.event_a) ?? null,
    eventB: byId.get(row.event_b) ?? null,
    decidedAt: row.decided_at,
  }))
}

// ---------------------------------------------------------------------------
// Avisos antes de fusionar (hotfix 13/10)
// ---------------------------------------------------------------------------
// Los pares ya salen del mismo venue_id (findDuplicateCandidates agrupa por
// lugar), así que dos lugares distintos conocidos nunca forman un par. El
// riesgo que queda es que la IA le haya asignado al borrador el mismo lugar
// que al otro evento cuando el flyer decía otro: por eso se compara también
// el lugar que leyó la IA (ai_metadata.extracted_data.venue_name).

export type PairWarning = { kind: 'venue' | 'venue_ai' | 'day'; text: string }

function normalizeVenueText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(de|del|la|el|los|las|salta)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Lugar tal como lo leyó la IA del flyer, si lo hay. */
export function aiVenueName(event: Pick<DuplicateCandidateEvent, 'ai_metadata'>): string | null {
  const meta = event.ai_metadata
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null
  const extracted = (meta as Record<string, unknown>).extracted_data
  if (!extracted || typeof extracted !== 'object' || Array.isArray(extracted)) return null
  const value = (extracted as Record<string, unknown>).venue_name
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/** true si los dos textos nombran lugares distintos (uno no contiene al otro). */
function differentVenueText(x: string, y: string): boolean {
  const a = normalizeVenueText(x)
  const b = normalizeVenueText(y)
  if (!a || !b) return false
  return !(a.includes(b) || b.includes(a))
}

function dayMonth(iso: string): string {
  const [, month, day] = formatSaltaDayKey(iso).split('-')
  return `${day}/${month}`
}

/**
 * Avisos de un par antes de fusionar. Puro.
 * - `venue`: los dos tienen lugar asignado y es distinto.
 * - `venue_ai`: el lugar que leyó la IA de cada flyer no coincide.
 * - `day`: empiezan en días distintos (hora de Salta).
 */
export function pairWarnings(a: DuplicateCandidateEvent, b: DuplicateCandidateEvent): PairWarning[] {
  const warnings: PairWarning[] = []

  if (a.venue_id && b.venue_id && a.venue_id !== b.venue_id) {
    warnings.push({
      kind: 'venue',
      text: `Lugares distintos: ${a.venue?.name ?? 'sin nombre'} vs ${b.venue?.name ?? 'sin nombre'}`,
    })
  }

  const aiA = aiVenueName(a)
  const aiB = aiVenueName(b)
  if (aiA && aiB && differentVenueText(aiA, aiB)) {
    warnings.push({ kind: 'venue_ai', text: `Lugares distintos según el flyer: ${aiA} vs ${aiB}` })
  }

  const dayA = formatSaltaDayKey(a.start_date)
  const dayB = formatSaltaDayKey(b.start_date)
  if (dayA !== dayB) {
    warnings.push({ kind: 'day', text: `Días distintos: ${dayMonth(a.start_date)} vs ${dayMonth(b.start_date)}` })
  }

  return warnings
}
