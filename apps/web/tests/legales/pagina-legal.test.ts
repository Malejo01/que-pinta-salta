/**
 * `PaginaLegal` y compañía (R45, 45-a): el armazón compartido de las
 * páginas legales. Corre en el entorno por defecto de Vitest (node) y usa
 * `react-dom/server` (`renderToStaticMarkup`), igual que en
 * `tests/components/password-input.test.ts`.
 *
 * R63: el modo borrador se fue. `PaginaLegal` solo recibe `titulo`, `icono` y
 * `children`, y muestra la versión y la vigencia desde `vigencia.ts`.
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
import { VERSION_LEGAL, VIGENTE_DESDE } from '@/components/legal/vigencia'

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))

function readSource(relativePath: string): string {
  return readFileSync(path.join(WEB_ROOT, relativePath), 'utf8')
}

function renderPagina(titulo: string): string {
  return renderToStaticMarkup(
    PaginaLegal({
      titulo,
      icono: ShieldCheck,
      children: React.createElement('p', null, 'contenido'),
    })
  )
}

/** Fuente sin comentarios de bloque ni de línea (los comentarios pueden nombrar lo que ya no existe). */
function sinComentarios(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('PaginaLegal: versión y vigencia', () => {
  it('muestra "Versión <VERSION_LEGAL> — vigente desde el <VIGENTE_DESDE>"', () => {
    const html = renderPagina('Política de Privacidad')
    expect(html).toContain(`Versión ${VERSION_LEGAL} — vigente desde el ${VIGENTE_DESDE}`)
  })

  it('no queda rastro del borrador ni de "Última actualización"', () => {
    const html = renderPagina('Política de Privacidad')
    expect(html).not.toContain('Última actualización')
    expect(html).not.toContain('Borrador')
    expect(html).not.toContain('borrador')
    expect(html).not.toContain('role="note"')
  })

  it('el h1 lleva el título', () => {
    const html = renderPagina('Términos y Condiciones')
    expect(html).toMatch(/<h1[^>]*>Términos y Condiciones<\/h1>/)
  })

  it('VERSION_LEGAL es exactamente 1', () => {
    expect(VERSION_LEGAL).toBe(1)
  })
})

describe('PaginaLegal: el fuente ya no tiene el modo borrador', () => {
  it('sin comentarios, no menciona borrador, AvisoBorrador ni ultimaActualizacion', () => {
    const source = sinComentarios(readSource('components/legal/pagina-legal.tsx'))
    expect(source).not.toMatch(/borrador/i)
    expect(source).not.toContain('AvisoBorrador')
    expect(source).not.toContain('ultimaActualizacion')
  })
})

describe('La fecha de vigencia vive en un solo lugar', () => {
  it('las páginas no escriben "vigente desde"', () => {
    for (const ruta of ['app/privacidad/page.tsx', 'app/terminos/page.tsx']) {
      expect(sinComentarios(readSource(ruta)), ruta).not.toMatch(/vigente desde/i)
    }
  })

  it('el componente importa VIGENTE_DESDE de ./vigencia y no escribe una fecha propia', () => {
    const source = sinComentarios(readSource('components/legal/pagina-legal.tsx'))
    expect(source).toMatch(/import\s*\{[^}]*\bVIGENTE_DESDE\b[^}]*\}\s*from\s*["']\.\/vigencia["']/)
    // Lo único que sigue a "vigente desde el" es la interpolación de la constante.
    const apariciones = source.match(/vigente desde el[^\n]*/g) ?? []
    for (const linea of apariciones) {
      expect(linea).toMatch(/^vigente desde el\s*\{VIGENTE_DESDE\}/)
    }
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
