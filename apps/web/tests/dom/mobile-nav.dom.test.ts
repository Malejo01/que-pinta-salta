// @vitest-environment jsdom
//
// La barra inferior (`MobileNav`, tarea 73-b) montada en un DOM real: el ítem
// de la página actual lleva `aria-current="page"`, los demás NO llevan el
// atributo (ni "false"), y todos tienen foco visible con teclado.
//
// Los `vi.mock` van en este archivo (se izan al principio de ESTE archivo,
// antes de resolver el componente); ver el comentario de `preparar-dom.ts`.
import * as React from 'react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'

import { MobileNav } from '@/components/mobile-nav'

const { mockPathname } = vi.hoisted(() => ({ mockPathname: vi.fn<() => string>() }))

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
}))

// `next/link` real necesita el router de la app: un <a> común alcanza para
// mirar atributos. `prefetch` se descarta para que no llegue al DOM.
vi.mock('next/link', () => ({
  default: ({
    href,
    prefetch: _prefetch,
    children,
    ...resto
  }: {
    href: string
    prefetch?: boolean
    children?: React.ReactNode
  } & Record<string, unknown>) => React.createElement('a', { href, ...resto }, children),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const ITEMS = [
  { href: '/', label: 'Inicio' },
  { href: '/buscar', label: 'Buscar' },
  { href: '/mapa', label: 'Mapa' },
  { href: '/radar', label: 'Radar' },
  { href: '/favoritos', label: 'Mis eventos' },
]

function enlaces(ruta: string): HTMLAnchorElement[] {
  mockPathname.mockReturnValue(ruta)
  const { container } = render(React.createElement(MobileNav))
  return Array.from(container.querySelectorAll('a'))
}

describe('MobileNav: aria-current y foco visible en un DOM real', () => {
  it('dibuja los 5 enlaces de la barra', () => {
    const links = enlaces('/')
    expect(links.map((a) => a.getAttribute('href'))).toEqual(ITEMS.map((i) => i.href))
  })

  it.each(ITEMS)('en $href solo "$label" lleva aria-current="page"; los otros 4 no tienen el atributo', ({ href }) => {
    const links = enlaces(href)
    expect(links).toHaveLength(5)
    for (const a of links) {
      if (a.getAttribute('href') === href) {
        expect(a.getAttribute('aria-current')).toBe('page')
      } else {
        // `hasAttribute` y no `getAttribute(...) !== 'page'`: "false" tampoco vale.
        expect(a.hasAttribute('aria-current')).toBe(false)
      }
    }
    expect(links.filter((a) => a.hasAttribute('aria-current'))).toHaveLength(1)
  })

  it('en una ruta que no es de la barra (/evento/x) ningún ítem lleva aria-current', () => {
    const links = enlaces('/evento/x')
    expect(links).toHaveLength(5)
    expect(links.some((a) => a.hasAttribute('aria-current'))).toBe(false)
  })

  it('cada enlace tiene foco visible (focus-visible:ring-2) y nunca outline-none sin un focus-visible: que lo reemplace', () => {
    const links = enlaces('/')
    for (const a of links) {
      const clases = a.className.split(/\s+/)
      expect(clases).toContain('focus-visible:ring-2')
      if (clases.includes('outline-none')) {
        expect(clases.some((c) => c.startsWith('focus-visible:'))).toBe(true)
      }
    }
  })
})

// Q3: en las páginas en inglés los links pasan a /en cuando la página existe
// en inglés (/, /cines, /mapa y /buscar), y aria-current sigue funcionando.
describe('MobileNav en inglés (/en, /en/cines)', () => {
  it('en /en: los textos en inglés, "Home", "Search", "Map" y "Radar" van a /en; el resto sigue en castellano', () => {
    const links = enlaces('/en')
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/en', '/en/buscar', '/en/mapa', '/en/radar', '/favoritos'])
    expect(links.map((a) => a.textContent)).toEqual(['Home', 'Search', 'Map', 'Radar', 'My events'])
    expect(links.filter((a) => a.hasAttribute('aria-current')).map((a) => a.getAttribute('href'))).toEqual(['/en'])
    expect(links[0].getAttribute('aria-current')).toBe('page')
  })

  it('en /en, los ítems que llevan a páginas solo en castellano tienen hrefLang="es-AR"; Home, Search, Map y Radar no', () => {
    const links = enlaces('/en')
    expect(links.map((a) => a.getAttribute('hreflang'))).toEqual([null, null, null, null, 'es-AR'])
  })

  it('en castellano ningún ítem lleva hrefLang', () => {
    expect(enlaces('/').some((a) => a.hasAttribute('hreflang'))).toBe(false)
  })

  it('en /en/cines ningún ítem lleva aria-current (cines no está en la barra)', () => {
    const links = enlaces('/en/cines')
    expect(links.some((a) => a.hasAttribute('aria-current'))).toBe(false)
  })

  it('en castellano los textos no cambian', () => {
    expect(enlaces('/').map((a) => a.textContent)).toEqual(ITEMS.map((i) => i.label))
  })
})
