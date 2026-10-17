// 25-c, punto 5 (reescrito en 36-a: `obtenerEventosDeAtajo` se borró, sin
// uso desde que Inicio pide una sola vez y filtra el atajo en memoria):
// `obtenerEventosVigentesParaInicio` (lib/datos/eventos.ts) con un doble del
// cliente de Supabase (fixtures inventados, sin red ni base). Cubre: el
// camino feliz (filtra por categoría y vigencia, y lleva junto `paraAtajo`
// con `end_date` incluido para que el filtro de atajo en memoria sea
// correcto), que un error de la consulta se devuelve como mensaje (nunca
// explota), que una excepción de red tampoco explota, y que no hay
// reintentos (se consulta una sola vez por llamada).
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

import { MENSAJE_ERROR_RED, obtenerEventosVigentesParaInicio } from '../lib/datos/eventos'

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

describe('obtenerEventosVigentesParaInicio: camino feliz', () => {
  it('incluye lo vigente y descarta lo vencido (sin ventana de atajo: eso lo filtra el llamador en memoria)', async () => {
    const vigente = filaDeEvento({ id: 'evento-vigente', title: 'Evento Vigente' })
    const vencido = filaDeEvento({
      id: 'evento-vencido',
      title: 'Evento Vencido',
      start_date: '2026-10-13T10:00:00-03:00', // 10:00 + 4h = 14:00, antes de las 20:00 de AHORA
    })
    estado.resultado = { data: [vigente, vencido], error: null }

    const resultado = await obtenerEventosVigentesParaInicio(AHORA)

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) throw new Error('no debería fallar')
    expect(resultado.eventos.map((e) => e.evento.id)).toEqual(['evento-vigente'])
    expect(resultado.eventos[0].evento.venue).toBe('Teatro de Prueba')
  })

  it('descarta filas sin categoría (join sin category_id)', async () => {
    const sinCategoria = filaDeEvento({ id: 'evento-sin-categoria', category: null })
    estado.resultado = { data: [sinCategoria], error: null }

    const resultado = await obtenerEventosVigentesParaInicio(AHORA)

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) throw new Error('no debería fallar')
    expect(resultado.eventos).toEqual([])
  })

  it('lleva `paraAtajo` con `start_date`, `end_date` y el slug de la categoría (lo que necesita `eventoEnAtajo` de core)', async () => {
    const conFin = filaDeEvento({
      id: 'evento-con-fin',
      start_date: '2026-10-13T08:00:00-03:00',
      end_date: '2026-10-20T20:00:00-03:00',
      category: { slug: 'boliches', name: 'Boliches' },
    })
    estado.resultado = { data: [conFin], error: null }

    const resultado = await obtenerEventosVigentesParaInicio(AHORA)

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) throw new Error('no debería fallar')
    expect(resultado.eventos).toHaveLength(1)
    expect(resultado.eventos[0].paraAtajo).toEqual({
      start_date: '2026-10-13T08:00:00-03:00',
      end_date: '2026-10-20T20:00:00-03:00',
      category: 'boliches',
    })
    // `DisplayEvent` no conserva `end_date` (transformEvent lo descarta):
    // por eso viaja aparte, en `paraAtajo`, y no se puede reconstruir desde
    // `evento.startDateTime` solo.
    expect(resultado.eventos[0].evento).not.toHaveProperty('end_date')
  })

  it('consulta events una sola vez (sin reintentos)', async () => {
    estado.resultado = { data: [], error: null }
    await obtenerEventosVigentesParaInicio(AHORA)
    expect(estado.llamadasAEvents).toBe(1)
  })
})

describe('obtenerEventosVigentesParaInicio: errores (nunca explota)', () => {
  it('la consulta devuelve error: ok=false con MENSAJE_ERROR_RED, no el error crudo', async () => {
    estado.resultado = { data: null, error: { message: 'detalle interno de postgres, nunca debería salir' } }

    const resultado = await obtenerEventosVigentesParaInicio(AHORA)

    expect(resultado).toEqual({ ok: false, error: MENSAJE_ERROR_RED })
  })

  it('la consulta tira una excepción (por ejemplo sin conexión): se atrapa, mismo mensaje', async () => {
    estado.arrojar = new Error('network request failed')

    const resultado = await obtenerEventosVigentesParaInicio(AHORA)

    expect(resultado).toEqual({ ok: false, error: MENSAJE_ERROR_RED })
  })

  it('una sola consulta incluso cuando falla (sin reintentos)', async () => {
    estado.resultado = { data: null, error: { message: 'boom' } }
    await obtenerEventosVigentesParaInicio(AHORA)
    expect(estado.llamadasAEvents).toBe(1)
  })
})

describe('obtenerEventosVigentesParaInicio: sin configuración de Supabase', () => {
  it('no llega ni a construir la consulta', async () => {
    // Reemplaza el doble por `null` solo en este bloque, para probar el
    // camino "la app no tiene configuración de datos".
    vi.resetModules()
    vi.doMock('@/lib/supabase', () => ({ supabase: null }))
    const { obtenerEventosVigentesParaInicio: obtenerSinConfig, MENSAJE_SIN_CONFIGURACION } = await import(
      '../lib/datos/eventos'
    )

    const resultado = await obtenerSinConfig(AHORA)

    expect(resultado).toEqual({ ok: false, error: MENSAJE_SIN_CONFIGURACION })
    expect(estado.llamadasAEvents).toBe(0)
  })
})
