import type { TicketSource } from '../types'
import { getSourcePriority, getSourceTier, resolveEventSource } from './source-priority'

/**
 * Fusión de dos registros del mismo evento, sin pérdida de datos.
 *
 * Regla general
 * -------------
 * 1. Si el registro existente tiene el campo vacío y el entrante lo trae, se
 *    rellena. Eso no es un conflicto: es completar.
 * 2. Si los dos lo traen y coinciden, no pasa nada.
 * 3. Si los dos lo traen y difieren, gana la fuente de mayor prioridad
 *    (ver source-priority.ts) y el valor perdedor se guarda en el registro de
 *    auditoría. Nunca se pierde.
 * 4. Empate de prioridad -> gana el que ya estaba. Es arbitrario, pero
 *    estable: reprocesar la misma corrida dos veces no cambia el resultado.
 *
 * Este módulo es puro: no toca la base. Devuelve el patch a aplicar y la
 * entrada de auditoría. Eso es lo que permite que el job de limpieza corra en
 * dry-run usando exactamente el mismo código que la ingesta.
 */

export type MergeContext = 'ingest' | 'cleanup'

export interface DiscardedValue {
  field: string
  kept: any
  discarded: any
  kept_source: string
  discarded_source: string
  rule: string
}

export interface MergeAuditEntry {
  merged_at: string
  context: MergeContext
  dedup_key: string
  base_source: string
  incoming_source: string
  base_priority: number
  incoming_priority: number
  discarded: DiscardedValue[]
  /** Sólo en limpieza retroactiva: id de la fila absorbida y borrada. */
  absorbed_event_id?: string
  /** Snapshot completo de la fila absorbida, para poder reconstruirla. */
  absorbed_snapshot?: Record<string, any>
}

export interface MergeResult {
  /** Campos a actualizar sobre el registro que se conserva. */
  patch: Record<string, any>
  audit: MergeAuditEntry
  /** true si el patch cambia algo. */
  changed: boolean
  /** Conflictos reales: campo presente en ambos, con valores distintos. */
  conflicts: DiscardedValue[]
}

export interface MergeOptions {
  incomingSource: string
  dedupKey: string
  context: MergeContext
  /** Fuente del registro existente. Por defecto `base.scrape_source_key`. */
  baseSource?: string | null
  absorbedEventId?: string
  absorbedSnapshot?: Record<string, any>
  /** Máximo de entradas conservadas en merge_audit. */
  auditLimit?: number
}

/**
 * Campos de valor único que se resuelven por prioridad de fuente.
 *
 * Fuera de la lista a propósito:
 *   slug        la URL del evento ya está publicada e indexada; cambiarla
 *               rompe links vivos. La variante descartada queda en auditoría.
 *   id, created_at, created_by, view_count, is_featured
 *               son propiedades del registro, no del evento.
 */
const PRIORITY_FIELDS = [
  'title',
  'start_date',
  'end_date',
  'venue_id',
  'description',
  'short_description',
  'price_max',
  'age_restriction',
] as const

const ARRAY_UNION_FIELDS = ['tags', 'gallery_urls'] as const

const DEFAULT_AUDIT_LIMIT = 50

function isEmptyValue(value: any): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

/** `age_restriction: 0` significa "sin dato", no "sin restricción declarada". */
function isEmptyForField(field: string, value: any): boolean {
  if (field === 'age_restriction' && value === 0) return true
  if (field === 'price_max' && value === 0) return true
  return isEmptyValue(value)
}

function sameValue(field: string, a: any, b: any): boolean {
  if (field === 'start_date' || field === 'end_date') {
    const ta = new Date(a).getTime()
    const tb = new Date(b).getTime()
    if (!Number.isNaN(ta) && !Number.isNaN(tb)) return ta === tb
  }
  if (typeof a === 'string' && typeof b === 'string') return a.trim() === b.trim()
  return a === b
}

/**
 * Una imagen de 150x150 o con "thumb" en la URL es una miniatura y se ve mal
 * en la card. Si la que hay es miniatura y llega una que no lo es, se usa la
 * nueva aunque venga de una fuente de menor prioridad: acá no hay conflicto de
 * verdad sobre cuál es el evento, sólo sobre qué archivo se muestra.
 */
function isThumbnail(url?: string | null): boolean {
  if (!url) return true

  let lower = url.toLowerCase()
  try {
    lower = decodeURIComponent(lower)
  } catch {
    // URL mal escapada: se compara igual sobre el original.
  }

  // Se comparan sin separadores porque EntradaUno publica las miniaturas como
  // "150%20x%20150%20%285%29.jpg" — con espacios escapados en el medio del
  // tamaño. Buscar "150x150" tal cual no las encuentra y se termina
  // conservando la miniatura y descartando la imagen grande.
  const compact = lower.replace(/[^a-z0-9]/g, '')
  return compact.includes('150x150') || compact.includes('thumb') || compact.includes('equity')
}

function normalizeTicketSources(value: any): TicketSource[] {
  if (!Array.isArray(value)) return []
  return value.filter((item) => item && typeof item === 'object' && typeof item.url === 'string')
}

function ticketSourceKey(url: string): string {
  return url.trim().replace(/\/+$/, '').toLowerCase()
}

/**
 * Une los links de compra sin pisar ninguno. La identidad de un link es su URL
 * normalizada, no el `source`: la misma ticketera puede publicar dos links
 * (venta general y preventa) y los dos sirven.
 *
 * Respeta la estructura que ya usan los 116 eventos multi-link:
 * `{ source, url, price_min }`.
 */
export function mergeTicketSources(
  existing: any,
  incoming: any,
  incomingSource: string,
  incomingUrl?: string | null,
  incomingPriceMin?: number | null
): TicketSource[] {
  const merged = normalizeTicketSources(existing)
  const seen = new Set(merged.map((source) => ticketSourceKey(source.url)))

  const candidates = normalizeTicketSources(incoming)
  if (incomingUrl && typeof incomingUrl === 'string' && incomingUrl.trim()) {
    candidates.push({
      source: incomingSource,
      url: incomingUrl,
      price_min: incomingPriceMin ?? 0,
    })
  }

  for (const candidate of candidates) {
    const key = ticketSourceKey(candidate.url)
    if (!key || seen.has(key)) continue
    seen.add(key)
    merged.push({
      source: candidate.source || incomingSource,
      url: candidate.url,
      price_min: candidate.price_min ?? 0,
    })
  }

  return merged
}

function unionArray(existing: any, incoming: any): any[] {
  const base = Array.isArray(existing) ? existing : []
  const extra = Array.isArray(incoming) ? incoming : []
  const out = [...base]
  const keyOf = (item: any) => (typeof item === 'string' ? item.toLowerCase() : JSON.stringify(item))
  const seen = new Set(base.map(keyOf))

  for (const item of extra) {
    const key = keyOf(item)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }

  return out
}

/**
 * `price_min` es "lo más barato que se consigue", no un dato en disputa: si una
 * fuente vende a 15000 y otra a 12000, el mínimo real es 12000. Por eso se
 * agrega en vez de resolverse por prioridad.
 *
 * Los ceros se ignoran salvo que todas las fuentes digan cero: un flyer de
 * Instagram sin precio se guarda como 0, y tomarlo como mínimo dejaría en $0
 * un evento que sí se cobra.
 */
function resolvePriceMin(basePrice: any, incomingPrice: any): number {
  const positives = [basePrice, incomingPrice].filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0
  )
  if (positives.length > 0) return Math.min(...positives)
  return 0
}

/**
 * Sólo se permite promover DRAFT -> PUBLISHED cuando una ticketera o el portal
 * provincial confirman el evento. Nunca se toca PENDING (es la cola de
 * moderación humana; promoverlo saltearía la revisión) ni CANCELLED, y nunca se
 * baja un PUBLISHED. Toda diferencia de estado queda igual en la auditoría.
 */
function resolveStatus(baseStatus: any, incomingStatus: any, incomingSource: string): string | null {
  if (!incomingStatus || incomingStatus === baseStatus) return null
  if (baseStatus !== 'DRAFT') return null
  if (incomingStatus !== 'PUBLISHED') return null

  const tier = getSourceTier(incomingSource)
  return tier === 'ticketera' || tier === 'portal' ? 'PUBLISHED' : null
}

export function mergeEvents(
  base: Record<string, any>,
  incoming: Record<string, any>,
  options: MergeOptions
): MergeResult {
  const baseSource = options.baseSource ?? resolveEventSource(base)
  const incomingSource = options.incomingSource
  const basePriority = getSourcePriority(baseSource)
  const incomingPriority = getSourcePriority(incomingSource)
  const incomingWins = incomingPriority > basePriority

  const patch: Record<string, any> = {}
  const discarded: DiscardedValue[] = []
  const conflicts: DiscardedValue[] = []

  /** Por qué ganó el que ganó, cuando la razón es sólo la prioridad. */
  const priorityRule = incomingPriority === basePriority ? 'empate-gana-existente' : 'prioridad-de-fuente'

  const recordConflict = (field: string, kept: any, lost: any, rule: string, keptIsIncoming: boolean) => {
    const entry: DiscardedValue = {
      field,
      kept,
      discarded: lost,
      kept_source: (keptIsIncoming ? incomingSource : baseSource) || 'sin-fuente',
      discarded_source: (keptIsIncoming ? baseSource : incomingSource) || 'sin-fuente',
      rule,
    }
    discarded.push(entry)
    conflicts.push(entry)
  }

  // --- Campos de valor único, resueltos por prioridad -----------------------
  for (const field of PRIORITY_FIELDS) {
    const baseValue = base[field]
    const incomingValue = incoming[field]

    if (isEmptyForField(field, incomingValue)) continue

    if (isEmptyForField(field, baseValue)) {
      // Hueco rellenado: no es conflicto, no va a la auditoría.
      patch[field] = incomingValue
      continue
    }

    if (sameValue(field, baseValue, incomingValue)) continue

    if (incomingWins) {
      patch[field] = incomingValue
      recordConflict(field, incomingValue, baseValue, priorityRule, true)
    } else {
      recordConflict(field, baseValue, incomingValue, priorityRule, false)
    }
  }

  // --- Imagen: excepción por calidad, no por prioridad ----------------------
  if (!isEmptyValue(incoming.image_url)) {
    if (isEmptyValue(base.image_url)) {
      patch.image_url = incoming.image_url
    } else if (!sameValue('image_url', base.image_url, incoming.image_url)) {
      const upgrade = isThumbnail(base.image_url) && !isThumbnail(incoming.image_url)
      if (upgrade || incomingWins) {
        patch.image_url = incoming.image_url
        recordConflict(
          'image_url',
          incoming.image_url,
          base.image_url,
          upgrade ? 'miniatura-reemplazada' : priorityRule,
          true
        )
      } else {
        recordConflict('image_url', base.image_url, incoming.image_url, priorityRule, false)
      }
    }
  }

  // --- Categoría: la clasificación manual es pegajosa ----------------------
  if (!isEmptyValue(incoming.category_id)) {
    if (isEmptyValue(base.category_id)) {
      patch.category_id = incoming.category_id
      patch.classification_source = incoming.classification_source || 'scraper'
    } else if (!sameValue('category_id', base.category_id, incoming.category_id)) {
      if (base.classification_source === 'manual') {
        recordConflict(
          'category_id',
          base.category_id,
          incoming.category_id,
          'clasificacion-manual-bloqueada',
          false
        )
      } else if (incoming.classification_source === 'manual' || incomingWins) {
        patch.category_id = incoming.category_id
        patch.classification_source = incoming.classification_source || 'scraper'
        recordConflict(
          'category_id',
          incoming.category_id,
          base.category_id,
          incoming.classification_source === 'manual' ? 'clasificacion-manual-gana' : priorityRule,
          true
        )
      } else {
        recordConflict('category_id', base.category_id, incoming.category_id, priorityRule, false)
      }
    }
  }

  // --- Acumulativos: nunca se pisan ---------------------------------------
  // El registro existente puede tener `ticket_url` pero `ticket_sources` vacío:
  // es el estado de las filas anteriores a 20260624_add_event_ticket_sources y
  // el de cualquier fila creada por fuera de la ingesta. Se siembra el array
  // con su propio link antes de sumar el entrante, o al fusionar se perdería.
  const baseSources = mergeTicketSources(
    [],
    base.ticket_sources,
    baseSource || 'sin-fuente',
    base.ticket_url,
    base.price_min
  )
  const mergedSources = mergeTicketSources(
    baseSources,
    incoming.ticket_sources,
    incomingSource,
    incoming.ticket_url,
    incoming.price_min
  )
  if (mergedSources.length !== normalizeTicketSources(base.ticket_sources).length) {
    patch.ticket_sources = mergedSources
  }

  // `ticket_url` sigue siendo la columna que lee la UI vieja: queda apuntando
  // al link de la fuente de mayor prioridad, pero el array conserva todos.
  if (isEmptyValue(base.ticket_url) && !isEmptyValue(incoming.ticket_url)) {
    patch.ticket_url = incoming.ticket_url
  } else if (
    !isEmptyValue(incoming.ticket_url) &&
    incomingWins &&
    !sameValue('ticket_url', base.ticket_url, incoming.ticket_url)
  ) {
    patch.ticket_url = incoming.ticket_url
  }

  for (const field of ARRAY_UNION_FIELDS) {
    const merged = unionArray(base[field], incoming[field])
    const baseLength = Array.isArray(base[field]) ? base[field].length : 0
    if (merged.length !== baseLength) patch[field] = merged
  }

  // --- Derivados -----------------------------------------------------------
  const finalPriceMin = resolvePriceMin(base.price_min, incoming.price_min)
  if (finalPriceMin !== base.price_min) patch.price_min = finalPriceMin

  const finalIsFree = finalPriceMin === 0 && base.is_free !== false && incoming.is_free !== false
  if (finalIsFree !== base.is_free) patch.is_free = finalIsFree

  const finalIsCommercial = Boolean(base.is_commercial || incoming.is_commercial)
  if (finalIsCommercial !== Boolean(base.is_commercial)) patch.is_commercial = finalIsCommercial

  const nextStatus = resolveStatus(base.status, incoming.status, incomingSource)
  if (nextStatus) {
    patch.status = nextStatus
  } else if (incoming.status && base.status && incoming.status !== base.status) {
    recordConflict('status', base.status, incoming.status, 'estado-no-se-toca-en-merge', false)
  }

  // La fuente del registro pasa a ser la de mayor prioridad de las dos, para
  // que la próxima fusión compare contra la autoridad real y no contra la que
  // casualmente llegó primero.
  if (incomingWins) patch.scrape_source_key = incomingSource

  if (!isEmptyValue(incoming.slug) && !sameValue('slug', base.slug, incoming.slug)) {
    recordConflict('slug', base.slug, incoming.slug, 'slug-inmutable-url-publicada', false)
  }

  const audit: MergeAuditEntry = {
    merged_at: new Date().toISOString(),
    context: options.context,
    dedup_key: options.dedupKey,
    base_source: baseSource || 'sin-fuente',
    incoming_source: incomingSource,
    base_priority: basePriority,
    incoming_priority: incomingPriority,
    discarded,
  }
  if (options.absorbedEventId) audit.absorbed_event_id = options.absorbedEventId
  if (options.absorbedSnapshot) audit.absorbed_snapshot = options.absorbedSnapshot

  return { patch, audit, changed: Object.keys(patch).length > 0, conflicts }
}

/** Agrega una entrada al historial de auditoría, recortando la más vieja. */
export function appendAudit(
  existingAudit: any,
  entry: MergeAuditEntry,
  limit: number = DEFAULT_AUDIT_LIMIT
): MergeAuditEntry[] {
  const history = Array.isArray(existingAudit) ? existingAudit : []
  const next = [...history, entry]
  return next.length > limit ? next.slice(next.length - limit) : next
}
