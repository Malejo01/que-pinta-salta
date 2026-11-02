// Login con Google (28-h, F8, Ronda 28): saber por qué falla, sin mandar
// nunca datos personales a ningún lado. El código de error de
// @react-native-google-signin/google-signin es lo único que sale de la app
// hacia Sentry; nunca `message`, email, nombre ni token.
//
// `codigoErrorGoogle` y `eventoErrorGoogle` son puras (no llaman a Sentry ni
// a console): las prueba 28-q sin red ni mocks del SDK nativo más allá de
// `isErrorWithCode`. `registrarErrorGoogle` es el único punto que de verdad
// llama a Sentry/console, y solo con el código.
import * as Sentry from '@sentry/react-native'
import { isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin'
import { leerEnv } from '@/lib/env'

const MENSAJE_PLAY_SERVICES = 'Actualizá los servicios de Google Play.'
const MENSAJE_GENERICO_GOOGLE = 'No se pudo completar el ingreso con Google. Probá de nuevo o entrá con tu email.'

/**
 * El código de error de un intento de login con Google, como string, o
 * `null` si `error` no es un error con `code` (`isErrorWithCode` de la
 * librería). Pura.
 */
export function codigoErrorGoogle(error: unknown): string | null {
  if (!isErrorWithCode(error)) return null
  return String(error.code)
}

/**
 * Q4-4: qué tipo de falla es, para decidir qué ve la persona y qué va a
 * Sentry. Los códigos de Android vienen de `CommonStatusCodes` /
 * `GoogleSignInStatusCodes` (como string) y los de la librería, de
 * `statusCodes`:
 *  - `cancelado`: la persona cerró la ventana (12501, 16 o `SIGN_IN_CANCELLED`).
 *    No es un error: no se reporta ni se muestra nada.
 *  - `en-curso`: ya había un ingreso abierto (`IN_PROGRESS`). No se reporta.
 *  - `sin-red`: 7 (`NETWORK_ERROR`). Se le pide revisar la conexión; no se reporta.
 *  - `play-services`: faltan o están viejos los servicios de Google Play.
 *  - `configuracion`: 10 (`DEVELOPER_ERROR`: la huella SHA-1 de la firma o el
 *    `webClientId` no coinciden con la consola de Google), 12500
 *    (`SIGN_IN_FAILED`, casi siempre lo mismo) o `NULL_PRESENTER`. Es NUESTRO
 *    problema: va a Sentry como error, con el código.
 *  - `otro`: cualquier otro código (por ejemplo 8, `INTERNAL_ERROR`) o una
 *    excepción sin código. Va a Sentry como aviso.
 */
export type TipoErrorGoogle = 'cancelado' | 'en-curso' | 'sin-red' | 'play-services' | 'configuracion' | 'otro'

const CODIGOS_CANCELADO = new Set(['12501', '16', 'SIGN_IN_CANCELLED'])
const CODIGOS_CONFIGURACION = new Set(['10', 'DEVELOPER_ERROR', '12500', 'NULL_PRESENTER'])

/** Pura: el tipo de falla según el código (`codigoErrorGoogle`). */
export function tipoErrorGoogle(codigo: string | null): TipoErrorGoogle {
  if (codigo === null) return 'otro'
  if (codigo === statusCodes.SIGN_IN_CANCELLED || CODIGOS_CANCELADO.has(codigo)) return 'cancelado'
  if (codigo === statusCodes.IN_PROGRESS || codigo === 'IN_PROGRESS') return 'en-curso'
  if (codigo === statusCodes.PLAY_SERVICES_NOT_AVAILABLE || codigo === 'PLAY_SERVICES_NOT_AVAILABLE') return 'play-services'
  if (codigo === '7' || codigo === 'NETWORK_ERROR') return 'sin-red'
  if (CODIGOS_CONFIGURACION.has(codigo)) return 'configuracion'
  return 'otro'
}

export interface EventoErrorGoogle {
  mensaje: string
  nivel: 'error' | 'warning'
  tags: { codigo: string; tipo: TipoErrorGoogle }
  /** Agrupa en Sentry por tipo y código, no por la línea del stack. */
  fingerprint: string[]
}

/**
 * Arma el evento que se manda a Sentry, o `null` si esa falla no se reporta
 * (cancelado, en curso, sin red). Pura: solo el código y el tipo — nunca
 * `message`, email, nombre ni token.
 */
export function eventoErrorGoogle(codigo: string | null): EventoErrorGoogle | null {
  const tipo = tipoErrorGoogle(codigo)
  if (tipo === 'cancelado' || tipo === 'en-curso' || tipo === 'sin-red') return null
  const codigoTag = codigo ?? 'sin-codigo'
  return {
    mensaje: tipo === 'configuracion' ? 'google_signin_configuracion' : 'google_signin_error',
    nivel: tipo === 'configuracion' ? 'error' : 'warning',
    tags: { codigo: codigoTag, tipo },
    fingerprint: ['google-signin', tipo, codigoTag],
  }
}

/**
 * Registra un intento fallido de login con Google: a Sentry (solo si hay DSN)
 * con `captureMessage`, nivel, tags y fingerprint; por `console.warn` solo en
 * `__DEV__`. La cancelación, un ingreso en curso y la falta de red no se
 * reportan. Nunca manda `message`, email, nombre ni token.
 */
export function registrarErrorGoogle(error: unknown): void {
  const codigo = codigoErrorGoogle(error)
  const evento = eventoErrorGoogle(codigo)

  if (__DEV__) {
    console.warn('[google-signin] código de error:', codigo ?? 'sin-codigo', tipoErrorGoogle(codigo))
  }
  if (!evento) return

  if (leerEnv().sentryDsn) {
    Sentry.captureMessage(evento.mensaje, { level: evento.nivel, tags: evento.tags, fingerprint: evento.fingerprint })
  }
}

export const MENSAJE_GOOGLE_SIN_RED = 'No hay conexión. Revisá tu internet y probá de nuevo con Google.'
export const MENSAJE_GOOGLE_CONFIGURACION =
  'El ingreso con Google no está disponible en este momento. Probá de nuevo más tarde o entrá con tu email.'
export const MENSAJE_GOOGLE_EN_CURSO = 'Ya hay un ingreso con Google abierto. Terminalo o cerralo y probá de nuevo.'

/**
 * El mensaje que ve la persona según el código, o `null` si no hay que
 * mostrar nada (canceló). Pura. Siempre deja salida: reintentar o usar email.
 */
export function mensajeErrorGoogle(codigo: string | null): string | null {
  switch (tipoErrorGoogle(codigo)) {
    case 'cancelado':
      return null
    case 'en-curso':
      return MENSAJE_GOOGLE_EN_CURSO
    case 'sin-red':
      return MENSAJE_GOOGLE_SIN_RED
    case 'play-services':
      return MENSAJE_PLAY_SERVICES
    case 'configuracion':
      return MENSAJE_GOOGLE_CONFIGURACION
    default:
      return MENSAJE_GENERICO_GOOGLE
  }
}
