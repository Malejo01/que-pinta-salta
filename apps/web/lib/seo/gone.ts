/**
 * 308 / 410 para fichas que ya no existen (Search Console, 13/10).
 *
 * Una página del App Router solo puede devolver 404 (notFound) o redirigir:
 * no puede responder 410. Por eso la decisión se toma en middleware.ts, con
 * una consulta mínima y el cliente de service role (la RLS de anon no deja
 * ver flyers archivados ni eventos sin publicar). Lo único que sale de acá es
 * un código de estado y, en el 308, el id de un evento PUBLICADO (público).
 *
 *   /flyer/<uuid>   ACTIVE                      → sigue (la página lo muestra)
 *                   archivado y con evento      → 308 /evento/<id> (siguiendo fusiones,
 *                                                 solo si el destino está publicado)
 *                   archivado sin evento        → 410
 *                   inexistente                 → sigue (404 de la página)
 *   /evento/<uuid>  inexistente (borrado)       → 410
 *                   CANCELLED, sin sesión       → 410 (con sesión sigue: el admin lo ve)
 *                   fusionado, publicado, DRAFT → sigue (la página hace su 308 o su 404)
 *   /en/evento/<uuid>                           → lo mismo que /evento/<uuid> (Q3); si
 *                                                 alguna vez hay un 308, conserva el /en.
 *                                                 /flyer existe solo en castellano.
 *
 * Cualquier error de la consulta → sigue: falla hacia el comportamiento de antes.
 */
import { findMergeRedirect, mergedIntoId } from '@/lib/events/merged'
import { rutaEn, separarIdioma } from '@/lib/i18n/rutas'

/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- cliente de supabase-js o un doble de test */
type SupabaseLike = any

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** `idioma` solo en la ficha en inglés (`/en/evento/<uuid>`); en castellano no va. */
export type GoneTarget = { kind: 'flyer' | 'evento'; id: string; idioma?: 'en' }
export type GoneDecision = { kind: 'pass' } | { kind: 'redirect'; location: string } | { kind: 'gone' }

const PASS: GoneDecision = { kind: 'pass' }

/**
 * `/flyer/<uuid>`, `/evento/<uuid>` o `/en/evento/<uuid>` exactos (sin
 * subrutas). Cualquier otra cosa (también `/en/flyer/...`, que no existe): null.
 */
export function parseGonePath(pathname: string): GoneTarget | null {
  const { idioma, ruta } = separarIdioma(pathname)
  const m = /^\/(flyer|evento)\/([^/]+)\/?$/.exec(ruta)
  if (!m || !UUID_RE.test(m[2])) return null
  const kind = m[1] as 'flyer' | 'evento'
  if (idioma === 'en' && kind !== 'evento') return null
  const target: GoneTarget = { kind, id: m[2].toLowerCase() }
  if (idioma === 'en') target.idioma = 'en'
  return target
}

/** Id del evento publicado al que lleva `eventId` (él mismo o el final de su cadena de fusiones). */
export async function publishedEventFor(client: SupabaseLike, eventId: string): Promise<string | null> {
  if (!UUID_RE.test(eventId)) return null
  const { data, error } = await client.from('events').select('id, status, ai_metadata').eq('id', eventId).maybeSingle()
  if (error || !data) return null
  if (mergedIntoId(data)) return findMergeRedirect(client, eventId)
  return data.status === 'PUBLISHED' ? (data.id as string) : null
}

export async function decideFlyer(client: SupabaseLike, id: string): Promise<GoneDecision> {
  const { data, error } = await client
    .from('instagram_flyers')
    .select('id, status, event_id:ai_metadata->>event_id')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return PASS
  if (data.status === 'ACTIVE') return PASS

  const eventId = typeof data.event_id === 'string' ? data.event_id : null
  const target = eventId ? await publishedEventFor(client, eventId) : null
  return target ? { kind: 'redirect', location: `/evento/${target}` } : { kind: 'gone' }
}

export async function decideEvento(client: SupabaseLike, id: string, hasSession: boolean): Promise<GoneDecision> {
  const { data, error } = await client
    .from('events')
    .select('id, status, ai_metadata')
    .eq('id', id)
    .maybeSingle()
  if (error) return PASS
  if (!data) return { kind: 'gone' }
  if (mergedIntoId(data)) return PASS
  if (data.status === 'CANCELLED' && !hasSession) return { kind: 'gone' }
  return PASS
}

export async function decideGone(client: SupabaseLike, target: GoneTarget, hasSession: boolean): Promise<GoneDecision> {
  let decision: GoneDecision
  try {
    decision =
      target.kind === 'flyer' ? await decideFlyer(client, target.id) : await decideEvento(client, target.id, hasSession)
  } catch {
    return PASS
  }
  // Desde la ficha en inglés, un 308 lleva a la ficha en inglés.
  if (decision.kind === 'redirect' && target.idioma) {
    return { kind: 'redirect', location: rutaEn(target.idioma, decision.location) }
  }
  return decision
}

/**
 * Cuerpo del 410: sin datos del evento ni del flyer, y fuera del índice.
 * HTML fijo del middleware (sin React ni Tailwind): CSS en línea con los colores de app/globals.css.
 *   --background          oklch(0.98 0 0)       -> #f8f8f8   (.dark: oklch(0.1 0 0)      -> #030303)
 *   --foreground          oklch(0.145 0 0)      -> #0a0a0a   (.dark: oklch(0.95 0 0)     -> #eeeeee)
 *   --primary             oklch(0.45 0.18 25)   -> #a20519   (.dark: oklch(0.59 0.2 25)  -> #db373a, 73-a: 4,5:1 contra el fondo)
 *   --primary-foreground  oklch(1 0 0)          -> #ffffff   (.dark: igual)
 *   --muted-foreground    oklch(0.45 0 0)       -> #555555   (.dark: oklch(0.6 0 0)      -> #808080)
 */
export const GONE_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ya no está disponible | Qué Pinta Salta</title><style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.5;text-align:center;background:#f8f8f8;color:#0a0a0a}.marca{color:#a20519;font-weight:600;margin:0}p{color:#555555}.acciones{display:flex;gap:.75rem;justify-content:center;flex-wrap:wrap;margin-top:2rem}a{padding:.5rem 1rem;border-radius:.375rem;font-size:.875rem;font-weight:500;text-decoration:none;border:1px solid #a20519;color:#a20519}a.principal{background:#a20519;color:#ffffff}@media (prefers-color-scheme: dark){body{background:#030303;color:#eeeeee}.marca{color:#db373a}p{color:#808080}a{border-color:#db373a;color:#db373a}a.principal{background:#db373a;color:#ffffff}}</style></head><body><p class="marca">Qué Pinta Salta</p><h1>Esto ya no está disponible</h1><p>El evento o el flyer que buscabas se dio de baja.</p><div class="acciones"><a class="principal" href="/">Ver qué pinta hoy</a><a href="/buscar">Buscar</a></div></body></html>`
