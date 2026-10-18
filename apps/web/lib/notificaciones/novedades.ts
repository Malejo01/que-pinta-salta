/**
 * Cargar las novedades de lo que cada usuario sigue (R41, tarea 41-b): la
 * capa que SÍ habla con Supabase, para alimentar `@qps/core/notificaciones/novedades`
 * (41-a, puro: la ventana por usuario y el cruce con lo que sigue). Esta
 * tarea no decide nada de reglas de negocio, solo junta los datos:
 *
 *   1. `job_runs`: las corridas OK (`SUCCESS`/`PARTIAL`) de `notificaciones`
 *      de las últimas `VENTANA_MAXIMA_NOVEDADES_HORAS`, con su `hasta`
 *      (`details.novedadesHasta` si es un ISO válido, si no `started_at`).
 *      La corrida ACTUAL (la que está llamando a esta función) queda afuera
 *      SOLA, porque `withJobRun` (`apps/web/lib/job-runs.ts`) la inserta en
 *      estado `RUNNING` ANTES de llamar a `enviarNotificaciones`, y el
 *      filtro de `status` de acá solo pide `SUCCESS`/`PARTIAL`: no hace
 *      falta (ni se debe) excluirla por id. Si alguna vez se "simplifica"
 *      ese filtro de status, la ventana arrancaría en `ahora` y esta
 *      función nunca encontraría novedades.
 *   2. `inicioVentanaNovedades` (41-a) resuelve, para cada usuario, desde
 *      dónde mirar `events.created_at`: la respuesta 01-r39 de Mauro habla
 *      de una ventana GLOBAL desde la última corrida OK, pero una ventana
 *      global se pierde la ingesta de ticketeras de las 05:00 de Salta
 *      (adentro del horario de silencio por defecto, 23:00-09:00): la
 *      corrida de las 05:05 descartaría a todos por silencio y correría la
 *      ventana, y a las 09:05 esos eventos ya no estarían. La ventana por
 *      usuario arranca en la última corrida OK en la que ESE usuario no
 *      estaba en silencio.
 *   3. Lo que cada usuario sigue (`user_followed_categories/venues/instagram_accounts`).
 *      Si nadie sigue nada, no hace falta ni mirar `events`.
 *   4. Los eventos nuevos (`events.created_at`, NUNCA `updated_at`, `status
 *      = 'PUBLISHED'` y vigentes con `isVigente`) desde el `desde` más
 *      amplio de todos los usuarios (el recorte final, por usuario, lo hace
 *      `novedadesDeUsuario`).
 *   5. Los flyers de Instagram de las cuentas seguidas que apuntan a esos
 *      eventos nuevos, para armar `instagramAccountIds` de cada evento.
 *   6. `novedadesDeUsuario` (41-a), una vez por usuario.
 *
 * Limitación que queda así a propósito (la documenta también 41-a):
 * "nuevo en la base, no nuevo para esta persona" — `created_at` mide cuándo
 * el evento entró a la base, no cuándo el usuario empezó a seguir lo que lo
 * trae.
 *
 * Si falla cualquier lectura, se corta ahí: `{ ok: false, tabla }`, sin
 * datos de ningún usuario. La ruta traduce eso a un 500 (igual que las
 * otras lecturas de `enviarNotificaciones`): la corrida queda `FAILED`, la
 * ventana no avanza (no se graba `novedadesHasta`) y la corrida siguiente
 * reintenta desde el mismo punto.
 *
 * QPS-201, sin resolver en esta tarea (está fuera del alcance aprobado):
 * ninguna consulta de acá pagina, igual que la de `push_tokens` ya existente
 * en la ruta. Con más de 1000 filas en `job_runs`, `user_followed_*`,
 * `events` o `instagram_flyers`, PostgREST corta en la fila 1000 sin avisar
 * y esta función no se entera. Queda para el backlog.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { isVigente } from '@qps/core/events/vigencia'
import {
  inicioVentanaNovedades,
  novedadesDeUsuario,
  VENTANA_MAXIMA_NOVEDADES_HORAS,
  type EventoParaNovedades,
  type SigueParaNovedades,
} from '@qps/core/notificaciones/novedades'
import type { PreferenciasNotificacion } from '@qps/core/notificaciones/preferencias'
import type { NovedadParaTanda } from '@qps/core/notificaciones/tanda'

/** Igual criterio que `lib/radar/events.ts`: el `event_id` de `ai_metadata` es una columna JSON libre, se valida como uuid antes de confiar en ella. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface CargarNovedadesInput {
  userIds: string[]
  /** El mismo mapa que ya arma la ruta (paso 2): fila de `notification_preferences` si existe, `null` si no. No se normalizan `quiet_start`/`quiet_end` acá: eso lo acepta `estaEnHorarioDeSilencio` (core) tal cual vienen de la base (`"HH:MM:SS"`). */
  preferenciasPorUsuario: Map<string, PreferenciasNotificacion>
  ahora: Date
}

export type ResultadoCargarNovedades =
  | { ok: true; porUsuario: Map<string, NovedadParaTanda[]> }
  | { ok: false; tabla: string }

/**
 * `{ ok: false, tabla }` más el `console.error` que pide la tarea: SOLO el
 * nombre de la tabla y `error.message` (nunca ids de usuario, ni filas, ni
 * nada de `details`/`ai_metadata`, que son columnas JSON libres y podrían
 * traer cualquier cosa).
 */
function errorDeTabla(tabla: string, error: { message: string }): ResultadoCargarNovedades {
  console.error(`[Notificaciones] Error al leer ${tabla}:`, error.message)
  return { ok: false, tabla }
}

type FilaJobRun = { started_at: string; details: unknown }

/** `details.novedadesHasta` si es un string que parsea como fecha; si no (falta, no es string, o no parsea), `started_at`. */
function hastaDeCorrida(fila: FilaJobRun): string {
  const details = fila.details as { novedadesHasta?: unknown } | null | undefined
  const candidato = details?.novedadesHasta
  if (typeof candidato === 'string' && !Number.isNaN(new Date(candidato).getTime())) return candidato
  return fila.started_at
}

type FilaEvento = {
  id: string
  title: string
  created_at: string | null
  start_date: string
  end_date: string | null
  status: string | null
  category_id: string | null
  venue_id: string | null
}

type FilaFlyer = { account_id: string; ai_metadata: unknown }

/** `ai_metadata.event_id`, si es un string con forma de uuid; `null` si no (el flyer se ignora para novedades, no rompe nada). */
function eventIdDelFlyer(ai_metadata: unknown): string | null {
  if (!ai_metadata || typeof ai_metadata !== 'object' || Array.isArray(ai_metadata)) return null
  const eventId = (ai_metadata as Record<string, unknown>).event_id
  return typeof eventId === 'string' && UUID_RE.test(eventId) ? eventId : null
}

export async function cargarNovedades(
  supabase: SupabaseClient,
  { userIds, preferenciasPorUsuario, ahora }: CargarNovedadesInput,
): Promise<ResultadoCargarNovedades> {
  // 1. Corridas OK de notificaciones, de las últimas VENTANA_MAXIMA_NOVEDADES_HORAS
  // (la misma constante de 41-a, no un número repetido acá: así no hace
  // falta pedirle a la base corridas más viejas que lo que inicioVentanaNovedades
  // va a poder usar de todos modos).
  const limiteVentana = new Date(ahora.getTime() - VENTANA_MAXIMA_NOVEDADES_HORAS * 60 * 60 * 1000).toISOString()
  const { data: corridas, error: errorCorridas } = await supabase
    .from('job_runs')
    .select('started_at, details')
    .eq('job_key', 'notificaciones')
    .in('status', ['SUCCESS', 'PARTIAL'])
    .gte('started_at', limiteVentana)
  if (errorCorridas) return errorDeTabla('job_runs', errorCorridas)

  const corridasOk = ((corridas ?? []) as FilaJobRun[]).map((fila) => ({ hasta: hastaDeCorrida(fila) }))

  // 2. El `desde` de cada usuario (inicioVentanaNovedades, 41-a) y el mínimo
  // de todos: acota la consulta de `events` a una sola ventana, en vez de
  // una consulta por usuario. El recorte final (desde SU `desde`) lo hace
  // novedadesDeUsuario más abajo, por usuario.
  const desdePorUsuario = new Map<string, Date>()
  let desdeMinimo: Date | null = null
  for (const userId of userIds) {
    const desde = inicioVentanaNovedades({
      corridasOk,
      preferencias: preferenciasPorUsuario.get(userId) ?? null,
      ahora,
    })
    desdePorUsuario.set(userId, desde)
    if (desdeMinimo === null || desde.getTime() < desdeMinimo.getTime()) desdeMinimo = desde
  }
  if (desdeMinimo === null) return { ok: true, porUsuario: new Map() } // userIds vacío: la ruta ya corta antes de llegar acá, pero no se divide por cero.

  // 3. Lo que cada usuario sigue. Si nadie sigue nada, se termina acá: un
  // mapa vacío y ninguna lectura de `events`.
  const [categorias, venues, cuentas] = await Promise.all([
    supabase.from('user_followed_categories').select('user_id, category_id').in('user_id', userIds),
    supabase.from('user_followed_venues').select('user_id, venue_id').in('user_id', userIds),
    supabase.from('user_followed_instagram_accounts').select('user_id, instagram_account_id').in('user_id', userIds),
  ])
  if (categorias.error) return errorDeTabla('user_followed_categories', categorias.error)
  if (venues.error) return errorDeTabla('user_followed_venues', venues.error)
  if (cuentas.error) return errorDeTabla('user_followed_instagram_accounts', cuentas.error)

  const sigueCategorias = (categorias.data ?? []) as Array<{ user_id: string; category_id: string }>
  const sigueVenues = (venues.data ?? []) as Array<{ user_id: string; venue_id: string }>
  const sigueCuentas = (cuentas.data ?? []) as Array<{ user_id: string; instagram_account_id: string }>

  if (sigueCategorias.length === 0 && sigueVenues.length === 0 && sigueCuentas.length === 0) {
    return { ok: true, porUsuario: new Map() }
  }

  function sigueDe(userId: string): SigueParaNovedades {
    return {
      categoryIds: sigueCategorias.filter((f) => f.user_id === userId).map((f) => f.category_id),
      venueIds: sigueVenues.filter((f) => f.user_id === userId).map((f) => f.venue_id),
      instagramAccountIds: sigueCuentas.filter((f) => f.user_id === userId).map((f) => f.instagram_account_id),
    }
  }

  // 4. Eventos nuevos: solo created_at (nunca updated_at), PUBLISHED y
  // vigentes (isVigente en memoria, igual criterio que los favoritos de la
  // ruta y el Radar).
  const { data: eventRows, error: errorEvents } = await supabase
    .from('events')
    .select('id, title, created_at, start_date, end_date, status, category_id, venue_id')
    .eq('status', 'PUBLISHED')
    .gt('created_at', desdeMinimo.toISOString())
    .lte('created_at', ahora.toISOString())
  if (errorEvents) return errorDeTabla('events', errorEvents)

  const eventosVigentes = ((eventRows ?? []) as FilaEvento[]).filter((fila) => isVigente(fila, ahora))

  // 5. Instagram: los flyers de las cuentas seguidas que apuntan a alguno de
  // los eventos nuevos. El filtro por `account_id` y `status`/`ai_status` va
  // en la base; el cruce por `ai_metadata->>event_id` se hace EN MEMORIA, con
  // la misma validación de uuid que `lib/radar/events.ts` (no un filtro del
  // lado del servidor con `.in('ai_metadata->>event_id', ...)`: ese patrón
  // existe en el repo —`lib/admin/date-confirmation.ts`— pero ahí el cliente
  // está tipado como `any` a propósito; acá el cliente llega tipado de
  // verdad, y replicar el cruce de `lib/radar/events.ts`, ya probado en
  // producción, es más seguro que confirmar que los tipos lo aceptan sin un
  // `any` nuevo).
  const idsEventosNuevos = new Set(eventosVigentes.map((e) => e.id))
  const idsCuentasSeguidas = [...new Set(sigueCuentas.map((f) => f.instagram_account_id))]

  const instagramAccountIdsPorEvento = new Map<string, string[]>()
  if (idsCuentasSeguidas.length > 0 && idsEventosNuevos.size > 0) {
    const { data: flyerRows, error: errorFlyers } = await supabase
      .from('instagram_flyers')
      .select('account_id, ai_metadata')
      .eq('status', 'ACTIVE')
      .eq('ai_status', 'PROCESSED')
      .in('account_id', idsCuentasSeguidas)
    if (errorFlyers) return errorDeTabla('instagram_flyers', errorFlyers)

    for (const fila of (flyerRows ?? []) as FilaFlyer[]) {
      const eventId = eventIdDelFlyer(fila.ai_metadata)
      if (!eventId || !idsEventosNuevos.has(eventId)) continue
      const lista = instagramAccountIdsPorEvento.get(eventId) ?? []
      lista.push(fila.account_id)
      instagramAccountIdsPorEvento.set(eventId, lista)
    }
  }

  const eventosParaNovedades: EventoParaNovedades[] = eventosVigentes.map((fila) => ({
    id: fila.id,
    title: fila.title,
    created_at: fila.created_at,
    category_id: fila.category_id,
    venue_id: fila.venue_id,
    instagramAccountIds: instagramAccountIdsPorEvento.get(fila.id) ?? [],
  }))

  // 6. El armado, usuario por usuario: el cruce se hace EN MEMORIA, por
  // user_id, sin mezclar lo que sigue un usuario con las novedades de otro.
  const porUsuario = new Map<string, NovedadParaTanda[]>()
  for (const userId of userIds) {
    const desde = desdePorUsuario.get(userId)!
    porUsuario.set(userId, novedadesDeUsuario({ eventos: eventosParaNovedades, sigue: sigueDe(userId), desde, ahora }))
  }

  return { ok: true, porUsuario }
}
