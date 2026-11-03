// Q6-2: /en/nuevo-evento. El cuerpo es `PaginaNuevoEvento`
// (app/nuevo-evento/pagina-nuevo-evento.tsx), compartido con /nuevo-evento, y
// el formulario es `EventForm` con `idioma`. Los errores de las acciones
// (lib/actions.ts, en castellano) se traducen en el borde, con el diccionario.
// También: el middleware manda a /en/auth/login?next=/en/... sin sesión.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({ user: null as { id: string } | null }))

vi.mock('@/lib/actions', () => ({ createEvent: vi.fn(), uploadFlyer: vi.fn(), updateUserEvent: vi.fn() }))
vi.mock('@/lib/data', () => ({
  getCategories: async () => [
    { id: 'k1', slug: 'penas', name: 'Peñas' },
    { id: 'k2', slug: 'slug-nuevo', name: 'Algo nuevo' },
  ],
  getVenues: async () => [{ id: 'v1', name: 'La Casona' }],
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: estado.user } }) } }),
}))

import { NextRequest } from 'next/server'
import { EventForm } from '@/components/event-form'
import { PaginaNuevoEvento } from '@/app/nuevo-evento/pagina-nuevo-evento'
import { en } from '@/lib/i18n/diccionarios/en'
import { es } from '@/lib/i18n/diccionarios/es'
import { RUTAS_EN_INGLES } from '@/lib/i18n/rutas'
import { updateSession } from '@/lib/supabase/proxy'
import type { Category, Venue } from '@/lib/types'

const ROOT = process.cwd()
const leer = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8')

const CATEGORIAS = [{ id: 'k1', slug: 'penas', name: 'Folk music (peñas)' }] as unknown as Category[]
const LUGARES = [{ id: 'v1', name: 'La Casona' }] as unknown as Venue[]

function render(idioma?: 'es' | 'en', extra: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(
    React.createElement(EventForm, { categories: CATEGORIAS, venues: LUGARES, ...(idioma ? { idioma } : {}), ...extra }),
  )
}

describe('/en/nuevo-evento: la página', () => {
  it('app/en/nuevo-evento/page.tsx usa PaginaNuevoEvento en inglés, sin indexar', () => {
    const src = leer('app', 'en', 'nuevo-evento', 'page.tsx')
    expect(src).toContain('PaginaNuevoEvento({ searchParams, idioma: "en" })')
    expect(src).toContain('robots: { index: false, follow: true }')
    expect(RUTAS_EN_INGLES).toContain('/nuevo-evento')
  })

  it('en inglés, las categorías llevan el nombre del diccionario (por slug); si no hay, el de la base', async () => {
    const el = (await PaginaNuevoEvento({ searchParams: Promise.resolve({}), idioma: 'en' })) as React.ReactElement<{
      categories: Category[]
      idioma: string
    }>
    expect(el.props.idioma).toBe('en')
    expect(el.props.categories.map((c) => c.name)).toEqual(['Folk music (peñas)', 'Algo nuevo'])
    const elEs = (await PaginaNuevoEvento({ searchParams: Promise.resolve({}), idioma: 'es' })) as React.ReactElement<{
      categories: Category[]
    }>
    expect(elEs.props.categories.map((c) => c.name)).toEqual(['Peñas', 'Algo nuevo'])
  })
})

describe('/en/nuevo-evento: el formulario', () => {
  it('en inglés: títulos, labels, placeholders y botones en inglés', () => {
    const html = render('en')
    expect(html).toContain('>Add a new event</h1>')
    expect(html).toContain('aria-label="Back to home"')
    expect(html).toContain('href="/en"')
    expect(html).toMatch(/<label[^>]*for="title"[^>]*>Event title \*<\/label>/)
    expect(html).toContain('placeholder="E.g.: Folk music night (peña) at La Casona"')
    expect(html).toMatch(/<label[^>]*for="isFree"[^>]*>Free event<\/label>/)
    expect(html).toContain('Choose a category')
    // (El valor elegido de un desplegable no sale en el HTML del servidor: se mira el fuente.)
    expect(leer('components', 'event-form.tsx')).toContain('<SelectItem value="0">{t.todasLasEdades}</SelectItem>')
    expect(en.formularioEvento.todasLasEdades).toBe('All ages')
    expect(html).toContain('>Create event</button>')
    // «Cancelar» lleva a /mis-eventos, que queda en castellano.
    const cancelar = html.match(/<a[^>]*href="\/mis-eventos"[^>]*>[^<]*<\/a>/)?.[0] ?? ''
    expect(cancelar).toContain('hrefLang="es-AR"')
    expect(cancelar).toContain('>Cancel</a>')
    for (const texto of ['Crear Nuevo Evento', 'Título del Evento', 'Selecciona una categoría', 'Cancelar']) {
      expect(html, texto).not.toContain(texto)
    }
  })

  it('en inglés, al editar: «Edit event» y «Update event»', () => {
    const html = render('en', { editId: 'e1' })
    expect(html).toContain('>Edit event</h1>')
    expect(html).toContain('>Update event</button>')
  })

  it('en castellano (por defecto): los textos de siempre', () => {
    const html = render()
    expect(html).toContain('>Crear Nuevo Evento</h1>')
    expect(html).toMatch(/<label[^>]*for="title"[^>]*>Título del Evento \*<\/label>/)
    expect(html).toContain('placeholder="Ej: Peña Folklórica en La Casona"')
    expect(html).toContain('Selecciona una categoría')
    expect(html).toContain('>Crear Evento</button>')
    expect(html).toMatch(/<a[^>]*href="\/mis-eventos"[^>]*>Cancelar<\/a>/)
    expect(html).not.toContain('hrefLang')
  })

  it('accesibilidad: cada desplegable tiene el id de su <Label>, el flyer es un botón y el error se anuncia', () => {
    const html = render('en')
    for (const id of ['categoryId', 'venueId', 'ageRestriction']) {
      expect(html, id).toMatch(new RegExp(`<label[^>]*for="${id}"`))
      expect(html, id).toMatch(new RegExp(`<button[^>]*id="${id}"`))
    }
    expect(html).toMatch(/<button type="button" aria-label="Click to upload an image" aria-describedby="flyer-ayuda"/)
    expect(html).toContain('id="flyer-ayuda"')
    expect(leer('components', 'event-form.tsx')).toContain('<div role="alert" className="rounded-lg border border-destructive')
  })
})

describe('/en/nuevo-evento: errores de las acciones', () => {
  const acciones = leer('lib', 'actions.ts')
  // Solo las tres acciones del formulario.
  function cuerpo(nombre: string): string {
    const inicio = acciones.indexOf(`export async function ${nombre}(`)
    expect(inicio, nombre).toBeGreaterThan(-1)
    const fin = acciones.indexOf('\nexport async function ', inicio + 1)
    return acciones.slice(inicio, fin === -1 ? undefined : fin)
  }
  const fuentes = ['createEvent', 'uploadFlyer', 'updateUserEvent'].map(cuerpo).join('\n')
  const fijos = [...fuentes.matchAll(/error: "([^"]+)"(?!\s*\+)/g)].map((m) => m[1])
  const prefijos = [...fuentes.matchAll(/error: "([^"]+)"\s*\+/g)].map((m) => m[1])

  it('se encontraron los textos (si da 0, el test no mira nada)', () => {
    expect(fijos.length).toBeGreaterThanOrEqual(7)
    expect(prefijos.length).toBe(3)
  })

  it('cada error fijo tiene traducción al inglés (y en castellano queda igual)', () => {
    for (const m of fijos) {
      expect(es.formularioEvento.error(m)).toBe(m)
      expect(en.formularioEvento.error(m), m).not.toBe(m)
    }
    expect(en.formularioEvento.error('Debes iniciar sesión para crear un evento')).toBe('You need to sign in to add an event.')
  })

  it('los que llevan detalle traducen el comienzo y dejan el detalle como viene', () => {
    for (const p of prefijos) {
      const traducido = en.formularioEvento.error(`${p}duplicate key`)
      expect(traducido.startsWith(p), p).toBe(false)
      expect(traducido.endsWith(': duplicate key'), p).toBe(true)
    }
  })

  it('un texto desconocido (o con nombre de propiedad de objeto) queda tal cual', () => {
    expect(en.formularioEvento.error('Otro error')).toBe('Otro error')
    expect(en.formularioEvento.error('constructor')).toBe('constructor')
  })

  it('el formulario pasa por el diccionario cada error que muestra', () => {
    const src = leer('components', 'event-form.tsx')
    expect(src).toContain('setError(t.error(result.error))')
    expect(src).not.toMatch(/setError\(result\.error\)/)
  })
})

describe('middleware: sin sesión, al ingreso en el mismo idioma', () => {
  async function destino(ruta: string): Promise<string | null> {
    const res = await updateSession(new NextRequest(`https://qps.test${ruta}`))
    return res.headers.get('location')
  }

  it('/en/nuevo-evento y /en/perfil → /en/auth/login?next=/en/...', async () => {
    estado.user = null
    expect(await destino('/en/nuevo-evento')).toBe('https://qps.test/en/auth/login?next=%2Fen%2Fnuevo-evento')
    expect(await destino('/en/perfil')).toBe('https://qps.test/en/auth/login?next=%2Fen%2Fperfil')
  })

  it('en castellano, igual que antes; y las páginas públicas no se tocan', async () => {
    estado.user = null
    expect(await destino('/nuevo-evento')).toBe('https://qps.test/auth/login?next=%2Fnuevo-evento')
    expect(await destino('/perfil')).toBe('https://qps.test/auth/login?next=%2Fperfil')
    expect(await destino('/en/mapa')).toBeNull()
    expect(await destino('/entradas')).toBeNull()
  })

  it('con sesión, pasa', async () => {
    estado.user = { id: 'u1' }
    expect(await destino('/en/nuevo-evento')).toBeNull()
  })
})
