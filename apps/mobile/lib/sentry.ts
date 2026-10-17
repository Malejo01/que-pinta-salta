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

// `eyJ` es la cabecera típica de un JWT (es el base64 de `{"`, con el que
// arranca cualquier header/payload JSON). Para no comerse una palabra que
// por casualidad empiece así:
//   - `(?<![A-Za-z0-9_-])` / `(?![A-Za-z0-9_-])`: "eyJ" tiene que ser el
//     arranque/final de una tanda de base64url, no estar metido en medio de
//     una palabra más larga (ej. "leyJudicial.penal.civil": la "J" viene
//     pegada a "ley", no hay límite real ahí).
//   - `{15,}` en el primer tramo: un header real (`{"alg":"HS256",...}` en
//     base64) tiene bastante más de 15 caracteres después de "eyJ"; una
//     palabra corta que arranque con "eyJ" por casualidad (ej.
//     "eyJardin.deflores.2024") no llega a ese largo y no matchea.
//   - tres tramos separados por puntos, cada uno solo con el alfabeto
//     base64url (letras, números, `-`, `_`): nada de espacios ni símbolos
//     que no aparezcan en un JWT real.
const PATRON_JWT =
  /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{6,}(?![A-Za-z0-9_-])/g

// Claves que, sin importar qué tengan adentro, se reemplazan directo por
// `[token]` (no hace falta mirar el valor: el nombre de la clave ya dice que
// es un secreto de sesión).
const CLAVES_TOKEN = new Set(['id_token', 'access_token', 'refresh_token'])

// Las mismas tres claves, pero como parámetro de query string o de fragmento
// (`?access_token=…`, `&id_token=…`, `#access_token=…`: el flujo implícito
// de OAuth devuelve el token en el fragmento de la URL, después del `#`):
// se reemplaza solo el valor, separador y clave quedan igual.
const PATRON_QUERY_TOKEN = /([?&#](?:id_token|access_token|refresh_token)=)[^&\s]+/g

function sinEmail<T extends string | undefined>(texto: T): T {
  if (typeof texto !== 'string') return texto
  return texto.replace(PATRON_EMAIL, '[email]') as T
}

function sinJwt<T extends string | undefined>(texto: T): T {
  if (typeof texto !== 'string') return texto
  return texto.replace(PATRON_JWT, '[jwt]') as T
}

function sinTokenDeQuery<T extends string | undefined>(texto: T): T {
  if (typeof texto !== 'string') return texto
  return texto.replace(PATRON_QUERY_TOKEN, '$1[token]') as T
}

/** Email, luego token de query/fragmento, luego JWT; no se pisan entre sí. */
function sanear<T extends string | undefined>(texto: T): T {
  if (typeof texto !== 'string') return texto
  return sinJwt(sinTokenDeQuery(sinEmail(texto))) as T
}

function limpiarBreadcrumb(miga: Breadcrumb): Breadcrumb {
  const limpia: Breadcrumb = { ...miga, message: sanear(miga.message) }
  if (limpia.data) {
    limpia.data = limpiarCadenasSuperficiales(limpia.data as Record<string, unknown>)
  }
  return limpia
}

/**
 * Transforma, sin mutar, los valores de un nivel (no recorre objetos
 * anidados: no hace falta para `extra`/`tags`/`data`/`user`, que son
 * planos). Las claves de `CLAVES_TOKEN` se reemplazan enteras por
 * `[token]`; el resto de los valores `string` pasa por `sanear`.
 *
 * Es de un solo nivel a propósito: hoy ningún `extra`/`user`/
 * `breadcrumb.data` de la app mete un objeto anidado (el único call site es
 * `lib/google.ts`, con `tags` plano y tipado `Record<string, Primitive>`), y
 * esta función tampoco se usa sobre `event.contexts` ni `event.request`
 * (quedan sin tocar). Si el día de mañana se agrega un `setExtra`/
 * `setContext` con un objeto anidado, o se empieza a sanear `contexts`/
 * `request`, esto hay que revisarlo de nuevo (no asumir que ya está
 * cubierto).
 */
function limpiarCadenasSuperficiales<V>(objeto: Record<string, V>): Record<string, V> {
  const limpio: Record<string, V> = { ...objeto }
  for (const clave of Object.keys(limpio)) {
    if (CLAVES_TOKEN.has(clave)) {
      limpio[clave] = '[token]' as V
      continue
    }
    const valor = limpio[clave]
    if (typeof valor === 'string') limpio[clave] = sanear(valor) as V
  }
  return limpio
}

/**
 * Pura. Saca `user.email`, `user.ip_address`, `user.username` y cualquier
 * email, JWT o token que aparezca en `message`, en `exception.values[].value`
 * (ahí es donde Sentry guarda el texto de una excepción capturada; `message`
 * suele venir vacío en ese caso), en las `breadcrumbs`, en los valores
 * `string` de `extra`/`tags`/resto de `user`, o como `?access_token=…` /
 * `&id_token=…` en cualquiera de esos campos, antes de que Sentry mande el
 * evento.
 */
export function beforeSend(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  const limpio: ErrorEvent = { ...event }

  if (limpio.user) {
    const usuario = { ...limpio.user }
    delete usuario.email
    delete usuario.ip_address
    delete usuario.username
    limpio.user = limpiarCadenasSuperficiales(usuario as Record<string, unknown>)
  }

  limpio.message = sanear(limpio.message)

  const excepcion = limpio.exception
  if (excepcion?.values) {
    limpio.exception = {
      ...excepcion,
      // `type` es el nombre de la clase de error: no se toca, solo `value`.
      values: excepcion.values.map((item) => ({ ...item, value: sanear(item.value) })),
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
