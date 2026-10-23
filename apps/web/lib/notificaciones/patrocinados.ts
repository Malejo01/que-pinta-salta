/**
 * La campaña patrocinada vigente de esta corrida (D2/Ronda 51, tarea 51-b):
 * la capa que SÍ habla con Supabase, para alimentar `armarTanda` de
 * `@qps/core/notificaciones/tanda` (51-a). La resolución de CUÁL campaña está
 * vigente (si hay varias cargadas, elegir una de forma determinista) ya está
 * en `@qps/core/notificaciones/patrocinados` (`campaniaVigente`, 51-a): este
 * archivo solo lee `sponsored_campaigns`, filtra por fecha en la base, y
 * decide si la campaña vigente es USABLE (evento `PUBLISHED` y con
 * `event_id`) o hay que descartarla.
 *
 * Tres resultados posibles, distintos entre sí a propósito (la ruta los
 * cuenta distinto en `details`):
 *   1. No hay ninguna campaña vigente ahora mismo: `{ campania: null,
 *      descartada: false }`.
 *   2. Hay una vigente, pero no es usable (su evento no está `PUBLISHED`, o
 *      no tiene `event_id`): `{ campania: null, descartada: true }`. El
 *      contrato de `armarTanda` exige un evento (`CampaniaParaTanda.eventId`
 *      no es opcional), así que sin uno no hay nada que pasarle.
 *   3. Hay una vigente y usable: `{ campania: {...}, descartada: false }`.
 *
 * Si la lectura falla, `{ ok: false, tabla: 'sponsored_campaigns' }` (mismo
 * contrato que `ResultadoCargarNovedades` de `./novedades`): la ruta lo
 * traduce a un 500, igual que las otras lecturas de `enviarNotificaciones`.
 *
 * Nunca se loguea el contenido de la campaña (título, cuerpo) junto con
 * datos de personas — acá no hay datos de personas en esta lectura, así que
 * ni se plantea; el único log es el nombre de la tabla y `error.message`,
 * igual criterio que `./novedades`.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { campaniaVigente, type VentanaCampania } from '@qps/core/notificaciones/patrocinados'

/**
 * La campaña vigente, ya usable: lo que necesita `armarTanda` (`id`,
 * `titulo`, `cuerpo`, `eventId`, el contrato de `CampaniaParaTanda` de
 * `@qps/core/notificaciones/tanda`) más `sentAt`, que la ruta necesita para
 * decidir si todavía hace falta marcar `sponsored_campaigns.sent_at` (no es
 * parte del contrato de `armarTanda`: esa función no conoce `sent_at`, solo
 * decide a quién le toca un mensaje).
 */
export interface CampaniaVigenteUsable {
  id: string
  titulo: string
  cuerpo: string
  eventId: string
  /** `sponsored_campaigns.sent_at` tal cual vino de la base: `null` si todavía no se marcó ningún envío exitoso de esta campaña. */
  sentAt: string | null
}

export type ResultadoCampaniaVigente =
  | { ok: true; campania: CampaniaVigenteUsable | null; descartada: boolean }
  | { ok: false; tabla: string }

/** Fila cruda de `sponsored_campaigns`, con el estado del evento embebido (`event:events(status)`). */
interface FilaCampania {
  id: string
  title: string
  body: string
  event_id: string | null
  starts_at: string
  ends_at: string
  sent_at: string | null
  event: { status: string | null } | null
}

/** `{ ok: false, tabla }` más el único `console.error` permitido: nombre de la tabla y `error.message`. */
function errorDeTabla(tabla: string, error: { message: string }): ResultadoCampaniaVigente {
  console.error(`[Notificaciones] Error al leer ${tabla}:`, error.message)
  return { ok: false, tabla }
}

/**
 * Lee `sponsored_campaigns`, filtrando en la base por `starts_at <= ahora` y
 * `ends_at > ahora` (el mismo intervalo semiabierto que usa
 * `@qps/core/notificaciones/patrocinados`), y resuelve cuál queda vigente con
 * `campaniaVigente` (51-a): en el caso normal el filtro de la base ya deja
 * una sola fila (`validarCampania` rechaza ventanas superpuestas al guardar),
 * pero `campaniaVigente` igual se usa acá, no un `[0]` a mano, por si alguna
 * vez hay más de una (una campaña cargada por fuera del flujo validado, por
 * ejemplo).
 */
export async function cargarCampaniaVigente(supabase: SupabaseClient, ahora: Date): Promise<ResultadoCampaniaVigente> {
  const ahoraISO = ahora.toISOString()
  const { data, error } = await supabase
    .from('sponsored_campaigns')
    .select('id, title, body, event_id, starts_at, ends_at, sent_at, event:events(status)')
    .lte('starts_at', ahoraISO)
    .gt('ends_at', ahoraISO)
  if (error) return errorDeTabla('sponsored_campaigns', error)

  const filas = (data ?? []) as unknown as FilaCampania[]
  const candidatas: (FilaCampania & VentanaCampania)[] = filas.map((fila) => ({
    ...fila,
    startsAt: new Date(fila.starts_at),
    endsAt: new Date(fila.ends_at),
  }))

  const ganadora = campaniaVigente(candidatas, ahora)
  if (!ganadora) return { ok: true, campania: null, descartada: false }

  // El contrato de armarTanda exige un evento: sin event_id, o con el evento
  // sin publicar, la campaña se descarta entera (no se manda "a medias", sin
  // data/link, como sí se permite para favoritos/novedades).
  if (!ganadora.event_id || ganadora.event?.status !== 'PUBLISHED') {
    return { ok: true, campania: null, descartada: true }
  }

  return {
    ok: true,
    campania: {
      id: ganadora.id,
      titulo: ganadora.title,
      cuerpo: ganadora.body,
      eventId: ganadora.event_id,
      sentAt: ganadora.sent_at,
    },
    descartada: false,
  }
}
