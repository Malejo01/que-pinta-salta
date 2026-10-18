/**
 * `/privacidad` reescrita (R45, 45-b): mismo patrón que
 * `tests/legales/pagina-legal.test.ts` (ya commiteado) — sin jsdom, con
 * `renderToStaticMarkup` y los `vi.mock` de `Navbar`/`MobileNav`. La página
 * no tiene props, así que se puede invocar `PrivacidadPage()` directamente.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/navbar', () => ({ Navbar: () => null }))
vi.mock('@/components/mobile-nav', () => ({ MobileNav: () => null }))

import PrivacidadPage, { metadata } from '@/app/privacidad/page'
import { CONTACTO_EMAIL } from '@qps/core/contacto'

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))

function readSource(relativePath: string): string {
  return readFileSync(path.join(WEB_ROOT, relativePath), 'utf8')
}

const SOURCE = readSource('app/privacidad/page.tsx')
const html = renderToStaticMarkup(React.createElement(PrivacidadPage))

describe('metadata', () => {
  it('canonical es "/privacidad"', () => {
    expect(metadata.alternates?.canonical).toBe('/privacidad')
  })

  it('tiene title que termina en "| Qué Pinta Salta" y description que nombra la app', () => {
    expect(typeof metadata.title).toBe('string')
    expect(String(metadata.title)).toMatch(/\| Qué Pinta Salta$/)
    expect(typeof metadata.description).toBe('string')
    expect(String(metadata.description).toLowerCase()).toContain('app')
  })
})

describe('el mail de contacto sale de la constante, nunca literal en el archivo', () => {
  it('el HTML tiene el mail y un mailto con asunto', () => {
    expect(html).toContain(CONTACTO_EMAIL)
    expect(html).toContain(`href="mailto:${CONTACTO_EMAIL}?subject=`)
  })

  it('el archivo fuente no tiene el mail literal', () => {
    expect(SOURCE).not.toContain('contacto@quepintasalta.com.ar')
  })

  it('el archivo fuente no tiene una secuencia de 8 dígitos o más (CUIT, teléfono, etc.)', () => {
    expect(SOURCE).not.toMatch(/\d{8,}/)
  })
})

describe('borrador y marcas', () => {
  it('el HTML tiene el aviso de borrador', () => {
    expect(html).toContain('Borrador pendiente de revisión legal')
  })

  it('el HTML tiene "Última actualización: [COMPLETAR"', () => {
    expect(html).toContain('Última actualización: [COMPLETAR')
  })

  it('el HTML tiene al menos 6 marcas [REVISIÓN LEGAL]', () => {
    const coincidencias = html.match(/\[REVISIÓN LEGAL\]/g) ?? []
    expect(coincidencias.length).toBeGreaterThanOrEqual(6)
  })
})

describe('el texto nombra lo propio de la app', () => {
  it.each(['token', 'Sentry', 'calendario', 'sin conexión', 'Voy', 'Me interesa', 'Expo'])(
    'el HTML contiene "%s"',
    (fragmento) => {
      expect(html).toContain(fragmento)
    }
  )
})

describe('enlaces a eliminar cuenta', () => {
  it('enlaza /eliminar-cuenta y /perfil/eliminar-cuenta', () => {
    expect(html).toContain('href="/eliminar-cuenta"')
    expect(html).toContain('href="/perfil/eliminar-cuenta"')
  })
})

describe('marco legal argentino', () => {
  it('dice "Ley 25.326" y nombra la Agencia de Acceso a la Información Pública', () => {
    expect(html).toContain('Ley 25.326')
    expect(html).toContain('Agencia de Acceso a la Información Pública')
  })
})

describe('Server Component', () => {
  it("el archivo no contiene 'use client'", () => {
    expect(SOURCE).not.toContain("'use client'")
    expect(SOURCE).not.toContain('"use client"')
  })
})

describe('"Voy" / "Me interesa": el total se muestra desde 3 y nunca se dice quién', () => {
  it('el HTML dice que el total se muestra desde 3 personas y que nunca se muestra quién', () => {
    expect(html).toContain('desde 3 personas')
    expect(html).toContain('nunca se muestra quién')
  })
})
