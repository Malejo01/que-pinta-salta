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
const MENSAJE_GENERICO_GOOGLE = 'No se pudo completar el ingreso con Google. Probá de nuevo.'

/**
 * El código de error de un intento de login con Google, como string, o
 * `null` si `error` no es un error con `code` (`isErrorWithCode` de la
 * librería). Pura.
 */
export function codigoErrorGoogle(error: unknown): string | null {
  if (!isErrorWithCode(error)) return null
  return String(error.code)
}

export interface EventoErrorGoogle {
  mensaje: string
  tags: { codigo: string }
}

/**
 * Arma el evento que se manda a Sentry a partir del código de error. Pura:
 * no llama a Sentry ni a console, no recibe ni devuelve nada más que el
 * código — nunca `message`, email, nombre ni token.
 */
export function eventoErrorGoogle(codigo: string): EventoErrorGoogle {
  return { mensaje: 'google_signin_error', tags: { codigo } }
}

/**
 * Registra el código de error de un intento de login con Google: a Sentry
 * (solo si hay DSN configurado, es decir, Sentry está activo) con
 * `Sentry.captureMessage` y las `tags`, y por `console.warn` solo en
 * `__DEV__`. Nunca manda `message`, email, nombre ni token. Si `error` no
 * tiene código (no es un error de la librería), no hace nada.
 */
export function registrarErrorGoogle(error: unknown): void {
  const codigo = codigoErrorGoogle(error)
  if (codigo === null) return

  if (__DEV__) {
    console.warn('[google-signin] código de error:', codigo)
  }

  if (leerEnv().sentryDsn) {
    const evento = eventoErrorGoogle(codigo)
    Sentry.captureMessage(evento.mensaje, { tags: evento.tags })
  }
}

/**
 * El mensaje que ve el usuario según el código de error. Pura. Con
 * `PLAY_SERVICES_NOT_AVAILABLE`, pide actualizar Google Play; con
 * `DEVELOPER_ERROR` (puede llegar como `"10"` o `"DEVELOPER_ERROR"`), con un
 * código desconocido o con `null` (sin código), el mensaje es genérico.
 */
export function mensajeErrorGoogle(codigo: string | null): string {
  if (codigo === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) return MENSAJE_PLAY_SERVICES
  return MENSAJE_GENERICO_GOOGLE
}
