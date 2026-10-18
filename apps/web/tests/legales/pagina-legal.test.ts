/**
 * `PaginaLegal` y compañía (R45, 45-a): el armazón compartido de las
 * páginas legales. `apps/web` no tiene jsdom ni @testing-library/react
 * (vitest corre con `environment: 'node'`, ver `apps/web/vitest.config.ts`),
 * así que se usa `react-dom/server` (`renderToStaticMarkup`), igual que en
 * `tests/components/password-input.test.ts`.
 *
 * `Navbar` y `MobileNav` son componentes de cliente con hooks y Supabase:
 * se mockean para que no exploten al renderizar en Node puro.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ShieldCheck } from 'lucide-react'

vi.mock('@/components/navbar', () => ({ Navbar: () => null }))
vi.mock('@/components/mobile-nav', () => ({ MobileNav: () => null }))

import { PaginaLegal, SeccionLegal, Marca, claseLink } from '@/components/legal/pagina-legal'

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))

function readSource(relativePath: string): string {
  return readFileSync(path.join(WEB_ROOT, relativePath), 'utf8')
}

describe('PaginaLegal: aviso de borrador', () => {
  it('con borrador: true, sale el aviso con role="note" y el texto exacto', () => {
    const html = renderToStaticMarkup(
      PaginaLegal({
        titulo: 'Política de Privacidad',
        icono: ShieldCheck,
        ultimaActualizacion: '8 de octubre de 2026',
        borrador: true,
        children: React.createElement('p', null, 'contenido'),
      })
    )

    expect(html).toContain('role="note"')
    expect(html).toContain('Borrador pendiente de revisión legal')
    expect(html).toContain('Este texto todavía no lo revisó un abogado y puede cambiar antes de publicarse.')
  })

  it('sin borrador (prop ausente), no sale el aviso', () => {
    const html = renderToStaticMarkup(
      PaginaLegal({
        titulo: 'Política de Privacidad',
        icono: ShieldCheck,
        ultimaActualizacion: '8 de octubre de 2026',
        children: React.createElement('p', null, 'contenido'),
      })
    )

    expect(html).not.toContain('role="note"')
    expect(html).not.toContain('Borrador pendiente de revisión legal')
  })

  it('con borrador: false, tampoco sale el aviso', () => {
    const html = renderToStaticMarkup(
      PaginaLegal({
        titulo: 'Política de Privacidad',
        icono: ShieldCheck,
        ultimaActualizacion: '8 de octubre de 2026',
        borrador: false,
        children: React.createElement('p', null, 'contenido'),
      })
    )

    expect(html).not.toContain('role="note"')
    expect(html).not.toContain('Borrador pendiente de revisión legal')
  })
})

describe('PaginaLegal: título y fecha', () => {
  it('el h1 lleva el título y se ve "Última actualización: <valor>"', () => {
    const html = renderToStaticMarkup(
      PaginaLegal({
        titulo: 'Términos y Condiciones',
        icono: ShieldCheck,
        ultimaActualizacion: '18 de octubre de 2026',
        children: React.createElement('p', null, 'contenido'),
      })
    )

    expect(html).toMatch(/<h1[^>]*>Términos y Condiciones<\/h1>/)
    expect(html).toContain('Última actualización: 18 de octubre de 2026')
  })
})

describe('Marca', () => {
  it('renderiza sus hijos tal cual y no agrega texto propio', () => {
    const html = renderToStaticMarkup(Marca({ children: '[REVISIÓN LEGAL]' }))

    expect(html).toContain('[REVISIÓN LEGAL]')
    // Sin texto propio: lo único que hay en el HTML, aparte de las etiquetas
    // del span, es exactamente el literal que se le pasó.
    const soloTexto = html.replace(/<[^>]*>/g, '')
    expect(soloTexto).toBe('[REVISIÓN LEGAL]')
  })
})

describe('SeccionLegal', () => {
  it('pone el título en un h2 y respeta el id cuando se le pasa', () => {
    const html = renderToStaticMarkup(
      SeccionLegal({
        titulo: 'Quiénes somos',
        id: 'quienes-somos',
        children: React.createElement('p', null, 'texto'),
      })
    )

    expect(html).toMatch(/<h2[^>]*>Quiénes somos<\/h2>/)
    expect(html).toContain('id="quienes-somos"')
  })

  it('sin id, no agrega el atributo', () => {
    const html = renderToStaticMarkup(SeccionLegal({ titulo: 'Contacto', children: React.createElement('p', null, 'texto') }))

    expect(html).not.toContain('id=')
  })
})

describe('claseLink', () => {
  it('es exactamente el estilo de link de la página de hoy', () => {
    expect(claseLink).toBe('text-primary underline underline-offset-4 hover:text-primary/80')
  })
})

describe('components/legal/pagina-legal.tsx: Server Component', () => {
  it('no contiene \'use client\'', () => {
    const source = readSource('components/legal/pagina-legal.tsx')
    expect(source).not.toContain("'use client'")
    expect(source).not.toContain('"use client"')
  })
})
