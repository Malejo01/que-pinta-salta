// 52-a: la carga de AdSense — lazyOnload, consentimiento antes del script, y
// los slots/alturas de lib/config/monetization.ts.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const readSource = (rel: string) => readFileSync(path.join(WEB_ROOT, rel), 'utf8')

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('app/layout.tsx: ya no tiene el <script> crudo de adsbygoogle', () => {
  const src = readSource('app/layout.tsx')

  it('no hay pagead2.googlesyndication.com dentro de un <script> (ahora es <AdsenseLoader />)', () => {
    expect(src).not.toMatch(/<script[^>]*pagead2\.googlesyndication\.com/)
  })

  it('usa <AdsenseLoader />, importado de components/adsense-loader', () => {
    expect(src).toMatch(/from ['"]@\/components\/adsense-loader['"]/)
    expect(src).toMatch(/<AdsenseLoader\s*\/>/)
  })
})

describe('components/adsense-loader.tsx: next/script en lazyOnload', () => {
  const src = readSource('components/adsense-loader.tsx')

  it("importa Script de 'next/script'", () => {
    expect(src).toMatch(/import Script from ['"]next\/script['"]/)
  })

  it('strategy="lazyOnload" (nunca bloquea el primer pantallazo)', () => {
    expect(src).toContain('strategy="lazyOnload"')
  })
})

describe('AdsenseLoader(): con ADS_ENABLED apagado, devuelve null', () => {
  it('null, sin llegar a montar el script ni a leer el consentimiento', async () => {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_ADS_ENABLED', 'false')
    const { AdsenseLoader } = await import('@/components/adsense-loader')

    expect(AdsenseLoader()).toBeNull()
  })
})

describe('renderAdsenseScript: mientras el consentimiento sea null (o "unknown", en el servidor), no hay <Script>', () => {
  it('consent = null (todavía no respondió el aviso): null', async () => {
    const { renderAdsenseScript } = await import('@/components/adsense-loader')
    expect(renderAdsenseScript('1234567890', null)).toBeNull()
  })

  it('consent = "unknown" (snapshot del servidor): null', async () => {
    const { renderAdsenseScript } = await import('@/components/adsense-loader')
    expect(renderAdsenseScript('1234567890', 'unknown')).toBeNull()
  })

  it('consent = "granted": devuelve el <Script> con el client id y lazyOnload', async () => {
    const { renderAdsenseScript } = await import('@/components/adsense-loader')
    const el = renderAdsenseScript('1234567890', 'granted') as unknown as { props: Record<string, unknown> }
    expect(el).not.toBeNull()
    expect(el.props.src).toBe('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=1234567890')
    expect(el.props.strategy).toBe('lazyOnload')
    expect(el.props.crossOrigin).toBe('anonymous')
  })

  it('consent = "denied": devuelve el <Script> igual (solo cambia requestNonPersonalizedAds, no si se carga)', async () => {
    const { renderAdsenseScript } = await import('@/components/adsense-loader')
    const el = renderAdsenseScript('1234567890', 'denied')
    expect(el).not.toBeNull()
  })
})

describe('configurarAnunciosNoPersonalizados: fija requestNonPersonalizedAds antes del script', () => {
  it("consent='denied' -> requestNonPersonalizedAds = 1", async () => {
    const { configurarAnunciosNoPersonalizados } = await import('@/components/adsense-loader')
    const fakeWindow = {} as unknown as Window
    configurarAnunciosNoPersonalizados(fakeWindow, 'denied')
    expect(fakeWindow.adsbygoogle?.requestNonPersonalizedAds).toBe(1)
  })

  it("consent='granted' -> requestNonPersonalizedAds = 0", async () => {
    const { configurarAnunciosNoPersonalizados } = await import('@/components/adsense-loader')
    const fakeWindow = {} as unknown as Window
    configurarAnunciosNoPersonalizados(fakeWindow, 'granted')
    expect(fakeWindow.adsbygoogle?.requestNonPersonalizedAds).toBe(0)
  })

  it('si la persona cambia de respuesta, el valor se actualiza (denied -> granted)', async () => {
    const { configurarAnunciosNoPersonalizados } = await import('@/components/adsense-loader')
    const fakeWindow = {} as unknown as Window
    configurarAnunciosNoPersonalizados(fakeWindow, 'denied')
    expect(fakeWindow.adsbygoogle?.requestNonPersonalizedAds).toBe(1)
    configurarAnunciosNoPersonalizados(fakeWindow, 'granted')
    expect(fakeWindow.adsbygoogle?.requestNonPersonalizedAds).toBe(0)
  })

  it('reusa el adsbygoogle existente (no lo pisa con un arreglo nuevo)', async () => {
    const { configurarAnunciosNoPersonalizados } = await import('@/components/adsense-loader')
    const comandoPrevio = { previo: true }
    const fakeWindow = { adsbygoogle: [comandoPrevio] } as unknown as Window
    configurarAnunciosNoPersonalizados(fakeWindow, 'granted')
    expect(fakeWindow.adsbygoogle).toContain(comandoPrevio)
  })
})

describe('lib/config/monetization: ADSENSE_SLOTS', () => {
  async function slotsConAds(raw: string): Promise<string | null> {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_ADS_ENABLED', 'true')
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_CLIENT_ID', 'ca-pub-0000000000000000')
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_SLOT_PORTADA', raw)
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_SLOT_FICHA', raw)
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_SLOT_BUSCAR', raw)
    const { ADSENSE_SLOTS } = await import('@/lib/config/monetization')
    return ADSENSE_SLOTS.portada
  }

  it('"home-middle-banner" (el nombre de hoy, no un ID numérico): null', async () => {
    expect(await slotsConAds('home-middle-banner')).toBeNull()
  })

  it('"" (sin configurar): null', async () => {
    expect(await slotsConAds('')).toBeNull()
  })

  it('"1234567890" (solo dígitos): el número, igual', async () => {
    expect(await slotsConAds('1234567890')).toBe('1234567890')
  })

  it('con ADS_ENABLED apagado, null aunque el slot sea válido', async () => {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_ADS_ENABLED', 'false')
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_SLOT_PORTADA', '1234567890')
    const { ADSENSE_SLOTS } = await import('@/lib/config/monetization')
    expect(ADSENSE_SLOTS.portada).toBeNull()
  })

  it('cada lugar (portada, ficha, buscar) se lee de su propia variable', async () => {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_ADS_ENABLED', 'true')
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_SLOT_PORTADA', '1111111111')
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_SLOT_FICHA', '2222222222')
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_SLOT_BUSCAR', '')
    const { ADSENSE_SLOTS } = await import('@/lib/config/monetization')
    expect(ADSENSE_SLOTS.portada).toBe('1111111111')
    expect(ADSENSE_SLOTS.ficha).toBe('2222222222')
    expect(ADSENSE_SLOTS.buscar).toBeNull()
  })
})

describe('lib/config/monetization: ALTO_RESERVADO_ANUNCIO', () => {
  it('tiene un valor en px para mobile y desktop en los tres lugares', async () => {
    vi.resetModules()
    const { ALTO_RESERVADO_ANUNCIO } = await import('@/lib/config/monetization')

    for (const lugar of ['portada', 'ficha', 'buscar'] as const) {
      expect(typeof ALTO_RESERVADO_ANUNCIO[lugar].mobile).toBe('number')
      expect(typeof ALTO_RESERVADO_ANUNCIO[lugar].desktop).toBe('number')
      expect(ALTO_RESERVADO_ANUNCIO[lugar].mobile).toBeGreaterThan(0)
      expect(ALTO_RESERVADO_ANUNCIO[lugar].desktop).toBeGreaterThan(0)
    }
  })
})
