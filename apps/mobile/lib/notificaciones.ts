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
      .select('radar_channel, favorite_reminders, follow_news, announcements, quiet_start, quiet_end')
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
        quiet_start: data.quiet_start,
        quiet_end: data.quiet_end,
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
