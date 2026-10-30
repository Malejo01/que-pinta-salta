/**
 * hreflang en el sitemap (Q3, 78-c): toda ruta con versión en inglés sale dos
 * veces (castellano y /en) con `alternates.languages` iguales en las dos
 * entradas; legales, /eliminar-cuenta y flyers quedan sin alternates. Se
 * corren las dos ramas de app/sitemap.ts (sin y con variables de entorno de
 * Supabase) con un doble de @supabase/supabase-js. Sin red ni base.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ANUNCIANTES } from '@/lib/config/anunciantes'
import { RUTAS_EN_INGLES, tieneVersionEnIngles } from '@/lib/i18n/rutas'
import { idiomasAlternos } from '@/lib/i18n/seo'

const BASE = 'https://www.quepintasalta.com.ar'
const ID_EVENTO = '12345678-1234-4234-8234-123456789012'
const ID_FLYER = 'flyer-de-prueba-1'
const ACTUALIZADO = '2026-10-20T12:00:00.000Z'

const { tablas } = vi.hoisted(() => ({
  tablas: {} as Record<string, unknown[]>,
}))

function consulta(tabla: string): Record<string, unknown> {
  const c: Record<string, unknown> = {}
  const encadenar = () => c
  c.select = encadenar
  c.eq = encadenar
  c.gte = encadenar
  c.order = encadenar
  c.then = (ok?: (v: unknown) => unknown, error?: (e: unknown) => unknown) =>
    Promise.resolve({ data: tablas[tabla] ?? [], error: null }).then(ok, error)
  return c
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (tabla: string) => consulta(tabla) }),
}))

type Entrada = {
  url: string
  lastModified?: Date
  changeFrequency?: string
  priority?: number
  alternates?: { languages?: Record<string, string> }
}

async function correrSitemap(): Promise<Entrada[]> {
  vi.resetModules()
  const { default: sitemap } = await import('@/app/sitemap')
  return (await sitemap()) as Entrada[]
}

/** Las rutas relativas (con "/" para la portada) con inglés, convertidas a URL absoluta. */
const absoluta = (ruta: string) => (ruta === '/' ? BASE : `${BASE}${ruta}`)
const languagesAbsolutos = (ruta: string) =>
  Object.fromEntries(Object.entries(idiomasAlternos(ruta)).map(([idioma, r]) => [idioma, absoluta(r)]))

const RAMAS = [
  {
    nombre: 'sin variables de entorno de Supabase',
    preparar: () => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
      tablas.events = []
      tablas.instagram_flyers = []
      tablas.cinema_movies = []
    },
    conEvento: false,
  },
  {
    nombre: 'con Supabase configurado y un evento y un flyer de prueba',
    preparar: () => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proyecto-de-prueba.supabase.co')
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'clave-anonima-de-prueba')
      tablas.events = [{ id: ID_EVENTO, updated_at: ACTUALIZADO }]
      tablas.instagram_flyers = [{ id: ID_FLYER, published_at: ACTUALIZADO }]
      tablas.cinema_movies = [{ updated_at: ACTUALIZADO }]
    },
    conEvento: true,
  },
]

describe.each(RAMAS)('sitemap $nombre', ({ preparar, conEvento }) => {
  let urls: Entrada[]
  const entrada = (ruta: string) => urls.find((u) => u.url === absoluta(ruta))

  beforeEach(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-27T15:00:00.000Z'))
    preparar()
    urls = await correrSitemap()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it.each(['/', '/cines', '/mapa', '/buscar'])('%s sale en castellano y en /en con los mismos alternates', (ruta) => {
    const es = entrada(ruta)
    const en = entrada(ruta === '/' ? '/en' : `/en${ruta}`)
    expect(es).toBeDefined()
    expect(en).toBeDefined()
    expect(es!.alternates).toEqual(en!.alternates)
    expect(es!.alternates).toEqual({ languages: languagesAbsolutos(ruta) })
    // Misma frecuencia, prioridad y fecha en las dos versiones.
    expect(en!.changeFrequency).toBe(es!.changeFrequency)
    expect(en!.priority).toBe(es!.priority)
    expect(en!.lastModified).toEqual(es!.lastModified)
  })

  it('los alternates son es-AR → castellano, en → /en…, x-default → castellano, todo absoluto', () => {
    expect(entrada('/cines')!.alternates!.languages).toEqual({
      'es-AR': `${BASE}/cines`,
      en: `${BASE}/en/cines`,
      'x-default': `${BASE}/cines`,
    })
    for (const u of urls) {
      for (const destino of Object.values(u.alternates?.languages ?? {})) {
        expect(destino.startsWith(`${BASE}`)).toBe(true)
      }
    }
  })

  it('la portada va sin barra final, en castellano y en inglés', () => {
    expect(urls.some((u) => u.url === BASE)).toBe(true)
    expect(urls.some((u) => u.url === `${BASE}/en`)).toBe(true)
    expect(urls.some((u) => u.url === `${BASE}/`)).toBe(false)
    expect(urls.some((u) => u.url === `${BASE}/en/`)).toBe(false)
    expect(entrada('/')!.alternates!.languages).toEqual({
      'es-AR': BASE,
      en: `${BASE}/en`,
      'x-default': BASE,
    })
  })

  it.each(['/privacidad', '/terminos', '/eliminar-cuenta'])('%s no tiene alternates ni versión /en', (ruta) => {
    expect(entrada(ruta)).toBeDefined()
    expect(entrada(ruta)).not.toHaveProperty('alternates')
    expect(urls.some((u) => u.url === `${BASE}/en${ruta}`)).toBe(false)
  })

  it('/anunciantes no tiene versión /en mientras no esté en RUTAS_EN_INGLES', () => {
    if (!tieneVersionEnIngles('/anunciantes')) {
      expect(urls.some((u) => u.url === `${BASE}/en/anunciantes`)).toBe(false)
      if (ANUNCIANTES.publicada) expect(entrada('/anunciantes')).not.toHaveProperty('alternates')
    }
  })

  it('ninguna URL se repite', () => {
    const lista = urls.map((u) => u.url)
    expect(new Set(lista).size).toBe(lista.length)
  })

  it('toda entrada con alternates apunta a URLs que existen en el sitemap, y es recíproca', () => {
    const todas = new Set(urls.map((u) => u.url))
    for (const u of urls.filter((e) => e.alternates)) {
      const languages = u.alternates!.languages!
      for (const destino of Object.values(languages)) expect(todas.has(destino)).toBe(true)
      // La propia URL es una de las dos versiones, y la otra tiene los mismos alternates.
      expect(Object.values(languages)).toContain(u.url)
      for (const destino of new Set(Object.values(languages))) {
        expect(urls.find((e) => e.url === destino)!.alternates).toEqual(u.alternates)
      }
    }
  })

  it('lo que dice el sitemap coincide con idiomasAlternos() para cada ruta con inglés', () => {
    const rutasConIngles = ['/', '/cines', '/mapa', '/buscar', ...(conEvento ? [`/evento/${ID_EVENTO}`] : [])]
    for (const ruta of rutasConIngles) {
      expect(tieneVersionEnIngles(ruta)).toBe(true)
      expect(entrada(ruta)!.alternates!.languages).toEqual(languagesAbsolutos(ruta))
    }
    // Y para TODA entrada del sitemap (también las que se sumen a RUTAS_EN_INGLES después, p. ej. /anunciantes):
    // tiene alternates si y solo si su ruta tiene versión en inglés, y son los de idiomasAlternos().
    for (const u of urls) {
      const sinBase = u.url === BASE ? '/' : u.url.slice(BASE.length)
      const ruta = sinBase === '/en' ? '/' : sinBase.startsWith('/en/') ? sinBase.slice(3) : sinBase
      if (tieneVersionEnIngles(ruta)) {
        expect(u.alternates?.languages, u.url).toEqual(languagesAbsolutos(ruta))
      } else {
        expect(u, u.url).not.toHaveProperty('alternates')
      }
    }
    expect(urls.filter((u) => u.alternates).length).toBeGreaterThanOrEqual(rutasConIngles.length * 2)
  })

  it('el sitemap no inventa una versión /en que RUTAS_EN_INGLES no declara', () => {
    expect(RUTAS_EN_INGLES).toEqual(expect.arrayContaining(['/', '/cines', '/mapa', '/buscar', '/evento/*']))
    for (const u of urls.filter((e) => e.url.startsWith(`${BASE}/en`))) {
      const ruta = u.url.slice(`${BASE}/en`.length) || '/'
      expect(tieneVersionEnIngles(ruta)).toBe(true)
    }
  })
})

describe('sitemap con un evento de prueba', () => {
  let urls: Entrada[]

  beforeEach(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proyecto-de-prueba.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'clave-anonima-de-prueba')
    tablas.events = [{ id: ID_EVENTO, updated_at: ACTUALIZADO }]
    tablas.instagram_flyers = [{ id: ID_FLYER, published_at: ACTUALIZADO }]
    tablas.cinema_movies = []
    urls = await correrSitemap()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('el evento sale como /evento/<id> y /en/evento/<id> con alternates recíprocos y los mismos lastModified y priority', () => {
    const es = urls.find((u) => u.url === `${BASE}/evento/${ID_EVENTO}`)
    const en = urls.find((u) => u.url === `${BASE}/en/evento/${ID_EVENTO}`)
    expect(es).toBeDefined()
    expect(en).toBeDefined()
    expect(es!.alternates).toEqual({
      languages: {
        'es-AR': `${BASE}/evento/${ID_EVENTO}`,
        en: `${BASE}/en/evento/${ID_EVENTO}`,
        'x-default': `${BASE}/evento/${ID_EVENTO}`,
      },
    })
    expect(en!.alternates).toEqual(es!.alternates)
    expect(es!.lastModified).toEqual(new Date(ACTUALIZADO))
    expect(en!.lastModified).toEqual(es!.lastModified)
    expect(en!.priority).toBe(es!.priority)
    expect(es!.priority).toBe(0.7)
    expect(en!.changeFrequency).toBe(es!.changeFrequency)
  })

  it('el flyer sale una sola vez, sin alternates ni versión /en', () => {
    const flyer = urls.filter((u) => u.url.includes(`/flyer/${ID_FLYER}`))
    expect(flyer.map((u) => u.url)).toEqual([`${BASE}/flyer/${ID_FLYER}`])
    expect(flyer[0]).not.toHaveProperty('alternates')
  })

  it('las dos versiones de /buscar y /mapa toman el lastModified del último evento', () => {
    for (const ruta of ['/buscar', '/mapa', '/en/buscar', '/en/mapa']) {
      expect(urls.find((u) => u.url === `${BASE}${ruta}`)!.lastModified).toEqual(new Date(ACTUALIZADO))
    }
  })

  it('las entradas en castellano e inglés no comparten el mismo objeto de alternates mutable por accidente (cada una tiene el suyo igual)', () => {
    const es = urls.find((u) => u.url === `${BASE}/cines`)!
    const en = urls.find((u) => u.url === `${BASE}/en/cines`)!
    expect(en.alternates).toEqual(es.alternates)
  })
})
