// Q4-11: aplica `decidirFinde` con una notificación LOCAL (expo-notifications).
// Nunca pide el permiso: sin permiso, solo cancela. Nunca tira.
import * as Notificaciones from 'expo-notifications'
import { formatSaltaDayKey } from '@qps/core/date-format'
import { almacenPorDefecto, type Almacen } from '@/lib/sin-conexion/almacen'
import { CLAVE_AGENDA, leerCache, TTL_AGENDA_MS } from '@/lib/sin-conexion/cache'
import type { DatosAgenda } from '@/lib/sin-conexion/agenda'
import { decidirFinde, IDENTIFICADOR_FINDE, TIPO_FINDE, type DecisionFinde } from './finde'

/** Preferencia del interruptor de Cuenta: '1' / '0' / sin valor (= según el permiso). */
export const CLAVE_FINDE = 'qps.finde.activo'
/** Día (Salta) del último «Aviso del equipo» que llegó al teléfono. */
export const CLAVE_DIA_AVISO_EQUIPO = 'qps.push.dia-aviso-equipo'
/** `data.aviso` del «Aviso del equipo» (lo agrega `datosPushAvisoEquipo`, core). */
export const MARCA_AVISO_EQUIPO = 'equipo'

export type ModuloNotificacionesFinde = Pick<
  typeof Notificaciones,
  'getPermissionsAsync' | 'cancelScheduledNotificationAsync' | 'scheduleNotificationAsync'
>

/** `true` si `data` es la de un «Aviso del equipo» (`{ aviso: 'equipo' }`). */
export function esAvisoDelEquipo(data: unknown): boolean {
  return typeof data === 'object' && data !== null && (data as Record<string, unknown>).aviso === MARCA_AVISO_EQUIPO
}

/** Q5-16: `true` si es un «Aviso del equipo» que llegó hoy (`hoy`, día de Salta; `fecha` en ms). */
export function avisoDelEquipoDeHoy(data: unknown, fecha: number, hoy: string): boolean {
  return esAvisoDelEquipo(data) && Number.isFinite(fecha) && formatSaltaDayKey(new Date(fecha)) === hoy
}

export interface DependenciasFinde {
  notificaciones?: ModuloNotificacionesFinde
  almacen?: Almacen
}

async function leer(almacen: Almacen, clave: string): Promise<string | null> {
  try {
    return await almacen.leer(clave)
  } catch {
    return null
  }
}

export async function guardarPreferenciaFinde(activo: boolean, almacen: Almacen = almacenPorDefecto): Promise<void> {
  try {
    await almacen.escribir(CLAVE_FINDE, activo ? '1' : '0')
  } catch {
    // El próximo arranque decide por el permiso.
  }
}

export async function findeActivo(deps: DependenciasFinde = {}): Promise<boolean> {
  const notificaciones = deps.notificaciones ?? Notificaciones
  const almacen = deps.almacen ?? almacenPorDefecto
  let permiso = false
  try {
    permiso = (await notificaciones.getPermissionsAsync()).status === 'granted'
  } catch {
    permiso = false
  }
  if (!permiso) return false
  return (await leer(almacen, CLAVE_FINDE)) !== '0'
}

/** Anota que hoy llegó un «Aviso del equipo» y cancela el del finde si era para hoy. */
export async function registrarAvisoDelEquipo(ahora: Date, deps: DependenciasFinde = {}): Promise<void> {
  const almacen = deps.almacen ?? almacenPorDefecto
  try {
    await almacen.escribir(CLAVE_DIA_AVISO_EQUIPO, formatSaltaDayKey(ahora))
  } catch {
    // Sin anotar: puede llegar el del finde además del del equipo.
  }
  await programarFinde(ahora, deps)
}

export async function programarFinde(ahora: Date, deps: DependenciasFinde = {}): Promise<DecisionFinde> {
  const notificaciones = deps.notificaciones ?? Notificaciones
  const almacen = deps.almacen ?? almacenPorDefecto
  const [activo, cache, diaAvisoEquipo] = await Promise.all([
    findeActivo(deps),
    leerCache<DatosAgenda>(CLAVE_AGENDA, { ahora, ttlMs: TTL_AGENDA_MS, almacen }),
    leer(almacen, CLAVE_DIA_AVISO_EQUIPO),
  ])
  const decision = decidirFinde({
    ahora,
    activo,
    eventos: cache?.datos.eventos.map((item) => ({ paraAtajo: item.paraAtajo, gratis: item.evento.price === 'gratis' })) ?? null,
    guardadoEn: cache?.guardadoEn ?? null,
    diaAvisoEquipo,
  })

  try {
    await notificaciones.cancelScheduledNotificationAsync(IDENTIFICADOR_FINDE)
  } catch {
    // Puede no existir.
  }
  if (!decision.programar) return decision
  try {
    await notificaciones.scheduleNotificationAsync({
      identifier: IDENTIFICADOR_FINDE,
      content: { title: decision.titulo, body: decision.cuerpo, data: { tipo: TIPO_FINDE } },
      trigger: { type: Notificaciones.SchedulableTriggerInputTypes.DATE, date: decision.cuando, channelId: 'default' },
    })
  } catch {
    // Se intenta de nuevo en el próximo arranque.
  }
  return decision
}
