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
