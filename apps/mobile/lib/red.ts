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
