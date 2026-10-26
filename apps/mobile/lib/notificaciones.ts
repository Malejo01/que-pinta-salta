// Notificaciones en Cuenta (R27, tarea 27-b). `notification_preferences`
// recién llega a producción el jueves (R23/R27: ver
// `supabase/migrations/20261013120000_app_notificaciones.sql`): hasta
// entonces, `clasificarErrorTabla` (lib/errores.ts) detecta "la tabla no
// existe" y esta sección muestra `MENSAJE_NO_DISPONIBLE` sin romper el resto
// de Cuenta. El `user_id` que recibe cada función es siempre el que la
// pantalla leyó de `useSession()`.
import {
  PREFERENCIAS_POR_DEFECTO,
  validarPreferenciasNotificacion,
  type CanalRadar,
  type PreferenciasNotificacion,
  type PreferenciasNotificacionEntrada,
} from '@qps/core/notificaciones/preferencias'
import { clasificarErrorTabla } from '@/lib/errores'
import { MENSAJE_SIN_CONFIGURACION } from '@/lib/mensajes'
import { supabase } from '@/lib/supabase'

export { MENSAJE_SIN_CONFIGURACION }
export const MENSAJE_ERROR = 'No pudimos cargar tus notificaciones. Probá de nuevo.'
export const MENSAJE_ERROR_GUARDAR = 'No pudimos guardar tus notificaciones. Probá de nuevo.'
export const MENSAJE_NO_DISPONIBLE = 'Pronto vas a poder elegir tus notificaciones.'

// Ronda 41, tarea 41-e: `quiet_start`/`quiet_end` son columnas `time` y
// PostgREST las devuelve como `"HH:MM:SS"` (no `"HH:MM"`). Sin esta
// normalización, el campo mostraba `23:00:00` y "Guardar" fallaba contra
// `HORA_RE` de `@qps/core/notificaciones/preferencias` (exige exactamente
// `HH:MM`, dos dígitos en cada parte).
const HORA_CORTA_RE = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/

/**
 * `"23:00:00"` -> `"23:00"`, `"09:05"` -> `"09:05"` (ya está corta, se
 * devuelve igual). Cualquier otro formato (`"9:5"`, `""`, `null`, etc.) cae
 * a `porDefecto`: no se "arregla" un formato ambiguo (dos dígitos exactos en
 * cada parte, igual que `HORA_RE` de core). Pura.
 */
export function horaCorta(valor: unknown, porDefecto: string): string {
  if (typeof valor !== 'string') return porDefecto
  const coincidencia = HORA_CORTA_RE.exec(valor)
  if (!coincidencia) return porDefecto
  return `${coincidencia[1]}:${coincidencia[2]}`
}

export type ResultadoNotificaciones =
  | { tipo: 'ok'; preferencias: PreferenciasNotificacion }
  | { tipo: 'no-disponible' }
  | { tipo: 'error'; error: string }

export type ResultadoGuardarNotificaciones =
  | { tipo: 'ok' }
  | { tipo: 'no-disponible' }
  | { tipo: 'error'; error: string }

function resultadoDeError(error: unknown, mensaje: string): { tipo: 'no-disponible' } | { tipo: 'error'; error: string } {
  return clasificarErrorTabla(error) === 'no-disponible' ? { tipo: 'no-disponible' } : { tipo: 'error', error: mensaje }
}

/**
 * Preferencias de notificación de `userId`. Sin fila todavía (el usuario
 * nunca guardó), los `PREFERENCIAS_POR_DEFECTO` de core. Si la tabla no
 * existe en este entorno, `'no-disponible'`.
 */
export async function obtenerNotificaciones(userId: string): Promise<ResultadoNotificaciones> {
  if (!supabase) return { tipo: 'error', error: MENSAJE_SIN_CONFIGURACION }

  try {
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('radar_channel, favorite_reminders, follow_news, announcements, sponsored, quiet_start, quiet_end')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) return resultadoDeError(error, MENSAJE_ERROR)

    if (!data) {
      return { tipo: 'ok', preferencias: PREFERENCIAS_POR_DEFECTO }
    }

    return {
      tipo: 'ok',
      preferencias: {
        ...PREFERENCIAS_POR_DEFECTO,
        radar_channel: data.radar_channel as CanalRadar,
        favorite_reminders: data.favorite_reminders,
        follow_news: data.follow_news,
        announcements: data.announcements,
        sponsored: data.sponsored,
        quiet_start: horaCorta(data.quiet_start, PREFERENCIAS_POR_DEFECTO.quiet_start),
        quiet_end: horaCorta(data.quiet_end, PREFERENCIAS_POR_DEFECTO.quiet_end),
      },
    }
  } catch (excepcion) {
    return resultadoDeError(excepcion, MENSAJE_ERROR)
  }
}

/**
 * Guarda las preferencias de notificación de `userId`: valida con
 * `validarPreferenciasNotificacion` de core (sin `daily_cap`, que no se
 * edita) y hace upsert por `user_id`. Si la tabla no existe, `'no-disponible'`.
 */
export async function guardarNotificaciones(
  userId: string,
  datos: PreferenciasNotificacionEntrada
): Promise<ResultadoGuardarNotificaciones> {
  if (!supabase) return { tipo: 'error', error: MENSAJE_SIN_CONFIGURACION }

  const validado = validarPreferenciasNotificacion(datos)
  if (!validado.ok) return { tipo: 'error', error: validado.error }

  try {
    const { error } = await supabase
      .from('notification_preferences')
      .upsert({ user_id: userId, ...validado.datos })

    if (error) return resultadoDeError(error, MENSAJE_ERROR_GUARDAR)
    return { tipo: 'ok' }
  } catch (excepcion) {
    return resultadoDeError(excepcion, MENSAJE_ERROR_GUARDAR)
  }
}

export type ResultadoCambiarAvisosEquipo = { ok: true } | { ok: false; mensaje: string }

export const MENSAJE_ERROR_AVISOS_EQUIPO = 'No pudimos guardar tu preferencia de avisos del equipo. Probá de nuevo.'

/**
 * Ronda 70, 70-a: prende/apaga `announcements` (avisos del equipo de Qué
 * Pinta Salta) en un toque. Mismo patrón que `cambiarPatrocinados`: el upsert
 * manda solo `user_id` y `announcements`, así nunca pisa las demás columnas.
 * `userId` sale siempre de `useSession()` de quien llama.
 */
export async function cambiarAvisosEquipo(userId: string, valor: boolean): Promise<ResultadoCambiarAvisosEquipo> {
  if (!supabase) return { ok: false, mensaje: MENSAJE_SIN_CONFIGURACION }

  try {
    const { error } = await supabase
      .from('notification_preferences')
      .upsert({ user_id: userId, announcements: valor }, { onConflict: 'user_id' })

    if (error) {
      const resultado = resultadoDeError(error, MENSAJE_ERROR_AVISOS_EQUIPO)
      return resultado.tipo === 'no-disponible'
        ? { ok: false, mensaje: MENSAJE_NO_DISPONIBLE }
        : { ok: false, mensaje: resultado.error }
    }
    return { ok: true }
  } catch (excepcion) {
    const resultado = resultadoDeError(excepcion, MENSAJE_ERROR_AVISOS_EQUIPO)
    return resultado.tipo === 'no-disponible'
      ? { ok: false, mensaje: MENSAJE_NO_DISPONIBLE }
      : { ok: false, mensaje: resultado.error }
  }
}

export type ResultadoCambiarPatrocinados = { ok: true } | { ok: false; mensaje: string }

export const MENSAJE_ERROR_PATROCINADOS = 'No pudimos guardar tu preferencia de avisos patrocinados. Probá de nuevo.'

/**
 * Ronda 51, tarea 51-d: prende/apaga `sponsored` (avisos patrocinados) en un
 * solo toque, sin pasar por el resto del formulario de notificaciones. El
 * upsert manda **solo** `user_id` y `sponsored`: si la fila todavía no
 * existe, las demás columnas toman el default de la base
 * (`notification_preferences`, migración de D2 de la R51) — no se "completa"
 * con los defaults de `PREFERENCIAS_POR_DEFECTO` de core, porque eso pisaría
 * cualquier otra preferencia que la persona ya tenga guardada desde otro
 * dispositivo (la fila podría existir en el servidor aunque esta pantalla
 * nunca la haya leído, por ejemplo si el upsert llega antes que
 * `obtenerNotificaciones` en otra sesión).
 *
 * `userId` lo tiene que pasar quien llama, **siempre** leído de
 * `useSession()` en esa pantalla — nunca un dato que venga de un push (la
 * tarea 51-e llama a esta función desde el botón de una notificación
 * patrocinada, y la única garantía que tiene de que el usuario es quien dice
 * ser es la sesión activa en el teléfono, no el contenido del push).
 *
 * El timeout de red ya lo pone el cliente de Supabase
 * (`fetchConTimeout`/`TIMEOUT_RED_MS` aplicado en `lib/supabase.ts`): esta
 * función no agrega uno propio.
 */
export async function cambiarPatrocinados(userId: string, valor: boolean): Promise<ResultadoCambiarPatrocinados> {
  if (!supabase) return { ok: false, mensaje: MENSAJE_SIN_CONFIGURACION }

  try {
    const { error } = await supabase
      .from('notification_preferences')
      .upsert({ user_id: userId, sponsored: valor }, { onConflict: 'user_id' })

    if (error) {
      const resultado = resultadoDeError(error, MENSAJE_ERROR_PATROCINADOS)
      return resultado.tipo === 'no-disponible'
        ? { ok: false, mensaje: MENSAJE_NO_DISPONIBLE }
        : { ok: false, mensaje: resultado.error }
    }
    return { ok: true }
  } catch (excepcion) {
    const resultado = resultadoDeError(excepcion, MENSAJE_ERROR_PATROCINADOS)
    return resultado.tipo === 'no-disponible'
      ? { ok: false, mensaje: MENSAJE_NO_DISPONIBLE }
      : { ok: false, mensaje: resultado.error }
  }
}
