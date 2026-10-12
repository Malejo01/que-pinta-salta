/**
 * Confirmación de fecha en /admin/revision (QPS-065/073/077): un único lugar
 * para decidir si hace falta que el admin confirme a mano que la fecha de un
 * borrador es correcta, por qué, y cómo mostrarlo. Sin `'use server'`: la
 * usan tanto `lib/admin-actions.ts` (la guarda del servidor) como
 * `app/admin/revision/page.tsx` (para precalcular el aviso) y
 * `components/draft-events-manager.tsx` (estado del formulario).
 *
 * Lógica (sin cambios de comportamiento respecto de la Ronda 14/`needsDateConfirmation`):
 *  - `ai_metadata.is_fallback === true` (QPS-068): el pipeline de IA falló y
 *    se usó `published_at` como fecha de respaldo. Reason: 'fallback'.
 *  - `ai_metadata.date_source === 'published_at'` (QPS-073): la IA no
 *    extrajo una fecha válida del flyer y se usó `published_at`. Reason:
 *    'published_at'.
 *  - Ya tiene `date_source` (y no es 'published_at'): salió del flyer,
 *    confirmada (`needed: false`).
 *  - Borrador viejo (de antes de QPS-073, sin `date_source`): si viene del
 *    pipeline de Instagram (`scrape_source_key === 'instagram-ai'`) y algún
 *    flyer de origen tiene `published_at` en el mismo día de Salta que
 *    `start_date` (o el mismo instante), asumimos que la fecha también salió
 *    del posteo. Reason: 'legacy'.
 *  - No se pudieron leer los flyers de origen (timeout, RLS, esquema): falla
 *    cerrada, se exige confirmación igual. Reason: 'unreadable'.
 */
import { formatSaltaDayKey } from '@/lib/date-format'

export const DATE_CONFIRMATION_CODE = 'DATE_CONFIRMATION_REQUIRED'
export const DATE_CONFIRMATION_MESSAGE = 'Confirmá la fecha: salió de la publicación, no del flyer'

export type DateConfirmationReason = 'fallback' | 'published_at' | 'legacy' | 'unreadable' | null

export interface DateConfirmationResult {
  needed: boolean
  reason: DateConfirmationReason
  /** `published_at` del flyer que explica la fecha, o null si no aplica / no se encontró. */
  postedAt: string | null
}

/** Fila mínima de `instagram_flyers` que necesita esta lógica. */
export interface FlyerPublishedAtRow {
  published_at: string | null
}

type DraftEventRow = {
  id?: unknown
  ai_metadata?: unknown
  scrape_source_key?: unknown
  start_date?: unknown
} | null | undefined

function firstPublishedAt(flyers: FlyerPublishedAtRow[]): string | null {
  const found = flyers.find((f) => typeof f.published_at === 'string' && f.published_at)
  return found ? (found.published_at as string) : null
}

/**
 * Pura: decide si hace falta confirmar la fecha y por qué.
 *
 * `flyers` son los flyers de origen de este evento (`instagram_flyers` con
 * `ai_metadata->>event_id = row.id`), normalmente obtenidos con
 * `loadFlyersByEvent`. Pasar `null` (en vez de un array, incluso vacío)
 * significa "no se pudieron leer" (falla cerrada): solo importa para el caso
 * del borrador viejo, que es el único que necesita leerlos para decidir.
 */
export function dateConfirmation(row: DraftEventRow, flyers: FlyerPublishedAtRow[] | null): DateConfirmationResult {
  const meta = row?.ai_metadata
  const metaObj = meta && typeof meta === 'object' && !Array.isArray(meta)
    ? (meta as Record<string, unknown>)
    : null

  if (metaObj?.is_fallback === true) {
    return { needed: true, reason: 'fallback', postedAt: firstPublishedAt(flyers ?? []) }
  }
  if (metaObj?.date_source === 'published_at') {
    return { needed: true, reason: 'published_at', postedAt: firstPublishedAt(flyers ?? []) }
  }

  // Ya tiene date_source (y no es 'published_at'): salió del flyer, confirmada.
  if (metaObj && 'date_source' in metaObj) {
    return { needed: false, reason: null, postedAt: null }
  }

  // Borrador viejo: solo lo revisamos si viene del pipeline de Instagram-IA.
  if (row?.scrape_source_key !== 'instagram-ai') {
    return { needed: false, reason: null, postedAt: null }
  }

  const startDate = typeof row?.start_date === 'string' ? row.start_date : null
  if (!startDate) {
    return { needed: false, reason: null, postedAt: null }
  }

  // Falla cerrada: si no pudimos leer los flyers de origen, no hay otra señal
  // de si la fecha es confiable, así que exigimos confirmación.
  if (flyers === null) {
    return { needed: true, reason: 'unreadable', postedAt: null }
  }

  const matching = flyers.find((flyer) => {
    const publishedAt = flyer.published_at
    if (!publishedAt) return false
    return publishedAt === startDate || formatSaltaDayKey(publishedAt) === formatSaltaDayKey(startDate)
  })

  if (matching) {
    return { needed: true, reason: 'legacy', postedAt: matching.published_at }
  }

  return { needed: false, reason: null, postedAt: null }
}

/** "YYYY-MM-DD" (formatSaltaDayKey) -> "dd/mm". */
function toDayMonth(publishedAt: string): string {
  const [, month, day] = formatSaltaDayKey(publishedAt).split('-')
  return `${day}/${month}`
}

/** Motivo legible para mostrar en el admin, con dd/mm en hora de Salta cuando aplica. */
export function dateConfirmationText(result: DateConfirmationResult): string {
  const dayMonth = result.postedAt ? toDayMonth(result.postedAt) : null

  switch (result.reason) {
    case 'published_at':
      return dayMonth
        ? `El flyer no dice fecha; se usó el día del posteo, ${dayMonth}.`
        : 'El flyer no dice fecha; se usó el día del posteo.'
    case 'fallback':
      return dayMonth
        ? `No se pudo leer el flyer; se usó el día del posteo, ${dayMonth}.`
        : 'No se pudo leer el flyer; se usó el día del posteo.'
    case 'legacy':
      return dayMonth
        ? `Borrador anterior a la marca de fecha: coincide con el día del posteo, ${dayMonth}.`
        : 'Borrador anterior a la marca de fecha: coincide con el día del posteo.'
    case 'unreadable':
      return 'No se pudo verificar de dónde salió la fecha.'
    default:
      return ''
  }
}

/**
 * Pura: ¿la fecha está confirmada? Sí si no hacía falta, si el admin tildó el
 * checkbox, o si ya cambió la fecha/hora del formulario respecto de la que
 * tiene el evento en la base (comparando el instante, no el string).
 */
export function isDateConfirmed(params: {
  needed: boolean
  checked: boolean
  originalStartISO: string | null
  formStartISO: string | null
}): boolean {
  const { needed, checked, originalStartISO, formStartISO } = params
  if (!needed) return true
  if (checked) return true
  if (!originalStartISO || !formStartISO) return false

  const original = new Date(originalStartISO).getTime()
  const form = new Date(formStartISO).getTime()
  if (Number.isNaN(original) || Number.isNaN(form)) return false

  return original !== form
}

// ---------------------------------------------------------------------------
// Estado del formulario (confirmación): reducer puro, testeable sin
// testing-library.
// ---------------------------------------------------------------------------

export interface DateConfirmFormState {
  checked: boolean
}

export const initialDateConfirmFormState: DateConfirmFormState = { checked: false }

export type DateConfirmFormAction =
  /** Se eligió un borrador distinto (el id no se guarda acá: ya lo tiene el estado del componente): reinicia. */
  | { type: 'select'; id: string | null }
  /** Se refrescó la lista de eventos (p. ej. tras "Procesar con IA"): no reinicia el formulario. */
  | { type: 'eventsRefreshed' }
  /** El admin tildó/destildó "La fecha es correcta". */
  | { type: 'check'; checked: boolean }

export function dateConfirmFormReducer(state: DateConfirmFormState, action: DateConfirmFormAction): DateConfirmFormState {
  switch (action.type) {
    case 'select':
      return { checked: false }
    case 'eventsRefreshed':
      return state
    case 'check':
      return { checked: action.checked }
    default:
      return state
  }
}

// ---------------------------------------------------------------------------
// Carga de flyers (una sola consulta para varios eventos)
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any -- el cliente admin es dinámico (service role, sin tipar); mismo patrón que lib/events/merged.ts */
type SupabaseLike = any
/* eslint-enable @typescript-eslint/no-explicit-any */

export type LoadFlyersByEventResult =
  | { map: Map<string, FlyerPublishedAtRow[]>; error?: undefined }
  | { map?: undefined; error: string }

/**
 * Una sola consulta a `instagram_flyers` para varios ids de evento a la vez
 * (en vez de una consulta por borrador): filtra por
 * `ai_metadata->>event_id` en la lista de ids y agrupa el resultado.
 */
export async function loadFlyersByEvent(client: SupabaseLike, eventIds: string[]): Promise<LoadFlyersByEventResult> {
  if (eventIds.length === 0) return { map: new Map() }

  const { data, error } = await client
    .from('instagram_flyers')
    .select('published_at, ai_metadata')
    .in('ai_metadata->>event_id', eventIds)

  if (error) {
    return { error: error.message as string }
  }

  const map = new Map<string, FlyerPublishedAtRow[]>()
  for (const flyer of (data ?? []) as Array<{ published_at: string | null; ai_metadata: unknown }>) {
    const meta = flyer.ai_metadata
    const metaObj = meta && typeof meta === 'object' && !Array.isArray(meta) ? (meta as Record<string, unknown>) : null
    const eventId = metaObj?.event_id
    if (typeof eventId !== 'string') continue

    const list = map.get(eventId) ?? []
    list.push({ published_at: flyer.published_at ?? null })
    map.set(eventId, list)
  }

  return { map }
}
