// 25-c, punto 5: `obtenerCines` y `cantidadDeSalas` (lib/datos/cines.ts) con
// un doble del cliente de Supabase (fixtures inventados, sin red ni base).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({
  resultado: { data: [] as unknown, error: null as unknown } as { data: unknown; error: unknown },
  arrojar: null as unknown,
  llamadasACinemaMovies: 0,
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (tabla: string) => {
      if (tabla === 'cinema_movies') estado.llamadasACinemaMovies++
      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.eq = () => builder
      builder.order = () => builder
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        if (estado.arrojar) return Promise.reject(estado.arrojar).catch(reject)
        return Promise.resolve(estado.resultado).then(resolve, reject)
      }
      return builder
    },
  },
}))

import { cantidadDeSalas, MENSAJE_ERROR_RED, obtenerCines, type Pelicula } from '../lib/datos/cines'

function pelicula(over: Partial<Pelicula> = {}): Pelicula {
  return {
    id: 'pelicula-de-prueba-1',
    slug: 'pelicula-de-prueba',
    title: 'Película de Prueba',
    poster_url: null,
    showings: {
      cine_a: { name: 'Cine de Prueba A', booking_url: 'https://cine-de-prueba.example.com', formats: [{ type: '2D', times: ['18:00', '21:00'] }] },
    },
    ...over,
  }
}

beforeEach(() => {
  estado.resultado = { data: [], error: null }
  estado.arrojar = null
  estado.llamadasACinemaMovies = 0
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('obtenerCines: camino feliz', () => {
  it('devuelve las películas tal como las manda la consulta', async () => {
    const p1 = pelicula({ id: 'p1', title: 'Película Uno' })
    const p2 = pelicula({ id: 'p2', title: 'Película Dos' })
    estado.resultado = { data: [p1, p2], error: null }

    const resultado = await obtenerCines()

    expect(resultado).toEqual({ ok: true, peliculas: [p1, p2] })
  })

  it('sin datos: lista vacía, no null ni undefined', async () => {
    estado.resultado = { data: null, error: null }

    const resultado = await obtenerCines()

    expect(resultado).toEqual({ ok: true, peliculas: [] })
  })

  it('consulta cinema_movies una sola vez (sin reintentos)', async () => {
    await obtenerCines()
    expect(estado.llamadasACinemaMovies).toBe(1)
  })
})

describe('obtenerCines: errores (nunca explota)', () => {
  it('la consulta devuelve error: ok=false con MENSAJE_ERROR_RED, no el error crudo', async () => {
    estado.resultado = { data: null, error: { message: 'detalle interno de postgres, nunca debería salir' } }

    const resultado = await obtenerCines()

    expect(resultado).toEqual({ ok: false, error: MENSAJE_ERROR_RED })
  })

  it('la consulta tira una excepción (por ejemplo sin conexión): se atrapa, mismo mensaje', async () => {
    estado.arrojar = new Error('network request failed')

    const resultado = await obtenerCines()

    expect(resultado).toEqual({ ok: false, error: MENSAJE_ERROR_RED })
  })

  it('una sola consulta incluso cuando falla (sin reintentos)', async () => {
    estado.resultado = { data: null, error: { message: 'boom' } }
    await obtenerCines()
    expect(estado.llamadasACinemaMovies).toBe(1)
  })
})

describe('obtenerCines: sin configuración de Supabase', () => {
  it('no llega ni a construir la consulta', async () => {
    vi.resetModules()
    vi.doMock('@/lib/supabase', () => ({ supabase: null }))
    const { obtenerCines: obtenerSinConfig, MENSAJE_SIN_CONFIGURACION } = await import('../lib/datos/cines')

    const resultado = await obtenerSinConfig()

    expect(resultado).toEqual({ ok: false, error: MENSAJE_SIN_CONFIGURACION })
    expect(estado.llamadasACinemaMovies).toBe(0)
  })
})

describe('cantidadDeSalas', () => {
  it('cuenta las claves de showings', () => {
    expect(
      cantidadDeSalas(
        pelicula({
          showings: {
            cine_a: { name: 'Cine A', booking_url: 'https://a.example.com', formats: [{ type: '2D', times: ['18:00'] }] },
            cine_b: { name: 'Cine B', booking_url: 'https://b.example.com', formats: [{ type: '3D', times: ['21:00'] }] },
          },
        })
      )
    ).toBe(2)
  })

  it('una sola sala', () => {
    expect(
      cantidadDeSalas(
        pelicula({
          showings: { cine_a: { name: 'Cine A', booking_url: 'https://a.example.com', formats: [{ type: '2D', times: ['18:00'] }] } },
        })
      )
    ).toBe(1)
  })

  it('sin showings (null/undefined): 0', () => {
    expect(cantidadDeSalas(pelicula({ showings: null as unknown as Pelicula['showings'] }))).toBe(0)
    expect(cantidadDeSalas(pelicula({ showings: undefined as unknown as Pelicula['showings'] }))).toBe(0)
  })
})
