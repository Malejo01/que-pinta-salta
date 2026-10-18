// Timeout de red para el cliente de Supabase (28-a). Sin esto, una llamada
// que nunca responde (red caída a mitad de camino, por ejemplo) deja a la
// app "cargando" para siempre.
//
// Nada de `AbortSignal.timeout` ni `AbortSignal.any`: no está garantizado
// que existan en Hermes (el motor de JS de React Native). Se construye el
// `AbortController` + `setTimeout` a mano.

/** 15 segundos: alcanzan para el uso normal de la app, incluido el refresco del token. */
export const TIMEOUT_RED_MS = 15000

type Fetch = typeof fetch

/**
 * Devuelve una función con la forma de `fetch` que corta la llamada a los
 * `ms` milisegundos. Si la llamada ya trae su propio `signal`, se respeta:
 * si ese signal se aborta (o ya viene abortado), la llamada se corta igual.
 * El timer se limpia siempre, haya cortado o no.
 */
export function fetchConTimeout(fetchBase: Fetch, ms: number): Fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const controlador = new AbortController()
    const signalExterno = init?.signal ?? null

    const abortar = () => controlador.abort()

    if (signalExterno) {
      if (signalExterno.aborted) abortar()
      else signalExterno.addEventListener('abort', abortar)
    }

    const temporizador = setTimeout(abortar, ms)

    try {
      return await fetchBase(input, { ...init, signal: controlador.signal })
    } finally {
      clearTimeout(temporizador)
      if (signalExterno) signalExterno.removeEventListener('abort', abortar)
    }
  }) as Fetch
}

/**
 * Detecta "sin conexión" sin `netinfo` (R43, plan §1): se mira el resultado
 * de la llamada, nunca el estado del dispositivo. Pura, y nunca tira —
 * recibe `unknown` a propósito porque `lib/favoritos.ts` tiene ramas
 * `Promise.resolve({ data: [], error: null })` sin `status`, y cualquier
 * excepción atrapada con `catch` puede ser cualquier cosa.
 *
 * `true` si:
 * - es una respuesta con `error` presente y `status === 0`: la forma que
 *   devuelve postgrest-js 2.106 cuando el `fetch` rechaza (modo avión, DNS)
 *   o se corta por el timeout de `fetchConTimeout` — nunca hay respuesta
 *   HTTP real;
 * - o es (o tiene la forma de) un `TypeError` cuyo mensaje matchea
 *   `/Network request failed/i` (el `fetch` de React Native en modo avión);
 * - o tiene `name === 'AbortError'` (el `AbortController` de
 *   `fetchConTimeout`, o cualquier otro abort).
 *
 * `false` si: el `status` es HTTP (>= 100, cualquier 2xx a 5xx — un 5xx de
 * Supabase es "propuesta sin confirmar", R43: muestra el error de siempre,
 * no la caché), si el error trae un `code` de PostgREST no vacío
 * (`PGRST116`, `42501`, `PGRST205`...), o si `valor` es `null`, `undefined`,
 * un string, un número o un objeto sin ninguna de las formas de arriba
 * (`{}` incluido).
 */
export function esErrorDeRed(valor: unknown): boolean {
  if (typeof valor !== 'object' || valor === null) return false

  const objeto = valor as Record<string, unknown>

  if (objeto.name === 'AbortError') return true

  const mensaje = typeof objeto.message === 'string' ? objeto.message : null
  const pareceTypeErrorDeRed =
    (valor instanceof TypeError || objeto.name === 'TypeError') &&
    mensaje !== null &&
    /Network request failed/i.test(mensaje)
  if (pareceTypeErrorDeRed) return true

  if ('error' in objeto && objeto.error && typeof objeto.error === 'object') {
    const error = objeto.error as Record<string, unknown>
    const codigoPostgrest = typeof error.code === 'string' ? error.code : ''
    if (codigoPostgrest.length > 0) return false
    return objeto.status === 0
  }

  return false
}
