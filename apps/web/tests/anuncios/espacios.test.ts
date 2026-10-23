/**
 * 52-b (Web, los espacios): el alto reservado del banner (CLS 0), la
 * etiqueta "Publicidad" (no un encabezado), y dónde vive `<AdSenseBanner`
 * en cada página — portada, ficha y buscar, nunca en los modales ni arriba
 * del pliegue.
 *
 * Sin red ni base; entorno `node` (ver `vitest.config.ts`). Cada test que
 * importa `@/components/adsense-banner` resetea módulos y fija las
 * variables de entorno antes: `lib/config/monetization.ts` las lee una
 * sola vez, al cargar el módulo (mismo criterio que
 * `tests/anuncios/carga.test.ts`, de la 52-a).
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))

function readSource(relativePath: string): string {
  return readFileSync(path.join(WEB_ROOT, relativePath), 'utf8')
}

function listarTsx(dirAbsoluto: string): string[] {
  const resultado: string[] = []
  for (const entrada of readdirSync(dirAbsoluto, { withFileTypes: true })) {
    const abs = path.join(dirAbsoluto, entrada.name)
    if (entrada.isDirectory()) {
      resultado.push(...listarTsx(abs))
    } else if (entrada.isFile() && entrada.name.endsWith('.tsx')) {
      resultado.push(abs)
    }
  }
  return resultado
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

async function cargarAdSenseBanner() {
  const mod = await import('@/components/adsense-banner')
  return mod.AdSenseBanner
}

// ---------------------------------------------------------------------------
// El alto reservado (CLS 0) y el cartel de respaldo cuando el slot es null.
// ---------------------------------------------------------------------------
describe('AdSenseBanner: con ADS_ENABLED=true y el slot en null', () => {
  // 15 s: el primer import dinámico es en frío y con dos suites en paralelo pasa los 5 s por omisión (R64).
  it('el contenedor sale con el min-height del lugar y el cartel de respaldo (sin <ins>)', async () => {
    vi.stubEnv('NEXT_PUBLIC_ADS_ENABLED', 'true')
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_CLIENT_ID', 'ca-pub-0000000000000000')
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_SLOT_PORTADA', '')
    const AdSenseBanner = await cargarAdSenseBanner()

    const html = renderToStaticMarkup(React.createElement(AdSenseBanner, { lugar: 'portada' }))

    expect(html).toContain('min-h-[280px]')
    expect(html).toContain('sm:min-h-[250px]')
    expect(html).not.toContain('<ins')
    expect(html).toContain('Anunciá en Qué Pinta Salta')
  }, 15_000)
})

// ---------------------------------------------------------------------------
// ALTO_RESERVADO_CLASES (el literal de Tailwind) tiene que seguir atado a
// ALTO_RESERVADO_ANUNCIO (los números en lib/config/monetization.ts): si el
// día de mañana cambian los px ahí, este test cae y obliga a tocar el
// literal a mano (Tailwind 4 no arma una clase con un template literal).
// ---------------------------------------------------------------------------
describe('ALTO_RESERVADO_CLASES: atado a ALTO_RESERVADO_ANUNCIO', () => {
  it('el min-h de cada lugar coincide con los px de ALTO_RESERVADO_ANUNCIO', async () => {
    vi.stubEnv('NEXT_PUBLIC_ADS_ENABLED', 'true')
    const { ALTO_RESERVADO_CLASES } = await import('@/components/adsense-banner')
    const { ALTO_RESERVADO_ANUNCIO } = await import('@/lib/config/monetization')

    for (const lugar of ['portada', 'ficha', 'buscar'] as const) {
      const { mobile, desktop } = ALTO_RESERVADO_ANUNCIO[lugar]
      const esperado = `min-h-[${mobile}px] sm:min-h-[${desktop}px]`
      expect(ALTO_RESERVADO_CLASES).toBe(esperado)
    }
  })
})

describe('AdSenseBanner: con un slot numérico', () => {
  it('sale el contenedor con el min-height y el <ins data-ad-slot>', async () => {
    vi.stubEnv('NEXT_PUBLIC_ADS_ENABLED', 'true')
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_CLIENT_ID', 'ca-pub-0000000000000000')
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_SLOT_FICHA', '1234567890')
    const AdSenseBanner = await cargarAdSenseBanner()

    const html = renderToStaticMarkup(React.createElement(AdSenseBanner, { lugar: 'ficha' }))

    expect(html).toContain('min-h-[280px]')
    expect(html).toContain('sm:min-h-[250px]')
    expect(html).toMatch(/<ins[^>]*data-ad-slot="1234567890"/)
    expect(html).not.toContain('Anunciá en Qué Pinta Salta')
  })
})

// ---------------------------------------------------------------------------
// La etiqueta "Publicidad": chica, apagada, y NUNCA un encabezado
// (QPS-089: un <h4> ahí rompía la jerarquía de la página).
// ---------------------------------------------------------------------------
describe('AdSenseBanner: la etiqueta "Publicidad"', () => {
  it('está presente, en texto chico y apagado, y no es un encabezado (h1..h6)', async () => {
    vi.stubEnv('NEXT_PUBLIC_ADS_ENABLED', 'true')
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_CLIENT_ID', 'ca-pub-0000000000000000')
    const AdSenseBanner = await cargarAdSenseBanner()

    const html = renderToStaticMarkup(React.createElement(AdSenseBanner, { lugar: 'buscar' }))

    expect(html).toMatch(/<p[^>]*class="[^"]*text-xs[^"]*text-muted-foreground[^"]*"[^>]*>Publicidad<\/p>/)
    expect(html).not.toMatch(/<h[1-6][^>]*>[^<]*Publicidad/)
  })
})

// ---------------------------------------------------------------------------
// Con ADS_ENABLED apagado, el HTML es vacío (como hoy): nada visible.
// ---------------------------------------------------------------------------
describe('AdSenseBanner: con ADS_ENABLED=false', () => {
  it('el HTML es vacío en los tres lugares', async () => {
    vi.stubEnv('NEXT_PUBLIC_ADS_ENABLED', 'false')
    const AdSenseBanner = await cargarAdSenseBanner()

    for (const lugar of ['portada', 'ficha', 'buscar'] as const) {
      const html = renderToStaticMarkup(React.createElement(AdSenseBanner, { lugar }))
      expect(html).toBe('')
    }
  })
})

// ---------------------------------------------------------------------------
// Detector de lugares: <AdSenseBanner solo en home-content.tsx,
// event-detail-page.tsx y buscar-content.tsx — nunca en event-modal*.tsx ni
// en app/@modal/**.
// ---------------------------------------------------------------------------
describe('Detector de lugares: <AdSenseBanner solo en portada, ficha y buscar', () => {
  const archivosTsx = [
    ...listarTsx(path.join(WEB_ROOT, 'components')),
    ...listarTsx(path.join(WEB_ROOT, 'app')),
  ]

  it('aparece exactamente en home-content.tsx, event-detail-page.tsx y buscar-content.tsx', () => {
    const conElBanner = archivosTsx
      .filter((abs) => readFileSync(abs, 'utf8').includes('<AdSenseBanner'))
      .map((abs) => path.relative(WEB_ROOT, abs).replace(/\\/g, '/'))
      .sort()

    expect(conElBanner).toEqual([
      'app/buscar/buscar-content.tsx',
      'components/event-detail-page.tsx',
      'components/home-content.tsx',
    ])
  })

  it('ningún event-modal*.tsx lo usa', () => {
    const modales = archivosTsx.filter((abs) => /^event-modal.*\.tsx$/.test(path.basename(abs)))
    expect(modales.length).toBeGreaterThan(0)
    for (const abs of modales) {
      expect(readFileSync(abs, 'utf8')).not.toContain('<AdSenseBanner')
    }
  })

  it('ningún archivo bajo app/@modal/ lo usa', () => {
    const archivosModal = listarTsx(path.join(WEB_ROOT, 'app', '@modal'))
    expect(archivosModal.length).toBeGreaterThan(0)
    for (const abs of archivosModal) {
      expect(readFileSync(abs, 'utf8')).not.toContain('<AdSenseBanner')
    }
  })
})

// ---------------------------------------------------------------------------
// Buscar: el banner va al final de <main>, después del bloque de resultados
// (nunca entre el buscador y los resultados).
// ---------------------------------------------------------------------------
describe('buscar-content.tsx: el banner va al final de <main>, después de los resultados', () => {
  const src = readSource('app/buscar/buscar-content.tsx')

  it('<AdSenseBanner aparece después de resultadosMostrados.map (la grilla de resultados)', () => {
    const iResultados = src.indexOf('resultadosMostrados.map')
    const iBanner = src.indexOf('<AdSenseBanner')
    expect(iResultados).toBeGreaterThan(-1)
    expect(iBanner).toBeGreaterThan(iResultados)
  })

  it('<AdSenseBanner queda adentro de <main> (antes de que cierre)', () => {
    const iBanner = src.indexOf('<AdSenseBanner')
    const iCierreMain = src.indexOf('</main>')
    expect(iCierreMain).toBeGreaterThan(iBanner)
  })

  it('usa lugar="buscar"', () => {
    expect(src).toMatch(/<AdSenseBanner\s+lugar="buscar"/)
  })
})

// ---------------------------------------------------------------------------
// Ficha: el banner va después de "Cómo llegar" y del botón de entradas
// (regla (a) del 19/10, nunca arriba del pliegue).
// ---------------------------------------------------------------------------
describe('event-detail-page.tsx: el banner va después de "Cómo llegar" y "Comprar tickets"', () => {
  const src = readSource('components/event-detail-page.tsx')

  it('<AdSenseBanner aparece después de "Cómo llegar"', () => {
    const iComoLlegar = src.indexOf('Cómo llegar')
    const iBanner = src.indexOf('<AdSenseBanner')
    expect(iComoLlegar).toBeGreaterThan(-1)
    expect(iBanner).toBeGreaterThan(iComoLlegar)
  })

  it('<AdSenseBanner aparece después de "Comprar tickets"', () => {
    const iComprar = src.indexOf('Comprar tickets')
    const iBanner = src.indexOf('<AdSenseBanner')
    expect(iComprar).toBeGreaterThan(-1)
    expect(iBanner).toBeGreaterThan(iComprar)
  })

  it('usa lugar="ficha"', () => {
    expect(src).toMatch(/<AdSenseBanner\s+lugar="ficha"/)
  })
})

// ---------------------------------------------------------------------------
// Portada: el banner va después del Hero (regla (a) del 19/10).
// ---------------------------------------------------------------------------
describe('home-content.tsx: el banner va después del Hero', () => {
  const src = readSource('components/home-content.tsx')

  it('<AdSenseBanner aparece después de <HeroCarousel', () => {
    const iHero = src.indexOf('<HeroCarousel')
    const iBanner = src.indexOf('<AdSenseBanner')
    expect(iHero).toBeGreaterThan(-1)
    expect(iBanner).toBeGreaterThan(iHero)
  })

  it('usa lugar="portada"', () => {
    expect(src).toMatch(/<AdSenseBanner\s+lugar="portada"/)
  })
})
