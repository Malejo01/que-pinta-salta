// "Voy" / "Me interesa" de la ficha de un evento (R26, tarea 26-b, QPS-110 en
// ops/alcance-app-v1.md). Las cantidades son públicas (`event_attendance_counts`);
// la marca propia solo con sesión (`event_attendance`, acotada por su RLS a
// la fila del usuario — nunca se filtra por `user_id` a mano). El `user_id`
// que se manda en el upsert es siempre el de la sesión, nunca un dato de la
// pantalla, y nunca se muestra quién marcó: solo las cantidades.
//
// `event_attendance`/`event_attendance_counts` recién llegan a producción el
// jueves: hasta entonces, PostgREST devuelve "la tabla/vista no existe"
// (`PGRST205`, `42P01`) o un `PGRST2xx` con "schema cache" en el mensaje.
// `clasificarErrorAsistencia` es pura (sin red, sin Supabase) para que 26-c
// la pruebe sin mockear nada.
import { supabase } from './supabase'

export const MENSAJE_SIN_CONFIGURACION = 'La app no tiene la configuración de datos: avisá al equipo.'
export const MENSAJE_ERROR = 'No pudimos cargar esta sección. Probá de nuevo.'
export const MENSAJE_NO_DISPONIBLE = 'Pronto vas a poder marcar si vas.'

export type TipoAsistencia = 'voy' | 'me_interesa'

export interface CantidadesAsistencia {
  voy: number
  meInteresa: number
}

export type EstadoAsistencia =
  | { tipo: 'ok'; cantidades: CantidadesAsistencia; propia: TipoAsistencia | null }
  | { tipo: 'no-disponible' }
  | { tipo: 'error'; error: string }

export type ResultadoMarcar = { tipo: 'ok' } | { tipo: 'no-disponible' } | { tipo: 'error'; error: string }

const PGRST2XX_SCHEMA_CACHE_RE = /^PGRST2\d\d$/

/**
 * Clasifica un error de PostgREST sobre `event_attendance` /
 * `event_attendance_counts`. `'no-disponible'`: la tabla o la vista todavía
 * no existen en este entorno (`PGRST205`, `42P01`, o un `PGRST2xx` con
 * "schema cache" en el mensaje). Cualquier otro error (por ejemplo `42501`,
 * o un error de red sin `code`): `'error'`. Pura: no toca la red ni el
 * estado de la app.
 */
export function clasificarErrorAsistencia(error: unknown): 'no-disponible' | 'error' {
  if (!error || typeof error !== 'object') return 'error'

  const registro = error as Record<string, unknown>
  const code = typeof registro.code === 'string' ? registro.code : ''
  const message = typeof registro.message === 'string' ? registro.message : ''

  if (code === 'PGRST205' || code === '42P01') return 'no-disponible'
  if (PGRST2XX_SCHEMA_CACHE_RE.test(code) && /schema cache/i.test(message)) return 'no-disponible'

  return 'error'
}

function resultadoDeError(error: unknown): { tipo: 'no-disponible' } | { tipo: 'error'; error: string } {
  return clasificarErrorAsistencia(error) === 'no-disponible'
    ? { tipo: 'no-disponible' }
    : { tipo: 'error', error: MENSAJE_ERROR }
}

/**
 * Cantidades públicas de `eventId` y, si `userId` no es `null`, la marca
 * propia. Sin sesión (`userId` null), `propia` es siempre `null` y nunca se
 * consulta `event_attendance`.
 */
export async function obtenerAsistencia(eventId: string, userId: string | null): Promise<EstadoAsistencia> {
  if (!supabase) {
    return { tipo: 'error', error: MENSAJE_SIN_CONFIGURACION }
  }

  try {
    const { data: fila, error: errorCantidades } = await supabase
      .from('event_attendance_counts')
      .select('voy, me_interesa')
      .eq('event_id', eventId)
      .maybeSingle()

    if (errorCantidades) {
      return resultadoDeError(errorCantidades)
    }

    const cantidades: CantidadesAsistencia = { voy: fila?.voy ?? 0, meInteresa: fila?.me_interesa ?? 0 }

    if (!userId) {
      return { tipo: 'ok', cantidades, propia: null }
    }

    // Solo `kind`: nunca `user_id` en el select, aunque la RLS ya acota esta
    // consulta a la fila propia (filtrar por event_id alcanza).
    const { data: filaPropia, error: errorPropia } = await supabase
      .from('event_attendance')
      .select('kind')
      .eq('event_id', eventId)
      .maybeSingle()

    if (errorPropia) {
      return resultadoDeError(errorPropia)
    }

    const propia: TipoAsistencia | null =
      filaPropia?.kind === 'voy' || filaPropia?.kind === 'me_interesa' ? filaPropia.kind : null

    return { tipo: 'ok', cantidades, propia }
  } catch (excepcion) {
    return resultadoDeError(excepcion)
  }
}

/**
 * Marca o desmarca `tipo` para `eventId`. Si ya estaba marcado con `tipo`
 * (`actual === tipo`), borra la fila propia; si no, hace upsert por
 * `(user_id, event_id)` con el nuevo `kind` (cambia el kind si había otro).
 * `userId` es siempre el de la sesión, nunca un dato de la pantalla.
 */
export async function marcarAsistencia(
  eventId: string,
  userId: string,
  tipo: TipoAsistencia,
  actual: TipoAsistencia | null
): Promise<ResultadoMarcar> {
  if (!supabase) {
    return { tipo: 'error', error: MENSAJE_SIN_CONFIGURACION }
  }

  try {
    if (actual === tipo) {
      // La RLS ("eliminación del dueño") ya acota esto a la fila propia.
      const { error } = await supabase.from('event_attendance').delete().eq('event_id', eventId)
      if (error) return resultadoDeError(error)
      return { tipo: 'ok' }
    }

    const { error } = await supabase
      .from('event_attendance')
      .upsert({ user_id: userId, event_id: eventId, kind: tipo }, { onConflict: 'user_id,event_id' })
    if (error) return resultadoDeError(error)
    return { tipo: 'ok' }
  } catch (excepcion) {
    return resultadoDeError(excepcion)
  }
}
