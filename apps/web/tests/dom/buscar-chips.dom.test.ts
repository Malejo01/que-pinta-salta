// @vitest-environment jsdom
//
// `/buscar` (Q3, C2) montado en un DOM real: los chips "Solo gratis" y "Para
// chicos" combinados con el texto, el contador en la región viva y "Quitar
// filtros" del vacío (apaga los chips, deja el texto y el foco va a "Solo
// gratis").
//
// Los `vi.mock` van en este archivo (se izan al principio de ESTE archivo,
// antes de resolver el componente); ver el comentario de `preparar-dom.ts`.
// Lo que no se prueba acá (navbar, barra inferior, tarjeta, modales,
// anuncio) se reemplaza por stubs: la tarjeta es un <article> con el título.
import * as React from 'react'
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'
import { act, render, cleanup, fireEvent, screen, within } from '@testing-library/react'

import { BuscarContent } from '@/app/buscar/buscar-content'

vi.mock('next/link', () => ({
  default: ({ href, children, ...resto }: { href: string; children?: React.ReactNode } & Record<string, unknown>) =>
    React.createElement('a', { href, ...resto }, children),
}))
vi.mock('@/components/navbar', () => ({ Navbar: () => null }))
vi.mock('@/components/mobile-nav', () => ({ MobileNav: () => null }))
vi.mock('@/components/event-modal', () => ({ EventModal: () => null }))
vi.mock('@/components/movie-modal', () => ({ MovieModal: () => null }))
vi.mock('@/components/adsense-banner', () => ({ AdSenseBanner: () => null }))
vi.mock('@/components/event-card', () => ({
  EventCard: ({ event }: { event: { title: string } }) => React.createElement('article', null, event.title),
}))
// `home-content` arrastra toda la portada: de ahí solo se usa `transformEvent`.
vi.mock('@/components/home-content', async () => ({
  transformEvent: (await import('@/lib/home/transform')).transformEvent,
}))

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

const CATEGORIAS = {
  infantil: { slug: 'infantil', name: 'Infantil' },
  recitales: { slug: 'recitales', name: 'Recitales' },
  boliches: { slug: 'boliches', name: 'Boliches' },
}

let autoId = 0
/** Un evento crudo de la base, lo justo para `transformEvent`. */
function eventoCrudo(titulo: string, categoria: keyof typeof CATEGORIAS, extra: Record<string, unknown> = {}) {
  autoId += 1
  return {
    id: `evento-${autoId}`,
    slug: `evento-${autoId}`,
    title: titulo,
    start_date: `2026-11-${String(autoId).padStart(2, '0')}T21:00:00-03:00`,
    category: CATEGORIAS[categoria],
    venue: { name: `Lugar ${autoId}`, address: '' },
    is_free: false,
    price_min: 2000,
    description: '',
    tags: null,
    ...extra,
  }
}

const EVENTOS = [
  eventoCrudo('Títeres en la plaza', 'infantil', { is_free: true }),
  eventoCrudo('Plaza de recitales', 'recitales', { is_free: true }),
  eventoCrudo('Taller en la plaza', 'recitales', { tags: ['Niños'] }),
  eventoCrudo('Rock pesado', 'recitales'),
]

// Un flyer de Instagram (sin tags) de boliches: nunca pasa "Para chicos".
const FLYER = {
  id: 'f1',
  published_at: '2026-11-01T12:00:00-03:00',
  category: 'boliches',
  is_free: true,
  price_min: 0,
  venue_name: 'Boliche de la plaza',
  caption: 'Fiesta en la plaza',
  storage_image_url: null,
  original_image_url: null,
  ig_post_url: 'https://instagram.com/p/x',
  account: { display_name: 'Boliche', default_category: 'boliches', default_venue_name: null, username: 'boliche' },
}

function montar() {
  render(
    React.createElement(BuscarContent, {
      events: EVENTOS as never,
      categories: Object.values(CATEGORIAS) as never,
      serverNowISO: '2026-10-27T12:00:00-03:00',
      flyers: [FLYER] as never,
      cinemaMovies: [],
      userFavorites: [],
    })
  )
}

const chip = (nombre: string) => within(screen.getByRole('group', { name: 'Filtros' })).getByRole('button', { name: nombre })
const titulos = () => screen.queryAllByRole('article').map((a) => a.textContent)
const region = () => {
  const p = document.querySelector('[aria-live="polite"]')
  if (!p) throw new Error('no está la región viva')
  return p
}
/** Tipea y deja pasar la espera del anuncio (la región viva no habla en cada tecla). */
const buscar = (texto: string) => {
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: texto } })
  act(() => {
    vi.advanceTimersByTime(700)
  })
}

describe('/buscar: chips "Solo gratis" y "Para chicos" en un DOM real', () => {
  it('sin texto ni chips: la grilla de categorías, los dos chips apagados y la región viva montada y vacía', () => {
    montar()
    expect(screen.getByText('Explorar por categoría')).toBeTruthy()
    expect(chip('Solo gratis').getAttribute('aria-pressed')).toBe('false')
    expect(chip('Para chicos').getAttribute('aria-pressed')).toBe('false')
    expect(titulos()).toEqual([])
    expect(region().textContent).toBe('')
  })

  it('"Para chicos" sin texto: los eventos de la categoría infantil o con tag de chicos (el flyer no)', () => {
    montar()
    fireEvent.click(chip('Para chicos'))
    expect(chip('Para chicos').getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByText('Explorar por categoría')).toBeNull()
    expect(titulos()).toEqual(['Títeres en la plaza', 'Taller en la plaza'])
    expect(region().textContent).toBe('2 eventos para chicos')
  })

  it('los dos chips sin texto: "N eventos gratis para chicos"', () => {
    montar()
    fireEvent.click(chip('Solo gratis'))
    expect(region().textContent).toBe('3 eventos gratis')
    fireEvent.click(chip('Para chicos'))
    expect(titulos()).toEqual(['Títeres en la plaza'])
    expect(region().textContent).toBe('1 evento gratis para chicos')
  })

  it('con texto, los chips se suman a la búsqueda y el contador los nombra', () => {
    montar()
    buscar('plaza')
    expect(titulos()).toEqual(['Títeres en la plaza', 'Plaza de recitales', 'Taller en la plaza', 'Boliche'])
    expect(region().textContent).toBe('4 resultados para "plaza"')
    fireEvent.click(chip('Para chicos'))
    expect(titulos()).toEqual(['Títeres en la plaza', 'Taller en la plaza'])
    expect(region().textContent).toBe('2 resultados para "plaza" · para chicos')
    fireEvent.click(chip('Solo gratis'))
    expect(titulos()).toEqual(['Títeres en la plaza'])
    expect(region().textContent).toBe('1 resultado para "plaza" · gratis · para chicos')
  })

  it('solo espacios en el buscador es lo mismo que no escribir nada: la grilla', () => {
    montar()
    buscar('   ')
    expect(screen.getByText('Explorar por categoría')).toBeTruthy()
    expect(region().textContent).toBe('')
  })

  it('vacío con chips: "Quitar filtros" apaga los dos, deja el texto y el foco va a "Solo gratis"', () => {
    montar()
    buscar('rock')
    fireEvent.click(chip('Solo gratis'))
    fireEvent.click(chip('Para chicos'))
    expect(titulos()).toEqual([])
    expect(region().textContent).toBe('No se encontraron eventos para "rock" · gratis · para chicos')

    fireEvent.click(screen.getByRole('button', { name: 'Quitar filtros' }))

    expect(chip('Solo gratis').getAttribute('aria-pressed')).toBe('false')
    expect(chip('Para chicos').getAttribute('aria-pressed')).toBe('false')
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('rock')
    expect(titulos()).toEqual(['Rock pesado'])
    expect(region().textContent).toBe('1 resultado para "rock"')
    expect(document.activeElement).toBe(chip('Solo gratis'))
    expect(screen.queryByRole('button', { name: 'Quitar filtros' })).toBeNull()
  })

  it('la región viva no anuncia cada tecla: espera a que se deje de tipear (la vista sí cambia al instante)', () => {
    montar()
    const caja = screen.getByRole('searchbox')
    for (const parcial of ['p', 'pl', 'pla', 'plaz']) {
      fireEvent.change(caja, { target: { value: parcial } })
      act(() => {
        vi.advanceTimersByTime(200)
      })
    }
    expect(region().textContent).toBe('')
    expect(titulos().length).toBeGreaterThan(0)
    act(() => {
      vi.advanceTimersByTime(700)
    })
    expect(region().textContent).toBe('4 resultados para "plaz"')
  })

  it('el contador visible queda fuera del árbol accesible (lo dice la región viva)', () => {
    montar()
    fireEvent.click(chip('Solo gratis'))
    const visible = screen.getByText('3 eventos gratis', { selector: 'p[aria-hidden="true"]' })
    expect(visible).toBeTruthy()
    expect(region().className).toBe('sr-only')
  })

  it('vacío sin chips (solo texto): no hay "Quitar filtros"', () => {
    montar()
    buscar('jazz')
    expect(region().textContent).toBe('No se encontraron eventos para "jazz"')
    expect(screen.queryByRole('button', { name: 'Quitar filtros' })).toBeNull()
  })
})
