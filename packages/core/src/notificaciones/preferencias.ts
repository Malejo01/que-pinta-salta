/**
 * Preferencias de notificación de la app (R23, tabla `notification_preferences`;
 * R27, tarea 27-a): canal del Radar, interruptores y horario de silencio.
 * Sin React ni Supabase.
 */

export const CANALES_RADAR = ['email', 'push', 'ambos'] as const
export type CanalRadar = (typeof CANALES_RADAR)[number]

export interface PreferenciasNotificacion {
  radar_channel: CanalRadar
  favorite_reminders: boolean
  follow_news: boolean
  announcements: boolean
  quiet_start: string
  quiet_end: string
  daily_cap: number
}

/** Mismos defaults que la columna de la base (migración de la R23). */
export const PREFERENCIAS_POR_DEFECTO: PreferenciasNotificacion = {
  radar_channel: 'email',
  favorite_reminders: true,
  follow_news: true,
  announcements: false,
  quiet_start: '23:00',
  quiet_end: '09:00',
  daily_cap: 4,
}

const HORA_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

/** `"HH:MM"` válido, de 00:00 a 23:59. */
function esHoraValida(valor: unknown): valor is string {
  return typeof valor === 'string' && HORA_RE.test(valor)
}

/** Lo que se edita desde la app: sin `daily_cap`, que no se edita. */
export type PreferenciasNotificacionEntrada = Omit<PreferenciasNotificacion, 'daily_cap'>

export type ResultadoValidacionNotificacion =
  | { ok: true; datos: PreferenciasNotificacionEntrada }
  | { ok: false; error: string }

/**
 * Valida las preferencias de notificación que llegan de la app. `daily_cap`
 * no se recibe (no se edita), así que no se valida ni se devuelve.
 */
export function validarPreferenciasNotificacion(
  datos: Partial<Record<keyof PreferenciasNotificacionEntrada, unknown>>,
): ResultadoValidacionNotificacion {
  if (!(CANALES_RADAR as readonly unknown[]).includes(datos.radar_channel)) {
    return { ok: false, error: 'El canal del Radar no es válido.' }
  }
  if (typeof datos.favorite_reminders !== 'boolean') {
    return { ok: false, error: 'favorite_reminders tiene que ser un booleano.' }
  }
  if (typeof datos.follow_news !== 'boolean') {
    return { ok: false, error: 'follow_news tiene que ser un booleano.' }
  }
  if (typeof datos.announcements !== 'boolean') {
    return { ok: false, error: 'announcements tiene que ser un booleano.' }
  }
  if (!esHoraValida(datos.quiet_start)) {
    return { ok: false, error: 'quiet_start tiene que tener formato HH:MM (00:00 a 23:59).' }
  }
  if (!esHoraValida(datos.quiet_end)) {
    return { ok: false, error: 'quiet_end tiene que tener formato HH:MM (00:00 a 23:59).' }
  }

  return {
    ok: true,
    datos: {
      radar_channel: datos.radar_channel as CanalRadar,
      favorite_reminders: datos.favorite_reminders,
      follow_news: datos.follow_news,
      announcements: datos.announcements,
      quiet_start: datos.quiet_start,
      quiet_end: datos.quiet_end,
    },
  }
}
