// 28-q, punto 3 (arranque, 28-a): `fetchConTimeout` (lib/red.ts) es pura (no
// importa react-native ni nada de Expo), así que se prueba directo, con
// timers falsos y un `fetch` falso (nunca el `fetch` real: sin red).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchConTimeout, TIMEOUT_RED_MS } from '../lib/red'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function errorDeAborto(): Error {
  const error = new Error('Aborted')
  error.name = 'AbortError'
  return error
}

describe('fetchConTimeout', () => {
  it(`corta a los ${TIMEOUT_RED_MS} ms con un error de aborto, si fetchBase nunca responde`, async () => {
    // fetchBase real reacciona al signal que le pasa fetchConTimeout:
    // cuando ese signal se aborta (por el timeout), rechaza con AbortError —
    // igual que el fetch real.
    const fetchQueNuncaResponde = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(errorDeAborto()))
      }) as ReturnType<typeof fetch>
    })

    const envuelto = fetchConTimeout(fetchQueNuncaResponde, TIMEOUT_RED_MS)
    const promesa = envuelto('https://api-de-prueba.example.com/eventos')

    const expectativa = expect(promesa).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(TIMEOUT_RED_MS)
    await expectativa
  })

  it('no corta antes de tiempo: con 1 ms menos que el timeout, todavía no abortó', async () => {
    const fetchQueNuncaResponde = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise((resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(errorDeAborto()))
        // Nunca resuelve por su cuenta en este test: solo nos importa que
        // TODAVÍA no haya rechazado al faltar 1 ms.
        void resolve
      }) as ReturnType<typeof fetch>
    })

    const envuelto = fetchConTimeout(fetchQueNuncaResponde, TIMEOUT_RED_MS)
    let sePudoAsentar = false
    envuelto('https://api-de-prueba.example.com/eventos').catch(() => {
      sePudoAsentar = true
    })

    await vi.advanceTimersByTimeAsync(TIMEOUT_RED_MS - 1)
    expect(sePudoAsentar).toBe(false)
  })

  it('si la respuesta llega antes del timeout, la devuelve y limpia el timer (vi.getTimerCount() en 0)', async () => {
    const respuestaFalsa = { ok: true, status: 200 } as Response
    const fetchQueResuelveRapido = vi.fn(async () => respuestaFalsa)

    const envuelto = fetchConTimeout(fetchQueResuelveRapido, 5000)
    const resultado = await envuelto('https://api-de-prueba.example.com/eventos')

    expect(resultado).toBe(respuestaFalsa)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('si la respuesta llega antes, no llega a abortar aunque después se agote el timeout original', async () => {
    const respuestaFalsa = { ok: true, status: 200 } as Response
    const fetchQueResuelveRapido = vi.fn(async () => respuestaFalsa)

    const envuelto = fetchConTimeout(fetchQueResuelveRapido, 5000)
    await envuelto('https://api-de-prueba.example.com/eventos')

    // El timer ya se limpió (test de arriba); avanzar el reloj no debería
    // hacer nada raro (no hay timers pendientes).
    await vi.advanceTimersByTimeAsync(5000)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('si la llamada trae su propio signal y se aborta, también corta (sin esperar el timeout)', async () => {
    const controladorExterno = new AbortController()
    const fetchQueEscuchaElSignal = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(errorDeAborto()))
      }) as ReturnType<typeof fetch>
    })

    const envuelto = fetchConTimeout(fetchQueEscuchaElSignal, 60000)
    const promesa = envuelto('https://api-de-prueba.example.com/eventos', { signal: controladorExterno.signal })

    const expectativa = expect(promesa).rejects.toMatchObject({ name: 'AbortError' })
    controladorExterno.abort()
    await expectativa

    // No hizo falta llegar al timeout de 60s: el timer se limpia igual.
    expect(vi.getTimerCount()).toBe(0)
  })

  it('si la llamada trae un signal que YA viene abortado, corta de una (sin esperar ningún evento)', async () => {
    const controladorYaAbortado = new AbortController()
    controladorYaAbortado.abort()

    const fetchQueEscuchaElSignal = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        if (init?.signal?.aborted) {
          reject(errorDeAborto())
          return
        }
        init?.signal?.addEventListener('abort', () => reject(errorDeAborto()))
      }) as ReturnType<typeof fetch>
    })

    const envuelto = fetchConTimeout(fetchQueEscuchaElSignal, 60000)
    await expect(envuelto('https://api-de-prueba.example.com/eventos', { signal: controladorYaAbortado.signal })).rejects.toMatchObject(
      { name: 'AbortError' }
    )
  })
})
