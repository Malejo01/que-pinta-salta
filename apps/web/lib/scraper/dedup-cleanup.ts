import { createClient } from '@supabase/supabase-js'
import {
  buildDedupKey,
  dedupKeyOf,
  sameTicketEvent,
  ticketUrlsOf,
  hasRealTime,
  horasCompatibles,
  isAutoDescription,
} from './dedup-key'
import { mergeEvents, appendAudit, type DiscardedValue, type MergeAuditEntry } from './merge-events'
import { getSourcePriority, describeSource, resolveEventSource } from './source-priority'
import { formatSaltaDayKey, formatSaltaClock } from '../date-format'
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
 * Desde QPS-209, agrupar por clave (título + día) ya no alcanza: dentro de
 * cada grupo de venues compatibles también se exige hora compatible
 * (splitByFunction), para no volver a juntar en la limpieza dos funciones
 * reales del mismo show (16:00 y 21:00) que la ingesta separa desde la R40.
 * Lo que queda partido por hora se reporta en `functionSplits`, nunca se
 * fusiona a ciegas.
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
  /**
   * Por bucket (misma clave): `events` son las filas, CON hora real, de los
   * grupos de venue que se partieron en dos o más funciones por hora
   * (horas no compatibles entre sí, QPS-209) — nunca las de un venueGroup que
   * no se partió, aunque comparta dedupKey (ese venueGroup, si no coincide
   * con los demás, ya aparece en venueConflicts por su cuenta). NO se
   * fusionan: cada función sigue siendo su propia fila. `sinHoraExcluidos`
   * son las filas sin hora real que, dentro de esos mismos venueGroups
   * partidos, no se pudieron asignar a ninguna función (no hay forma de
   * saber a cuál pertenecen: del lado conservador, se reportan en vez de
   * adivinar).
   */
  functionSplits: Array<{ dedupKey: string; events: PlannedEvent[]; sinHoraExcluidos: PlannedEvent[] }>
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

/**
 * Dentro de un grupo de misma clave y venues compatibles (lo que sale de
 * splitByVenue), separa las funciones reales distintas del mismo show
 * (QPS-209). La clave de dedup es título + día, sin hora: sin esto, la
 * limpieza volvía a juntar la función de las 16:00 con la de las 21:00 que
 * la ingesta ya separa desde la R40.
 *
 * Las filas CON hora real (hasRealTime) se ordenan por start_date y se
 * parten en funciones por enlace completo: una fila entra en la función
 * actual si horasCompatibles() da true contra todas las filas que ya están
 * ahí. La tolerancia es la de la ingesta (TOLERANCIA_HORA_DEDUP_MIN, en
 * dedup-key.ts): se usa el default de horasCompatibles(), nunca un número
 * escrito a mano acá. Como las filas están ordenadas y horasCompatibles
 * compara instantes, ese chequeo "contra todas" es equivalente a comparar
 * sólo contra la PRIMERA fila de la función (es la que está más lejos en el
 * tiempo de una fila nueva que llega ordenada después): por eso alcanza con
 * compararla a ella. Así, una cadena 16:00 · 17:30 · 19:00 no colapsa en un
 * solo evento por transitividad (16:00-17:30 compatibles, 17:30-19:00
 * compatibles, pero 16:00-19:00 no).
 *
 * Las filas SIN hora real (00:00 de Salta, null o fecha inválida) son el
 * caso ambiguo:
 *   - si terminó habiendo una sola función, entran en ella (como antes de
 *     esta regla);
 *   - si no hay ninguna función (todas las filas son sin hora), forman su
 *     propio grupo entre ellas (como antes);
 *   - si hay dos o más funciones, no entran en NINGUNA: no hay forma de
 *     saber a cuál pertenecen, y del lado conservador eso significa dejarlas
 *     afuera y reportarlas (`ambiguousNoTime`), no adivinar. Un falso
 *     negativo deja un duplicado visible que el admin fusiona a mano; un
 *     falso positivo borraría una función real.
 *
 * Casos de borde: un grupo de 0 o 1 fila devuelve `{ groups: [group],
 * ambiguousNoTime: [] }` (mismo criterio borde que splitByVenue). No muta el
 * argumento.
 */
export function splitByFunction(
  group: Record<string, unknown>[]
): { groups: Record<string, unknown>[][]; ambiguousNoTime: Record<string, unknown>[] } {
  if (group.length < 2) return { groups: [group], ambiguousNoTime: [] }

  const withTime = group.filter((row) => hasRealTime(row.start_date as string | Date | null | undefined))
  const withoutTime = group.filter((row) => !hasRealTime(row.start_date as string | Date | null | undefined))

  const sorted = [...withTime].sort((a, b) => {
    const diff =
      new Date(a.start_date as string | Date).getTime() - new Date(b.start_date as string | Date).getTime()
    if (diff !== 0) return diff
    return String(a.id).localeCompare(String(b.id))
  })

  const functions: Record<string, unknown>[][] = []
  for (const row of sorted) {
    const current = functions[functions.length - 1]
    const firstOfCurrent = current?.[0]
    if (
      current &&
      horasCompatibles(
        firstOfCurrent!.start_date as string | Date,
        row.start_date as string | Date
      )
    ) {
      current.push(row)
    } else {
      functions.push([row])
    }
  }

  if (functions.length === 0) {
    return { groups: [[...withoutTime]], ambiguousNoTime: [] }
  }
  if (functions.length === 1) {
    return { groups: [[...functions[0], ...withoutTime]], ambiguousNoTime: [] }
  }
  return { groups: functions, ambiguousNoTime: withoutTime }
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
 *   a) tienen la misma clave (título + día), venues compatibles
 *      (ver splitByVenue) Y horas compatibles (ver splitByFunction, QPS-209:
 *      sin esto, dos funciones reales del mismo show, separadas por la
 *      ingesta desde la R40, volvían a juntarse acá por compartir clave), o
 *   b) comparten un link de compra, el mismo día y a la misma hora
 *      (ver sameTicketEvent), aunque los venues o los títulos difieran.
 *
 * Las relaciones se cierran transitivamente (union-find): si A y B comparten
 * link y B y C comparten clave, los tres son un grupo.
 *
 * venueConflicts son los buckets de misma clave que, aun después de aplicar
 * la regla del link, quedan partidos en más de un grupo de venue — y que,
 * efectivamente, el splitByVenue de ese bucket partió por venue (si el
 * bucket sólo se partió por hora, no entra acá: entra en functionSplits).
 *
 * functionSplits son los buckets que tienen AL MENOS UN grupo de venue
 * (splitByVenue) partido en dos o más funciones por hora (splitByFunction);
 * sin el link de compra de por medio (sameTicketEvent ya exige hora exacta o
 * ausente, así que el link nunca vuelve a juntar dos funciones distintas).
 * Las `rows` que se reportan son sólo las de ESE/ESOS grupo(s) de venue
 * partidos, no las del bucket entero: un venueGroup de una sola fila que no
 * se partió (su único motivo para no fusionar es el venue, no la hora) no
 * aparece ahí, aunque comparta dedupKey con el que sí se partió. Un bucket
 * puede aparecer en venueConflicts y en functionSplits a la vez: son dos
 * motivos distintos para no fusionar, con conjuntos de filas disjuntos.
 */
export function buildDuplicateGroups(rows: Record<string, unknown>[]): {
  groups: Array<{ rows: Record<string, unknown>[]; byTicketUrl: boolean }>
  venueConflicts: Array<{ dedupKey: string; rows: Record<string, unknown>[] }>
  functionSplits: Array<{
    dedupKey: string
    rows: Record<string, unknown>[]
    sinHoraExcluidas: Record<string, unknown>[]
  }>
} {
  const index = new Map<unknown, number>(rows.map((row, i) => [row, i]))
  const parent = rows.map((_, i) => i)
  // Segundo union-find sólo con la regla de clave (venue, no hora): si un
  // grupo final abarca más de una raíz de éste, existe gracias al link de
  // compra. No cambia con QPS-209: usa los mismos grupos que splitByVenue,
  // antes de partir por función.
  const keyParent = rows.map((_, i) => i)
  const find = (p: number[], i: number): number => (p[i] === i ? i : (p[i] = find(p, p[i])))
  const union = (p: number[], a: number, b: number) => {
    const ra = find(p, a)
    const rb = find(p, b)
    if (ra !== rb) p[rb] = ra
  }

  // Por bucket (dedupKey), si splitByVenue lo partió en más de un grupo de
  // venue (o dejó filas en `excluded`): es la condición extra que exige
  // venueConflicts más abajo, para no reportar ahí un bucket que sólo se
  // partió por hora.
  const partidoPorVenueByKey = new Map<string, boolean>()
  const functionSplits: Array<{
    dedupKey: string
    rows: Record<string, unknown>[]
    sinHoraExcluidas: Record<string, unknown>[]
  }> = []

  const buckets = groupByDedupKey(rows)
  for (const [dedupKey, bucket] of buckets) {
    if (bucket.length < 2) continue

    const venueSplit = splitByVenue(bucket)
    partidoPorVenueByKey.set(dedupKey, venueSplit.groups.length > 1 || venueSplit.excluded.length > 0)

    // Sólo las filas de los venueGroups que SÍ se partieron por hora: un
    // venueGroup con una sola fila sin venue en común no tiene nada que ver
    // con la partición por hora, aunque comparta dedupKey (ese motivo ya lo
    // cubre venueConflicts). `ambiguousNoTime` únicamente sale no vacío
    // cuando `groups.length > 1` (con una sola función las filas sin hora
    // entran en ella, ver splitByFunction), así que alcanza con mirar
    // `groups.length > 1` para decidir si el venueGroup partió por hora.
    const rowsPartidasPorHora: Record<string, unknown>[] = []
    const sinHoraExcluidas: Record<string, unknown>[] = []

    for (const venueGroup of venueSplit.groups) {
      // keyParent se une por venue nomás, sin mirar la hora: byTicketUrl
      // sigue significando exactamente lo mismo que antes de QPS-209.
      for (const row of venueGroup.slice(1)) {
        union(keyParent, index.get(venueGroup[0])!, index.get(row)!)
      }

      const functionSplit = splitByFunction(venueGroup)
      if (functionSplit.groups.length > 1) {
        rowsPartidasPorHora.push(...functionSplit.groups.flat())
        sinHoraExcluidas.push(...functionSplit.ambiguousNoTime)
      }

      // parent se une sólo dentro de cada función: las filas ambiguas sin
      // hora (ambiguousNoTime) no se unen con nada acá.
      for (const func of functionSplit.groups) {
        for (const row of func.slice(1)) {
          union(parent, index.get(func[0])!, index.get(row)!)
        }
      }
    }

    if (rowsPartidasPorHora.length > 0) {
      functionSplits.push({
        dedupKey,
        rows: rowsPartidasPorHora.sort(
          (a, b) =>
            new Date(a.start_date as string | Date).getTime() - new Date(b.start_date as string | Date).getTime()
        ),
        sinHoraExcluidas,
      })
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
    // La condición "más de una raíz" se conserva porque el link de compra
    // puede volver a unir dos venues (y en ese caso no se reporta: eso no
    // cambia). Lo que sí se agrega es `partidoPorVenueByKey`: sin esto, un
    // bucket partido SÓLO por hora (ningún conflicto de venue) caería acá,
    // que es exactamente lo que functionSplits ya cubre por su cuenta.
    if (!partidoPorVenueByKey.get(dedupKey)) continue
    const roots = new Set(bucket.map((row) => find(parent, index.get(row)!)))
    if (roots.size > 1) venueConflicts.push({ dedupKey, rows: bucket })
  }

  return { groups, venueConflicts, functionSplits }
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
    functionSplits: [],
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

  for (const split of built.functionSplits) {
    if (onlyIds.length > 0 && !groupMatchesIds([...split.rows, ...split.sinHoraExcluidas], onlyIds)) continue
    report.functionSplits.push({
      dedupKey: split.dedupKey,
      events: split.rows.map(toPlannedEvent),
      sinHoraExcluidos: split.sinHoraExcluidas.map(toPlannedEvent),
    })
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

  if (report.functionSplits.length > 0) {
    lines.push('')
    lines.push('='.repeat(72))
    lines.push(`DOS FUNCIONES EL MISMO DÍA (no se fusionan): ${report.functionSplits.length} buckets`)
    for (const split of report.functionSplits) {
      lines.push('-'.repeat(72))
      const day = split.events[0] ? formatSaltaDayKey(split.events[0].start_date) : '-'
      lines.push(`[${day}] ${split.dedupKey}`)
      for (const ev of split.events) {
        lines.push(
          `  ${ev.id}  ${describeSource(ev.source)}  inicio=${ev.start_date} (${formatSaltaClock(ev.start_date)} Salta)  ` +
          `venue=${ev.venue_id ?? '-'}  "${ev.title}"`
        )
      }
      if (split.sinHoraExcluidos.length > 0) {
        lines.push('  sin hora, no se pudieron asignar a ninguna función:')
        for (const ev of split.sinHoraExcluidos) {
          lines.push(`    ${ev.id}  ${describeSource(ev.source)}  inicio=${ev.start_date}  venue=${ev.venue_id ?? '-'}  "${ev.title}"`)
        }
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
