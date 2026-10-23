// 52-a: la CSP de next.config.mjs solo suma el CMP de Google
// (fundingchoicesmessages.google.com, "Privacidad y mensajes") cuando
// ADS_ENABLED está prendido. Apagado, la CSP tiene que quedar IDÉNTICA a la
// de hoy (texto fijo abajo, copiado de next.config.mjs sin la parte de
// anuncios). next.config.mjs lee process.env al importarse (no es una
// función de runtime), así que hace falta vi.resetModules() + import
// dinámico en cada caso para forzar una evaluación fresca.
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

type NextConfigModule = {
  default: {
    headers: () => Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>>
  }
}

async function cspCon(adsEnabled: boolean): Promise<string> {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_ADS_ENABLED', adsEnabled ? 'true' : 'false')
  const mod = (await import('../../next.config.mjs')) as NextConfigModule
  const [{ headers }] = await mod.default.headers()
  const csp = headers.find((h) => h.key === 'Content-Security-Policy')
  if (!csp) throw new Error('next.config.mjs no tiene el header Content-Security-Policy')
  return csp.value
}

// Mismas listas que next.config.mjs, pero SIN los dominios de anuncios: es
// la CSP de hoy (ADS_ENABLED apagado), fijada como fixture independiente del
// código para que un cambio accidental en next.config.mjs haga fallar este
// test.
const CSP_SIN_ADS = {
  'default-src': ["'self'"],
  'script-src': [
    "'self'", "'unsafe-eval'", "'unsafe-inline'",
    'https://va.vercel-scripts.com',
    'https://www.googletagmanager.com', 'https://*.googletagmanager.com', 'https://tagmanager.google.com',
    'https://www.google-analytics.com', 'https://*.google-analytics.com',
    'https://www.google.com', 'https://*.google.com', 'https://*.google.com.ar',
  ],
  'style-src': ["'self'", "'unsafe-inline'", 'https://*.googletagmanager.com', 'https://tagmanager.google.com', 'https://fonts.googleapis.com'],
  'img-src': [
    "'self'", 'blob:', 'data:',
    'https://*.supabase.co',
    'https://entradauno.com', 'https://*.entradauno.com',
    'https://norteticket.com', 'https://*.norteticket.com', 'https://norteticket.com.ar', 'https://*.norteticket.com.ar',
    'https://centralticket.com.ar', 'https://*.centralticket.com.ar',
    'https://vamos.gob.ar', 'https://*.vamos.gob.ar',
    'https://alpogo.com', 'https://*.alpogo.com',
    'https://images.unsplash.com', 'https://*.unsplash.com',
    'https://*.googletagmanager.com', 'https://*.google-analytics.com',
    'https://*.cinemark.com.ar', 'https://*.adro.studio',
    'https://stats.g.doubleclick.net',
    'https://*.google.com', 'https://*.google.com.ar',
    // El mapa (R54): los tiles de OpenFreeMap.
    'https://tiles.openfreemap.org',
  ],
  'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
  'connect-src': [
    "'self'", 'https://*.supabase.co', 'wss://*.supabase.co',
    'https://*.google-analytics.com', 'https://*.analytics.google.com',
    'https://stats.g.doubleclick.net',
    'https://*.googletagmanager.com', 'https://*.google.com', 'https://*.google.com.ar',
    'https://tiles.openfreemap.org',
  ],
  'frame-src': [
    'https://*.googletagmanager.com',
    'https://*.google.com', 'https://*.google.com.ar',
  ],
  'frame-ancestors': ["'none'"],
  'worker-src': ["'self'", 'blob:'],
}

const CSP_SIN_ADS_TEXTO = Object.entries(CSP_SIN_ADS)
  .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
  .join('; ')

describe('CSP: fundingchoicesmessages.google.com (CMP de Google) solo con ADS_ENABLED', () => {
  it('con ADS_ENABLED=true: está en script-src, connect-src y frame-src', async () => {
    const csp = await cspCon(true)

    expect(csp).toMatch(/script-src[^;]*\bfundingchoicesmessages\.google\.com\b/)
    expect(csp).toMatch(/connect-src[^;]*\bfundingchoicesmessages\.google\.com\b/)
    expect(csp).toMatch(/frame-src[^;]*\bfundingchoicesmessages\.google\.com\b/)
  })

  it('con ADS_ENABLED=false: no está en ninguna directiva, y la CSP es exactamente la de hoy', async () => {
    const csp = await cspCon(false)

    expect(csp).not.toContain('fundingchoicesmessages.google.com')
    expect(csp).toBe(CSP_SIN_ADS_TEXTO)
  })

  it.each([true, false])("frame-ancestors 'none' se mantiene con ADS_ENABLED=%s", async (adsEnabled) => {
    const csp = await cspCon(adsEnabled)
    expect(csp).toContain("frame-ancestors 'none'")
  })
})
