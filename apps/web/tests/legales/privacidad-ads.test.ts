/**
 * `/privacidad` con `ADS_ENABLED` apagado y prendido (R63). El flag se lee al
 * importar `lib/config/monetization.ts`, así que cada caso fija
 * `NEXT_PUBLIC_ADS_ENABLED` con `vi.stubEnv`, resetea los módulos y vuelve a
 * importar la página. Lo que se fija: la publicidad **de la app** (Google
 * Mobile Ads / AdMob, la sección "Publicidad en la app") se declara siempre,
 * con el flag que sea; lo del sitio (AdSense) sí depende del flag.
 */
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/navbar', () => ({ Navbar: () => null }))
vi.mock('@/components/mobile-nav', () => ({ MobileNav: () => null }))

async function renderConFlag(valor: string): Promise<string> {
  vi.stubEnv('NEXT_PUBLIC_ADS_ENABLED', valor)
  vi.resetModules()
  const { default: PrivacidadPage } = await import('@/app/privacidad/page')
  return renderToStaticMarkup(React.createElement(PrivacidadPage))
}

function seccion(html: string, titulo: string): string {
  const desde = html.indexOf(`>${titulo}</h2>`)
  expect(desde, `no está la sección "${titulo}"`).toBeGreaterThan(-1)
  return html.slice(desde, html.indexOf('</section>', desde))
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe.each([
  ['apagado', 'false'],
  ['prendido', 'true'],
])('/privacidad con ADS_ENABLED %s', (_nombre, valor) => {
  it('"Con quién los compartimos" nombra Google Mobile Ads / AdMob', async () => {
    const html = await renderConFlag(valor)
    const compartimos = seccion(html, 'Con quién los compartimos')
    expect(compartimos).toContain('Google Mobile Ads')
    expect(compartimos).toContain('AdMob')
  })

  it('la sección "Publicidad en la app" está, con el ID de publicidad y el link de Google', async () => {
    const html = await renderConFlag(valor)
    const publicidad = seccion(html, 'Publicidad en la app')
    expect(publicidad).toContain('ID de publicidad')
    expect(publicidad).toContain('href="https://policies.google.com/technologies/partner-sites"')
  })

  it('no hay borrador, "Me interesa" ni marcas de revisión legal', async () => {
    const html = await renderConFlag(valor)
    expect(html).not.toMatch(/borrador/i)
    expect(html).not.toMatch(/me interesa/i)
    expect(html).not.toContain('REVISIÓN LEGAL')
  })
})

describe('/privacidad: lo del sitio sí depende de ADS_ENABLED', () => {
  it('apagado: no afirma AdSense en el sitio; prendido: sí', async () => {
    const apagado = await renderConFlag('false')
    expect(apagado).not.toContain('AdSense')
    const prendido = await renderConFlag('true')
    expect(prendido).toContain('AdSense')
  })
})
