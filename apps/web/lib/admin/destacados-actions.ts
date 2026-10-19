'use server'

/**
 * Acciones del panel /admin/destacados (R50, QPS-239/-240, tarea 50-b):
 * destacar un evento, quitarle el destacado y listar los destacados
 * vigentes o recién vencidos. Las tres corren con el cliente del usuario
 * (`createClient()` de lib/supabase/server.ts), nunca con el de service
 * role: el trigger `enforce_event_user_rules()`
 * (supabase/migrations/20261018130100_etapa2_eventos_destacados.sql) deja
 * pasar featured_until/featured_set_by/featured_set_at sin tocar solo si
 * `is_admin()` evalúa true para el usuario real de la sesión (o si
 * current_user no es authenticated/anon) — con el cliente de servicio ese
 * control no se estaría probando de verdad. Mismo patrón de
 * requireAdminSupabase() que lib/admin/duplicate-actions.ts y
 * lib/admin/lugares-actions.ts (acá no se exporta: se copia, como en esos
 * dos archivos).
 *
 * Toda la validación de forma y reglas de negocio (uuid, "YYYY-MM-DD", no
 * pasado, no más de MAXIMO_DIAS_DESTACADO días) vive en
 * packages/core/src/events/destacados.ts (validarDestacado): este archivo
 * no la repite, solo la traduce a un mensaje en castellano.
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/metricas'
import { MAXIMO_DIAS_DESTACADO, validarDestacado, type ErrorValidarDestacado } from '@qps/core/events/destacados'

type SupabaseUserClient = Awaited<ReturnType<typeof createClient>>

type AuthOk = { ok: true; supabase: SupabaseUserClient; userId: string }
type AuthError = { ok: false; error: 'AUTH_REQUIRED' | 'FORBIDDEN'; mensaje: string }

/**
 * Sesión + rol ADMIN, con el cliente del usuario (para que RLS e
 * is_admin() evalúen a la persona real, no a un cliente de service role).
 */
async function requireAdminSupabase(): Promise<AuthOk | AuthError> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'AUTH_REQUIRED', mensaje: 'Necesitás iniciar sesión para hacer esto.' }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()

  if (profile?.role !== 'ADMIN') {
    return { ok: false, error: 'FORBIDDEN', mensaje: 'No tenés permisos de administrador para hacer esto.' }
  }

  return { ok: true, supabase, userId: user.id }
}

/**
 * Mensaje en castellano por cada error que puede devolver validarDestacado():
 * el código de core (ErrorValidarDestacado) no sale de este archivo, siempre
 * se traduce antes de llegar al resultado de la acción (es lo que ve la
 * pantalla de admin).
 */
function mensajePorErrorDeValidacion(error: ErrorValidarDestacado): string {
  switch (error) {
    case 'INVALID_ID':
      return 'El evento no es válido.'
    case 'FECHA_INVALIDA':
      return 'La fecha no es válida.'
    case 'FECHA_PASADA':
      return 'La fecha tiene que ser posterior a hoy.'
    case 'FECHA_LEJANA':
      return `La fecha no puede estar a más de ${MAXIMO_DIAS_DESTACADO} días de hoy.`
  }
}

export type ErrorDestacarEvento = 'INVALID' | 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_FOUND' | 'DB_ERROR'

export type ResultadoDestacarEvento =
  | { ok: true; featuredUntil: string }
  | { ok: false; error: ErrorDestacarEvento; mensaje: string }

/**
 * Destaca un evento hasta `entrada.hasta` (día "YYYY-MM-DD", en hora de
 * Salta: lo convierte a fin de día `validarDestacado`/`finDeDiaSalta` de
 * core). Orden fijo, es parte del contrato:
 *   1. validarDestacado(entrada, new Date()) ANTES de crear el cliente: una
 *      entrada con forma inválida no abre ninguna conexión a la base.
 *   2. Sesión (auth.getUser()).
 *   3. Rol ADMIN en profiles, con el cliente de la sesión.
 *   4. El update, con featured_set_by SIEMPRE desde getUser() (ver el
 *      comentario de más abajo).
 *   5. Revalida '/', la ficha del evento y '/admin/destacados'.
 */
export async function destacarEvento(entrada: unknown): Promise<ResultadoDestacarEvento> {
  const validado = validarDestacado(entrada, new Date())
  if (!validado.ok) {
    return { ok: false, error: 'INVALID', mensaje: mensajePorErrorDeValidacion(validado.error) }
  }

  const auth = await requireAdminSupabase()
  if (!auth.ok) return { ok: false, error: auth.error, mensaje: auth.mensaje }

  const { eventId, featuredUntil } = validado

  const { data, error } = await auth.supabase
    .from('events')
    .update({
      featured_until: featuredUntil,
      // featured_set_by sale SIEMPRE de auth.getUser() (auth.userId, ya
      // resuelto arriba por requireAdminSupabase()), nunca de `entrada`:
      // aunque alguien mande un featured_set_by falso en el body,
      // validarDestacado() de core solo devuelve `eventId` y
      // `featuredUntil` — no hay ningún camino para que ese valor de
      // `entrada` llegue hasta este update.
      featured_set_by: auth.userId,
      featured_set_at: new Date().toISOString(),
      // is_featured es legado (ver el comentario (a) de
      // packages/core/src/events/destacados.ts): la interfaz de hoy en más
      // ya no lo mira para decidir si algo está destacado, pero lo siguen
      // usando merge_events(), unmerge_event(), el índice
      // idx_events_featured y record_event_metric. Se escribe en paralelo
      // con featured_until para no romper a ninguno de esos cuatro.
      is_featured: true,
    })
    .eq('id', eventId)
    .select('id')

  if (error) {
    // Nunca el id ni el email de nadie en el log: solo la acción y el
    // código de error de Postgres.
    console.error('destacarEvento: error de la base', error.code)
    return { ok: false, error: 'DB_ERROR', mensaje: 'No se pudo destacar el evento. Intentá de nuevo.' }
  }

  if (!data || data.length === 0) {
    return { ok: false, error: 'NOT_FOUND', mensaje: 'No se encontró el evento.' }
  }

  revalidatePath('/')
  revalidatePath(`/evento/${eventId}`)
  revalidatePath('/admin/destacados')

  return { ok: true, featuredUntil }
}

export type ErrorQuitarDestacado = 'INVALID' | 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_FOUND' | 'DB_ERROR'

export type ResultadoQuitarDestacado = { ok: true } | { ok: false; error: ErrorQuitarDestacado; mensaje: string }

/**
 * Quita el destacado de un evento. `entrada` es `{ eventId }` (mismo shape
 * de objeto que `destacarEvento`, para que el cliente arme las dos llamadas
 * igual); `eventId` se valida como uuid ANTES de crear el cliente, con
 * `isUuid()` de lib/metricas (no se duplica esa regex acá: ya la expone esa
 * función, y `validarDestacado()` de core no sirve sola para este caso
 * porque exige también un "hasta" que quitarDestacado no tiene).
 */
export async function quitarDestacado(entrada: unknown): Promise<ResultadoQuitarDestacado> {
  const eventId =
    typeof entrada === 'object' && entrada !== null ? (entrada as Record<string, unknown>).eventId : entrada

  if (!isUuid(eventId)) {
    return { ok: false, error: 'INVALID', mensaje: 'El evento no es válido.' }
  }

  const auth = await requireAdminSupabase()
  if (!auth.ok) return { ok: false, error: auth.error, mensaje: auth.mensaje }

  const { data, error } = await auth.supabase
    .from('events')
    .update({
      featured_until: null,
      is_featured: false,
      // Igual que al destacar: queda registrado quién SACÓ el destacado y
      // cuándo (no solo quién lo puso) — featured_set_by/featured_set_at se
      // vuelven a escribir con el admin que está quitando. Sale siempre de
      // auth.userId (auth.getUser()), nunca de `entrada`.
      featured_set_by: auth.userId,
      featured_set_at: new Date().toISOString(),
    })
    .eq('id', eventId)
    .select('id')

  if (error) {
    console.error('quitarDestacado: error de la base', error.code)
    return { ok: false, error: 'DB_ERROR', mensaje: 'No se pudo quitar el destacado. Intentá de nuevo.' }
  }

  if (!data || data.length === 0) {
    return { ok: false, error: 'NOT_FOUND', mensaje: 'No se encontró el evento.' }
  }

  revalidatePath('/')
  revalidatePath(`/evento/${eventId}`)
  revalidatePath('/admin/destacados')

  return { ok: true }
}

export type DestacadoParaLista = {
  id: string
  title: string
  slug: string | null
  start_date: string
  featured_until: string
  featured_set_at: string | null
  destacadoPor: { fullName: string | null; email: string } | null
}

/**
 * Tope explícito de filas para obtenerDestacados() (ver el comentario de
 * esa función para por qué 200 alcanza de sobra).
 */
const LIMITE_DESTACADOS = 200

/**
 * Lista para /admin/destacados: eventos con `featured_until` no nulo que
 * siguen vigentes o vencieron en los últimos 30 días, ordenados por
 * `featured_until` ascendente. `null` si quien pide no es admin (o no tiene
 * sesión).
 *
 * Límite explícito en vez de paginar con traerTodasLasFilas() (lib/images/
 * paginar-filas.ts, que resuelve el bug QPS-162 de PostgREST cortando cada
 * `select` en 1000 filas): el universo de "eventos alguna vez destacados y
 * aún no hace más de 30 días que vencieron" es chico por construcción (lo
 * arma un admin a mano, de a uno, nunca un scraper) — 200 es, de sobra,
 * muchas veces más que cualquier cantidad razonable de destacados activos
 * en Salta a la vez. Si algún día se superara, hay que pasar a
 * traerTodasLasFilas() como en /admin/lugares.
 *
 * Nunca `select('*')`: columnas explícitas (QPS-108).
 */
export async function obtenerDestacados(): Promise<DestacadoParaLista[] | null> {
  const auth = await requireAdminSupabase()
  if (!auth.ok) return null

  const hace30Dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data: eventos, error } = await auth.supabase
    .from('events')
    .select('id, title, slug, start_date, featured_until, featured_set_by, featured_set_at')
    .not('featured_until', 'is', null)
    .gte('featured_until', hace30Dias)
    .order('featured_until', { ascending: true })
    .limit(LIMITE_DESTACADOS)

  if (error) {
    console.error('obtenerDestacados: error de la base', error.code)
    return []
  }

  const filas = eventos ?? []

  // El join directo por FK (algo como
  // "profiles!events_featured_set_by_fkey(full_name, email)", que es el
  // patrón que usa lib/admin-actions.ts para events.created_by) NO
  // funciona acá: a diferencia de events.created_by (cuya FK, puesta en el
  // baseline, apunta a public.profiles), events.featured_set_by apunta a
  // auth.users (supabase/migrations/20261018130100_etapa2_eventos_destacados.sql,
  // línea "featured_set_by uuid null references auth.users(id)"). auth.users
  // no está en el esquema que expone PostgREST, así que no hay ningún embed
  // posible desde events con esta columna: se resuelve con una segunda
  // consulta a profiles, por los ids distintos que aparecen en esta página
  // (como mucho LIMITE_DESTACADOS ids, nunca sin acotar).
  const idsAdmin = [...new Set(filas.map((fila) => fila.featured_set_by).filter((id): id is string => Boolean(id)))]

  const nombrePorId = new Map<string, { fullName: string | null; email: string }>()
  if (idsAdmin.length > 0) {
    const { data: perfiles, error: errorPerfiles } = await auth.supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', idsAdmin)

    if (errorPerfiles) {
      console.error('obtenerDestacados: error de la base (perfiles)', errorPerfiles.code)
    } else {
      for (const perfil of perfiles ?? []) {
        nombrePorId.set(perfil.id, { fullName: perfil.full_name, email: perfil.email })
      }
    }
  }

  return filas.map((fila) => ({
    id: fila.id,
    title: fila.title,
    slug: fila.slug,
    start_date: fila.start_date,
    featured_until: fila.featured_until as string,
    featured_set_at: fila.featured_set_at,
    destacadoPor: fila.featured_set_by ? nombrePorId.get(fila.featured_set_by) ?? null : null,
  }))
}
