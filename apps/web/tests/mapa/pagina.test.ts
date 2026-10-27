/**
 * La página `/mapa` (R54, tarea 54-b), con `getEvents` mockeado: arma el filtro
 * con lo que viene en la URL, le pasa al cliente solo los campos de
 * `PinLugar`, valida `?lugar=` y no toca nada personal. Sin red ni base.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getEvents = vi.hoisted(() => vi.fn())
const parsearEspia = vi.hoisted(() => vi.fn())
const accesoPersonal = vi.hoisted(() => vi.fn(() => { throw new Error('/mapa no puede leer sesión ni favoritos') }))

vi.mock('@/lib/data', () => ({ getEvents }))
vi.mock('@/lib/supabase/server', () => ({ createClient: accesoPersonal }))
vi.mock('@/lib/actions/favorites', () => ({ getUserFavorites: accesoPersonal }))
vi.mock('@/components/navbar', () => ({ Navbar: () => null }))
vi.mock('@/components/mobile-nav', () => ({ MobileNav: () => null }))
vi.mock('@qps/core/mapa/pines', async (original) => {
  const real = await original<typeof import('@qps/core/mapa/pines')>()
  parsearEspia.mockImplementation(real.parsearFiltroMapa)
  return { ...real, parsearFiltroMapa: parsearEspia }
})

import MapaPage, { metadata } from '@/app/mapa/page'
import { MapaContenido } from '@/app/mapa/mapa-contenido'
import { PaginaDeError } from '@/components/pagina-de-error'

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))

const AHORA = new Date('2026-10-23T18:00:00Z') // viernes 15:00 en Salta
const VENUE_ID = '11111111-1111-4111-8111-111111111111'
const OTRO_UUID = '22222222-2222-4222-8222-222222222222'

/** Un evento de hoy a las 20:00 de Salta, con campos de más que NO tienen que llegar al cliente. */
function evento(id: string, venue: Record<string, unknown> | null) {
  return {
    id,
    title: `Evento ${id}`,
    description: 'DESCRIPCION-SECRETA-SCRAPEADA',
    image_url: 'https://ejemplo.invalid/flyer.jpg',
    start_date: '2026-10-23T23:00:00Z',
    end_date: null,
    category: { slug: 'musica', name: 'Música' },
    venue,
  }
}

const VENUE = { id: VENUE_ID, name: 'Peña de prueba', address: 'Calle Falsa 123', latitude: -24.7883, longitude: -65.4106, phone: '000' }

/** Busca en el árbol que devuelve la página el elemento de `tipo`. */
function buscar(nodo: ReactNode, tipo: unknown): ReactElement | null {
  if (Array.isArray(nodo)) {
    for (const hijo of nodo) {
      const hallado = buscar(hijo, tipo)
      if (hallado) return hallado
    }
    return null
  }
  if (!isValidElement(nodo)) return null
  if (nodo.type === tipo) return nodo
  return buscar((nodo.props as { children?: ReactNode }).children, tipo)
}

async function propsDeContenido(params: Record<string, string | string[]> = {}) {
  const arbol = await MapaPage({ searchParams: Promise.resolve(params) })
  const contenido = buscar(arbol, MapaContenido)
  expect(contenido, 'la página tiene que dibujar MapaContenido').not.toBeNull()
  return contenido!.props as Record<string, unknown>
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AHORA)
  getEvents.mockReset()
  getEvents.mockResolvedValue([evento('e1', VENUE), evento('e2', null)])
  accesoPersonal.mockClear()
  parsearEspia.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('metadata', () => {
  it('título, descripción, canónica y Open Graph', () => {
    expect(metadata.title).toBe('Mapa de eventos en Salta')
    expect(typeof metadata.description).toBe('string')
    expect(metadata.alternates?.canonical).toBe('/mapa')
    expect(metadata.openGraph?.url).toBe('https://www.quepintasalta.com.ar/mapa')
  })
})

describe('el filtro y los datos', () => {
  it('pide los eventos con includeStartedToday', async () => {
    await propsDeContenido()
    expect(getEvents).toHaveBeenCalledWith({ includeStartedToday: true })
  })

  it('llama a parsearFiltroMapa con lo que vino en la URL y le pasa el filtro al cliente', async () => {
    const props = await propsDeContenido({ cuando: 'fecha', dia: '2026-10-25' })
    expect(parsearEspia).toHaveBeenCalledTimes(1)
    const [params, ahora] = parsearEspia.mock.calls[0]
    expect(params).toEqual({ cuando: 'fecha', dia: '2026-10-25' })
    expect(ahora).toBeInstanceOf(Date)
    expect(props.filtro).toEqual({ tipo: 'fecha', dia: '2026-10-25' })
  })

  it('un parámetro repetido usa el primero, y sin parámetros el filtro es "hoy"', async () => {
    await propsDeContenido({ cuando: ['finde', 'hoy'] })
    expect(parsearEspia.mock.calls[0][0]).toEqual({ cuando: 'finde', dia: null })
    parsearEspia.mockClear()
    const props = await propsDeContenido()
    expect(parsearEspia.mock.calls[0][0]).toEqual({ cuando: null, dia: null })
    expect(props.filtro).toEqual({ tipo: 'hoy' })
  })

  it('un día fuera de rango vuelve a "hoy"', async () => {
    const props = await propsDeContenido({ cuando: 'fecha', dia: '2026-02-31' })
    expect(props.filtro).toEqual({ tipo: 'hoy' })
  })

  it('cuenta los eventos sin lugar como "sin ubicación" y fija la hora del servidor', async () => {
    const props = await propsDeContenido()
    expect(props.sinUbicacion).toBe(1)
    expect(props.ahoraISO).toBe(AHORA.toISOString())
  })
})

describe('Gratis, Para chicos y categoría (Q3, C1)', () => {
  const OTRO_VENUE = { ...VENUE, id: OTRO_UUID, name: 'Plaza de prueba' }
  function conPublico() {
    return [
      { ...evento('paga', VENUE), is_free: false, tags: [] },
      { ...evento('gratis-infantil', OTRO_VENUE), is_free: true, tags: [], category: { slug: 'infantil', name: 'Infantil' } },
    ]
  }

  it('sin parámetros: sin filtros, y las categorías del día con su cantidad', async () => {
    getEvents.mockResolvedValue(conPublico())
    const props = await propsDeContenido()
    expect(props.extra).toEqual({ gratis: false, chicos: false, categoria: null })
    expect((props.pines as unknown[]).length).toBe(2)
    expect(props.categorias).toEqual([
      { slug: 'infantil', name: 'Infantil', cantidad: 1 },
      { slug: 'musica', name: 'Música', cantidad: 1 },
    ])
  })

  it('gratis=1, chicos=1 y categoria filtran los pines y llegan al cliente', async () => {
    getEvents.mockResolvedValue(conPublico())
    const props = await propsDeContenido({ gratis: '1', chicos: '1', categoria: 'infantil' })
    expect(props.extra).toEqual({ gratis: true, chicos: true, categoria: 'infantil' })
    const pines = props.pines as { venueId: string }[]
    expect(pines.map((pin) => pin.venueId)).toEqual([OTRO_UUID])
  })

  it('una categoría desconocida se ignora y un parámetro repetido usa el primero', async () => {
    getEvents.mockResolvedValue(conPublico())
    const props = await propsDeContenido({ categoria: 'inventada', gratis: ['1', '0'] })
    expect(props.extra).toEqual({ gratis: true, chicos: false, categoria: null })
  })

  it('?lugar= de un lugar que el filtro deja afuera no abre nada', async () => {
    getEvents.mockResolvedValue(conPublico())
    const props = await propsDeContenido({ gratis: '1', lugar: VENUE_ID })
    expect(props.lugarInicial).toBeNull()
    const conLugarQueQueda = await propsDeContenido({ gratis: '1', lugar: OTRO_UUID })
    expect(conLugarQueQueda.lugarInicial).toBe(OTRO_UUID)
  })
})

describe('qué llega al cliente', () => {
  it('solo las props esperadas, y los pines solo con los campos de PinLugar', async () => {
    const props = await propsDeContenido()
    expect(Object.keys(props).sort()).toEqual(['ahoraISO', 'categorias', 'extra', 'filtro', 'lugarInicial', 'pines', 'sinUbicacion'])
    const pines = props.pines as Record<string, unknown>[]
    expect(pines).toHaveLength(1)
    expect(Object.keys(pines[0]).sort()).toEqual(['direccion', 'eventos', 'lat', 'lng', 'nombre', 'venueId'])
    const eventos = pines[0].eventos as Record<string, unknown>[]
    expect(Object.keys(eventos[0]).sort()).toEqual(['categoria', 'id', 'inicio', 'titulo'])
  })

  it('ni la descripción ni la imagen ni el teléfono del lugar viajan en las props', async () => {
    const serializado = JSON.stringify(await propsDeContenido())
    expect(serializado).not.toContain('description')
    expect(serializado).not.toContain('image_url')
    expect(serializado).not.toContain('DESCRIPCION-SECRETA-SCRAPEADA')
    expect(serializado).not.toContain('phone')
  })
})

describe('?lugar=', () => {
  it('un uuid que es un pin llega como lugarInicial', async () => {
    expect((await propsDeContenido({ lugar: VENUE_ID })).lugarInicial).toBe(VENUE_ID)
  })

  it('un uuid que no es un pin da null', async () => {
    expect((await propsDeContenido({ lugar: OTRO_UUID })).lugarInicial).toBeNull()
  })

  it('algo que no es un uuid da null', async () => {
    expect((await propsDeContenido({ lugar: 'cualquier-cosa' })).lugarInicial).toBeNull()
    expect((await propsDeContenido({ lugar: '<script>' })).lugarInicial).toBeNull()
  })

  it('sin ?lugar= da null', async () => {
    expect((await propsDeContenido()).lugarInicial).toBeNull()
  })
})

describe('el error', () => {
  it('si getEvents falla, la página muestra el estado de error y no tira una excepción', async () => {
    getEvents.mockRejectedValue(new Error('base caída'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const arbol = await MapaPage({ searchParams: Promise.resolve({}) })
    error.mockRestore()
    expect(isValidElement(arbol) && arbol.type).toBe(PaginaDeError)
    expect(buscar(arbol, MapaContenido)).toBeNull()
  })
})

describe('nada personal', () => {
  it('no pidió la sesión ni los favoritos', async () => {
    await propsDeContenido({ lugar: VENUE_ID })
    expect(accesoPersonal).not.toHaveBeenCalled()
  })

  it('el código de la página no menciona sesión, favoritos ni Supabase', () => {
    // El código sin comentarios (de bloque, de línea completa ni al final de una línea).
    const fuente = readFileSync(path.join(WEB_ROOT, 'app/mapa/page.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[^\S\n]*\/\/.*$/gm, '')
      .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    expect(fuente).not.toMatch(/getUser|favorit|createClient|supabase/i)
  })
})
