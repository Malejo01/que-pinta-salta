// R-1 · La ficha pública de un lugar (/lugar/<slug> y /en/place/<slug>, Q5-5)
// de punta a punta, con Supabase de mentira: qué se busca, cuándo es 404,
// cuándo redirige (308) al slug canónico, la metadata (canonical, hreflang,
// noindex) y el HTML con su JSON-LD. Antes: las reglas puras
// (ficha.test.ts) y un detector que leía el fuente de la página.
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Consulta = { tabla: string; columnas: string; filtros: [string, string, unknown][] }
type Venue = {
  id: string
  name: string
  address: string
  slug: string | null
  latitude: number | string | null
  longitude: number | string | null
  canonical_venue_id: string | null
  is_placeholder: boolean
}

const estado = vi.hoisted(() => ({
  venues: [] as Venue[],
  eventos: [] as Record<string, unknown>[],
  permanentes: [] as Record<string, unknown>[],
  errorVenues: null as unknown,
  errorEventos: null as unknown,
  user: null as { id: string } | null,
  seguidos: [] as string[],
  consultas: [] as Consulta[],
  ruta: '/lugar/teatro-provincial',
}))

function filtrar<T extends Record<string, unknown>>(filas: T[], filtros: Consulta['filtros']): T[] {
  return filas.filter((f) =>
    filtros.every(([op, col, v]) => {
      if (op === 'eq') return f[col] === v
      if (op === 'in') return (v as unknown[]).includes(f[col])
      if (op === 'gte') return String(f[col]) >= String(v)
      if (op === 'or') {
        // Solo la forma que usa la ficha: «a.gte.X,b.gte.Y».
        return String(v)
          .split(',')
          .some((parte) => {
            const [c, o, ...valor] = parte.split('.')
            return o === 'gte' && f[c!] != null && String(f[c!]) >= valor.join('.')
          })
      }
      return true
    }),
  )
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: estado.user } }) },
    from(tabla: string) {
      const c: Consulta = { tabla, columnas: '', filtros: [] }
      const filas = (): { data: unknown; error: unknown } => {
        estado.consultas.push(c)
        if (tabla === 'venues') return { data: estado.errorVenues ? null : filtrar(estado.venues, c.filtros), error: estado.errorVenues }
        if (tabla === 'events') return { data: estado.errorEventos ? null : filtrar(estado.eventos, c.filtros), error: estado.errorEventos }
        if (tabla === 'lugares_permanentes') return { data: filtrar(estado.permanentes, c.filtros), error: null }
        if (tabla === 'user_followed_venues') {
          const venue = c.filtros.find(([, col]) => col === 'venue_id')?.[2] as string
          return { data: estado.seguidos.includes(venue) ? [{ venue_id: venue }] : [], error: null }
        }
        return { data: [], error: null }
      }
      const b: Record<string, unknown> = {
        select: (col: string) => ((c.columnas = col), b),
        order: () => b,
        limit: () => b,
        maybeSingle: async () => {
          const r = filas()
          return { data: (r.data as unknown[] | null)?.[0] ?? null, error: r.error }
        },
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(filas()).then(res, rej),
      }
      for (const m of ['eq', 'in', 'gte']) b[m] = (col: string, v: unknown) => (c.filtros.push([m, col, v]), b)
      b.or = (expr: string) => (c.filtros.push(['or', '', expr]), b)
      return b
    },
  }),
  createAdminClient: vi.fn(() => {
    throw new Error('la ficha pública no usa la service key')
  }),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => estado.ruta,
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  permanentRedirect: (url: string) => {
    throw new Error('308: ' + url)
  },
}))
// Lo interactivo (cliente) se reemplaza por marcas: acá importa la página del servidor.
vi.mock('@/components/navbar', () => ({ Navbar: () => null }))
vi.mock('@/components/mobile-nav', () => ({ MobileNav: () => null }))
vi.mock('@/components/lugares/mapa-chico-lugar', () => ({ MapaChicoLugar: () => React.createElement('div', { 'data-mapa': 'si' }) }))
vi.mock('@/components/lugares/boton-compartir-lugar', () => ({ BotonCompartirLugar: () => null }))
vi.mock('@/components/boton-seguir', () => ({
  BotonSeguir: (p: { id: string; siguiendoInicial: boolean; haySesion: boolean }) =>
    React.createElement('span', { 'data-seguir': p.id, 'data-siguiendo': String(p.siguiendoInicial), 'data-sesion': String(p.haySesion) }),
}))

import LugarPage, { generateMetadata as metadataEs } from '@/app/lugar/[slug]/page'
import PlacePage, { generateMetadata as metadataEn } from '@/app/en/place/[slug]/page'
import { obtenerFichaLugar } from '@/lib/lugares/ficha'
import { SITE_URL } from '@/lib/seo/sitio'

const TEATRO = '11111111-1111-4111-8111-111111111111'
const VIEJO = '22222222-2222-4222-8222-222222222222'
const PLAZA = '33333333-3333-4333-8333-333333333333'
const AHORA = new Date('2026-11-03T18:00:00Z')

const venue = (v: Partial<Venue> & Pick<Venue, 'id' | 'name'>): Venue => ({
  address: 'Mitre 1',
  slug: null,
  latitude: '-24.7883',
  longitude: '-65.4106',
  canonical_venue_id: null,
  is_placeholder: false,
  ...v,
})
const evento = (id: string, venueId: string, inicio: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: `Evento ${id}`,
  start_date: inicio,
  end_date: null,
  is_free: false,
  status: 'PUBLISHED',
  venue_id: venueId,
  ...extra,
})
const props = (slug: string) => ({ params: Promise.resolve({ slug }) })

beforeEach(() => {
  estado.venues = [
    venue({ id: TEATRO, name: 'Teatro Provincial', slug: 'teatro-provincial', address: 'Zuviría 70' }),
    // Un venue fusionado en el Teatro, con su slug viejo.
    venue({ id: VIEJO, name: 'Teatro Prov.', slug: 'teatro-prov', canonical_venue_id: TEATRO }),
    venue({ id: PLAZA, name: 'Plaza Güemes', slug: 'plaza-guemes', address: 'Caseros y Zuviría' }),
    venue({ id: 'ph', name: 'A confirmar', slug: 'a-confirmar', is_placeholder: true }),
    venue({ id: 'flaco', name: 'Bar Flaco', slug: 'bar-flaco' }),
  ]
  estado.eventos = [
    evento('e1', TEATRO, '2026-11-10T23:00:00Z', { is_free: true }),
    evento('e2', VIEJO, '2026-11-20T23:00:00Z'),
    evento('e3', TEATRO, '2026-10-20T23:00:00Z'),
    evento('e4', TEATRO, '2026-11-15T23:00:00Z', { status: 'PENDING' }),
  ]
  estado.permanentes = []
  estado.errorVenues = null
  estado.errorEventos = null
  estado.user = null
  estado.seguidos = []
  estado.consultas = []
  estado.ruta = '/lugar/teatro-provincial'
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AHORA)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('obtenerFichaLugar', () => {
  it('por slug: el venue, sus eventos PUBLICADOS (también los del venue fusionado), próximos y recientes', async () => {
    const f = await obtenerFichaLugar('teatro-provincial')
    expect(f.tipo).toBe('ok')
    if (f.tipo !== 'ok') return
    expect(f.venue).toEqual({ id: TEATRO, nombre: 'Teatro Provincial', direccion: 'Zuviría 70', slug: 'teatro-provincial', lat: -24.7883, lng: -65.4106 })
    expect(f.proximos.map((e) => e.id)).toEqual(['e1', 'e2'])
    expect(f.pasados.map((e) => e.id)).toEqual(['e3'])
    expect(f.permanente).toBeNull()
    const eventos = estado.consultas.find((c) => c.tabla === 'events')!
    expect(eventos.filtros).toContainEqual(['eq', 'status', 'PUBLISHED'])
    expect(eventos.filtros).toContainEqual(['in', 'venue_id', [TEATRO, VIEJO]])
  })

  it('bug R-1: una muestra que empezó hace más de 60 días y sigue abierta aparece en «Próximos»', async () => {
    estado.eventos.push(
      evento('muestra-larga', TEATRO, '2026-08-01T13:00:00Z', { end_date: '2026-12-20T23:00:00Z' }),
      evento('vieja-terminada', TEATRO, '2026-08-01T13:00:00Z', { end_date: '2026-08-30T23:00:00Z' }),
    )
    const f = await obtenerFichaLugar('teatro-provincial')
    expect(f.tipo === 'ok' && f.proximos.map((e) => e.id)).toEqual(['muestra-larga', 'e1', 'e2'])
    expect(f.tipo === 'ok' && f.pasados.map((e) => e.id)).toEqual(['e3'])
    const eventos = estado.consultas.find((c) => c.tabla === 'events')!
    expect(eventos.filtros).toContainEqual(['or', '', 'start_date.gte.2026-09-04T18:00:00.000Z,end_date.gte.2026-11-03T18:00:00.000Z'])
  })

  it('por uuid o por el slug de un venue fusionado: redirige al slug canónico', async () => {
    expect(await obtenerFichaLugar(TEATRO)).toEqual({ tipo: 'redirigir', slug: 'teatro-provincial' })
    expect(await obtenerFichaLugar(TEATRO.toUpperCase())).toEqual({ tipo: 'redirigir', slug: 'teatro-provincial' })
    expect(await obtenerFichaLugar('teatro-prov')).toEqual({ tipo: 'redirigir', slug: 'teatro-provincial' })
  })

  it.each([
    ['un slug que no existe', 'no-existe'],
    ['un venue «a confirmar» (placeholder)', 'a-confirmar'],
    ['algo que no es slug', 'hola mundo!'],
    ['un slug larguísimo', 'a'.repeat(101)],
  ])('%s: no-existe', async (_n, slug) => {
    expect(await obtenerFichaLugar(slug)).toEqual({ tipo: 'no-existe' })
  })

  it('bug R-1: un parámetro con un % suelto (mal codificado) es «no existe», no un error 500', async () => {
    await expect(obtenerFichaLugar('%E0%A4%A')).resolves.toEqual({ tipo: 'no-existe' })
    await expect(obtenerFichaLugar('teatro%')).resolves.toEqual({ tipo: 'no-existe' })
  })

  it('un venue fusionado en un placeholder (o sin slug): no-existe', async () => {
    estado.venues.push(venue({ id: 'v2', name: 'Otro', slug: 'otro', canonical_venue_id: 'ph' }))
    expect(await obtenerFichaLugar('otro')).toEqual({ tipo: 'no-existe' })
  })

  it('si la base falla al leer el venue, tira (la página da error; la metadata no)', async () => {
    estado.errorVenues = { code: '57014' }
    await expect(obtenerFichaLugar('teatro-provincial')).rejects.toThrow('ficha-lugar: venue')
  })

  it('si fallan los eventos, la ficha sale igual sin eventos', async () => {
    estado.errorEventos = { code: '57014' }
    const f = await obtenerFichaLugar('teatro-provincial')
    expect(f.tipo === 'ok' && f.proximos.length + f.pasados.length).toBe(0)
  })
})

describe('metadata: canonical, hreflang y noindex', () => {
  it('castellano: canonical al slug, hreflang es-AR / en / x-default, indexable si tiene eventos', async () => {
    const m = await metadataEs(props('teatro-provincial'))
    expect(m.title).toBe('Teatro Provincial, Salta')
    expect(m.alternates).toEqual({
      canonical: '/lugar/teatro-provincial',
      languages: { 'es-AR': '/lugar/teatro-provincial', en: '/en/place/teatro-provincial', 'x-default': '/lugar/teatro-provincial' },
    })
    expect(m.robots).toBeUndefined()
    expect(m.openGraph).toMatchObject({ url: '/lugar/teatro-provincial' })
  })

  it('inglés: canonical a /en/place, el mismo hreflang y locale en_US', async () => {
    const m = await metadataEn(props('teatro-provincial'))
    expect(m.alternates?.canonical).toBe('/en/place/teatro-provincial')
    expect(m.alternates?.languages).toEqual({ 'es-AR': '/lugar/teatro-provincial', en: '/en/place/teatro-provincial', 'x-default': '/lugar/teatro-provincial' })
    expect(m.openGraph).toMatchObject({ url: '/en/place/teatro-provincial', locale: 'en_US' })
  })

  it('una ficha flaca (sin eventos ni lugar permanente): noindex, follow', async () => {
    expect((await metadataEs(props('bar-flaco'))).robots).toEqual({ index: false, follow: true })
  })

  it('un lugar que no existe, o la base caída: «no encontrado» y noindex (la metadata nunca tira)', async () => {
    expect(await metadataEs(props('no-existe'))).toEqual({ title: 'No encontramos ese lugar', robots: { index: false, follow: true } })
    estado.errorVenues = { code: '57014' }
    expect((await metadataEn(props('teatro-provincial'))).robots).toEqual({ index: false, follow: true })
  })
})

describe('la página', () => {
  it('404 para lo que no existe', async () => {
    await expect(LugarPage(props('no-existe'))).rejects.toThrow('NEXT_NOT_FOUND')
    await expect(PlacePage(props('a-confirmar'))).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('308 al slug canónico, en el mismo idioma', async () => {
    await expect(LugarPage(props(TEATRO))).rejects.toThrow('308: /lugar/teatro-provincial')
    await expect(PlacePage(props('teatro-prov'))).rejects.toThrow('308: /en/place/teatro-provincial')
  })

  it('el HTML: nombre, dirección, eventos (lo pendiente no), «Seguir» sin sesión y el JSON-LD con los próximos', async () => {
    const html = renderToStaticMarkup(await LugarPage(props('teatro-provincial')))
    expect(html).toMatch(/<h1[^>]*>Teatro Provincial<\/h1>/)
    expect(html).toContain('Zuviría 70')
    expect(html).toContain('href="/evento/e1"')
    expect(html).toContain('href="/evento/e2"')
    expect(html).toContain('href="/evento/e3"')
    expect(html).not.toContain('/evento/e4')
    expect(html).toContain(`data-seguir="${TEATRO}" data-siguiendo="false" data-sesion="false"`)
    expect(html).toContain(`href="/mapa?cuando=hoy&amp;lugar=${TEATRO}"`)
    const json = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]!)
    expect(json).toMatchObject({
      '@type': 'EventVenue',
      '@id': `${SITE_URL}/lugar/teatro-provincial`,
      url: `${SITE_URL}/lugar/teatro-provincial`,
      name: 'Teatro Provincial',
      geo: { latitude: -24.7883, longitude: -65.4106 },
    })
    expect(json.event.map((e: { '@id': string }) => e['@id'])).toEqual([
      `${SITE_URL}/evento/e1`,
      `${SITE_URL}/evento/e2`,
    ])
    expect(json.event[0].isAccessibleForFree).toBe(true)
  })

  it('en inglés: links a /en, el JSON-LD con la url en inglés y el @id de siempre; lo de la base marcado en castellano', async () => {
    estado.ruta = '/en/place/teatro-provincial'
    const html = renderToStaticMarkup(await PlacePage(props('teatro-provincial')))
    expect(html).toContain('href="/en/evento/e1"')
    expect(html).toMatch(/<h1 lang="es"[^>]*>Teatro Provincial<\/h1>/)
    const json = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]!)
    expect(json.url).toBe(`${SITE_URL}/en/place/teatro-provincial`)
    expect(json['@id']).toBe(`${SITE_URL}/lugar/teatro-provincial`)
    expect(json.event[0].url).toBe(`${SITE_URL}/en/evento/e1`)
  })

  it('con sesión y siguiendo el lugar: el botón arranca en «siguiendo»', async () => {
    estado.user = { id: 'u1' }
    estado.seguidos = [TEATRO]
    const html = renderToStaticMarkup(await LugarPage(props('teatro-provincial')))
    expect(html).toContain(`data-seguir="${TEATRO}" data-siguiendo="true" data-sesion="true"`)
    const lectura = estado.consultas.find((c) => c.tabla === 'user_followed_venues')!
    expect(lectura.filtros).toEqual([
      ['eq', 'user_id', 'u1'],
      ['eq', 'venue_id', TEATRO],
    ])
  })

  it('sin ubicación: sin mapa ni «Ver en el mapa», y el JSON-LD sin geo', async () => {
    estado.venues[0] = { ...estado.venues[0]!, latitude: null, longitude: null }
    const html = renderToStaticMarkup(await LugarPage(props('teatro-provincial')))
    expect(html).not.toContain('data-mapa')
    expect(html).not.toContain('/mapa?')
    const json = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]!)
    expect(json.geo).toBeUndefined()
  })
})
