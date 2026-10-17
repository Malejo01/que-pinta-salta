// Ronda 41, tarea 41-c: el estado de push, puro (sin imports de React Native
// ni de Expo), para que se pueda probar sin dobles y para que `registro.ts`
// e `index.tsx` compartan el mismo vocabulario.
//
// QPS-113 no está confirmado: ningún texto de abajo lleva cifras de topes ni
// horarios.

/**
 * - `sin-sesion`: no hay persona logueada (push no aplica).
 * - `sin-pedir`: el permiso todavía no se preguntó.
 * - `pidiendo`: se está preguntando (UI, mientras corre `sincronizarPush`).
 * - `denegado`: la persona dijo que no, pero se le puede volver a preguntar.
 * - `bloqueado`: la persona dijo que no dos veces (o "no preguntar de
 *   nuevo"): no se puede volver a preguntar, hay que ir a los ajustes del
 *   sistema.
 * - `no-disponible`: el permiso está concedido pero no hay token (sin FCM,
 *   timeout, o una plataforma que no es Android ni iOS).
 * - `error-registro`: el permiso está concedido, hay token, pero falló la
 *   RPC de registro o no hay red.
 * - `activo`: permiso concedido, token obtenido y registrado en el server.
 */
export type EstadoPush =
  | 'sin-sesion'
  | 'sin-pedir'
  | 'pidiendo'
  | 'denegado'
  | 'bloqueado'
  | 'no-disponible'
  | 'error-registro'
  | 'activo'

/** Un texto corto en voseo por estado, para mostrar en Cuenta. */
export const TEXTOS_PUSH: Record<EstadoPush, string> = {
  'sin-sesion': 'Iniciá sesión para activar las notificaciones.',
  'sin-pedir': 'Activá las notificaciones para enterarte de las novedades.',
  pidiendo: 'Pidiendo el permiso...',
  denegado: 'No activaste las notificaciones. Podés intentarlo de nuevo cuando quieras.',
  bloqueado: 'Tenés las notificaciones bloqueadas para esta app. Activalas desde los ajustes del teléfono.',
  'no-disponible': 'Por ahora este teléfono no puede recibir notificaciones de la app.',
  'error-registro': 'No pudimos activar las notificaciones. Probá de nuevo.',
  activo: 'Las notificaciones están activas en este teléfono.',
}

/** La parte de `PermissionResponse` (expo-notifications) que necesita `estadoDesdePermiso`. */
export interface PermisoPush {
  status: 'granted' | 'denied' | 'undetermined'
  canAskAgain: boolean
}

/**
 * `granted` da `activo` (`registro.ts` lo puede pisar después con
 * `no-disponible` o `error-registro` si el token o la RPC fallan).
 * `denied` con `canAskAgain` da `denegado`, y sin `canAskAgain` da
 * `bloqueado`. `undetermined` da `sin-pedir`.
 */
export function estadoDesdePermiso({
  status,
  canAskAgain,
}: PermisoPush): 'activo' | 'denegado' | 'bloqueado' | 'sin-pedir' {
  if (status === 'granted') return 'activo'
  if (status === 'denied') return canAskAgain ? 'denegado' : 'bloqueado'
  return 'sin-pedir'
}

/** `'android' | 'ios' | null`. Cualquier otro valor de `Platform.OS` (p.ej. `'web'`) da `null`. */
export function plataformaPush(os: string): 'android' | 'ios' | null {
  return os === 'android' || os === 'ios' ? os : null
}
