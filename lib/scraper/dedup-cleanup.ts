import { createClient } from '@supabase/supabase-js'
import { buildDedupKey, dedupKeyOf } from './dedup-key'
import { mergeEvents, appendAudit, type DiscardedValue, type MergeAuditEntry } from './merge-events'
import { getSourcePriority, describeSource, resolveEventSource } from './source-priority'
import { formatSaltaDayKey } from '../date-format'

/**
 * Limpieza retroactiva de eventos duplicados.
 *
 * Corre en dry-run por defecto: agrupa por clave de dedup, arma el plan de
 * fusión completo — quién sobrevive, qué se absorbe, qué campos entran en
 * conflicto y cuál gana — y lo reporta SIN escribir nada. Recién con
 * `dryRun: false` aplica.
 *
 * Usa exactamente el mismo mergeEvents() que la ingesta, así que lo que el
 * dry-run informa es literalmente lo que va a pasar, no una aproximación.
 *
 * Qué hace al aplicar, por grupo:
 *   1. UPDATE sobre el registro que se conserva, con el resultado de fusionar
 *      todos los demás encima (links unidos, huecos completados, conflictos
 *      resueltos por prioridad de fuente).
 *   2. Repunta favoritos y vistas de las filas absorbidas hacia el que queda.
 *   3. DELETE de las filas absorbidas — pero recién después de dejar el
 *      snapshot JSON completo de cada una en `merge_audit` del sobreviviente.
 *      Ese snapshot es lo que permite reconstruir la fila si algo salió mal.
 */

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Faltan variables de entorno SUPABASE')
  return createClient(url, key)
}

export interface DedupCleanupOptions {
  /** Por defecto true: no escribe nada, sólo reporta. */
  dryRun?: boolean
  /** Filtro inferior sobre start_date, "YYYY-MM-DD" en hora de Salta. */
  from?: string
  /** Filtro superior sobre start_date, "YYYY-MM-DD" en hora de Salta. */
  to?: string
  /** Por defecto false: sólo se miran eventos de hoy en adelante. */
  includePast?: boolean
  /** Corta el plan después de N grupos. Sin límite por defecto. */
  maxGroups?: number
  /**
   * Escribe `dedup_key` en las filas que no la tienen (incluidas las que no
   * están duplicadas). Por defecto sigue a `!dryRun`.
   */
  backfillKeys?: boolean
  supabase?: any
}

export interface PlannedEvent {
  id: string
  title: string
  slug: string | null
  source: string
  status: string
  venue_id: string | null
  start_date: string
  ticket_sources: number
  view_count: number
  priority: number
}

export interface DuplicateGroupPlan {
  dedupKey: string
  day: string
  keeper: PlannedEvent
  absorbed: PlannedEvent[]
  conflicts: DiscardedValue[]
  ticketSourcesBefore: number
  ticketSourcesAfter: number
  patch: Record<string, any>
  auditEntries: MergeAuditEntry[]
}

export interface DedupCleanupReport {
  dryRun: boolean
  scannedEvents: number
  duplicateGroups: number
  /** Filas que se absorben y desaparecen. Es "el total de fusiones". */
  totalMerges: number
  /** Filas que quedan después de la limpieza, dentro del universo escaneado. */
  eventsAfter: number
  groups: DuplicateGroupPlan[]
  applied: {
    keepersUpdated: number
    eventsDeleted: number
    favoritesRepointed: number
    viewsRepointed: number
    keysBackfilled: number
  }
  errors: string[]
  range: { from: string | null; to: string | null }
}

/** Columnas que necesita el merge. `*` para no tener que sincronizar la lista. */
const PAGE_SIZE = 500

async function fetchAllEvents(supabase: any, options: DedupCleanupOptions): Promise<any[]> {
  const rows: any[] = []
  let offset = 0

  for (;;) {
    let query = supabase
      .from('events')
      .select('*')
      .neq('status', 'CANCELLED')
      .order('start_date', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)

    if (options.from) query = query.gte('start_date', new Date(`${options.from}T00:00:00.000-03:00`).toISOString())
    if (options.to) query = query.lte('start_date', new Date(`${options.to}T23:59:59.999-03:00`).toISOString())

    const { data, error } = await query
    if (error) throw new Error(`Error leyendo events: ${error.message}`)
    if (!data || data.length === 0) break

    rows.push(...data)
    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return rows
}

function toPlannedEvent(row: any): PlannedEvent {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug ?? null,
    source: resolveEventSource(row),
    status: row.status,
    venue_id: row.venue_id ?? null,
    start_date: row.start_date,
    ticket_sources: Array.isArray(row.ticket_sources) ? row.ticket_sources.length : 0,
    view_count: typeof row.view_count === 'number' ? row.view_count : 0,
    priority: getSourcePriority(resolveEventSource(row)),
  }
}

/**
 * Quién sobrevive: la fuente de mayor prioridad. A igualdad de prioridad, el
 * registro más viejo — es el que probablemente ya tenga la URL indexada y
 * favoritos encima. El desempate por antigüedad además hace determinista al
 * job: dos corridas sobre los mismos datos eligen el mismo sobreviviente.
 */
function pickKeeper(group: any[]): any[] {
  const sorted = [...group].sort((a, b) => {
    const byPriority = getSourcePriority(resolveEventSource(b)) - getSourcePriority(resolveEventSource(a))
    if (byPriority !== 0) return byPriority
    return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
  })
  return sorted
}

/** Agrupa las filas por clave de dedup recalculada en memoria. */
export function groupByDedupKey(rows: any[]): Map<string, any[]> {
  const groups = new Map<string, any[]>()

  for (const row of rows) {
    const key = dedupKeyOf(row)
    // Sin clave (título o fecha faltante) no se agrupa: nunca se fusiona a
    // ciegas un evento al que le falta justo el dato que lo identifica.
    if (!key) continue
    const bucket = groups.get(key)
    if (bucket) bucket.push(row)
    else groups.set(key, [row])
  }

  return groups
}

/** Arma el plan de fusión de un grupo, sin tocar la base. */
export function planGroup(dedupKey: string, group: any[]): DuplicateGroupPlan {
  const [keeper, ...absorbed] = pickKeeper(group)

  // Copia de trabajo: cada fusión ve el resultado de la anterior, igual que
  // pasaría si los eventos hubieran entrado de a uno por la ingesta.
  const working: Record<string, any> = { ...keeper }
  const conflicts: DiscardedValue[] = []
  const auditEntries: MergeAuditEntry[] = []
  const patch: Record<string, any> = {}

  for (const row of absorbed) {
    const merge = mergeEvents(working, row, {
      incomingSource: resolveEventSource(row),
      dedupKey,
      context: 'cleanup',
      absorbedEventId: row.id,
      absorbedSnapshot: row,
    })

    Object.assign(patch, merge.patch)
    Object.assign(working, merge.patch)
    conflicts.push(...merge.conflicts)
    auditEntries.push(merge.audit)
  }

  // Las vistas de las filas absorbidas se suman a la que queda; si no, un
  // evento popular pierde su historial de popularidad al deduplicar.
  const totalViews = group.reduce((sum, row) => sum + (row.view_count || 0), 0)
  if (totalViews !== (keeper.view_count || 0)) patch.view_count = totalViews

  const finalTitle = patch.title ?? keeper.title
  const finalStart = patch.start_date ?? keeper.start_date
  patch.dedup_key = buildDedupKey(finalTitle, finalStart) || null

  const ticketSourcesBefore = Array.isArray(keeper.ticket_sources) ? keeper.ticket_sources.length : 0
  const ticketSourcesAfter = Array.isArray(patch.ticket_sources)
    ? patch.ticket_sources.length
    : ticketSourcesBefore

  return {
    dedupKey,
    day: formatSaltaDayKey(keeper.start_date),
    keeper: toPlannedEvent(keeper),
    absorbed: absorbed.map(toPlannedEvent),
    conflicts,
    ticketSourcesBefore,
    ticketSourcesAfter,
    patch,
    auditEntries,
  }
}

/**
 * Repunta los favoritos de una fila absorbida hacia la que queda.
 * `user_favorites` tiene UNIQUE (user_id, event_id): si el usuario ya tenía
 * las dos en favoritos, la fila sobrante se va con el DELETE en cascada.
 */
async function repointFavorites(supabase: any, fromId: string, toId: string): Promise<number> {
  const { data: favorites, error } = await supabase
    .from('user_favorites')
    .select('id, user_id')
    .eq('event_id', fromId)

  if (error || !favorites || favorites.length === 0) return 0

  const { data: keeperFavorites } = await supabase
    .from('user_favorites')
    .select('user_id')
    .eq('event_id', toId)

  const alreadyFavorited = new Set((keeperFavorites || []).map((row: any) => row.user_id))
  const movable = favorites.filter((row: any) => !alreadyFavorited.has(row.user_id)).map((row: any) => row.id)
  if (movable.length === 0) return 0

  const { error: updateError } = await supabase
    .from('user_favorites')
    .update({ event_id: toId })
    .in('id', movable)

  return updateError ? 0 : movable.length
}

async function repointViews(supabase: any, fromId: string, toId: string): Promise<number> {
  const { data, error } = await supabase
    .from('event_views')
    .update({ event_id: toId })
    .eq('event_id', fromId)
    .select('id')

  if (error) return 0
  return data?.length ?? 0
}

/** Deja el flyer de Instagram apuntando al evento que sobrevive. */
async function repointInstagramFlyers(supabase: any, fromId: string, toId: string): Promise<void> {
  try {
    const { data } = await supabase
      .from('instagram_flyers')
      .select('id, ai_metadata')
      .eq('ai_metadata->>event_id', fromId)

    for (const flyer of data || []) {
      await supabase
        .from('instagram_flyers')
        .update({ ai_metadata: { ...(flyer.ai_metadata || {}), event_id: toId, merged_from_event_id: fromId } })
        .eq('id', flyer.id)
    }
  } catch {
    // Best effort: si la tabla o la columna no existen, la fusión sigue.
  }
}

export async function runDedupCleanup(options: DedupCleanupOptions = {}): Promise<DedupCleanupReport> {
  const supabase = options.supabase || getAdminClient()
  const dryRun = options.dryRun !== false
  const backfillKeys = options.backfillKeys ?? !dryRun

  const from = options.from ?? (options.includePast ? null : formatSaltaDayKey(new Date()))
  const to = options.to ?? null

  const report: DedupCleanupReport = {
    dryRun,
    scannedEvents: 0,
    duplicateGroups: 0,
    totalMerges: 0,
    eventsAfter: 0,
    groups: [],
    applied: {
      keepersUpdated: 0,
      eventsDeleted: 0,
      favoritesRepointed: 0,
      viewsRepointed: 0,
      keysBackfilled: 0,
    },
    errors: [],
    range: { from, to },
  }

  const rows = await fetchAllEvents(supabase, { ...options, from: from ?? undefined, to: to ?? undefined })
  report.scannedEvents = rows.length

  const groups = groupByDedupKey(rows)

  for (const [key, group] of groups) {
    if (group.length < 2) continue
    if (options.maxGroups && report.groups.length >= options.maxGroups) break
    report.groups.push(planGroup(key, group))
  }

  report.duplicateGroups = report.groups.length
  report.totalMerges = report.groups.reduce((sum, plan) => sum + plan.absorbed.length, 0)
  report.eventsAfter = report.scannedEvents - report.totalMerges

  if (dryRun && !backfillKeys) {
    return report
  }

  // ---- Aplicación ---------------------------------------------------------
  for (const plan of report.groups) {
    if (dryRun) break

    try {
      const existing = rows.find((row) => row.id === plan.keeper.id)
      let audit = (existing as any)?.merge_audit
      for (const entry of plan.auditEntries) {
        audit = appendAudit(audit, entry)
      }

      const { error: updateError } = await supabase
        .from('events')
        .update({ ...plan.patch, merge_audit: audit, updated_at: new Date().toISOString() })
        .eq('id', plan.keeper.id)

      if (updateError) {
        report.errors.push(`No se pudo actualizar el evento ${plan.keeper.id}: ${updateError.message}`)
        continue
      }
      report.applied.keepersUpdated++

      for (const absorbed of plan.absorbed) {
        report.applied.favoritesRepointed += await repointFavorites(supabase, absorbed.id, plan.keeper.id)
        report.applied.viewsRepointed += await repointViews(supabase, absorbed.id, plan.keeper.id)
        await repointInstagramFlyers(supabase, absorbed.id, plan.keeper.id)

        const { error: deleteError } = await supabase.from('events').delete().eq('id', absorbed.id)
        if (deleteError) {
          report.errors.push(`No se pudo borrar el duplicado ${absorbed.id}: ${deleteError.message}`)
          continue
        }
        report.applied.eventsDeleted++
      }
    } catch (error: any) {
      report.errors.push(`Grupo "${plan.dedupKey}": ${error?.message || error}`)
    }
  }

  // ---- Backfill de dedup_key en lo que no está duplicado -------------------
  if (backfillKeys) {
    const absorbedIds = new Set(report.groups.flatMap((plan) => plan.absorbed.map((event) => event.id)))
    const keeperIds = new Set(report.groups.map((plan) => plan.keeper.id))

    for (const row of rows) {
      if (absorbedIds.has(row.id) || keeperIds.has(row.id)) continue
      const key = dedupKeyOf(row)
      if (!key || row.dedup_key === key) continue

      if (dryRun) {
        report.applied.keysBackfilled++
        continue
      }

      const { error } = await supabase.from('events').update({ dedup_key: key }).eq('id', row.id)
      if (error) {
        report.errors.push(`No se pudo backfillear dedup_key en ${row.id}: ${error.message}`)
        continue
      }
      report.applied.keysBackfilled++
    }
  }

  return report
}

/**
 * Recorta un valor para el reporte. Marca el corte con "…" y aplana los saltos
 * de línea: dos descripciones que sólo difieren al final se veían idénticas
 * cuando el recorte era mudo.
 */
function preview(value: any, max = 110): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `"${text.slice(0, max)}…"` : `"${text}"`
}

/** Render de texto del reporte, para el CLI y para los logs del cron. */
export function formatReport(report: DedupCleanupReport): string {
  const lines: string[] = []
  const mode = report.dryRun ? 'DRY-RUN (no se escribió nada)' : 'APLICADO'

  lines.push('='.repeat(72))
  lines.push(`Deduplicación de eventos — ${mode}`)
  lines.push(`Rango: ${report.range.from ?? 'sin límite'} .. ${report.range.to ?? 'sin límite'}`)
  lines.push('='.repeat(72))
  lines.push(`Eventos escaneados:   ${report.scannedEvents}`)
  lines.push(`Grupos duplicados:    ${report.duplicateGroups}`)
  lines.push(`TOTAL DE FUSIONES:    ${report.totalMerges}`)
  lines.push(`Eventos al terminar:  ${report.eventsAfter}`)
  lines.push('')

  for (const plan of report.groups) {
    lines.push('-'.repeat(72))
    lines.push(`[${plan.day}] ${plan.dedupKey}`)
    lines.push(`  QUEDA    ${plan.keeper.id}  ${describeSource(plan.keeper.source)}`)
    lines.push(`           "${plan.keeper.title}"  status=${plan.keeper.status}`)

    for (const absorbed of plan.absorbed) {
      lines.push(`  ABSORBE  ${absorbed.id}  ${describeSource(absorbed.source)}`)
      lines.push(`           "${absorbed.title}"  status=${absorbed.status}`)
    }

    lines.push(`  links de compra: ${plan.ticketSourcesBefore} -> ${plan.ticketSourcesAfter}`)

    if (plan.conflicts.length > 0) {
      lines.push('  conflictos:')
      for (const conflict of plan.conflicts) {
        lines.push(
          `    ${conflict.field}: gana ${preview(conflict.kept)} (${conflict.kept_source}) ` +
          `/ descarta ${preview(conflict.discarded)} (${conflict.discarded_source}) [${conflict.rule}]`
        )
      }
    } else {
      lines.push('  conflictos: ninguno (sólo se completan huecos y se unen links)')
    }
  }

  if (report.errors.length > 0) {
    lines.push('')
    lines.push('ERRORES:')
    for (const error of report.errors) lines.push(`  - ${error}`)
  }

  lines.push('')
  if (report.dryRun) {
    lines.push(`Para aplicar estas ${report.totalMerges} fusiones: npm run dedup:events -- --apply`)
  } else {
    lines.push(
      `Aplicado: ${report.applied.keepersUpdated} actualizados, ${report.applied.eventsDeleted} borrados, ` +
      `${report.applied.favoritesRepointed} favoritos y ${report.applied.viewsRepointed} vistas repunteados, ` +
      `${report.applied.keysBackfilled} claves backfilleadas.`
    )
  }

  return lines.join('\n')
}
