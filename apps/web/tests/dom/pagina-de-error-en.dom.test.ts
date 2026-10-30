// @vitest-environment jsdom
//
// `PaginaDeError` con `idioma` (78-a): por omisión (y con "es") es idéntico a
// siempre, en castellano; con `idioma="en"` el bloque lleva `lang="en"`, los
// botones están en inglés y los links van a /en… . La marca "Qué Pinta Salta"
// queda con lang="es". Navbar y MobileNav son dobles nulos (no hacen al
// idioma del bloque). Sin red ni base.
import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { PaginaDeError } from '@/components/pagina-de-error'

vi.mock('next/link', () => ({
  default: ({ href, children, ...resto }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => {
    delete resto.prefetch
    return React.createElement('a', { href, ...resto }, children)
  },
}))
vi.mock('@/components/navbar', () => ({ Navbar: () => null }))
vi.mock('@/components/mobile-nav', () => ({ MobileNav: () => null }))

afterEach(() => {
  cleanup()
})

const links = () => screen.getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])

describe('PaginaDeError por omisión (castellano)', () => {
  it('lang="es", botones en castellano y links sin /en', () => {
    const { container } = render(
      React.createElement(PaginaDeError, { titulo: 'Título de prueba', texto: 'Texto de prueba' }),
    )
    expect(container.querySelector('main')!.getAttribute('lang')).toBe('es')
    expect(links()).toEqual([
      ['Ver qué pinta hoy', '/'],
      ['Buscar', '/buscar'],
    ])
    // La marca no lleva lang propio en castellano.
    expect(screen.getByText('Qué Pinta Salta').hasAttribute('lang')).toBe(false)
  })

  it('con idioma="es" explícito es lo mismo que por omisión', () => {
    const porOmision = render(React.createElement(PaginaDeError, { titulo: 'T', texto: 'X' })).container.innerHTML
    cleanup()
    const explicito = render(React.createElement(PaginaDeError, { titulo: 'T', texto: 'X', idioma: 'es' })).container.innerHTML
    expect(explicito).toBe(porOmision)
  })
})

describe('PaginaDeError con idioma="en"', () => {
  it('lang="en", botones en inglés y links a /en y /en/buscar', () => {
    const { container } = render(
      React.createElement(PaginaDeError, { titulo: 'We could not load the page', texto: 'Please try again.', idioma: 'en' }),
    )
    expect(container.querySelector('main')!.getAttribute('lang')).toBe('en')
    expect(links()).toEqual([
      ["See what's on today", '/en'],
      ['Search', '/en/buscar'],
    ])
    expect(screen.getByRole('heading', { name: 'We could not load the page' })).toBeTruthy()
    expect(screen.queryByText('Ver qué pinta hoy')).toBeNull()
  })

  it('la marca «Qué Pinta Salta» queda marcada lang="es" dentro del bloque en inglés', () => {
    render(React.createElement(PaginaDeError, { titulo: 'T', texto: 'X', idioma: 'en' }))
    expect(screen.getByText('Qué Pinta Salta').getAttribute('lang')).toBe('es')
  })

  it('el botón extra (children) va antes de las dos salidas fijas', () => {
    render(
      React.createElement(
        PaginaDeError,
        { titulo: 'T', texto: 'X', idioma: 'en' },
        React.createElement('button', { type: 'button' }, 'Try again'),
      ),
    )
    const botones = screen.getAllByRole('link')
    const extra = screen.getByRole('button', { name: 'Try again' })
    expect(extra.compareDocumentPosition(botones[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
