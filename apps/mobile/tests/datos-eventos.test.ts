// 25-c, punto 5: `obtenerEventosDeAtajo` (lib/datos/eventos.ts) con un doble
// del cliente de Supabase (fixtures inventados, sin red ni base). Cubre: el
// camino feliz (filtra por categoría, vigencia y ventana del atajo), que un
// error de la consulta se devuelve como mensaje (nunca explota), que una
// excepción de red tampoco explota, y que no hay reintentos (se consulta una
// sola vez por llamada).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({
  resultado: { data: [] as unknown, error: null as unknown } as { data: unknown; error: unknown } | null,
  arrojar: null as unknown,
  llamadasAEvents: 0,
}))

// `vi.mock` se eleva por encima de los imports estáticos: `lib/datos/eventos`
// ya ve este doble al importar `@/lib/supabase`. Nunca el cliente real de
// Supabase (ni red, ni .env, ni base).
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (tabla: string) => {
      if (tabla === 'events') estado.llamadasAEvents++
      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.eq = () => builder
      builder.or = () => builder
      builder.order = () => builder
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        if (estado.arrojar) return Promise.reject(estado.arrojar).catch(reject)
        return Promise.resolve(estado.resultado).then(resolve, reject)
      }
      return builder
    },
  },
}))

import { MENSAJE_ERROR_RED, obtenerEventosDeAtajo } from '../lib/datos/eventos'

function filaDeEvento(over: Partial<{
  id: string
  slug: string
  title: string
  start_date: string
  end_date: string | null
  category: { slug: string; name: string } | null
  venue: { name: string; address: string } | null
  price_min: number
  is_free: boolean
}>) {
  return {
    id: 'evento-de-prueba-1',
    slug: 'evento-de-prueba',
    title: 'Evento de Prueba',
    description: null,
    short_description: null,
    start_date: '2026-10-13T18:00:00-03:00',
    end_date: null,
    price_min: 0,
    is_free: true,
    image_url: null,
    ticket_url: null,
    age_restriction: 0,
    is_featured: false,
    category: { slug: 'teatro', name: 'Teatro' },
    venue: { name: 'Teatro de Prueba', address: 'Calle de Prueba 123' },
    ...over,
  }
}

const AHORA = new Date('2026-10-13T20:00:00-03:00') // martes, 20:00 hora de Salta

beforeEach(() => {
  estado.resultado = { data: [], error: null }
  estado.arrojar = null
  estado.llamadasAEvents = 0
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('obtenerEventosDeAtajo: camino feliz', () => {
  it('incluye lo vigente de "hoy" y descarta lo de otro día', async () => {
    const deHoy = filaDeEvento({ id: 'evento-de-hoy', title: 'Evento de Hoy', start_date: '2026-10-13T18:00:00-03:00' })
    const deOtroDia = filaDeEvento({
      id: 'evento-de-otro-dia',
      title: 'Evento de Otro Día',
      start_date: '2026-10-20T18:00:00-03:00',
    })
    estado.resultado = { data: [deHoy, deOtroDia], error: null }

    const resultado = await obtenerEventosDeAtajo('hoy', AHORA)

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) throw new Error('no debería fallar')
    expect(resultado.eventos.map((e) => e.id)).toEqual(['evento-de-hoy'])
    expect(resultado.eventos[0].venue).toBe('Teatro de Prueba')
  })

  it('descarta filas sin categoría (join sin category_id)', async () => {
    const sinCategoria = filaDeEvento({ id: 'evento-sin-categoria', category: null })
    estado.resultado = { data: [sinCategoria], error: null }

    const resultado = await obtenerEventosDeAtajo('hoy', AHORA)

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) throw new Error('no debería fallar')
    expect(resultado.eventos).toEqual([])
  })

  it('descarta lo que ya no está vigente (terminó hace más de 4 horas)', async () => {
    const vencido = filaDeEvento({ id: 'evento-vencido', start_date: '2026-10-13T10:00:00-03:00' })
    // 10:00 + 4h = 14:00, bien antes de las 20:00 de "AHORA": no vigente.
    estado.resultado = { data: [vencido], error: null }

    const resultado = await obtenerEventosDeAtajo('hoy', AHORA)

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) throw new Error('no debería fallar')
    expect(resultado.eventos).toEqual([])
  })

  it('consulta events una sola vez (sin reintentos)', async () => {
    estado.resultado = { data: [], error: null }
    await obtenerEventosDeAtajo('hoy', AHORA)
    expect(estado.llamadasAEvents).toBe(1)
  })
})

describe('obtenerEventosDeAtajo: errores (nunca explota)', () => {
  it('la consulta devuelve error: ok=false con MENSAJE_ERROR_RED, no el error crudo', async () => {
    estado.resultado = { data: null, error: { message: 'detalle interno de postgres, nunca debería salir' } }

    const resultado = await obtenerEventosDeAtajo('hoy', AHORA)

    expect(resultado).toEqual({ ok: false, error: MENSAJE_ERROR_RED })
  })

  it('la consulta tira una excepción (por ejemplo sin conexión): se atrapa, mismo mensaje', async () => {
    estado.arrojar = new Error('network request failed')

    const resultado = await obtenerEventosDeAtajo('hoy', AHORA)

    expect(resultado).toEqual({ ok: false, error: MENSAJE_ERROR_RED })
  })

  it('una sola consulta incluso cuando falla (sin reintentos)', async () => {
    estado.resultado = { data: null, error: { message: 'boom' } }
    await obtenerEventosDeAtajo('hoy', AHORA)
    expect(estado.llamadasAEvents).toBe(1)
  })
})

describe('obtenerEventosDeAtajo: sin configuración de Supabase', () => {
  it('no llega ni a construir la consulta', async () => {
    // Reemplaza el doble por `null` solo en este bloque, para probar el
    // camino "la app no tiene configuración de datos".
    vi.resetModules()
    vi.doMock('@/lib/supabase', () => ({ supabase: null }))
    const { obtenerEventosDeAtajo: obtenerSinConfig, MENSAJE_SIN_CONFIGURACION } = await import('../lib/datos/eventos')

    const resultado = await obtenerSinConfig('hoy', AHORA)

    expect(resultado).toEqual({ ok: false, error: MENSAJE_SIN_CONFIGURACION })
    expect(estado.llamadasAEvents).toBe(0)
  })
})
