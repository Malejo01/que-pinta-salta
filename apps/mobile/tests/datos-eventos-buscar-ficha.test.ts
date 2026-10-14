// Ronda 26 (26-extra, cierre del hueco de cobertura marcado por el revisor):
// `obtenerEventosVigentes`, `obtenerCategorias` y `obtenerEventoPorId`
// (lib/datos/eventos.ts, sumadas en 26-b / commit 06fc72d), con un doble del
// cliente de Supabase. Mismo patrón que `tests/datos-eventos.test.ts` y
// `tests/datos-cines.test.ts`: `vi.hoisted` + `vi.mock('@/lib/supabase', …)`,
// sin red ni base, fixtures inventados.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({
  // `events` (lista, usada por `obtenerEventosVigentes`): mismo contrato
  // "thenable" que `obtenerEventosDeAtajo` (se resuelve al hacer `await` de
  // la query sin llamar un método terminal propio).
  eventosResultado: { data: [] as unknown, error: null as unknown } as { data: unknown; error: unknown },
  eventosArrojar: null as unknown,
  llamadasAEventosLista: 0,

  // `events` (ficha, usada por `obtenerEventoPorId`): termina en `maybeSingle()`.
  fichaResultado: { data: null as unknown, error: null as unknown } as { data: unknown; error: unknown },
  fichaArrojar: null as unknown,
  llamadasAEventosFicha: 0,
  filtrosFicha: [] as Array<[string, unknown]>,
  maybeSingleLlamado: false,

  // `categories`, usada por `obtenerCategorias`.
  categoriasResultado: { data: [] as unknown, error: null as unknown } as { data: unknown; error: unknown },
  categoriasArrojar: null as unknown,
  llamadasACategorias: 0,
  columnasCategorias: null as unknown,
}))

// `vi.mock` se eleva por encima de los imports estáticos: `lib/datos/eventos`
// ya ve este doble al importar `@/lib/supabase`. Nunca el cliente real de
// Supabase (ni red, ni .env, ni base).
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (tabla: string) => {
      if (tabla === 'events') {
        // Dos builders posibles sobre la misma tabla: uno (lista, "thenable")
        // para `obtenerEventosVigentes` y otro (`maybeSingle`) para
        // `obtenerEventoPorId`. La función de producción que se esté
        // probando en cada test solo usa uno de los dos caminos.
        const filtros: Array<[string, unknown]> = []
        const builder: Record<string, unknown> = {}
        builder.select = () => builder
        builder.eq = (campo: string, valor: unknown) => {
          filtros.push([campo, valor])
          estado.filtrosFicha = filtros
          return builder
        }
        builder.or = () => builder
        builder.order = () => builder
        builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
          estado.llamadasAEventosLista++
          if (estado.eventosArrojar) return Promise.reject(estado.eventosArrojar).catch(reject)
          return Promise.resolve(estado.eventosResultado).then(resolve, reject)
        }
        builder.maybeSingle = async () => {
          estado.llamadasAEventosFicha++
          estado.maybeSingleLlamado = true
          if (estado.fichaArrojar) throw estado.fichaArrojar
          return estado.fichaResultado
        }
        return builder
      }
      if (tabla === 'categories') {
        const builder: Record<string, unknown> = {}
        builder.select = (cols: unknown) => {
          estado.columnasCategorias = cols
          return builder
        }
        builder.order = () => builder
        builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
          estado.llamadasACategorias++
          if (estado.categoriasArrojar) return Promise.reject(estado.categoriasArrojar).catch(reject)
          return Promise.resolve(estado.categoriasResultado).then(resolve, reject)
        }
        return builder
      }
      throw new Error(`tabla inesperada en el doble de datos-eventos-buscar-ficha: ${tabla}`)
    },
  },
}))

import {
  MENSAJE_ERROR_RED,
  obtenerCategorias,
  obtenerEventoPorId,
  obtenerEventosVigentes,
} from '../lib/datos/eventos'

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
  estado.eventosResultado = { data: [], error: null }
  estado.eventosArrojar = null
  estado.llamadasAEventosLista = 0

  estado.fichaResultado = { data: null, error: null }
  estado.fichaArrojar = null
  estado.llamadasAEventosFicha = 0
  estado.filtrosFicha = []
  estado.maybeSingleLlamado = false

  estado.categoriasResultado = { data: [], error: null }
  estado.categoriasArrojar = null
  estado.llamadasACategorias = 0
  estado.columnasCategorias = null
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('obtenerEventosVigentes: camino feliz', () => {
  it('trae eventos ya transformados a DisplayEvent', async () => {
    const evento = filaDeEvento({ id: 'evento-vigente', title: 'Evento Vigente' })
    estado.eventosResultado = { data: [evento], error: null }

    const resultado = await obtenerEventosVigentes(AHORA)

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) throw new Error('no debería fallar')
    expect(resultado.eventos).toHaveLength(1)
    expect(resultado.eventos[0]).toMatchObject({
      id: 'evento-vigente',
      title: 'Evento Vigente',
      venue: 'Teatro de Prueba',
      category: 'teatro',
    })
  })

  it('descarta filas sin categoría, igual que obtenerEventosDeAtajo', async () => {
    const sinCategoria = filaDeEvento({ id: 'evento-sin-categoria', category: null })
    estado.eventosResultado = { data: [sinCategoria], error: null }

    const resultado = await obtenerEventosVigentes(AHORA)

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) throw new Error('no debería fallar')
    expect(resultado.eventos).toEqual([])
  })

  it('descarta lo que ya no está vigente (terminó hace más de 4 horas), vía isVigente de core', async () => {
    const vencido = filaDeEvento({ id: 'evento-vencido', start_date: '2026-10-13T10:00:00-03:00' })
    // 10:00 + 4h = 14:00, bien antes de las 20:00 de AHORA: no vigente.
    estado.eventosResultado = { data: [vencido], error: null }

    const resultado = await obtenerEventosVigentes(AHORA)

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) throw new Error('no debería fallar')
    expect(resultado.eventos).toEqual([])
  })

  it('no filtra por ventana de atajo: un evento vigente de otro día (no "hoy") igual aparece', async () => {
    // A diferencia de `obtenerEventosDeAtajo('hoy', …)`, que descartaría esto
    // por no caer en la ventana de "hoy", `obtenerEventosVigentes` no conoce
    // ningún `Atajo`: solo filtra por categoría + vigencia.
    const deOtroDia = filaDeEvento({
      id: 'evento-de-otro-dia',
      title: 'Evento de Otro Día',
      start_date: '2026-10-20T18:00:00-03:00',
    })
    estado.eventosResultado = { data: [deOtroDia], error: null }

    const resultado = await obtenerEventosVigentes(AHORA)

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) throw new Error('no debería fallar')
    expect(resultado.eventos.map((e) => e.id)).toEqual(['evento-de-otro-dia'])
  })

  it('consulta events una sola vez (sin reintentos)', async () => {
    await obtenerEventosVigentes(AHORA)
    expect(estado.llamadasAEventosLista).toBe(1)
  })
})

describe('obtenerEventosVigentes: errores (nunca explota)', () => {
  it('la consulta devuelve error: ok=false con MENSAJE_ERROR_RED, no el error crudo', async () => {
    estado.eventosResultado = { data: null, error: { message: 'detalle interno de postgres, nunca debería salir' } }

    const resultado = await obtenerEventosVigentes(AHORA)

    expect(resultado).toEqual({ ok: false, error: MENSAJE_ERROR_RED })
  })

  it('la consulta tira una excepción (por ejemplo sin conexión): se atrapa, mismo mensaje', async () => {
    estado.eventosArrojar = new Error('network request failed')

    const resultado = await obtenerEventosVigentes(AHORA)

    expect(resultado).toEqual({ ok: false, error: MENSAJE_ERROR_RED })
  })
})

describe('obtenerEventosVigentes: sin configuración de Supabase', () => {
  it('no llega ni a construir la consulta', async () => {
    vi.resetModules()
    vi.doMock('@/lib/supabase', () => ({ supabase: null }))
    const { obtenerEventosVigentes: obtenerSinConfig, MENSAJE_SIN_CONFIGURACION } = await import('../lib/datos/eventos')

    const resultado = await obtenerSinConfig(AHORA)

    expect(resultado).toEqual({ ok: false, error: MENSAJE_SIN_CONFIGURACION })
    expect(estado.llamadasAEventosLista).toBe(0)
  })
})

describe('obtenerCategorias: camino feliz', () => {
  it('devuelve las categorías tal como las manda la consulta', async () => {
    const categorias = [
      { id: 'cat-1', name: 'Teatro', slug: 'teatro' },
      { id: 'cat-2', name: 'Música', slug: 'musica' },
    ]
    estado.categoriasResultado = { data: categorias, error: null }

    const resultado = await obtenerCategorias()

    expect(resultado).toEqual({ ok: true, categorias })
  })

  it('pide solo id, name, slug', async () => {
    await obtenerCategorias()
    expect(estado.columnasCategorias).toBe('id, name, slug')
  })

  it('sin datos: lista vacía, no null ni undefined', async () => {
    estado.categoriasResultado = { data: null, error: null }

    const resultado = await obtenerCategorias()

    expect(resultado).toEqual({ ok: true, categorias: [] })
  })
})

describe('obtenerCategorias: errores (nunca explota)', () => {
  it('la consulta devuelve error: ok=false con MENSAJE_ERROR_RED, no el error crudo', async () => {
    estado.categoriasResultado = { data: null, error: { message: 'detalle interno de postgres, nunca debería salir' } }

    const resultado = await obtenerCategorias()

    expect(resultado).toEqual({ ok: false, error: MENSAJE_ERROR_RED })
  })

  it('la consulta tira una excepción: se atrapa, mismo mensaje', async () => {
    estado.categoriasArrojar = new Error('network request failed')

    const resultado = await obtenerCategorias()

    expect(resultado).toEqual({ ok: false, error: MENSAJE_ERROR_RED })
  })
})

describe('obtenerCategorias: sin configuración de Supabase', () => {
  it('no llega ni a construir la consulta', async () => {
    vi.resetModules()
    vi.doMock('@/lib/supabase', () => ({ supabase: null }))
    const { obtenerCategorias: obtenerSinConfig, MENSAJE_SIN_CONFIGURACION } = await import('../lib/datos/eventos')

    const resultado = await obtenerSinConfig()

    expect(resultado).toEqual({ ok: false, error: MENSAJE_SIN_CONFIGURACION })
    expect(estado.llamadasACategorias).toBe(0)
  })
})

describe('obtenerEventoPorId: camino feliz', () => {
  it('trae el evento tal como lo manda la base (sin exigir categoría)', async () => {
    const evento = filaDeEvento({ id: 'evento-de-la-ficha', category: null })
    estado.fichaResultado = { data: evento, error: null }

    const resultado = await obtenerEventoPorId('evento-de-la-ficha')

    expect(resultado).toEqual({ tipo: 'ok', evento })
  })

  it('filtra por id y por status = PUBLISHED, y usa maybeSingle (no un array)', async () => {
    const evento = filaDeEvento({ id: 'evento-de-la-ficha' })
    estado.fichaResultado = { data: evento, error: null }

    await obtenerEventoPorId('evento-de-la-ficha')

    expect(estado.filtrosFicha).toEqual([
      ['id', 'evento-de-la-ficha'],
      ['status', 'PUBLISHED'],
    ])
    expect(estado.maybeSingleLlamado).toBe(true)
  })

  it('consulta events una sola vez (sin reintentos)', async () => {
    const evento = filaDeEvento({ id: 'evento-de-la-ficha' })
    estado.fichaResultado = { data: evento, error: null }

    await obtenerEventoPorId('evento-de-la-ficha')

    expect(estado.llamadasAEventosFicha).toBe(1)
  })
})

describe('obtenerEventoPorId: "no encontrado" y "error" son estados distintos', () => {
  it('sin fila y sin error de la base: "no-encontrado" (evento borrado, despublicado o fusionado)', async () => {
    estado.fichaResultado = { data: null, error: null }

    const resultado = await obtenerEventoPorId('evento-que-no-existe')

    expect(resultado).toEqual({ tipo: 'no-encontrado' })
  })

  it('error de la base: "error" con MENSAJE_ERROR_RED, no el error crudo', async () => {
    estado.fichaResultado = { data: null, error: { message: 'detalle interno de postgres, nunca debería salir' } }

    const resultado = await obtenerEventoPorId('evento-de-prueba')

    expect(resultado).toEqual({ tipo: 'error', error: MENSAJE_ERROR_RED })
  })

  it('una excepción (por ejemplo sin conexión): se atrapa, "error" con el mismo mensaje', async () => {
    estado.fichaArrojar = new Error('network request failed')

    const resultado = await obtenerEventoPorId('evento-de-prueba')

    expect(resultado).toEqual({ tipo: 'error', error: MENSAJE_ERROR_RED })
  })
})

describe('obtenerEventoPorId: sin configuración de Supabase', () => {
  it('no llega ni a construir la consulta, y el estado es "error" (no "no-encontrado")', async () => {
    vi.resetModules()
    vi.doMock('@/lib/supabase', () => ({ supabase: null }))
    const { obtenerEventoPorId: obtenerSinConfig, MENSAJE_SIN_CONFIGURACION } = await import('../lib/datos/eventos')

    const resultado = await obtenerSinConfig('evento-de-prueba')

    expect(resultado).toEqual({ tipo: 'error', error: MENSAJE_SIN_CONFIGURACION })
    expect(estado.llamadasAEventosFicha).toBe(0)
  })
})
