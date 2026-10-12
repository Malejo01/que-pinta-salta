/**
 * Eventos fusionados a mano: el absorbido queda en DRAFT con
 * `ai_metadata.merged_into_event_id = <id del que queda>`. Estas funciones
 * siguen esa cadena (con tope y protección contra ciclos) para que ni la
 * ingesta ni las rutas públicas traten al absorbido como un evento vivo.
 */

export const MAX_MERGE_HOPS = 5

/* eslint-disable @typescript-eslint/no-explicit-any -- el cliente y las filas de events son dinamicos (contrato con los tests) */
type SupabaseLike = any
type EventRow = any
/* eslint-enable @typescript-eslint/no-explicit-any */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Id del evento en el que se fusionó `row`, o null si no está fusionado. */
export function mergedIntoId(row: { ai_metadata?: unknown } | null | undefined): string | null {
  const meta = row?.ai_metadata
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null
  const value = (meta as Record<string, unknown>).merged_into_event_id
  return typeof value === 'string' && UUID_RE.test(value) ? value : null
}

/**
 * Sigue la cadena de fusiones hasta un evento no fusionado.
 * Ciclo, destino inexistente o tope de saltos -> `target: null`.
 */
export async function resolveMergeTarget(
  supabase: SupabaseLike,
  row: EventRow
): Promise<{ target: EventRow | null; hops: number }> {
  let current = row
  let hops = 0
  const seen = new Set<string>()
  if (row?.id) seen.add(row.id)

  for (;;) {
    const nextId = mergedIntoId(current)
    if (!nextId) return { target: current, hops }

    if (hops >= MAX_MERGE_HOPS || seen.has(nextId)) return { target: null, hops }
    seen.add(nextId)
    hops++

    const { data, error } = await supabase.from('events').select('*').eq('id', nextId).maybeSingle()
    if (error || !data) return { target: null, hops }
    current = data
  }
}

/**
 * Para las rutas públicas: dado el id de un evento fusionado, devuelve SOLO el
 * id del destino final si está PUBLISHED. Nunca devuelve otros campos. Pensado
 * para el cliente admin: no filtra nada del evento despublicado.
 */
export async function findMergeRedirect(supabase: SupabaseLike, id: string): Promise<string | null> {
  if (typeof id !== 'string' || !UUID_RE.test(id)) return null
  const { data: first, error } = await supabase
    .from('events')
    .select('ai_metadata')
    .eq('id', id)
    .maybeSingle()
  if (error || !first) return null

  let nextId = mergedIntoId(first)
  if (!nextId) return null

  const seen = new Set<string>([id])
  for (let hops = 0; hops < MAX_MERGE_HOPS; hops++) {
    if (seen.has(nextId)) return null
    seen.add(nextId)

    const { data, error: err } = await supabase
      .from('events')
      .select('id, status, ai_metadata')
      .eq('id', nextId)
      .maybeSingle()
    if (err || !data) return null

    const following = mergedIntoId(data)
    if (!following) return data.status === 'PUBLISHED' ? (data.id as string) : null
    nextId = following
  }
  return null
}
