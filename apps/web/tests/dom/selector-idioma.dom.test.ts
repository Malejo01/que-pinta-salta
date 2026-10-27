// @vitest-environment jsdom
//
// El selector de idioma (Q3) montado en un DOM real: adónde lleva (`href`),
// en qué idioma está el destino (`hrefLang`, `lang`) y su nombre accesible,
// desde castellano, desde inglés, desde una página que no existe en inglés y
// con query. Los `vi.mock` van en este archivo (ver `preparar-dom.ts`).
import * as React from 'react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'

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
  it('en / lleva a /en, dice «English» y se llama "View this site in English"', () => {
    const a = enlace('/')
    expect(a.getAttribute('href')).toBe('/en')
    expect(a.getAttribute('hreflang')).toBe('en')
    expect(a.getAttribute('lang')).toBe('en')
    expect(a.textContent).toBe('English')
    expect(screen.getByRole('link', { name: 'View this site in English' })).toBe(a)
  })

  it('en /en lleva a /, dice «Español» (lang="es") y se llama "Ver el sitio en español"', () => {
    const a = enlace('/en')
    expect(a.getAttribute('href')).toBe('/')
    expect(a.getAttribute('hreflang')).toBe('es-AR')
    expect(a.getAttribute('lang')).toBe('es')
    expect(a.textContent).toBe('Español')
    expect(screen.getByRole('link', { name: 'Ver el sitio en español' })).toBe(a)
  })

  it('en /mapa (sin versión en inglés todavía) lleva a /en', () => {
    expect(enlace('/mapa').getAttribute('href')).toBe('/en')
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

  it('compacto: «EN» en celular y «English» desde sm:, con el mismo nombre accesible', () => {
    const a = enlace('/', '', { compacto: true })
    const textos = Array.from(a.querySelectorAll('span')).map((s) => [s.textContent, s.className])
    expect(textos).toEqual([
      ['EN', 'sm:hidden'],
      ['English', 'hidden sm:inline'],
    ])
    expect(screen.getByRole('link', { name: 'View this site in English' })).toBe(a)
  })
})
