// Sentry detrás de EXPO_PUBLIC_SENTRY_DSN (R24): sin DSN no se inicializa
// nada. `sendDefaultPii: false` y `beforeSend` sacan cualquier dato personal
// antes de que el evento salga del teléfono.
//
// `beforeSend` es pura: no llama a ninguna función de `@sentry/react-native`,
// solo transforma el evento que le pasan. El import de `@sentry/react-native`
// queda a nivel de módulo (lo necesita `inicializarSentry`); si 24-c prueba
// este archivo con un doble del paquete (como hace secure-storage.ts con
// `expo-secure-store`), `beforeSend` sigue siendo pura y no depende de que el
// doble implemente nada más que los tipos.
import * as Sentry from '@sentry/react-native'
import type { EventHint } from '@sentry/core'

type ErrorEvent = Sentry.ErrorEvent
type Breadcrumb = Sentry.Breadcrumb

const PATRON_EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi

function sinEmail<T extends string | undefined>(texto: T): T {
  if (typeof texto !== 'string') return texto
  return texto.replace(PATRON_EMAIL, '[email]') as T
}

function limpiarBreadcrumb(miga: Breadcrumb): Breadcrumb {
  const limpia: Breadcrumb = { ...miga, message: sinEmail(miga.message) }
  if (limpia.data) {
    const data: Record<string, unknown> = {}
    for (const [clave, valor] of Object.entries(limpia.data)) {
      data[clave] = typeof valor === 'string' ? sinEmail(valor) : valor
    }
    limpia.data = data
  }
  return limpia
}

/**
 * Transforma, sin mutar, los valores `string` de un nivel (no recorre
 * objetos anidados: no hace falta para `extra`/`tags`, que son planos).
 */
function limpiarCadenasSuperficiales<V>(objeto: Record<string, V>): Record<string, V> {
  const limpio: Record<string, V> = { ...objeto }
  for (const clave of Object.keys(limpio)) {
    const valor = limpio[clave]
    if (typeof valor === 'string') limpio[clave] = sinEmail(valor) as V
  }
  return limpio
}

/**
 * Pura. Saca `user.email`, `user.ip_address`, `user.username` y cualquier
 * email que aparezca en `message`, en `exception.values[].value` (ahí es
 * donde Sentry guarda el texto de una excepción capturada; `message` suele
 * venir vacío en ese caso), en las `breadcrumbs` o en los valores `string`
 * de `extra`/`tags`, antes de que Sentry mande el evento.
 */
export function beforeSend(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  const limpio: ErrorEvent = { ...event }

  if (limpio.user) {
    const usuario = { ...limpio.user }
    delete usuario.email
    delete usuario.ip_address
    delete usuario.username
    limpio.user = usuario
  }

  limpio.message = sinEmail(limpio.message)

  const excepcion = limpio.exception
  if (excepcion?.values) {
    limpio.exception = {
      ...excepcion,
      // `type` es el nombre de la clase de error: no se toca, solo `value`.
      values: excepcion.values.map((item) => ({ ...item, value: sinEmail(item.value) })),
    }
  }

  if (Array.isArray(limpio.breadcrumbs)) {
    limpio.breadcrumbs = limpio.breadcrumbs.map(limpiarBreadcrumb)
  }

  if (limpio.extra) {
    limpio.extra = limpiarCadenasSuperficiales(limpio.extra)
  }

  if (limpio.tags) {
    limpio.tags = limpiarCadenasSuperficiales(limpio.tags)
  }

  return limpio
}

/**
 * Inicializa Sentry solo si hay DSN. Devuelve si quedó inicializado, para
 * que `_layout.tsx` decida si envuelve la app con `Sentry.wrap` o no.
 */
export function inicializarSentry(dsn: string | null): boolean {
  if (!dsn) return false
  Sentry.init({ dsn, sendDefaultPii: false, beforeSend })
  return true
}
