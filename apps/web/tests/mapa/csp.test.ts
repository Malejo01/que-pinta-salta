/**
 * La CSP de `next.config.mjs` (R54, tarea 54-c): el mapa necesita `fetch` a
 * OpenFreeMap (`connect-src`, `img-src`) y un worker de `blob:`
 * (`worker-src`, nuevo). Revisa seguridad.
 *
 * `ADS_ENABLED` (`NEXT_PUBLIC_ADS_ENABLED === 'true'`) se lee UNA VEZ, al
 * importar el módulo — igual que en `tests/app/app-links-route.test.ts`, que
 * también importa `next.config.mjs` sin setear esa variable. Acá tampoco se
 * setea, así que este archivo corre con el interruptor de anuncios APAGADO
 * (el valor por defecto de vitest, que no define `NEXT_PUBLIC_ADS_ENABLED`).
 * Si algún día hace falta probar la CSP con `ADS_ENABLED === true`, tiene que
 * ir en otro archivo: el valor queda fijo para todos los tests de este
 * módulo en todo el proceso de Vitest.
 *
 * Sin red ni base; entorno `node` (ver `vitest.config.ts`).
 */
import { describe, expect, it } from 'vitest'

import { ORIGEN_TILES } from '@qps/core/mapa/estilos'

type HeaderEntry = { key: string; value: string }
type HeaderGroup = { source: string; headers: HeaderEntry[] }
type NextConfigModule = { default: { headers: () => Promise<HeaderGroup[]> } }

/** El header `Content-Security-Policy` real de `next.config.mjs`, parseado a un mapa directiva -> fuentes. */
async function cspDirectivas(): Promise<Map<string, string[]>> {
  const mod = (await import('../../next.config.mjs')) as NextConfigModule
  const headerGroups = await mod.default.headers()
  const cspHeader = headerGroups[0]?.headers.find((h) => h.key === 'Content-Security-Policy')
  if (!cspHeader) throw new Error('No hay header Content-Security-Policy en next.config.mjs')

  const directivas = new Map<string, string[]>()
  for (const parte of cspHeader.value.split('; ')) {
    const [directiva, ...fuentes] = parte.split(' ')
    directivas.set(directiva, fuentes)
  }
  return directivas
}

async function permissionsPolicy(): Promise<string | undefined> {
  const mod = (await import('../../next.config.mjs')) as NextConfigModule
  const headerGroups = await mod.default.headers()
  return headerGroups[0]?.headers.find((h) => h.key === 'Permissions-Policy')?.value
}

describe('la CSP de next.config.mjs, con ADS_ENABLED apagado', () => {
  it('este entorno de test corre con NEXT_PUBLIC_ADS_ENABLED apagado (si esto fallara, el resto del archivo no estaría probando lo que dice)', () => {
    expect(process.env.NEXT_PUBLIC_ADS_ENABLED).not.toBe('true')
  })

  it('connect-src tiene ORIGEN_TILES (@qps/core/mapa/estilos)', async () => {
    const directivas = await cspDirectivas()
    expect(directivas.get('connect-src')).toContain(ORIGEN_TILES)
  })

  it('img-src tiene ORIGEN_TILES (@qps/core/mapa/estilos)', async () => {
    const directivas = await cspDirectivas()
    expect(directivas.get('img-src')).toContain(ORIGEN_TILES)
  })

  it('worker-src existe, con blob: y self, y nada más', async () => {
    const directivas = await cspDirectivas()
    expect(directivas.get('worker-src')).toEqual(["'self'", 'blob:'])
  })

  it('Permissions-Policy sigue con geolocation=() (la web no usa ubicación)', async () => {
    expect(await permissionsPolicy()).toBe('camera=(), microphone=(), geolocation=()')
  })

  // ---------------------------------------------------------------------
  // "Nada más cambió": la lista COMPLETA de orígenes esperada para cada
  // directiva, con ADS_ENABLED apagado. Si alguien suma un origen en
  // cualquier directiva (de esta tarea o de cualquier otra), esta
  // aserción se pone en rojo.
  // ---------------------------------------------------------------------
  it('nada más cambió: cada directiva tiene exactamente esta lista de orígenes', async () => {
    const directivas = await cspDirectivas()

    expect(directivas.get('default-src')).toEqual(["'self'"])

    expect(directivas.get('script-src')).toEqual([
      "'self'", "'unsafe-eval'", "'unsafe-inline'",
      'https://va.vercel-scripts.com',
      'https://www.googletagmanager.com', 'https://*.googletagmanager.com', 'https://tagmanager.google.com',
      'https://www.google-analytics.com', 'https://*.google-analytics.com',
      'https://www.google.com', 'https://*.google.com', 'https://*.google.com.ar',
    ])

    expect(directivas.get('style-src')).toEqual([
      "'self'", "'unsafe-inline'",
      'https://*.googletagmanager.com', 'https://tagmanager.google.com', 'https://fonts.googleapis.com',
    ])

    expect(directivas.get('img-src')).toEqual([
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
      ORIGEN_TILES,
    ])

    expect(directivas.get('font-src')).toEqual(["'self'", 'data:', 'https://fonts.gstatic.com'])

    expect(directivas.get('connect-src')).toEqual([
      "'self'", 'https://*.supabase.co', 'wss://*.supabase.co',
      'https://*.google-analytics.com', 'https://*.analytics.google.com',
      'https://stats.g.doubleclick.net',
      'https://*.googletagmanager.com', 'https://*.google.com', 'https://*.google.com.ar',
      ORIGEN_TILES,
    ])

    expect(directivas.get('frame-src')).toEqual([
      'https://*.googletagmanager.com',
      'https://*.google.com', 'https://*.google.com.ar',
    ])

    expect(directivas.get('frame-ancestors')).toEqual(["'none'"])

    expect(directivas.get('worker-src')).toEqual(["'self'", 'blob:'])

    // Ninguna directiva nueva aparte de worker-src.
    expect([...directivas.keys()].sort()).toEqual(
      [
        'default-src', 'script-src', 'style-src', 'img-src', 'font-src',
        'connect-src', 'frame-src', 'frame-ancestors', 'worker-src',
      ].sort(),
    )
  })

  it('ningún origen nuevo tiene comodín suelto ni unsafe-* (la única fuente nueva es ORIGEN_TILES, y worker-src solo suma blob:)', async () => {
    const directivas = await cspDirectivas()
    expect(ORIGEN_TILES).not.toContain('*')
    expect((directivas.get('connect-src') ?? []).filter((o) => o.includes('unsafe'))).toEqual([])
    expect((directivas.get('img-src') ?? []).filter((o) => o.includes('unsafe'))).toEqual([])
    expect(directivas.get('worker-src')).not.toContain('*')
  })
})
