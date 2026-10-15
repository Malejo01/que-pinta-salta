// Fase 0 de la R24: la configuración de la app.
// - El paquete de Android es el mismo que la R23 publica para assetlinks (una sola fuente de verdad).
// - Ninguna clave escrita en la config: lo que llega a `expo config --type public` no tiene secretos.
// Sin red ni teléfono.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import config, { plugins } from '../app.config'
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

describe('app.config.ts para EAS (QPS-143)', () => {
  it('el projectId de EAS está fijo en la config', () => {
    expect(config.extra?.eas?.projectId).toBe('3250542d-0b86-496f-832d-e4d19457070b')
  })

  it('el ícono y el ícono adaptativo apuntan a archivos que existen', () => {
    const base = path.join(__dirname, '..')
    expect(config.icon).toBeTruthy()
    expect(config.android?.adaptiveIcon?.foregroundImage).toBeTruthy()
    expect(config.android?.adaptiveIcon?.backgroundColor).toMatch(/^#[0-9A-F]{6}$/i)
    expect(fs.existsSync(path.join(base, config.icon!))).toBe(true)
    expect(fs.existsSync(path.join(base, config.android!.adaptiveIcon!.foregroundImage!))).toBe(true)
  })

  it('sin SENTRY_AUTH_TOKEN el plugin de Sentry no entra (no puede tumbar el build)', () => {
    expect(plugins({})).not.toContain('@sentry/react-native/expo')
    expect(plugins({ SENTRY_AUTH_TOKEN: '   ' })).not.toContain('@sentry/react-native/expo')
    expect(plugins({})).toEqual(['expo-router', 'expo-secure-store', '@react-native-google-signin/google-signin'])
  })

  it('con SENTRY_AUTH_TOKEN el plugin entra, y el token no queda en la config', () => {
    const conToken = plugins({ SENTRY_AUTH_TOKEN: 'token-de-prueba' })
    expect(conToken).toContain('@sentry/react-native/expo')
    expect(JSON.stringify(conToken)).not.toContain('token-de-prueba')
  })
})
