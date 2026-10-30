// B2: datos estructurados. Los constructores de lib/seo/json-ld.ts, y el
// JSON-LD que de verdad sale en el HTML de la portada, la ficha y /cines:
// se renderiza cada página con datos falsos, se sacan los
// <script type="application/ld+json"> y se parsean. Sin red ni base.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Dobles (vi.mock se iza: van antes de los imports de las páginas)
// ---------------------------------------------------------------------------

const getEvents = vi.fn()
const getEventById = vi.fn()
vi.mock('@/lib/data', () => ({
  getEvents: (...a: unknown[]) => getEvents(...a),
  getEventById: (...a: unknown[]) => getEventById(...a),
  getCategories: async () => [],
}))
vi.mock('@/lib/instagram/data', () => ({ getActiveFlyers: async () => [] }))
vi.mock('@/lib/actions/favorites', () => ({ getUserFavorites: async () => [] }))
vi.mock('@/lib/actions/radar', () => ({ obtenerSeguimientoDeEvento: async () => ({ lugar: null, cuenta: null }) }))
vi.mock('@/lib/asistencia-lectura', () => ({ leerAsistencia: async () => ({ ok: false }) }))

/** Lo que devuelve la consulta a `cinema_movies` (portada y /cines). */
let peliculas: Record<string, unknown>[] = []
const consulta = () => {
  const q = {
    select: () => q,
    eq: () => q,
    order: async () => ({ data: peliculas, error: null }),
  }
  return q
}
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: () => consulta(),
  }),
  createAdminClient: vi.fn(),
}))

vi.mock('@/components/home-content', () => ({ HomeContent: () => null }))
vi.mock('@/components/event-detail-page', () => ({ EventDetailPage: () => null }))
vi.mock('@/components/cines-view', () => ({ CinesView: () => null }))
vi.mock('@/components/navbar', () => ({ Navbar: () => null }))
vi.mock('@/components/mobile-nav', () => ({ MobileNav: () => null }))
// El layout se importa solo para comparar sus metadatos.
vi.mock('next/font/google', () => {
  const font = () => ({ className: '', variable: '', style: {} })
  return { Montserrat: font, Yellowtail: font, Poppins: font }
})

import { PaginaPortada } from '@/components/portada/pagina-portada'
import EventPage from '@/app/evento/[id]/page'
import { PaginaCines } from '@/components/cines/pagina-cines'
import { metadata as layoutMetadata } from '@/app/layout'
import {
  SITE_NAME,
  SITE_URL,
  conContexto,
  grafoJsonLd,
  listaJsonLd,
  migasJsonLd,
  organizacionJsonLd,
  serializarJsonLd,
  sitioWebJsonLd,
} from '@/lib/seo/json-ld'
import { IMAGEN_OG_POR_DEFECTO } from '@/lib/seo/sitio'
import { eventosParaListaDeLaPortada, MAX_EVENTOS_EN_LISTA } from '@/lib/seo/listas'
import { anclaDePelicula } from '@/lib/seo/anclas'
import { buildDisplayData } from '@/lib/home/transform'

// ---------------------------------------------------------------------------
// Ayudas
// ---------------------------------------------------------------------------

type Nodo = Record<string, unknown>

/** Cada bloque JSON-LD del HTML, parseado. */
function bloquesJsonLd(html: string): Nodo[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (m) => JSON.parse(m[1]) as Nodo
  )
}

/** Los nodos sueltos: los de cada `@graph` más los bloques de un solo nodo. */
function nodos(bloques: Nodo[]): Nodo[] {
  return bloques.flatMap((b) => (Array.isArray(b['@graph']) ? (b['@graph'] as Nodo[]) : [b]))
}

const deTipo = (lista: Nodo[], tipo: string) => lista.filter((n) => n['@type'] === tipo)

const DIA = 24 * 60 * 60 * 1000
const enDias = (d: number) => new Date(Date.now() + d * DIA).toISOString()
const uid = (n: number) => `99999999-9999-4999-8999-${String(n).padStart(12, '0')}`

const CATEGORIA = { id: 'cat-1', name: 'Peñas', slug: 'penas' }
const LUGAR = { id: 'v-1', name: 'Casa Grande', address: 'Balcarce 900', latitude: -24.78, longitude: -65.41, google_maps_url: null }

function evento(n: number, over: Record<string, unknown> = {}) {
  return {
    id: uid(n),
    title: `Evento ${n}`,
    slug: `evento-${n}`,
    description: 'Descripción larga',
    short_description: null,
    status: 'PUBLISHED',
    start_date: enDias(n),
    end_date: null,
    image_url: null,
    is_free: true,
    price_min: null,
    ticket_url: null,
    created_at: '2026-10-01T12:00:00.000Z',
    featured_until: null,
    tags: [],
    category: CATEGORIA,
    venue: LUGAR,
    ...over,
  }
}

beforeEach(() => {
  getEvents.mockReset()
  getEventById.mockReset()
  peliculas = []
})

// ---------------------------------------------------------------------------
// Constructores
// ---------------------------------------------------------------------------

describe('constructores de lib/seo/json-ld', () => {
  it('SITE_URL y SITE_NAME son los del layout (metadataBase y og:site_name)', () => {
    expect(new URL(SITE_URL).toString()).toBe(layoutMetadata.metadataBase!.toString())
    expect(SITE_NAME).toBe(layoutMetadata.openGraph?.siteName)
    expect(layoutMetadata.title).toMatchObject({ template: `%s | ${SITE_NAME}` })
  })

  it('IMAGEN_OG_POR_DEFECTO es la imagen Open Graph del layout', () => {
    const imagenes = layoutMetadata.openGraph?.images as unknown[]
    expect(imagenes[0]).toEqual({ ...IMAGEN_OG_POR_DEFECTO })
  })

  it('Organization: @id, nombre, url y un logo absoluto que existe en public/', async () => {
    const org = organizacionJsonLd()
    expect(org).toMatchObject({ '@type': 'Organization', '@id': `${SITE_URL}/#organizacion`, name: SITE_NAME })
    const logo = org.logo as string
    expect(logo.startsWith(`${SITE_URL}/`)).toBe(true)
    const { existsSync } = await import('node:fs')
    const { join } = await import('node:path')
    expect(existsSync(join(__dirname, '..', '..', 'public', new URL(logo).pathname))).toBe(true)
    // Sin perfiles del sitio en el código: sin sameAs (nada de los del autor).
    expect(org.sameAs).toBeUndefined()
  })

  it('WebSite: publisher es la Organization y la búsqueda va a la portada con ?search=', () => {
    const sitio = sitioWebJsonLd()
    expect(sitio).toMatchObject({
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#sitio`,
      inLanguage: 'es-AR',
      alternateName: ['Qué Pinta Salta'],
      publisher: { '@id': `${SITE_URL}/#organizacion` },
    })
    const accion = sitio.potentialAction as { target: { urlTemplate: string }; 'query-input': string }
    expect(accion.target.urlTemplate).toBe(`${SITE_URL}/?search={search_term_string}`)
    expect(accion['query-input']).toBe('required name=search_term_string')
  })

  it('BreadcrumbList: posiciones desde 1 y URLs absolutas', () => {
    expect(
      migasJsonLd([
        { nombre: 'Inicio', url: '/' },
        { nombre: 'Peñas', url: '/?category=penas' },
        { nombre: 'Evento', url: `${SITE_URL}/evento/1` },
      ])
    ).toEqual({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'Peñas', item: `${SITE_URL}/?category=penas` },
        { '@type': 'ListItem', position: 3, name: 'Evento', item: `${SITE_URL}/evento/1` },
      ],
    })
  })

  it('ItemList: con URLs o con nodos embebidos, y numberOfItems', () => {
    const conUrls = listaJsonLd([{ url: '/evento/a', nombre: 'A' }, { url: '/evento/b' }])
    expect(conUrls).toEqual({
      '@type': 'ItemList',
      numberOfItems: 2,
      itemListElement: [
        { '@type': 'ListItem', position: 1, url: `${SITE_URL}/evento/a`, name: 'A' },
        { '@type': 'ListItem', position: 2, url: `${SITE_URL}/evento/b` },
      ],
    })
    const embebidos = listaJsonLd([{ item: { '@type': 'Movie', name: 'Peli' } }], { nombre: 'Cartel', url: '/cines' })
    expect(embebidos).toEqual({
      '@type': 'ItemList',
      name: 'Cartel',
      url: `${SITE_URL}/cines`,
      numberOfItems: 1,
      itemListElement: [{ '@type': 'ListItem', position: 1, item: { '@type': 'Movie', name: 'Peli' } }],
    })
  })

  it('grafoJsonLd y conContexto ponen el @context de schema.org', () => {
    expect(grafoJsonLd([{ '@type': 'Thing' }])).toEqual({ '@context': 'https://schema.org', '@graph': [{ '@type': 'Thing' }] })
    expect(conContexto({ '@type': 'Thing' })).toEqual({ '@context': 'https://schema.org', '@type': 'Thing' })
  })

  it('serializarJsonLd escapa todos los "<" (un "</script>" no cierra el script) y sigue siendo el mismo JSON', () => {
    const data = { name: 'Peña </script><script>alert(1)</script> <b>' }
    const json = serializarJsonLd(data)
    expect(json).not.toContain('<')
    expect(json).toContain('\\u003c/script>')
    expect(JSON.parse(json)).toEqual(data)
  })
})

describe('eventosParaListaDeLaPortada', () => {
  const now = new Date()

  it('deja afuera lo que ya terminó y lo que no tiene categoría, y ordena por inicio', () => {
    const lista = eventosParaListaDeLaPortada(
      [
        evento(3),
        evento(1),
        evento(2, { category: null }),
        evento(4, { start_date: enDias(-3), end_date: enDias(-2) }),
      ] as never,
      now
    )
    expect(lista.map((e) => e.id)).toEqual([uid(1), uid(3)])
  })

  it('junta las funciones repetidas (mismo título y lugar) como la portada, y corta en el máximo', () => {
    const repetidas = [evento(1, { title: 'Misma' }), evento(2, { title: 'Misma' })]
    expect(eventosParaListaDeLaPortada(repetidas as never, now)).toEqual([{ id: uid(1), titulo: 'Misma' }])

    const muchos = Array.from({ length: 30 }, (_, i) => evento(i + 1))
    expect(eventosParaListaDeLaPortada(muchos as never, now)).toHaveLength(MAX_EVENTOS_EN_LISTA)
  })

  it('son los mismos eventos que la agenda de la portada (buildDisplayData), sin flyers ni películas', () => {
    const eventos = [
      evento(5),
      evento(1, { title: 'Repetida' }),
      evento(2, { title: 'Repetida' }),
      evento(3, { category: null }),
      evento(4, { start_date: enDias(-3), end_date: enDias(-2) }),
      evento(6, { start_date: enDias(-10), end_date: enDias(10) }), // en curso
    ]
    const pelicula = { id: 'm1', slug: 'peli', title: 'Peli', poster_url: null, showings: {}, is_currently_showing: true }
    const deLaPortada = buildDisplayData(eventos as never, [], [pelicula] as never, new Map(), now)
      .all.filter((e) => !e.isCinemaMovie && !e.isInstagramFlyer)
      .map((e) => e.id)
    const enLaLista = eventosParaListaDeLaPortada(eventos as never, now).map((e) => e.id)
    expect([...enLaLista].sort()).toEqual([...deLaPortada].sort())
    expect(enLaLista).toEqual([uid(6), uid(1), uid(5)])
  })
})

// ---------------------------------------------------------------------------
// Páginas renderizadas
// ---------------------------------------------------------------------------

describe('portada: JSON-LD en el HTML', () => {
  it('un @graph con Organization, WebSite (con SearchAction) e ItemList de fichas absolutas', async () => {
    getEvents.mockResolvedValue([evento(2), evento(1, { title: 'Peña </script> rara' })])
    const html = renderToStaticMarkup(await PaginaPortada({ idioma: 'es' }))
    const bloques = bloquesJsonLd(html)
    expect(bloques).toHaveLength(1)
    expect(bloques[0]['@context']).toBe('https://schema.org')

    const todos = nodos(bloques)
    expect(deTipo(todos, 'Organization')).toHaveLength(1)

    const [sitio] = deTipo(todos, 'WebSite')
    const accion = sitio.potentialAction as { '@type': string; target: { urlTemplate: string } }
    expect(accion['@type']).toBe('SearchAction')
    expect(accion.target.urlTemplate.startsWith(SITE_URL)).toBe(true)
    expect(accion.target.urlTemplate).toContain('{search_term_string}')

    const [lista] = deTipo(todos, 'ItemList')
    expect(lista.numberOfItems).toBe(2)
    const elementos = lista.itemListElement as { position: number; url: string; name: string }[]
    expect(elementos.map((e) => e.position)).toEqual([1, 2])
    expect(elementos.map((e) => e.url)).toEqual([`${SITE_URL}/evento/${uid(1)}`, `${SITE_URL}/evento/${uid(2)}`])
    // El título con "</script>" vuelve entero del JSON y no rompió el HTML.
    expect(elementos[0].name).toBe('Peña </script> rara')
  })

  it('sin eventos no publica el ItemList (pero sí Organization y WebSite)', async () => {
    getEvents.mockResolvedValue([])
    const todos = nodos(bloquesJsonLd(renderToStaticMarkup(await PaginaPortada({ idioma: 'es' }))))
    expect(todos.map((n) => n['@type']).sort()).toEqual(['Organization', 'WebSite'])
  })

  it('en inglés (/en) no sale JSON-LD: el WebSite y las URLs son de la versión en castellano', async () => {
    getEvents.mockResolvedValue([evento(1)])
    expect(bloquesJsonLd(renderToStaticMarkup(await PaginaPortada({ idioma: 'en' })))).toEqual([])
  })
})

describe('ficha: JSON-LD en el HTML', () => {
  async function renderFicha(ev: Record<string, unknown>) {
    getEventById.mockResolvedValue(ev)
    const pagina = await EventPage({ params: Promise.resolve({ id: ev.id as string }) })
    return nodos(bloquesJsonLd(renderToStaticMarkup(pagina)))
  }

  it('un solo Event (igual que antes: con su @context y la descripción sin limpiar) y un solo BreadcrumbList', async () => {
    const descripcion = '🎶🔥 ¡UNA NOCHE CON ARTISTAS!\n\nEntrada libre'
    const todos = await renderFicha(evento(1, { short_description: descripcion }))
    const eventos = deTipo(todos, 'Event')
    expect(eventos).toHaveLength(1)
    expect(eventos[0]).toMatchObject({
      '@context': 'https://schema.org',
      '@id': `${SITE_URL}/evento/${uid(1)}`,
      name: 'Evento 1',
      description: descripcion,
    })
    expect(deTipo(todos, 'BreadcrumbList')).toHaveLength(1)
  })

  it('migas: Inicio → categoría (?category=<slug>, la que filtra la portada) → el evento', async () => {
    const [migas] = deTipo(await renderFicha(evento(1)), 'BreadcrumbList')
    const items = migas.itemListElement as { position: number; name: string; item: string }[]
    expect(items).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Peñas', item: `${SITE_URL}/?category=penas` },
      { '@type': 'ListItem', position: 3, name: 'Evento 1', item: `${SITE_URL}/evento/${uid(1)}` },
    ])
  })

  it('sin categoría, las migas son Inicio → el evento', async () => {
    const [migas] = deTipo(await renderFicha(evento(1, { category: null })), 'BreadcrumbList')
    const items = migas.itemListElement as { name: string; item: string }[]
    expect(items.map((i) => i.item)).toEqual([`${SITE_URL}/`, `${SITE_URL}/evento/${uid(1)}`])
  })

  it('offers: gratis → precio 0; pago con precio → ese precio; pago sin precio (null o 0) → sin price ni priceCurrency', async () => {
    const oferta = async (over: Record<string, unknown>) =>
      deTipo(await renderFicha(evento(1, over)), 'Event')[0].offers as Record<string, unknown>

    expect(await oferta({ is_free: true, price_min: null })).toMatchObject({ price: 0, priceCurrency: 'ARS' })
    expect(await oferta({ is_free: false, price_min: 15000 })).toMatchObject({ price: 15000, priceCurrency: 'ARS' })
    for (const price_min of [null, 0]) {
      const o = await oferta({ is_free: false, price_min })
      expect(o).not.toHaveProperty('price')
      expect(o).not.toHaveProperty('priceCurrency')
      // El resto de la oferta, igual.
      expect(o).toMatchObject({ '@type': 'Offer', name: 'Entrada', availability: 'https://schema.org/InStock' })
    }
  })

  it('un evento que no es público (DRAFT) no publica ni el Event ni las migas', async () => {
    expect(await renderFicha(evento(1, { status: 'DRAFT' }))).toEqual([])
  })
})

describe('/cines: JSON-LD en el HTML', () => {
  const PELICULAS = [
    { id: 'm1', slug: 'pelicula-uno', title: 'Película Uno', poster_url: 'https://cinemark.example/uno.jpg', showings: {} },
    // Sin afiche usable: null, o '' (lo que guarda el scraper cuando no responde).
    { id: 'm2', slug: 'pelicula-dos', title: 'Película Dos', poster_url: null, showings: {} },
    { id: 'm3', slug: 'pelicula-tres', title: 'Película Tres', poster_url: '', showings: {} },
    { id: 'm4', slug: 'la-cuarta', title: 'La Cuarta', poster_url: '/afiches/cuarta.jpg', showings: {} },
  ]

  it('ItemList de Movie con nombre, afiche absoluto y el ancla de su tarjeta; sin las que no tienen afiche', async () => {
    peliculas = PELICULAS
    const todos = nodos(bloquesJsonLd(renderToStaticMarkup(await PaginaCines({ idioma: 'es' }))))
    const [lista] = deTipo(todos, 'ItemList')
    expect(lista['@context']).toBe('https://schema.org')
    expect(lista.numberOfItems).toBe(2)
    expect(lista.itemListElement).toEqual([
      {
        '@type': 'ListItem',
        position: 1,
        item: {
          '@type': 'Movie',
          name: 'Película Uno',
          url: `${SITE_URL}/cines#pelicula-pelicula-uno`,
          image: 'https://cinemark.example/uno.jpg',
        },
      },
      {
        '@type': 'ListItem',
        position: 2,
        item: {
          '@type': 'Movie',
          name: 'La Cuarta',
          url: `${SITE_URL}/cines#pelicula-la-cuarta`,
          image: `${SITE_URL}/afiches/cuarta.jpg`,
        },
      },
    ])
  })

  it('el ancla de cada Movie existe como id (único y válido) en la grilla de /cines', async () => {
    const { CinesView } = await vi.importActual<typeof import('@/components/cines-view')>('@/components/cines-view')
    const html = renderToStaticMarkup(createElement(CinesView, { movies: PELICULAS as never }))
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]).filter((id) => id.startsWith('pelicula-'))
    expect(ids).toEqual(['pelicula-pelicula-uno', 'pelicula-pelicula-dos', 'pelicula-pelicula-tres', 'pelicula-la-cuarta'])
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]*$/)

    peliculas = PELICULAS
    const [lista] = deTipo(nodos(bloquesJsonLd(renderToStaticMarkup(await PaginaCines({ idioma: 'es' })))), 'ItemList')
    for (const el of lista.itemListElement as { item: { url: string } }[]) {
      expect(ids).toContain(new URL(el.item.url).hash.slice(1))
    }
  })

  it('anclaDePelicula normaliza lo que no sirve para un id de HTML', () => {
    expect(anclaDePelicula('Toy Story 5')).toBe('pelicula-toy-story-5')
    expect(anclaDePelicula('-rara--')).toBe('pelicula-rara')
  })

  it('sin películas con afiche no hay JSON-LD', async () => {
    peliculas = [PELICULAS[1], PELICULAS[2]]
    expect(bloquesJsonLd(renderToStaticMarkup(await PaginaCines({ idioma: 'es' })))).toEqual([])
    peliculas = []
    expect(bloquesJsonLd(renderToStaticMarkup(await PaginaCines({ idioma: 'es' })))).toEqual([])
  })

  it('en inglés (/en/cines) no sale JSON-LD: las URLs de las películas son anclas de /cines', async () => {
    peliculas = PELICULAS
    expect(bloquesJsonLd(renderToStaticMarkup(await PaginaCines({ idioma: 'en' })))).toEqual([])
  })
})
