// Ronda 41, tarea 41-c: el permiso, el token de Expo y el registro por la
// RPC. Las dependencias (el módulo de notificaciones, `supabase`, el
// almacenamiento y el reloj) se pueden inyectar; sin nada inyectado, usan
// los módulos reales (lo que hacen los tests es un `vi.mock` de esos
// módulos, como en `tests/secure-storage.test.ts` y `tests/notificaciones.test.ts`).
//
// El token NUNCA sale por consola, Sentry ni pantalla. De un error de
// `getExpoPushTokenAsync` (o de la RPC) se loguea como mucho `error.code` o
// `error.name`, nunca `error.message` (en Android puede traer contexto del
// dispositivo) y nunca el token.
//
// Vuelta 1 de arreglo (41-c2, hallazgo del revisor confirmado por
// seguridad): las otras tres llamadas nativas (`setNotificationChannelAsync`,
// `requestPermissionsAsync`, `getPermissionsAsync`) no estaban protegidas:
// una excepción ahí dejaba `sincronizarPush` rechazada sin atrapar y
// `estadoSincronizado` congelado (al arrancar) o el botón clavado en
// `'pidiendo'` (en `correr()` de `index.tsx`). Ahora las cuatro están
// envueltas, cada una en el lugar donde ya vive su lógica (mismo patrón que
// `obtenerToken`), y cada una decide qué `EstadoPush` devolver según lo que
// esa falla significa para la persona (ver los comentarios en cada función).
import * as Notificaciones from 'expo-notifications'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@qps/db'
import { supabase as supabaseReal } from '@/lib/supabase'
import { getItem as getItemReal, removeItem as removeItemReal, setItem as setItemReal } from '@/lib/secure-storage'
import { TIMEOUT_RED_MS } from '@/lib/red'
import { estadoDesdePermiso, plataformaPush, type EstadoPush } from './estado'
import * as apiReal from './api'
import {
  guardarAvisosAnonimos,
  guardarDeviceId,
  hayQueApagarTrasBaja,
  leerAvisosAnonimos,
  leerDeviceId,
  marcarApagarTrasBaja,
} from './dispositivo'

// La constante vive en un módulo puro (`./clave-token`, R72, 72-e) para que
// `lib/cuenta.ts` la use sin arrastrar módulos nativos; se re-exporta acá con
// el mismo nombre para no romper a quien ya la importa de `registro.ts`.
import { CLAVE_TOKEN_PUSH } from './clave-token'
export { CLAVE_TOKEN_PUSH }

type ClienteSupabase = SupabaseClient<Database> | null

/** Lo que `registro.ts` necesita del módulo de notificaciones. */
export type ModuloNotificaciones = Pick<
  typeof Notificaciones,
  'getPermissionsAsync' | 'requestPermissionsAsync' | 'setNotificationChannelAsync' | 'getExpoPushTokenAsync'
>

export interface Almacenamiento {
  getItem: (clave: string) => Promise<string | null>
  setItem: (clave: string, valor: string) => Promise<void>
  removeItem: (clave: string) => Promise<void>
}

export interface Reloj {
  setTimeout: typeof setTimeout
  clearTimeout: typeof clearTimeout
}

/** R82 / Q4-2: el cliente de la API pública de avisos sin sesión (`./api`). */
export type ApiPush = Pick<typeof apiReal, 'registrarAnonimo' | 'cambiarPreferenciasAnonimas'>

/** Las dependencias con efectos, todas opcionales (por defecto, las reales). */
export interface DependenciasPush {
  notificaciones?: ModuloNotificaciones
  supabase?: ClienteSupabase
  almacenamiento?: Almacenamiento
  reloj?: Reloj
  api?: ApiPush
}

interface DependenciasResueltas {
  notificaciones: ModuloNotificaciones
  supabase: ClienteSupabase
  almacenamiento: Almacenamiento
  reloj: Reloj
  api: ApiPush
}

function resolverDependencias(deps: DependenciasPush): DependenciasResueltas {
  return {
    notificaciones: deps.notificaciones ?? Notificaciones,
    supabase: deps.supabase !== undefined ? deps.supabase : supabaseReal,
    almacenamiento: deps.almacenamiento ?? { getItem: getItemReal, setItem: setItemReal, removeItem: removeItemReal },
    reloj: deps.reloj ?? { setTimeout, clearTimeout },
    api: deps.api ?? apiReal,
  }
}

/**
 * A lo sumo `code` o `name`: nunca `message` (puede traer contexto del
 * dispositivo) ni el valor que se está registrando. `etiqueta` es un texto
 * fijo (nunca lleva ese valor, para que un detector estático lo pueda
 * confirmar sin ambigüedad).
 */
function registrarFallaSinDato(etiqueta: string, error: unknown): void {
  const codigo = typeof (error as { code?: unknown })?.code === 'string' ? (error as { code: string }).code : undefined
  const nombre = typeof (error as { name?: unknown })?.name === 'string' ? (error as { name: string }).name : undefined
  console.warn(etiqueta, codigo ?? nombre ?? 'desconocido')
}

/** Arma una promesa que rechaza a los `ms` con `reloj`, y devuelve cómo limpiarla. */
function promesaTimeout(ms: number, reloj: Reloj): { promesa: Promise<never>; limpiar: () => void } {
  let temporizador: ReturnType<typeof setTimeout> | undefined
  const promesa = new Promise<never>((_resolve, reject) => {
    temporizador = reloj.setTimeout(() => reject(new Error('timeout-push')), ms)
  })
  return {
    promesa,
    limpiar: () => {
      if (temporizador !== undefined) reloj.clearTimeout(temporizador)
    },
  }
}

/**
 * `setNotificationChannelAsync('default', …)`, solo en Android y antes de
 * pedir el permiso o el token. No hace nada en otras plataformas.
 *
 * Nunca tira: el canal es solo para que el aviso se vea con nombre e
 * importancia propios (algo cosmético), no hace falta para obtener el
 * token ni para registrar en el servidor. Si falla, se loguea sin dato y se
 * sigue de largo (el aviso cae igual en el canal por defecto del sistema)
 * en vez de abortar `sincronizarPush` entero por un problema que no impide
 * que la persona reciba notificaciones.
 */
export async function prepararCanalAndroid(deps: DependenciasPush = {}): Promise<void> {
  if (plataformaPush(Platform.OS) !== 'android') return

  const { notificaciones } = resolverDependencias(deps)
  try {
    await notificaciones.setNotificationChannelAsync('default', {
      name: 'Qué Pinta Salta',
      importance: Notificaciones.AndroidImportance.DEFAULT,
    })
  } catch (error) {
    registrarFallaSinDato('[push] no se pudo preparar el canal de notificaciones de Android', error)
  }
}

/**
 * `requestPermissionsAsync()`. Se llama solo desde una acción de la
 * persona (el botón de "activar"), nunca al montar.
 *
 * Si la llamada nativa tira (un módulo mal linkeado, una Activity nula),
 * no es que "este teléfono no puede recibir notificaciones" (`no-disponible`,
 * que en Cuenta no deja botón): es que la propia pregunta del permiso
 * falló por algo transitorio del lado nativo. Se devuelve `error-registro`
 * a propósito, que deja el botón de "Reintentar" (intentarlo de nuevo puede
 * andar sin reinstalar nada).
 */
export async function pedirPermiso(deps: DependenciasPush = {}): Promise<EstadoPush> {
  const { notificaciones } = resolverDependencias(deps)
  try {
    const permiso = await notificaciones.requestPermissionsAsync()
    return estadoDesdePermiso({ status: permiso.status, canAskAgain: permiso.canAskAgain })
  } catch (error) {
    registrarFallaSinDato('[push] no se pudo pedir el permiso de notificaciones', error)
    return 'error-registro'
  }
}

export type ResultadoToken = { ok: true; token: string } | { ok: false }

/**
 * `getExpoPushTokenAsync({ projectId })`, con el `projectId` de
 * `Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId`.
 * Con un timeout a mano de `TIMEOUT_RED_MS` (igual que `lib/red.ts`: nada de
 * `AbortSignal.timeout`, que Hermes no garantiza, y `getExpoPushTokenAsync`
 * no acepta un `signal`). Cualquier excepción, timeout, falta de
 * `projectId` o plataforma que no es Android ni iOS da `{ ok: false }` (el
 * estado que arma `sincronizarPush` es `no-disponible`): nunca se tira.
 */
export async function obtenerToken(deps: DependenciasPush = {}): Promise<ResultadoToken> {
  if (!plataformaPush(Platform.OS)) return { ok: false }

  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId
  if (!projectId) return { ok: false }

  const { notificaciones, reloj } = resolverDependencias(deps)
  const { promesa: promesaTimeoutPush, limpiar } = promesaTimeout(TIMEOUT_RED_MS, reloj)

  try {
    const resultado = await Promise.race([notificaciones.getExpoPushTokenAsync({ projectId }), promesaTimeoutPush])
    return { ok: true, token: resultado.data }
  } catch (error) {
    registrarFallaSinDato('[push] no se pudo activar las notificaciones en este teléfono', error)
    return { ok: false }
  } finally {
    limpiar()
  }
}

export type ResultadoRegistro = 'activo' | 'error-registro'

/**
 * Registra el token de este teléfono (R41; R82 / Q4-2):
 *
 * 1. SIEMPRE, con o sin sesión: `POST /api/push/registrar` (la API pública,
 *    `./api`). Asegura el `device_id` de la fila (lo genera el servidor la
 *    primera vez y acá se guarda) y trae los interruptores sin cuenta.
 * 2. Con sesión (`conSesion`, por defecto `true`): además la RPC
 *    `register_push_token` (`p_token`, `p_platform`; nunca un `user_id`, lo
 *    toma de `auth.uid()`). Es el VÍNCULO con la cuenta: la misma fila pasa a
 *    tener `user_id`. Si la API del paso 1 falló, la RPC igual registra (como
 *    antes de la R82): con sesión, manda la RPC.
 *
 * Sin sesión, el resultado es el de la API. Si la persona eliminó su cuenta en
 * este teléfono (decisión 6), al registrarse sin cuenta se apagan los dos
 * interruptores; la marca se borra solo si el apagado salió bien.
 *
 * Si sale bien, guarda el token en SecureStore (best-effort). Nunca tira.
 */
export async function registrarToken(
  token: string,
  deps: DependenciasPush = {},
  { conSesion = true }: { conSesion?: boolean } = {},
): Promise<ResultadoRegistro> {
  const { supabase, almacenamiento, api } = resolverDependencias(deps)

  const plataforma = plataformaPush(Platform.OS)
  if (!plataforma) return 'error-registro'

  let anonimo: Awaited<ReturnType<ApiPush['registrarAnonimo']>> = { ok: false, motivo: 'red' }
  try {
    anonimo = await api.registrarAnonimo({ token, plataforma, deviceId: await leerDeviceId(almacenamiento), idioma: 'es' })
  } catch (excepcion) {
    registrarFallaSinDato('[push] falló el registro sin cuenta', excepcion)
  }
  if (anonimo.ok) {
    await guardarDeviceId(almacenamiento, anonimo.deviceId)
    if (anonimo.avisosEquipo !== null) {
      await guardarAvisosAnonimos(almacenamiento, {
        avisosEquipo: anonimo.avisosEquipo,
        avisosPatrocinados: anonimo.avisosPatrocinados === true,
      })
    }
  }

  if (!conSesion) {
    if (!anonimo.ok) return 'error-registro'
    if (await hayQueApagarTrasBaja(almacenamiento)) {
      try {
        const apagado = await api.cambiarPreferenciasAnonimas({
          token,
          deviceId: anonimo.deviceId,
          avisosEquipo: false,
          avisosPatrocinados: false,
        })
        if (apagado.ok) {
          await marcarApagarTrasBaja(almacenamiento, false)
          await guardarAvisosAnonimos(almacenamiento, { avisosEquipo: false, avisosPatrocinados: false })
        }
      } catch (excepcion) {
        registrarFallaSinDato('[push] no se pudieron apagar los avisos tras eliminar la cuenta', excepcion)
      }
    }
  } else {
    if (!supabase) return 'error-registro'
    try {
      const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: plataforma })
      if (error) return 'error-registro'
    } catch (excepcion) {
      registrarFallaSinDato('[push] falló el registro en el servidor', excepcion)
      return 'error-registro'
    }
  }

  try {
    await almacenamiento.setItem(CLAVE_TOKEN_PUSH, token)
  } catch {
    // Best-effort: guardar el token no puede tumbar un registro que ya
    // salió bien en el servidor (trampa 2 del encargo).
  }

  return 'activo'
}

/**
 * R82 / Q4-2: al cerrar sesión. Llama a la RPC `unlink_push_token` con el
 * token guardado: la fila del teléfono NO se borra, queda sin cuenta
 * (conserva el `device_id`, copia los avisos del equipo de la cuenta y deja
 * los patrocinados en `false`, decisión 7). El token guardado se conserva
 * (sigue siendo el de este teléfono).
 *
 * Si la RPC falla (sin red, una base vieja sin la función), cae al borrado de
 * antes (`borrarTokenDeEsteTelefono`) para que un teléfono compartido no siga
 * recibiendo los avisos de la cuenta anterior. Nunca tira.
 */
export async function desvincularTokenDeEsteTelefono(deps: DependenciasPush = {}): Promise<ResultadoBorrado> {
  const { supabase, almacenamiento, reloj } = resolverDependencias(deps)

  let tokenGuardado: string | null = null
  try {
    tokenGuardado = await almacenamiento.getItem(CLAVE_TOKEN_PUSH)
  } catch {
    tokenGuardado = null
  }
  if (!tokenGuardado) return 'ok'
  if (!supabase) return borrarTokenDeEsteTelefono(deps)

  const { promesa: promesaTimeoutDesvinculo, limpiar } = promesaTimeout(TIMEOUT_RED_MS, reloj)
  try {
    const { error } = await Promise.race([
      supabase.rpc('unlink_push_token', { p_token: tokenGuardado }),
      promesaTimeoutDesvinculo,
    ])
    if (error) return borrarTokenDeEsteTelefono(deps)
  } catch {
    return borrarTokenDeEsteTelefono(deps)
  } finally {
    limpiar()
  }

  // Los interruptores sin cuenta cambiaron en el servidor: el próximo
  // registro (justo después del signOut) trae los nuevos.
  await guardarAvisosAnonimos(almacenamiento, null)
  return 'ok'
}

export type ResultadoBorrado = 'ok' | 'error'

/**
 * Nunca tira (lo usa 41-e, antes del `signOut`). Lee el token guardado y
 * borra la fila por `token` (RLS del dueño), con timeout. Después borra
 * siempre la clave de SecureStore (best-effort). Sin token guardado, no
 * llama a Supabase y devuelve `ok`.
 */
export async function borrarTokenDeEsteTelefono(deps: DependenciasPush = {}): Promise<ResultadoBorrado> {
  const { supabase, almacenamiento, reloj } = resolverDependencias(deps)

  let tokenGuardado: string | null = null
  try {
    tokenGuardado = await almacenamiento.getItem(CLAVE_TOKEN_PUSH)
  } catch {
    tokenGuardado = null
  }

  let resultado: ResultadoBorrado = 'ok'

  if (tokenGuardado) {
    if (!supabase) {
      resultado = 'error'
    } else {
      const { promesa: promesaTimeoutBorrado, limpiar } = promesaTimeout(TIMEOUT_RED_MS, reloj)
      try {
        const { error } = await Promise.race([
          supabase.from('push_tokens').delete().eq('token', tokenGuardado),
          promesaTimeoutBorrado,
        ])
        if (error) resultado = 'error'
      } catch {
        resultado = 'error'
      } finally {
        limpiar()
      }
    }
  }

  try {
    await almacenamiento.removeItem(CLAVE_TOKEN_PUSH)
  } catch {
    // Best-effort: nunca tira (contrato de la tarea, la usa 41-e antes del signOut).
  }

  return resultado
}

/**
 * Encadena todo:
 * - con `preguntar: false` (al arrancar con sesión), solo lee el permiso
 *   (`getPermissionsAsync`, nunca `requestPermissionsAsync`): si no está
 *   concedido, devuelve `sin-pedir`, `denegado` o `bloqueado` sin preguntar
 *   nada;
 * - con `preguntar: true` (el botón), pide el permiso
 *   (`requestPermissionsAsync`);
 * - si en cualquiera de los dos casos el permiso queda concedido: canal,
 *   token y registro.
 *
 * Nunca tira: `pedirPermiso` y `obtenerToken` ya se protegen a sí mismas
 * (y deciden su propio estado de falla), `prepararCanalAndroid` nunca
 * propaga nada, y el `getPermissionsAsync` de acá abajo tiene su propio
 * `try/catch` (no se delegó a una función aparte porque es la única
 * llamada nativa que vive directamente en el cuerpo de `sincronizarPush`,
 * no en una función con nombre propio como las otras tres).
 */
export async function sincronizarPush(
  { preguntar, conSesion = true }: { preguntar: boolean; conSesion?: boolean },
  deps: DependenciasPush = {}
): Promise<EstadoPush> {
  const { notificaciones } = resolverDependencias(deps)

  let estadoPermiso: EstadoPush
  if (preguntar) {
    estadoPermiso = await pedirPermiso(deps)
  } else {
    try {
      const permiso = await notificaciones.getPermissionsAsync()
      estadoPermiso = estadoDesdePermiso({ status: permiso.status, canAskAgain: permiso.canAskAgain })
    } catch (error) {
      // Misma razón que en `pedirPermiso`: leer el permiso actual falló
      // por algo del lado nativo (no porque el teléfono no admita push).
      // `error-registro` deja el botón de "Reintentar"; `no-disponible`
      // (sin botón) lo dejaría sin salida, y no atrapar nada congelaría
      // `estadoSincronizado` en `'sin-pedir'` para siempre (la trampa que
      // reportó el revisor).
      registrarFallaSinDato('[push] no se pudo leer el permiso de notificaciones', error)
      return 'error-registro'
    }
  }

  if (estadoPermiso !== 'activo') return estadoPermiso

  await prepararCanalAndroid(deps)
  const token = await obtenerToken(deps)
  if (!token.ok) return 'no-disponible'

  return registrarToken(token.token, deps, { conSesion })
}

export type ResultadoCambioAvisos = { ok: true; avisos: { avisosEquipo: boolean; avisosPatrocinados: boolean } } | { ok: false }

/**
 * R82 / Q4-2: prende o apaga los avisos del equipo o los patrocinados de este
 * teléfono SIN cuenta (`POST /api/push/preferencias` con el token y el
 * `device_id` guardados). Si sale bien, guarda el nuevo estado. Sin token o
 * sin `device_id` guardado (nunca se registró), `{ ok: false }`. Nunca tira.
 */
export async function cambiarAvisosDeEsteTelefono(
  cambio: { avisosEquipo?: boolean; avisosPatrocinados?: boolean },
  deps: DependenciasPush = {},
): Promise<ResultadoCambioAvisos> {
  const { almacenamiento, api } = resolverDependencias(deps)
  let token: string | null = null
  try {
    token = await almacenamiento.getItem(CLAVE_TOKEN_PUSH)
  } catch {
    token = null
  }
  const deviceId = await leerDeviceId(almacenamiento)
  if (!token || !deviceId) return { ok: false }

  try {
    const resultado = await api.cambiarPreferenciasAnonimas({ token, deviceId, ...cambio })
    if (!resultado.ok) return { ok: false }
  } catch (excepcion) {
    registrarFallaSinDato('[push] no se pudieron cambiar los avisos sin cuenta', excepcion)
    return { ok: false }
  }
  const anteriores = (await leerAvisosAnonimos(almacenamiento)) ?? { avisosEquipo: true, avisosPatrocinados: false }
  const avisos = {
    avisosEquipo: cambio.avisosEquipo ?? anteriores.avisosEquipo,
    avisosPatrocinados: cambio.avisosPatrocinados ?? anteriores.avisosPatrocinados,
  }
  await guardarAvisosAnonimos(almacenamiento, avisos)
  return { ok: true, avisos }
}

/** R82 / Q4-2: el último estado guardado de los interruptores sin cuenta (`null` si no hay). */
export function avisosGuardadosDeEsteTelefono(deps: DependenciasPush = {}) {
  return leerAvisosAnonimos(resolverDependencias(deps).almacenamiento)
}
