// Q4-11: aplica `decidirFinde` con una notificación LOCAL (expo-notifications).
// Nunca pide el permiso: sin permiso, solo cancela. Nunca tira.
import * as Notificaciones from 'expo-notifications'
import { formatSaltaDayKey } from '@qps/core/date-format'
import { SITIO } from '@qps/core/metricas/links'
import { RUTA_AVISO_EQUIPO_DEL_DIA } from '@qps/core/notificaciones/equipo'
import { fetchConTimeout } from '@/lib/red'
import { almacenPorDefecto, type Almacen } from '@/lib/sin-conexion/almacen'
import { CLAVE_AGENDA, leerCache, TTL_AGENDA_MS } from '@/lib/sin-conexion/cache'
import type { DatosAgenda } from '@/lib/sin-conexion/agenda'
import { idiomaGuardado, type Idioma } from '@/lib/i18n/idioma'
import { decidirFinde, IDENTIFICADOR_FINDE, TIPO_FINDE, type DecisionFinde } from './finde'

/** Preferencia del interruptor de Cuenta: '1' / '0' / sin valor (= según el permiso). */
export const CLAVE_FINDE = 'qps.finde.activo'
/** Día (Salta) del último «Aviso del equipo» que llegó al teléfono. */
export const CLAVE_DIA_AVISO_EQUIPO = 'qps.push.dia-aviso-equipo'
/** `data.aviso` del «Aviso del equipo» (lo agrega `datosPushAvisoEquipo`, core). */
export const MARCA_AVISO_EQUIPO = 'equipo'
/** Q6-8: `GET ?dia=AAAA-MM-DD` → `{ ok, dia, hubo }`: si el equipo mandó un aviso ese día. */
export const URL_AVISO_EQUIPO_DEL_DIA = `${SITIO}${RUTA_AVISO_EQUIPO_DEL_DIA}`
const TIMEOUT_CONSULTA_MS = 5000

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
  /**
   * Q6-1: el idioma del aviso. Sin pasarlo, el guardado en el teléfono
   * (Cuenta → Idioma, o el del dispositivo con «Automático»).
   */
  idioma?: Idioma
  /** Q6-8: para consultar `URL_AVISO_EQUIPO_DEL_DIA` (el `fetch` global si no se pasa). */
  fetch?: typeof fetch
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

/**
 * Q6-8: le pregunta al servidor si el equipo mandó un aviso el día `dia`
 * (Salta). `true` / `false`, o `null` si no se sabe (sin red, error, respuesta
 * rara): quien llama lo toma como «no» y programa como siempre. Nunca tira.
 */
export async function avisoDelEquipoEnElServidor(dia: string, fetchBase: typeof fetch): Promise<boolean | null> {
  try {
    const respuesta = await fetchConTimeout(fetchBase, TIMEOUT_CONSULTA_MS)(`${URL_AVISO_EQUIPO_DEL_DIA}?dia=${encodeURIComponent(dia)}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    if (!respuesta.ok) return null
    const cuerpo = (await respuesta.json()) as Record<string, unknown> | null
    if (!cuerpo || cuerpo.ok !== true || cuerpo.dia !== dia || typeof cuerpo.hubo !== 'boolean') return null
    return cuerpo.hubo
  } catch {
    return null
  }
}

export async function programarFinde(ahora: Date, deps: DependenciasFinde = {}): Promise<DecisionFinde> {
  const notificaciones = deps.notificaciones ?? Notificaciones
  const almacen = deps.almacen ?? almacenPorDefecto
  const [activo, cache, diaAvisoEquipo, idioma] = await Promise.all([
    findeActivo(deps),
    leerCache<DatosAgenda>(CLAVE_AGENDA, { ahora, ttlMs: TTL_AGENDA_MS, almacen }),
    leer(almacen, CLAVE_DIA_AVISO_EQUIPO),
    deps.idioma ?? idiomaGuardado(almacen),
  ])
  const entrada = {
    ahora,
    activo,
    eventos: cache?.datos.eventos.map((item) => ({ paraAtajo: item.paraAtajo, gratis: item.evento.price === 'gratis' })) ?? null,
    guardadoEn: cache?.guardadoEn ?? null,
    diaAvisoEquipo,
    idioma,
  }
  let decision = decidirFinde(entrada)

  // Q6-8: si el del finde es para HOY (jueves, antes de las 18), se pregunta
  // al servidor si el equipo ya mandó su aviso: puede haber llegado con la
  // app cerrada y la persona haberlo descartado sin tocarlo (no queda en la
  // bandeja). Solo los jueves y solo si iba a programarse: casi nunca hay red
  // de por medio. Si no se sabe, se programa como siempre.
  const hoy = formatSaltaDayKey(ahora)
  if (decision.programar && formatSaltaDayKey(decision.cuando) === hoy) {
    const hubo = await avisoDelEquipoEnElServidor(hoy, deps.fetch ?? fetch)
    if (hubo === true) {
      try {
        await almacen.escribir(CLAVE_DIA_AVISO_EQUIPO, hoy)
      } catch {
        // Sin anotar: el próximo arranque vuelve a preguntar.
      }
      decision = decidirFinde({ ...entrada, diaAvisoEquipo: hoy })
    } else if ((await leer(almacen, CLAVE_DIA_AVISO_EQUIPO)) === hoy) {
      // Mientras se esperaba la respuesta llegó el aviso con la app abierta
      // (`registrarAvisoDelEquipo` ya lo anotó y canceló): no se reprograma.
      decision = decidirFinde({ ...entrada, diaAvisoEquipo: hoy })
    }
  }

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
