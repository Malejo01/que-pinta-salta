// tests/eliminar-cuenta.test.ts (R37, tarea 37-d): `lib/cuenta.ts`, sin red
// ni base, con dobles. Mismo patrón que el resto de `tests/`:
// `vi.mock('@/lib/supabase', ...)` (como `tests/favoritos.test.ts` y
// `tests/radar.test.ts`), `vi.mock('expo-secure-store', ...)` (como
// `tests/secure-storage.test.ts`) y
// `vi.mock('@react-native-google-signin/google-signin', ...)` (como
// `tests/google.test.ts`). `fetch` se reemplaza con `vi.stubGlobal`
// (utilidad propia de Vitest, no una dependencia nueva): nunca pega contra
// la red de verdad. Ningún token real en todo el archivo.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SITIO } from '@qps/core/metricas/links'

const estado = vi.hoisted(() => ({
  signOutLlamado: 0,
  googleSignOutLlamado: 0,
  banderaBienvenidaBorrada: 0,
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signOut: vi.fn(async () => {
        estado.signOutLlamado++
      }),
    },
  },
}))

vi.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    signOut: vi.fn(async () => {
      estado.googleSignOutLlamado++
    }),
  },
}))

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {
    estado.banderaBienvenidaBorrada++
  }),
}))

import { completarEliminacionDeCuenta, confirmacionValida, eliminarMiCuenta } from '@/lib/cuenta'

const RUTA_ESPERADA = `${SITIO}/api/cuenta/eliminar`
const TOKEN_DE_PRUEBA = 'token-de-prueba'
const MENSAJE_SIN_RED = 'No pudimos eliminar la cuenta. Revisá tu conexión.'

beforeEach(() => {
  estado.signOutLlamado = 0
  estado.googleSignOutLlamado = 0
  estado.banderaBienvenidaBorrada = 0
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// confirmacionValida: mismo criterio que la web (espacios de más, sin
// distinguir mayúsculas/minúsculas).
// ---------------------------------------------------------------------------
describe('confirmacionValida', () => {
  it('acepta el literal exacto', () => {
    expect(confirmacionValida('ELIMINAR')).toBe(true)
  })

  it('acepta minúsculas y espacios de más al principio/final', () => {
    expect(confirmacionValida('  eliminar  ')).toBe(true)
    expect(confirmacionValida('Eliminar')).toBe(true)
  })

  it('rechaza cualquier otra cosa', () => {
    expect(confirmacionValida('Eliminarr')).toBe(false)
    expect(confirmacionValida('')).toBe(false)
    expect(confirmacionValida('ELIMINA R')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// eliminarMiCuenta: el pedido al servidor.
// ---------------------------------------------------------------------------
describe('eliminarMiCuenta: el pedido al servidor', () => {
  it('hace POST a la ruta del sitio con el Bearer, el content-type y el body { confirmacion: "ELIMINAR" }', async () => {
    const mockFetch = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true }) as Response)
    vi.stubGlobal('fetch', mockFetch)

    const resultado = await eliminarMiCuenta(TOKEN_DE_PRUEBA)

    expect(resultado).toEqual({ ok: true })
    expect(mockFetch).toHaveBeenCalledTimes(1)

    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe(RUTA_ESPERADA)
    expect(init?.method).toBe('POST')
    // toEqual (no toMatchObject): un header de más (p. ej. un X-Qps-Uid con
    // el id de la cuenta) tiene que poner este test en rojo, no pasar
    // inadvertido.
    expect(init?.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN_DE_PRUEBA}`,
    })
    expect(JSON.parse(init?.body as string)).toEqual({ confirmacion: 'ELIMINAR' })
  })

  it('nunca manda un identificador de cuenta ni el email: el body solo tiene "confirmacion"', async () => {
    const mockFetch = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true }) as Response)
    vi.stubGlobal('fetch', mockFetch)

    await eliminarMiCuenta(TOKEN_DE_PRUEBA)

    const init = mockFetch.mock.calls[0][1]
    const body = JSON.parse(init?.body as string)
    expect(Object.keys(body)).toEqual(['confirmacion'])
  })

  it('el archivo de producción (lib/cuenta.ts) no contiene "user_id" ni "userId" en ningún lado', () => {
    const ruta = fileURLToPath(new URL('../lib/cuenta.ts', import.meta.url))
    const codigo = readFileSync(ruta, 'utf8')
    expect(codigo).not.toMatch(/user_id/i)
    expect(codigo).not.toMatch(/userId/)
  })

  it('si el servidor responde con error, da ok:false con un mensaje que nunca repite el texto del servidor', async () => {
    const mockFetch = vi.fn(async () => ({ ok: false }) as Response)
    vi.stubGlobal('fetch', mockFetch)

    const resultado = await eliminarMiCuenta(TOKEN_DE_PRUEBA)

    expect(resultado.ok).toBe(false)
    if (!resultado.ok) {
      expect(resultado.mensaje).not.toContain('un detalle interno del servidor')
      expect(typeof resultado.mensaje).toBe('string')
    }
  })

  it('sin red (el fetch rechaza), el mensaje es exactamente el de conexión', async () => {
    const mockFetch = vi.fn(async () => {
      throw new TypeError('Network request failed')
    })
    vi.stubGlobal('fetch', mockFetch)

    const resultado = await eliminarMiCuenta(TOKEN_DE_PRUEBA)

    expect(resultado).toEqual({ ok: false, mensaje: MENSAJE_SIN_RED })
  })
})

// ---------------------------------------------------------------------------
// completarEliminacionDeCuenta: orquesta el borrado + la limpieza de
// después (cerrar sesión, Google si corresponde, borrar la bandera de la
// Bienvenida) + la navegación a /bienvenida — inyectada como función, para
// no depender de expo-router en este archivo.
// ---------------------------------------------------------------------------
describe('completarEliminacionDeCuenta', () => {
  it('si sale bien: cierra sesión, borra la bandera de la Bienvenida y navega a /bienvenida', async () => {
    const mockFetch = vi.fn(async () => ({ ok: true }) as Response)
    vi.stubGlobal('fetch', mockFetch)
    const navegarABienvenida = vi.fn()

    const resultado = await completarEliminacionDeCuenta(TOKEN_DE_PRUEBA, false, { navegarABienvenida })

    expect(resultado).toEqual({ ok: true })
    expect(estado.signOutLlamado).toBe(1)
    expect(estado.banderaBienvenidaBorrada).toBe(1)
    expect(navegarABienvenida).toHaveBeenCalledTimes(1)
    expect(estado.googleSignOutLlamado).toBe(0) // entró con email, no con Google
    // Una segunda llamada de red agregada acá dentro (telemetría con el
    // email, por ejemplo) tiene que poner este test en rojo.
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('si la persona entró con Google, también cierra la sesión nativa de Google', async () => {
    const mockFetch = vi.fn(async () => ({ ok: true }) as Response)
    vi.stubGlobal('fetch', mockFetch)
    const navegarABienvenida = vi.fn()

    await completarEliminacionDeCuenta(TOKEN_DE_PRUEBA, true, { navegarABienvenida })

    expect(estado.googleSignOutLlamado).toBe(1)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('si entró con email, no llama a GoogleSignin.signOut()', async () => {
    const mockFetch = vi.fn(async () => ({ ok: true }) as Response)
    vi.stubGlobal('fetch', mockFetch)
    const navegarABienvenida = vi.fn()

    await completarEliminacionDeCuenta(TOKEN_DE_PRUEBA, false, { navegarABienvenida })

    expect(estado.googleSignOutLlamado).toBe(0)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('si falla el servidor: no cierra sesión, no borra la bandera y no navega', async () => {
    const mockFetch = vi.fn(async () => ({ ok: false }) as Response)
    vi.stubGlobal('fetch', mockFetch)
    const navegarABienvenida = vi.fn()

    const resultado = await completarEliminacionDeCuenta(TOKEN_DE_PRUEBA, false, { navegarABienvenida })

    expect(resultado.ok).toBe(false)
    expect(estado.signOutLlamado).toBe(0)
    expect(estado.banderaBienvenidaBorrada).toBe(0)
    expect(navegarABienvenida).not.toHaveBeenCalled()
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('sin red: tampoco cierra sesión, ni borra la bandera, ni navega', async () => {
    const mockFetch = vi.fn(async () => {
      throw new TypeError('sin red')
    })
    vi.stubGlobal('fetch', mockFetch)
    const navegarABienvenida = vi.fn()

    const resultado = await completarEliminacionDeCuenta(TOKEN_DE_PRUEBA, false, { navegarABienvenida })

    expect(resultado).toEqual({ ok: false, mensaje: MENSAJE_SIN_RED })
    expect(estado.signOutLlamado).toBe(0)
    expect(estado.banderaBienvenidaBorrada).toBe(0)
    expect(navegarABienvenida).not.toHaveBeenCalled()
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})
