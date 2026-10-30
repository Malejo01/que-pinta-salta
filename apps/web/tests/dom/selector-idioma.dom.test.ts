// @vitest-environment jsdom
//
// El selector de idioma (Q3) montado en un DOM real: adónde lleva (`href`),
// en qué idioma está el destino (`hrefLang`, `lang`) y su nombre accesible,
// desde castellano, desde inglés, desde una página que no existe en inglés y
// con query. Los `vi.mock` van en este archivo (ver `preparar-dom.ts`).
import * as React from 'react'
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'

import { SelectorIdioma } from '@/components/selector-idioma'

const { navegacion } = vi.hoisted(() => ({ navegacion: { pathname: '/', query: '' } }))

vi.mock('next/navigation', () => ({
  usePathname: () => navegacion.pathname,
  useSearchParams: () => new URLSearchParams(navegacion.query),
}))

afterEach(() => {
  cleanup()
})

function enlace(pathname: string, query = '', props: React.ComponentProps<typeof SelectorIdioma> = {}): HTMLAnchorElement {
  navegacion.pathname = pathname
  navegacion.query = query
  const { container } = render(React.createElement(SelectorIdioma, props))
  const links = container.querySelectorAll('a')
  expect(links).toHaveLength(1)
  return links[0]
}

describe('SelectorIdioma', () => {
  it('en / lleva a /en, dice «English» y su nombre accesible lo contiene (WCAG 2.5.3)', () => {
    const a = enlace('/')
    expect(a.getAttribute('href')).toBe('/en')
    expect(a.getAttribute('hreflang')).toBe('en')
    expect(a.getAttribute('lang')).toBe('en')
    expect(a.textContent).toBe('English')
    expect(screen.getByRole('link', { name: 'English (EN): view this site in English' })).toBe(a)
  })

  it('en /en lleva a /, dice «Español» (lang="es") y su nombre accesible lo contiene', () => {
    const a = enlace('/en')
    expect(a.getAttribute('href')).toBe('/')
    expect(a.getAttribute('hreflang')).toBe('es-AR')
    expect(a.getAttribute('lang')).toBe('es')
    expect(a.textContent).toBe('Español')
    expect(screen.getByRole('link', { name: 'Español (ES): ver el sitio en español' })).toBe(a)
  })

  it('en /mapa lleva a /en/mapa; en una página sin versión en inglés (/radar) lleva a /en', () => {
    expect(enlace('/mapa').getAttribute('href')).toBe('/en/mapa')
    cleanup()
    expect(enlace('/radar').getAttribute('href')).toBe('/en')
  })

  it('conserva la query: /cines?x=1 → /en/cines?x=1, y de vuelta', () => {
    expect(enlace('/cines', 'x=1').getAttribute('href')).toBe('/en/cines?x=1')
    cleanup()
    expect(enlace('/en/cines', 'x=1').getAttribute('href')).toBe('/cines?x=1')
  })

  it('es un <a> común (carga completa), con 44 px de alto mínimo y foco visible', () => {
    const clases = enlace('/').className.split(/\s+/)
    expect(clases).toContain('min-h-11')
    expect(clases).toContain('focus-visible:ring-2')
    expect(clases).not.toContain('outline-none')
  })

  it.each([
    ['/', 'EN', 'English'],
    ['/en', 'ES', 'Español'],
  ])('compacto en %s: «%s» en celular y «%s» desde sm:, y el nombre accesible contiene los dos (WCAG 2.5.3)', (ruta, corto, largo) => {
    const a = enlace(ruta, '', { compacto: true })
    const textos = Array.from(a.querySelectorAll('span')).map((s) => [s.textContent, s.className])
    expect(textos).toEqual([
      [corto, 'sm:hidden'],
      [largo, 'hidden sm:inline'],
    ])
    const nombre = a.getAttribute('aria-label') ?? ''
    expect(nombre.startsWith(`${largo} (${corto})`)).toBe(true)
  })
})

// La portada sincroniza los filtros con `history.replaceState` conservando el
// estado de Next, y `useSearchParams` no se entera: el destino real se arma al
// hacer click, con `window.location` (query y hash incluidos).
describe('SelectorIdioma: el destino se calcula al hacer click', () => {
  // jsdom no navega: se corta el click después de que lo vio React.
  const frenarNavegacion = (e: Event) => e.preventDefault()
  beforeEach(() => window.addEventListener('click', frenarNavegacion))
  afterEach(() => {
    window.removeEventListener('click', frenarNavegacion)
    window.history.replaceState(null, '', '/')
  })

  it('en / con ?date=semana#hoy puesto por replaceState: el render no lo ve, el click sí', () => {
    window.history.replaceState({ __NA: true }, '', '/?date=semana#hoy')
    const a = enlace('/') // useSearchParams (mock) sigue vacío
    expect(a.getAttribute('href')).toBe('/en')
    fireEvent.click(a)
    expect(a.getAttribute('href')).toBe('/en?date=semana#hoy')
  })

  it('de /en/cines?x=1#cartelera vuelve a /cines?x=1#cartelera', () => {
    window.history.replaceState(null, '', '/en/cines?x=1#cartelera')
    const a = enlace('/en/cines')
    fireEvent.click(a)
    expect(a.getAttribute('href')).toBe('/cines?x=1#cartelera')
  })

  it('desde una página sin inglés (/radar?z=1) va a /en, sin la query', () => {
    window.history.replaceState(null, '', '/radar?z=1#x')
    const a = enlace('/radar')
    fireEvent.click(a)
    expect(a.getAttribute('href')).toBe('/en')
  })

  it('también con el botón del medio (abrir en otra pestaña)', () => {
    window.history.replaceState(null, '', '/?date=hoy')
    const a = enlace('/')
    fireEvent(a, new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }))
    expect(a.getAttribute('href')).toBe('/en?date=hoy')
  })
})
