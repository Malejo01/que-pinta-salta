// Fase 0 de la R24: la configuración de la app.
// - El paquete de Android es el mismo que la R23 publica para assetlinks (una sola fuente de verdad).
// - Ninguna clave escrita en la config: lo que llega a `expo config --type public` no tiene secretos.
// Sin red ni teléfono.
import { describe, expect, it } from 'vitest'
import config from '../app.config'
import { ANDROID_PACKAGE } from '../../web/lib/config/app-links'

describe('app.config.ts', () => {
  it('el paquete de Android es el de la R23 (para siempre)', () => {
    expect(config.android?.package).toBe(ANDROID_PACKAGE)
  })

  it('el esquema es quepintasalta y los App Links apuntan a /evento/ en www', () => {
    expect(config.scheme).toBe('quepintasalta')
    const datos = config.android?.intentFilters?.flatMap((f) => (Array.isArray(f.data) ? f.data : [f.data])) ?? []
    expect(datos).toContainEqual({ scheme: 'https', host: 'www.quepintasalta.com.ar', pathPrefix: '/evento/' })
  })

  it('no hay claves escritas en la config', () => {
    const texto = JSON.stringify(config)
    expect(texto).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/) // JWT (anon o service role)
    expect(texto).not.toMatch(/sbp_|sb_secret_|sntrys_|https:\/\/[a-f0-9]+@[^"]*sentry/i)
    expect(texto).not.toMatch(/apps\.googleusercontent\.com/)
  })
})
