import { createClient } from '@supabase/supabase-js'
import { buildDedupKey, dedupKeyOf, sameTicketEvent, ticketUrlsOf, hasRealTime, isAutoDescription } from './dedup-key'
import { mergeEvents, appendAudit, type DiscardedValue, type MergeAuditEntry } from './merge-events'
import { getSourcePriority, describeSource, resolveEventSource } from './source-priority'
import { formatSaltaDayKey } from '../date-format'
import { mergedIntoId } from '../events/merged'

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
 *   2. Repunta favoritos (y el flyer de Instagram) de las filas absorbidas.
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
  /**
   * Restringe el plan (y la aplicación) a los grupos que contengan alguno de
   * estos ids de evento (completos o prefijo de al menos 8 caracteres). Sirve
   * para aplicar sólo los grupos aprobados uno por uno. Con este filtro no se
   * hace backfill de claves.
   */
  onlyEventIds?: string[]
  // Queda en `any` a propósito: los tests (dedup-cleanup-merged.test.ts,
  // dedup-cleanup-plan.test.ts) pasan un cliente fake mínimo (`{ from }`) que no
  // satisface `SupabaseClient`. Mismo contrato que lib/events/merged.ts.
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
  ticket_url: string | null
  view_count: number
  priority: number
}

export interface DuplicateGroupPlan {
  dedupKey: string
  day: string
  /** true si el grupo existe (o es más grande) por compartir link de compra. */
  byTicketUrl: boolean
  keeper: PlannedEvent
  absorbed: PlannedEvent[]
  conflicts: DiscardedValue[]
  ticketSourcesBefore: number
  ticketSourcesAfter: number
  patch: Record<string, unknown>
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
  /**
   * Misma clave (título + día) pero venues distintos: NO se fusionan. Se
   * reportan para que una persona vea si son el mismo evento mal resuelto o
   * dos eventos con el mismo título genérico.
   */
  venueConflicts: Array<{ dedupKey: string; events: PlannedEvent[] }>
  applied: {
    keepersUpdated: number
    eventsDeleted: number
    favoritesRepointed: number
    keysBackfilled: number
  }
  errors: string[]
  range: { from: string | null; to: string | null }
}

/** Columnas que necesita el merge. `*` para no tener que sincronizar la lista. */
const PAGE_SIZE = 500

// Las filas de `events` se tipan `Record<string, unknown>` en todo este
// archivo (acá y en toPlannedEvent, descriptionScore, pickKeeper,
// splitByVenue, groupByDedupKey, buildDuplicateGroups, groupMatchesIds y
// planGroup): en producción son filas reales de Supabase (columnas dinámicas,
// `select('*')`), y es el mismo tipo que usan los fixtures de los tests de
// caracterización (dedup-cleanup-plan.test.ts, dedup-cleanup-merged.test.ts),
// que se les pasan directo, sin cast. Tipar con `Tables<'events'>` de
// @qps/db rompería esos tests (no están entre los archivos permitidos) o
// forzaría un `as` por cada acceso a campo dentro de estas funciones puras.
// Cada acceso a un campo sale `unknown` y se estrecha con una guarda
// (`typeof`, `Array.isArray`) o, cuando no hay guarda hoy, con un `as` que no
// cambia nada en tiempo de ejecución (sólo el chequeo de tipos).
//
// El cliente de Supabase sigue en `any` (acá y en repointFavorites,
// repointInstagramFlyers): mismo motivo que `DedupCleanupOptions.supabase`
// más arriba, los tests le pasan un cliente fake (`{ from }`) que no
// satisface `SupabaseClient`.
async function fetchAllEvents(supabase: any, options: DedupCleanupOptions): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
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

    // Un fusionado a mano (DRAFT con merged_into_event_id) nunca es keeper ni
    // absorbido. La paginación usa data.length, no lo que queda tras filtrar.
    rows.push(...data.filter((row: { ai_metadata?: unknown }) => mergedIntoId(row) === null))
    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return rows
}

function toPlannedEvent(row: Record<string, unknown>): PlannedEvent {
  return {
    id: row.id as string,
    title: row.title as string,
    slug: (row.slug ?? null) as string | null,
    source: resolveEventSource(row),
    status: row.status as string,
    venue_id: (row.venue_id ?? null) as string | null,
    start_date: row.start_date as string,
    ticket_sources: Array.isArray(row.ticket_sources) ? row.ticket_sources.length : 0,
    ticket_url: (row.ticket_url ?? null) as string | null,
    view_count: typeof row.view_count === 'number' ? row.view_count : 0,
    priority: getSourcePriority(resolveEventSource(row)),
  }
}

/** Largo de la descripción real; la autogenerada por el scraper vale 0. */
function descriptionScore(row: Record<string, unknown>): number {
  const text = typeof row.description === 'string' ? row.description.trim() : ''
  return isAutoDescription(text) ? 0 : text.length
}

/**
 * Quién sobrevive, en este orden:
 *   1. la fila con hora real sobre la que tiene 00:00 (sin hora);
 *   2. la fuente de mayor prioridad (ticketera > portal > manual > Instagram),
 *      que además define el venue;
 *   3. la descripción más completa (la autogenerada "Evento importado
 *      automáticamente desde..." cuenta como vacía);
 *   4. el registro más viejo — es el que probablemente ya tenga la URL indexada
 *      y favoritos encima, y hace determinista al job.
 * Los ticket_sources de todas las filas se unen en la que queda (mergeEvents).
 */
export function pickKeeper(group: Record<string, unknown>[]): Record<string, unknown>[] {
  const sorted = [...group].sort((a, b) => {
    const byTime =
      Number(hasRealTime(b.start_date as string | Date | null | undefined)) -
      Number(hasRealTime(a.start_date as string | Date | null | undefined))
    if (byTime !== 0) return byTime
    const byPriority = getSourcePriority(resolveEventSource(b)) - getSourcePriority(resolveEventSource(a))
    if (byPriority !== 0) return byPriority
    const byDescription = descriptionScore(b) - descriptionScore(a)
    if (byDescription !== 0) return byDescription
    return (
      new Date((a.created_at as string | number | Date | null | undefined) || 0).getTime() -
      new Date((b.created_at as string | number | Date | null | undefined) || 0).getTime()
    )
  })
  return sorted
}

/**
 * Separa un grupo de misma clave por venue. Si hay a lo sumo un venue distinto
 * (los demás sin venue), es un solo grupo. Si hay varios, cada venue es su
 * propio grupo y las filas sin venue quedan afuera: no hay forma de saber a
 * cuál pertenecen.
 */
export function splitByVenue(
  group: Record<string, unknown>[]
): { groups: Record<string, unknown>[][]; excluded: Record<string, unknown>[] } {
  const venues = [...new Set(group.map((row) => row.venue_id).filter(Boolean))]
  if (venues.length <= 1) return { groups: [group], excluded: [] }
  return {
    groups: venues.map((venueId) => group.filter((row) => row.venue_id === venueId)),
    excluded: group.filter((row) => !row.venue_id),
  }
}

/** Agrupa las filas por clave de dedup recalculada en memoria. */
export function groupByDedupKey(rows: Record<string, unknown>[]): Map<string, Record<string, unknown>[]> {
  const groups = new Map<string, Record<string, unknown>[]>()

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

/**
 * Arma los grupos de duplicados. Dos filas son el mismo evento si:
 *
 *   a) tienen la misma clave (título + día) y venues compatibles
 *      (ver splitByVenue), o
 *   b) comparten un link de compra, el mismo día y a la misma hora
 *      (ver sameTicketEvent), aunque los venues o los títulos difieran.
 *
 * Las relaciones se cierran transitivamente (union-find): si A y B comparten
 * link y B y C comparten clave, los tres son un grupo.
 *
 * venueConflicts son los buckets de misma clave que, aun después de aplicar la
 * regla del link, quedan partidos en más de un grupo.
 */
export function buildDuplicateGroups(rows: Record<string, unknown>[]): {
  groups: Array<{ rows: Record<string, unknown>[]; byTicketUrl: boolean }>
  venueConflicts: Array<{ dedupKey: string; rows: Record<string, unknown>[] }>
} {
  const index = new Map<unknown, number>(rows.map((row, i) => [row, i]))
  const parent = rows.map((_, i) => i)
  // Segundo union-find sólo con la regla de clave: si un grupo final abarca
  // más de una raíz de éste, existe gracias al link de compra.
  const keyParent = rows.map((_, i) => i)
  const find = (p: number[], i: number): number => (p[i] === i ? i : (p[i] = find(p, p[i])))
  const union = (p: number[], a: number, b: number) => {
    const ra = find(p, a)
    const rb = find(p, b)
    if (ra !== rb) p[rb] = ra
  }

  const buckets = groupByDedupKey(rows)
  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue
    for (const group of splitByVenue(bucket).groups) {
      for (const row of group.slice(1)) {
        union(parent, index.get(group[0])!, index.get(row)!)
        union(keyParent, index.get(group[0])!, index.get(row)!)
      }
    }
  }

  // Candidatos por (día, link): sólo se comparan filas que ya comparten algo.
  const byDayUrl = new Map<string, number[]>()
  rows.forEach((row, i) => {
    if (!row.start_date) return
    const day = formatSaltaDayKey(row.start_date as string | Date)
    for (const url of ticketUrlsOf(row)) {
      const key = `${day}|${url}`
      const list = byDayUrl.get(key)
      if (list) list.push(i)
      else byDayUrl.set(key, [i])
    }
  })
  for (const list of byDayUrl.values()) {
    for (let x = 0; x < list.length; x++) {
      for (let y = x + 1; y < list.length; y++) {
        if (sameTicketEvent(rows[list[x]], rows[list[y]])) union(parent, list[x], list[y])
      }
    }
  }

  const components = new Map<number, number[]>()
  rows.forEach((_, i) => {
    const root = find(parent, i)
    const list = components.get(root)
    if (list) list.push(i)
    else components.set(root, [i])
  })

  const groups: Array<{ rows: Record<string, unknown>[]; byTicketUrl: boolean }> = []
  for (const members of components.values()) {
    if (members.length < 2) continue
    const keyRoots = new Set(members.map((i) => find(keyParent, i)))
    groups.push({ rows: members.map((i) => rows[i]), byTicketUrl: keyRoots.size > 1 })
  }

  const venueConflicts: Array<{ dedupKey: string; rows: Record<string, unknown>[] }> = []
  for (const [dedupKey, bucket] of buckets) {
    if (bucket.length < 2) continue
    const roots = new Set(bucket.map((row) => find(parent, index.get(row)!)))
    if (roots.size > 1) venueConflicts.push({ dedupKey, rows: bucket })
  }

  return { groups, venueConflicts }
}

/** Un grupo contiene alguno de los ids pedidos (completo o prefijo >= 8). */
function groupMatchesIds(group: Record<string, unknown>[], ids: string[]): boolean {
  return group.some((row) => ids.some((id) => id.length >= 8 && String(row.id).startsWith(id)))
}

/** Arma el plan de fusión de un grupo, sin tocar la base. */
export function planGroup(
  dedupKey: string,
  group: Record<string, unknown>[],
  byTicketUrl = false
): DuplicateGroupPlan {
  const [keeper, ...absorbed] = pickKeeper(group)

  // Copia de trabajo: cada fusión ve el resultado de la anterior, igual que
  // pasaría si los eventos hubieran entrado de a uno por la ingesta.
  const working: Record<string, unknown> = { ...keeper }
  const conflicts: DiscardedValue[] = []
  const auditEntries: MergeAuditEntry[] = []
  const patch: Record<string, unknown> = {}

  for (const row of absorbed) {
    const merge = mergeEvents(working, row, {
      incomingSource: resolveEventSource(row),
      dedupKey,
      context: 'cleanup',
      absorbedEventId: row.id as string,
      absorbedSnapshot: row,
    })

    Object.assign(patch, merge.patch)
    Object.assign(working, merge.patch)
    conflicts.push(...merge.conflicts)
    auditEntries.push(merge.audit)
  }

  // Las vistas de las filas absorbidas se suman a la que queda; si no, un
  // evento popular pierde su historial de popularidad al deduplicar.
  const totalViews = group.reduce((sum, row) => sum + ((row.view_count as number) || 0), 0)
  if (totalViews !== (keeper.view_count || 0)) patch.view_count = totalViews

  const finalTitle = (patch.title ?? keeper.title) as string | null | undefined
  const finalStart = (patch.start_date ?? keeper.start_date) as string | Date | null | undefined
  patch.dedup_key = buildDedupKey(finalTitle, finalStart) || null

  const ticketSourcesBefore = Array.isArray(keeper.ticket_sources) ? keeper.ticket_sources.length : 0
  const ticketSourcesAfter = Array.isArray(patch.ticket_sources)
    ? patch.ticket_sources.length
    : ticketSourcesBefore

  return {
    dedupKey,
    day: formatSaltaDayKey(keeper.start_date as string | Date),
    byTicketUrl,
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
  // `supabase` es `any` (ver DedupCleanupOptions.supabase); se anota la forma de lo
  // seleccionado para no perder el tipado de las filas en el resto de la función.
  const { data: favorites, error }: { data: Array<{ id: string; user_id: string }> | null; error: unknown } =
    await supabase
      .from('user_favorites')
      .select('id, user_id')
      .eq('event_id', fromId)

  if (error || !favorites || favorites.length === 0) return 0

  const { data: keeperFavorites }: { data: Array<{ user_id: string }> | null } = await supabase
    .from('user_favorites')
    .select('user_id')
    .eq('event_id', toId)

  const alreadyFavorited = new Set((keeperFavorites || []).map((row) => row.user_id))
  const movable = favorites.filter((row) => !alreadyFavorited.has(row.user_id)).map((row) => row.id)
  if (movable.length === 0) return 0

  const { error: updateError } = await supabase
    .from('user_favorites')
    .update({ event_id: toId })
    .in('id', movable)

  return updateError ? 0 : movable.length
}

/**
 * Deja el flyer de Instagram apuntando al evento que sobrevive.
 * `supabase: any` por el mismo motivo que DedupCleanupOptions.supabase.
 */
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
  const onlyIds = (options.onlyEventIds ?? []).map((id) => id.trim()).filter(Boolean)
  const backfillKeys = onlyIds.length > 0 ? false : (options.backfillKeys ?? !dryRun)

  const from = options.from ?? (options.includePast ? null : formatSaltaDayKey(new Date()))
  const to = options.to ?? null

  const report: DedupCleanupReport = {
    dryRun,
    scannedEvents: 0,
    duplicateGroups: 0,
    totalMerges: 0,
    eventsAfter: 0,
    groups: [],
    venueConflicts: [],
    applied: {
      keepersUpdated: 0,
      eventsDeleted: 0,
      favoritesRepointed: 0,
      keysBackfilled: 0,
    },
    errors: [],
    range: { from, to },
  }

  const rows = await fetchAllEvents(supabase, { ...options, from: from ?? undefined, to: to ?? undefined })
  report.scannedEvents = rows.length

  const built = buildDuplicateGroups(rows)

  for (const conflict of built.venueConflicts) {
    if (onlyIds.length > 0 && !groupMatchesIds(conflict.rows, onlyIds)) continue
    report.venueConflicts.push({ dedupKey: conflict.dedupKey, events: conflict.rows.map(toPlannedEvent) })
  }

  for (const group of built.groups) {
    if (onlyIds.length > 0 && !groupMatchesIds(group.rows, onlyIds)) continue
    if (options.maxGroups && report.groups.length >= options.maxGroups) break
    const keeper = pickKeeper(group.rows)[0]
    report.groups.push(planGroup(dedupKeyOf(keeper), group.rows, group.byTicketUrl))
  }
  report.groups.sort((a, b) => a.day.localeCompare(b.day) || a.dedupKey.localeCompare(b.dedupKey))

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
      // `existing` es `Record<string, unknown> | undefined` (viene de `rows`, ver
      // fetchAllEvents): `.merge_audit` sale `unknown` y se pasa tal cual a
      // `appendAudit` (que lo recibe como `any`, igual que antes).
      let audit = existing?.merge_audit
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
        await repointInstagramFlyers(supabase, absorbed.id, plan.keeper.id)

        const { error: deleteError } = await supabase.from('events').delete().eq('id', absorbed.id)
        if (deleteError) {
          report.errors.push(`No se pudo borrar el duplicado ${absorbed.id}: ${deleteError.message}`)
          continue
        }
        report.applied.eventsDeleted++
      }
    } catch (error) {
      // Replica `error?.message || error` sin `any`: si es un objeto con
      // `.message`, se usa eso; si no (o viene vacío), se interpola el error tal cual.
      const message = error !== null && typeof error === 'object' && 'message' in error
        ? (error as { message?: unknown }).message
        : undefined
      report.errors.push(`Grupo "${plan.dedupKey}": ${message || error}`)
    }
  }

  // ---- Backfill de dedup_key en lo que no está duplicado -------------------
  if (backfillKeys) {
    const absorbedIds = new Set(report.groups.flatMap((plan) => plan.absorbed.map((event) => event.id)))
    const keeperIds = new Set(report.groups.map((plan) => plan.keeper.id))

    for (const row of rows) {
      if (absorbedIds.has(row.id as string) || keeperIds.has(row.id as string)) continue
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
function preview(value: unknown, max = 110): string {
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
    lines.push(`[${plan.day}] ${plan.dedupKey}${plan.byTicketUrl ? '   << POR LINK DE COMPRA' : ''}`)
    lines.push(`  QUEDA    ${plan.keeper.id}  ${describeSource(plan.keeper.source)}`)
    lines.push(`           "${plan.keeper.title}"  status=${plan.keeper.status}  inicio=${plan.keeper.start_date}  venue=${plan.keeper.venue_id ?? '-'}`)
    if (plan.byTicketUrl) lines.push(`           link=${plan.keeper.ticket_url ?? '-'}`)

    for (const absorbed of plan.absorbed) {
      lines.push(`  ABSORBE  ${absorbed.id}  ${describeSource(absorbed.source)}`)
      lines.push(`           "${absorbed.title}"  status=${absorbed.status}  inicio=${absorbed.start_date}  venue=${absorbed.venue_id ?? '-'}`)
      if (plan.byTicketUrl) lines.push(`           link=${absorbed.ticket_url ?? '-'}`)
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

  if (report.venueConflicts.length > 0) {
    lines.push('')
    lines.push('='.repeat(72))
    lines.push(`NO SE FUSIONAN (misma clave, venues distintos, sin link en común): ${report.venueConflicts.length} grupos`)
    for (const conflict of report.venueConflicts) {
      lines.push('-'.repeat(72))
      lines.push(conflict.dedupKey)
      for (const ev of conflict.events) {
        lines.push(`  ${ev.id}  ${describeSource(ev.source)}  inicio=${ev.start_date}  venue=${ev.venue_id ?? '-'}  "${ev.title}"`)
      }
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
      `${report.applied.favoritesRepointed} favoritos repunteados, ` +
      `${report.applied.keysBackfilled} claves backfilleadas.`
    )
  }

  return lines.join('\n')
}
