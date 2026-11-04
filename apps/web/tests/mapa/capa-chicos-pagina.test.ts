// R-1 · /mapa?capa=chicos (Q5-2) con la página real y Supabase de mentira:
// la tabla de lugares para chicos se lee solo con la capa, con columnas
// públicas y solo publicados; `gratis=1` deja los gratis; `?lugar=` acepta
// el venue de un lugar para chicos; y si la lectura falla, el mapa sale igual.
// tests/mapa/pagina.test.ts cubre /mapa sin la capa (y prohíbe leer la sesión);
// la capa solo tenía pruebas del armado puro y del componente.
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({
  consultas: [] as { tabla: string; columnas: string; filtros: [string, unknown][]; limite: number | null }[],
  respuesta: { data: [] as unknown[], error: null as unknown } as { data: unknown; error: unknown } | 'tira',
  sesionLeida: 0,
}))
const getEvents = vi.hoisted(() => vi.fn())

vi.mock('@/lib/data', () => ({ getEvents }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => {
        estado.sesionLeida++
        return { data: { user: null } }
      },
    },
    from(tabla: string) {
      const c = { tabla, columnas: '', filtros: [] as [string, unknown][], limite: null as number | null }
      estado.consultas.push(c)
      const b: Record<string, unknown> = {
        select: (col: string) => ((c.columnas = col), b),
        eq: (col: string, v: unknown) => (c.filtros.push([col, v]), b),
        limit: (n: number) => ((c.limite = n), b),
        returns: async () => {
          if (estado.respuesta === 'tira') throw new Error('sin red')
          return estado.respuesta
        },
      }
      return b
    },
  }),
  createAdminClient: vi.fn(() => {
    throw new Error('/mapa no usa la service key')
  }),
}))
vi.mock('@/lib/actions/favorites', () => ({
  getUserFavorites: () => {
    throw new Error('/mapa no lee favoritos')
  },
}))
vi.mock('@/components/navbar', () => ({ Navbar: () => null }))
vi.mock('@/components/mobile-nav', () => ({ MobileNav: () => null }))

import MapaPage from '@/app/mapa/page'
import { MapaContenido } from '@/app/mapa/mapa-contenido'

const AHORA = new Date('2026-11-03T18:00:00Z')
const PLAZA_VENUE = '33333333-3333-4333-8333-333333333333'
const PELOTERO_VENUE = '44444444-4444-4444-8444-444444444444'

const filaLugar = (id: string, venueId: string, acceso: string, nombre: string) => ({
  id,
  venue_id: venueId,
  tipo: acceso === 'gratis' ? 'plaza_juegos' : 'pelotero',
  estado: 'publicado',
  descripcion_corta: null,
  edad_min: null,
  edad_max: null,
  horarios: { version: 1, semana: {} },
  acceso,
  nota_precio: null,
  techado: null,
  tiene_rampa: null,
  tiene_bano_adaptado: null,
  tiene_cambiador: null,
  contacto_telefono: null,
  contacto_web: null,
  contacto_instagram: null,
  fuente: 'visita',
  osm_ref: null,
  verificado_at: '2026-10-20T12:00:00Z',
  venue: { name: nombre, address: 'Calle 1', slug: null, latitude: -24.79, longitude: -65.41, canonical_venue_id: null },
})

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

async function props(params: Record<string, string> = {}) {
  const contenido = buscar(await MapaPage({ searchParams: Promise.resolve(params) }), MapaContenido)
  expect(contenido).not.toBeNull()
  return contenido!.props as { lugaresChicos: { venueId: string; nombre: string; acceso: string }[]; lugarInicial: string | null }
}

beforeEach(() => {
  estado.consultas = []
  estado.respuesta = { data: [filaLugar('l1', PLAZA_VENUE, 'gratis', 'Plaza 9 de Julio'), filaLugar('l2', PELOTERO_VENUE, 'pago', 'Pelotero Centro')], error: null }
  estado.sesionLeida = 0
  getEvents.mockReset()
  getEvents.mockResolvedValue([])
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AHORA)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('/mapa?capa=chicos', () => {
  it('sin la capa no se lee la tabla', async () => {
    expect((await props()).lugaresChicos).toEqual([])
    expect(estado.consultas).toEqual([])
  })

  it('con la capa: solo publicados, columnas públicas y un tope; nunca la sesión', async () => {
    const p = await props({ capa: 'chicos' })
    expect(p.lugaresChicos.map((l) => l.nombre).sort()).toEqual(['Pelotero Centro', 'Plaza 9 de Julio'])
    const [c] = estado.consultas
    expect(c!.tabla).toBe('lugares_permanentes')
    expect(c!.filtros).toEqual([['estado', 'publicado']])
    expect(c!.limite).toBe(500)
    expect(c!.columnas).not.toMatch(/cargado_por|verificado_por/)
    expect(estado.sesionLeida).toBe(0)
  })

  it('gratis=1 deja solo los gratis', async () => {
    const p = await props({ capa: 'chicos', gratis: '1' })
    expect(p.lugaresChicos.map((l) => l.acceso)).toEqual(['gratis'])
  })

  it('?lugar= con el venue de un lugar para chicos (sin eventos) llega como lugar inicial; sin la capa, no', async () => {
    expect((await props({ capa: 'chicos', lugar: PELOTERO_VENUE })).lugarInicial).toBe(PELOTERO_VENUE)
    expect((await props({ lugar: PELOTERO_VENUE })).lugarInicial).toBeNull()
  })

  it('si la lectura falla (error o excepción), el mapa sale igual sin la capa', async () => {
    estado.respuesta = { data: null, error: { code: '57014' } }
    expect((await props({ capa: 'chicos' })).lugaresChicos).toEqual([])
    estado.respuesta = 'tira'
    expect((await props({ capa: 'chicos' })).lugaresChicos).toEqual([])
  })
})
