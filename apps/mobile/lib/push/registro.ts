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
import * as Notificaciones from 'expo-notifications'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@qps/db'
import { supabase as supabaseReal } from '@/lib/supabase'
import { getItem as getItemReal, removeItem as removeItemReal, setItem as setItemReal } from '@/lib/secure-storage'
import { TIMEOUT_RED_MS } from '@/lib/red'
import { estadoDesdePermiso, plataformaPush, type EstadoPush } from './estado'

/** Clave de SecureStore donde se guarda el último token de push registrado en este teléfono. */
export const CLAVE_TOKEN_PUSH = 'push-token'

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

/** Las cuatro dependencias con efectos, todas opcionales (por defecto, las reales). */
export interface DependenciasPush {
  notificaciones?: ModuloNotificaciones
  supabase?: ClienteSupabase
  almacenamiento?: Almacenamiento
  reloj?: Reloj
}

interface DependenciasResueltas {
  notificaciones: ModuloNotificaciones
  supabase: ClienteSupabase
  almacenamiento: Almacenamiento
  reloj: Reloj
}

function resolverDependencias(deps: DependenciasPush): DependenciasResueltas {
  return {
    notificaciones: deps.notificaciones ?? Notificaciones,
    supabase: deps.supabase !== undefined ? deps.supabase : supabaseReal,
    almacenamiento: deps.almacenamiento ?? { getItem: getItemReal, setItem: setItemReal, removeItem: removeItemReal },
    reloj: deps.reloj ?? { setTimeout, clearTimeout },
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
 */
export async function prepararCanalAndroid(deps: DependenciasPush = {}): Promise<void> {
  if (plataformaPush(Platform.OS) !== 'android') return

  const { notificaciones } = resolverDependencias(deps)
  await notificaciones.setNotificationChannelAsync('default', {
    name: 'Qué Pinta Salta',
    importance: Notificaciones.AndroidImportance.DEFAULT,
  })
}

/**
 * `requestPermissionsAsync()`. Se llama solo desde una acción de la
 * persona (el botón de "activar"), nunca al montar.
 */
export async function pedirPermiso(deps: DependenciasPush = {}): Promise<EstadoPush> {
  const { notificaciones } = resolverDependencias(deps)
  const permiso = await notificaciones.requestPermissionsAsync()
  return estadoDesdePermiso({ status: permiso.status, canAskAgain: permiso.canAskAgain })
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
 * `supabase.rpc('register_push_token', { p_token, p_platform })`. Nunca un
 * `insert`/`upsert` directo en `push_tokens`, y nunca un `user_id` (lo toma
 * la RPC de `auth.uid()`). Si sale bien, guarda el token en SecureStore
 * (best-effort: si falla ese guardado, el registro en el servidor ya salió
 * bien, así que no se tumba por eso). Si la RPC falla (o no hay `supabase`
 * configurado), da `error-registro`.
 */
export async function registrarToken(token: string, deps: DependenciasPush = {}): Promise<ResultadoRegistro> {
  const { supabase, almacenamiento } = resolverDependencias(deps)
  if (!supabase) return 'error-registro'

  const plataforma = plataformaPush(Platform.OS)
  if (!plataforma) return 'error-registro'

  try {
    const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: plataforma })
    if (error) return 'error-registro'
  } catch (excepcion) {
    registrarFallaSinDato('[push] falló el registro en el servidor', excepcion)
    return 'error-registro'
  }

  try {
    await almacenamiento.setItem(CLAVE_TOKEN_PUSH, token)
  } catch {
    // Best-effort: guardar el token no puede tumbar un registro que ya
    // salió bien en el servidor (trampa 2 del encargo).
  }

  return 'activo'
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
 */
export async function sincronizarPush(
  { preguntar }: { preguntar: boolean },
  deps: DependenciasPush = {}
): Promise<EstadoPush> {
  const { notificaciones } = resolverDependencias(deps)

  let estadoPermiso: EstadoPush
  if (preguntar) {
    estadoPermiso = await pedirPermiso(deps)
  } else {
    const permiso = await notificaciones.getPermissionsAsync()
    estadoPermiso = estadoDesdePermiso({ status: permiso.status, canAskAgain: permiso.canAskAgain })
  }

  if (estadoPermiso !== 'activo') return estadoPermiso

  await prepararCanalAndroid(deps)
  const token = await obtenerToken(deps)
  if (!token.ok) return 'no-disponible'

  return registrarToken(token.token, deps)
}
