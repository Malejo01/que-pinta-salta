// @vitest-environment jsdom
//
// R-3 (Q4-6): las páginas nuevas de /en se dibujan bien. Las notas legales en
// inglés (/en/privacidad, /en/terminos, /en/eliminar-cuenta) y la 404 en
// inglés. Navbar y MobileNav son dobles nulos. Sin red ni base.
import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('next/link', () => ({
  default: ({ href, children, ...resto }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => {
    delete resto.prefetch
    return React.createElement('a', { href, ...resto }, children)
  },
}))
vi.mock('@/components/navbar', () => ({ Navbar: () => null }))
vi.mock('@/components/mobile-nav', () => ({ MobileNav: () => null }))

import Privacidad, { metadata as metaPrivacidad } from '@/app/en/privacidad/page'
import Terminos, { metadata as metaTerminos } from '@/app/en/terminos/page'
import EliminarCuenta, { metadata as metaEliminar } from '@/app/en/eliminar-cuenta/page'
import NotFoundEn, { metadata as metaNotFound } from '@/app/en/not-found'
import RutaInexistenteEn from '@/app/en/[...resto]/page'

afterEach(() => cleanup())

describe.each([
  ['/privacidad', Privacidad, metaPrivacidad, 'Privacy policy'],
  ['/terminos', Terminos, metaTerminos, 'Terms of use'],
  ['/eliminar-cuenta', EliminarCuenta, metaEliminar, 'Delete your account'],
] as const)('/en%s: nota en inglés de una página legal', (ruta, Pagina, meta, titulo) => {
  it('dice en inglés que solo está en castellano y lleva a la página que vale', () => {
    render(React.createElement(Pagina))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(titulo)
    expect(document.body.textContent).toContain('This page is only available in Spanish')
    const link = screen.getByRole('link', { name: 'Read it in Spanish' })
    expect(link.getAttribute('href')).toBe(ruta)
    expect(link.getAttribute('hreflang')).toBe('es-AR')
    const main = document.getElementById('contenido')
    expect(main?.getAttribute('lang')).toBe('en')
    expect(main?.getAttribute('tabindex')).toBe('-1')
  })

  it('noindex y canónica a la página en castellano', () => {
    expect(meta.robots).toMatchObject({ index: false, follow: true })
    expect(meta.alternates?.canonical).toBe(ruta)
  })
})

describe('/en: la 404 en inglés', () => {
  it('título y salidas en inglés, con el ancla del skip-link', () => {
    render(React.createElement(NotFoundEn))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe("We couldn't find that page")
    expect(document.getElementById('contenido')?.getAttribute('lang')).toBe('en')
    expect(metaNotFound.robots).toMatchObject({ index: false })
  })

  it('el catch-all de /en llama a notFound()', () => {
    expect(() => RutaInexistenteEn()).toThrow(/NEXT_(HTTP_ERROR_FALLBACK;404|NOT_FOUND)/)
  })
})
