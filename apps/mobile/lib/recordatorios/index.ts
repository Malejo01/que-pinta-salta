// Q4-10: aplica el plan de `./programacion` con notificaciones LOCALES de
// expo-notifications (sin backend). Nunca pide el permiso: si no está
// concedido, solo cancela lo que hubiera. Nunca tira.
import * as Notificaciones from 'expo-notifications'
import type { DisplayEvent } from '@qps/core/home/types'
import { almacenPorDefecto, type Almacen } from '@/lib/sin-conexion/almacen'
import {
  PREFIJO_RECORDATORIO,
  TIPO_RECORDATORIO,
  planificarRecordatorios,
  recordatoriosActivos,
} from './programacion'

/** Preferencia local del interruptor de Cuenta: '1' prendido, '0' apagado, sin valor = según el permiso. */
export const CLAVE_RECORDATORIOS = 'qps.recordatorios.activos'

export type ModuloNotificacionesLocales = Pick<
  typeof Notificaciones,
  'getPermissionsAsync' | 'getAllScheduledNotificationsAsync' | 'cancelScheduledNotificationAsync' | 'scheduleNotificationAsync'
>

export interface DependenciasRecordatorios {
  notificaciones?: ModuloNotificacionesLocales
  almacen?: Almacen
}

export async function leerPreferencia(almacen: Almacen = almacenPorDefecto): Promise<'1' | '0' | null> {
  try {
    const valor = await almacen.leer(CLAVE_RECORDATORIOS)
    return valor === '1' || valor === '0' ? valor : null
  } catch {
    return null
  }
}

export async function guardarPreferencia(activos: boolean, almacen: Almacen = almacenPorDefecto): Promise<void> {
  try {
    await almacen.escribir(CLAVE_RECORDATORIOS, activos ? '1' : '0')
  } catch {
    // Sin guardar: el próximo arranque decide por el permiso.
  }
}

export async function permisoConcedido(notificaciones: ModuloNotificacionesLocales = Notificaciones): Promise<boolean> {
  try {
    return (await notificaciones.getPermissionsAsync()).status === 'granted'
  } catch {
    return false
  }
}

/** ¿Están activos ahora? (preferencia + permiso, sin pedir nada). */
export async function estanActivos(deps: DependenciasRecordatorios = {}): Promise<boolean> {
  const notificaciones = deps.notificaciones ?? Notificaciones
  const [preferencia, permiso] = await Promise.all([leerPreferencia(deps.almacen), permisoConcedido(notificaciones)])
  return recordatoriosActivos(preferencia, permiso)
}

async function cancelarLosNuestros(notificaciones: ModuloNotificacionesLocales): Promise<number> {
  let cancelados = 0
  try {
    const programadas = await notificaciones.getAllScheduledNotificationsAsync()
    for (const n of programadas) {
      if (n.identifier.startsWith(PREFIJO_RECORDATORIO)) {
        await notificaciones.cancelScheduledNotificationAsync(n.identifier)
        cancelados++
      }
    }
  } catch {
    // Seguimos: lo peor es un recordatorio de más.
  }
  return cancelados
}

export type ResultadoSincronizacion = { activos: boolean; programados: number; cancelados: number }

/**
 * Deja programados exactamente los recordatorios de `eventos` (lo guardado y
 * los Voy de la persona). Sin sesión, `eventos` vacío: cancela todo lo nuestro.
 */
export async function sincronizarRecordatorios(
  eventos: DisplayEvent[],
  ahora: Date,
  deps: DependenciasRecordatorios = {},
): Promise<ResultadoSincronizacion> {
  const notificaciones = deps.notificaciones ?? Notificaciones
  const activos = await estanActivos(deps)
  const cancelados = await cancelarLosNuestros(notificaciones)
  if (!activos) return { activos, programados: 0, cancelados }

  let programados = 0
  for (const r of planificarRecordatorios(eventos, ahora)) {
    try {
      await notificaciones.scheduleNotificationAsync({
        identifier: r.identificador,
        content: { title: r.titulo, body: r.cuerpo, data: { eventId: r.eventId, tipo: TIPO_RECORDATORIO } },
        trigger: { type: Notificaciones.SchedulableTriggerInputTypes.DATE, date: r.cuando, channelId: 'default' },
      })
      programados++
    } catch {
      // Uno que falla no frena a los demás.
    }
  }
  return { activos, programados, cancelados }
}
