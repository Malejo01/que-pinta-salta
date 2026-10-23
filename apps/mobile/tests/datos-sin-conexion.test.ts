// R43, 43-b: `sinConexion` en las cuatro funciones que lo suman
// (`filasVigentes` — probada vía `obtenerEventosVigentesParaInicio`, que no
// es exportada directamente —, `obtenerCategorias`, `obtenerCines` y
// `obtenerFavoritos`). Mismo patrón de doble de Supabase que
// `tests/datos-eventos.test.ts`, `tests/datos-cines.test.ts` y
// `tests/favoritos.test.ts`, pero controlando además el `status` de la
// respuesta (`esErrorDeRed` necesita la respuesta COMPLETA, no solo
// `error`). Sin red ni base: fixtures inventados.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type RespuestaFalsa = { data: unknown; error: unknown; status?: number }

const estado = vi.hoisted(() => ({
  events: { data: [] as unknown, error: null, status: 200 } as RespuestaFalsa,
  categories: { data: [] as unknown, error: null, status: 200 } as RespuestaFalsa,
  cinemaMovies: { data: [] as unknown, error: null, status: 200 } as RespuestaFalsa,
  userFavorites: { data: [] as unknown, error: null, status: 200 } as RespuestaFalsa,
  eventAttendance: { data: [] as unknown, error: null, status: 200 } as RespuestaFalsa,
  arrojar: {
    events: null as unknown,
    categories: null as unknown,
    cinemaMovies: null as unknown,
    userFavorites: null as unknown,
    eventAttendance: null as unknown,
  },
}))

// `vi.mock` se eleva por encima de los imports estáticos: los tres módulos
// bajo prueba ya ven este doble al importar `@/lib/supabase`. Nunca el
// cliente real (ni red, ni .env, ni base).
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (tabla: string) => {
      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.eq = () => builder
      builder.or = () => builder
      builder.order = () => builder
      builder.in = () => builder
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        if (tabla === 'events') {
          if (estado.arrojar.events) return Promise.reject(estado.arrojar.events).catch(reject)
          return Promise.resolve(estado.events).then(resolve, reject)
        }
        if (tabla === 'categories') {
          if (estado.arrojar.categories) return Promise.reject(estado.arrojar.categories).catch(reject)
          return Promise.resolve(estado.categories).then(resolve, reject)
        }
        if (tabla === 'cinema_movies') {
          if (estado.arrojar.cinemaMovies) return Promise.reject(estado.arrojar.cinemaMovies).catch(reject)
          return Promise.resolve(estado.cinemaMovies).then(resolve, reject)
        }
        if (tabla === 'user_favorites') {
          if (estado.arrojar.userFavorites) return Promise.reject(estado.arrojar.userFavorites).catch(reject)
          return Promise.resolve(estado.userFavorites).then(resolve, reject)
        }
        if (tabla === 'event_attendance') {
          // R47: obtenerFavoritos también lee los Voy (con su propio .then(ok, err)).
          if (estado.arrojar.eventAttendance) return Promise.reject(estado.arrojar.eventAttendance).catch(reject)
          return Promise.resolve(estado.eventAttendance).then(resolve, reject)
        }
        throw new Error(`tabla inesperada en el doble de datos-sin-conexion: ${tabla}`)
      }
      return builder
    },
  },
}))

import { obtenerCategorias, obtenerEventosVigentesParaInicio } from '../lib/datos/eventos'
import { obtenerCines } from '../lib/datos/cines'
import { obtenerFavoritos } from '../lib/favoritos'

const AHORA = new Date('2026-10-17T20:00:00-03:00')
const USER_ID = 'usuario-de-prueba-1'

/** La forma real de postgrest-js 2.106 cuando el `fetch` rechaza (modo avión/DNS): ver `tests/red-sin-conexion.test.ts`. */
function respuestaDeRed(): RespuestaFalsa {
  return {
    data: null,
    error: { message: 'TypeError: Network request failed', details: null, hint: '', code: '' },
    status: 0,
  }
}

function respuestaPgrst116(): RespuestaFalsa {
  return { data: null, error: { message: 'no rows', details: null, hint: '', code: 'PGRST116' }, status: 406 }
}

function respuesta500(): RespuestaFalsa {
  return { data: null, error: { message: 'internal error', details: null, hint: '', code: '' }, status: 500 }
}

beforeEach(() => {
  estado.events = { data: [], error: null, status: 200 }
  estado.categories = { data: [], error: null, status: 200 }
  estado.cinemaMovies = { data: [], error: null, status: 200 }
  estado.userFavorites = { data: [], error: null, status: 200 }
  estado.eventAttendance = { data: [], error: null, status: 200 }
  estado.arrojar = { events: null, categories: null, cinemaMovies: null, userFavorites: null, eventAttendance: null }
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('sinConexion: true cuando la respuesta es { error, status: 0 } (fetch rechazado)', () => {
  it('obtenerEventosVigentesParaInicio (filasVigentes)', async () => {
    estado.events = respuestaDeRed()
    const resultado = await obtenerEventosVigentesParaInicio(AHORA)
    expect(resultado).toEqual({ ok: false, error: expect.any(String), sinConexion: true })
  })

  it('obtenerCategorias', async () => {
    estado.categories = respuestaDeRed()
    const resultado = await obtenerCategorias()
    expect(resultado).toEqual({ ok: false, error: expect.any(String), sinConexion: true })
  })

  it('obtenerCines', async () => {
    estado.cinemaMovies = respuestaDeRed()
    const resultado = await obtenerCines()
    expect(resultado).toEqual({ ok: false, error: expect.any(String), sinConexion: true })
  })

  it('obtenerFavoritos (la consulta de user_favorites)', async () => {
    estado.userFavorites = respuestaDeRed()
    const resultado = await obtenerFavoritos(USER_ID)
    expect(resultado).toEqual({ ok: false, error: expect.any(String), sinConexion: true })
  })

  it('obtenerFavoritos propaga el sinConexion de obtenerCategorias (categoriasRes.sinConexion, no esErrorDeRed(categoriasRes))', async () => {
    estado.userFavorites = { data: [{ event_id: 'evento-1' }], error: null, status: 200 }
    estado.events = { data: [], error: null, status: 200 }
    estado.categories = respuestaDeRed()

    const resultado = await obtenerFavoritos(USER_ID)

    expect(resultado).toEqual({ ok: false, error: expect.any(String), sinConexion: true })
  })
})

describe('sinConexion: ausente con un PGRST116 (status 406) o un 500', () => {
  it('obtenerEventosVigentesParaInicio: PGRST116', async () => {
    estado.events = respuestaPgrst116()
    const resultado = await obtenerEventosVigentesParaInicio(AHORA)
    expect(resultado.ok).toBe(false)
    if (resultado.ok) throw new Error('no debería salir ok')
    expect(resultado.sinConexion).toBeFalsy()
  })

  it('obtenerEventosVigentesParaInicio: 500', async () => {
    estado.events = respuesta500()
    const resultado = await obtenerEventosVigentesParaInicio(AHORA)
    expect(resultado.ok).toBe(false)
    if (resultado.ok) throw new Error('no debería salir ok')
    expect(resultado.sinConexion).toBeFalsy()
  })

  it('obtenerCategorias: PGRST116', async () => {
    estado.categories = respuestaPgrst116()
    const resultado = await obtenerCategorias()
    expect(resultado.ok).toBe(false)
    if (resultado.ok) throw new Error('no debería salir ok')
    expect(resultado.sinConexion).toBeFalsy()
  })

  it('obtenerCategorias: 500', async () => {
    estado.categories = respuesta500()
    const resultado = await obtenerCategorias()
    expect(resultado.ok).toBe(false)
    if (resultado.ok) throw new Error('no debería salir ok')
    expect(resultado.sinConexion).toBeFalsy()
  })

  it('obtenerCines: PGRST116', async () => {
    estado.cinemaMovies = respuestaPgrst116()
    const resultado = await obtenerCines()
    expect(resultado.ok).toBe(false)
    if (resultado.ok) throw new Error('no debería salir ok')
    expect(resultado.sinConexion).toBeFalsy()
  })

  it('obtenerCines: 500', async () => {
    estado.cinemaMovies = respuesta500()
    const resultado = await obtenerCines()
    expect(resultado.ok).toBe(false)
    if (resultado.ok) throw new Error('no debería salir ok')
    expect(resultado.sinConexion).toBeFalsy()
  })

  it('obtenerFavoritos: PGRST116 en user_favorites', async () => {
    estado.userFavorites = respuestaPgrst116()
    const resultado = await obtenerFavoritos(USER_ID)
    expect(resultado.ok).toBe(false)
    if (resultado.ok) throw new Error('no debería salir ok')
    expect(resultado.sinConexion).toBeFalsy()
  })

  it('obtenerFavoritos: 500 en user_favorites', async () => {
    estado.userFavorites = respuesta500()
    const resultado = await obtenerFavoritos(USER_ID)
    expect(resultado.ok).toBe(false)
    if (resultado.ok) throw new Error('no debería salir ok')
    expect(resultado.sinConexion).toBeFalsy()
  })
})

describe('sinConexion: true cuando se atrapa una excepción TypeError("Network request failed")', () => {
  it('obtenerEventosVigentesParaInicio', async () => {
    estado.arrojar.events = new TypeError('Network request failed')
    const resultado = await obtenerEventosVigentesParaInicio(AHORA)
    expect(resultado).toEqual({ ok: false, error: expect.any(String), sinConexion: true })
  })

  it('obtenerCategorias', async () => {
    estado.arrojar.categories = new TypeError('Network request failed')
    const resultado = await obtenerCategorias()
    expect(resultado).toEqual({ ok: false, error: expect.any(String), sinConexion: true })
  })

  it('obtenerCines', async () => {
    estado.arrojar.cinemaMovies = new TypeError('Network request failed')
    const resultado = await obtenerCines()
    expect(resultado).toEqual({ ok: false, error: expect.any(String), sinConexion: true })
  })

  it('obtenerFavoritos', async () => {
    estado.arrojar.userFavorites = new TypeError('Network request failed')
    const resultado = await obtenerFavoritos(USER_ID)
    expect(resultado).toEqual({ ok: false, error: expect.any(String), sinConexion: true })
  })
})

describe('R47: la lectura de event_attendance (Voy) no tira la pantalla de Favoritos', () => {
  it('sin ningún favorito ni Voy: { ok: true, voy: [], eventos: [] }', async () => {
    const resultado = await obtenerFavoritos(USER_ID)
    expect(resultado).toEqual({ ok: true, voy: [], eventos: [] })
  })

  it('si event_attendance responde con error de red, no es sinConexion: sigue con idsVoy vacío', async () => {
    estado.eventAttendance = respuestaDeRed()
    const resultado = await obtenerFavoritos(USER_ID)
    expect(resultado).toEqual({ ok: true, voy: [], eventos: [] })
  })

  it('si event_attendance arroja TypeError("Network request failed"), tampoco tira abajo la pantalla', async () => {
    estado.arrojar.eventAttendance = new TypeError('Network request failed')
    const resultado = await obtenerFavoritos(USER_ID)
    expect(resultado).toEqual({ ok: true, voy: [], eventos: [] })
  })

  it('si user_favorites falla por red, sigue siendo sinConexion aunque event_attendance ande', async () => {
    estado.userFavorites = respuestaDeRed()
    const resultado = await obtenerFavoritos(USER_ID)
    expect(resultado).toEqual({ ok: false, error: expect.any(String), sinConexion: true })
  })
})

describe('sin configuración de Supabase: nunca sinConexion (no es un error de red)', () => {
  it('obtenerEventosVigentesParaInicio', async () => {
    vi.resetModules()
    vi.doMock('@/lib/supabase', () => ({ supabase: null }))
    const { obtenerEventosVigentesParaInicio: sinConfig, MENSAJE_SIN_CONFIGURACION } = await import('../lib/datos/eventos')
    const resultado = await sinConfig(AHORA)
    expect(resultado).toEqual({ ok: false, error: MENSAJE_SIN_CONFIGURACION })
  })

  it('obtenerFavoritos', async () => {
    vi.resetModules()
    vi.doMock('@/lib/supabase', () => ({ supabase: null }))
    const { obtenerFavoritos: sinConfig } = await import('../lib/favoritos')
    const { MENSAJE_SIN_CONFIGURACION } = await import('../lib/mensajes')
    const resultado = await sinConfig(USER_ID)
    expect(resultado).toEqual({ ok: false, error: MENSAJE_SIN_CONFIGURACION })
  })
})
