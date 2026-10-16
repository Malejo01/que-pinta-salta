// Fase 0 de la R24: la configuración de la app.
// - El paquete de Android es el mismo que la R23 publica para assetlinks (una sola fuente de verdad).
// - Ninguna clave escrita en la config: lo que llega a `expo config --type public` no tiene secretos.
// Sin red ni teléfono.
import { afterEach, describe, expect, it, vi } from 'vitest'
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

// 28-q, parte B, punto 18 (28-c): `extra.entorno`. El valor depende de
// `EAS_BUILD_PROFILE` leído al cargar el módulo, así que para probar los
// distintos valores hay que resetear el registro de módulos y volver a
// importar `../app.config` con el env ya cambiado — el `config` importado
// arriba quedó fijado con el env que había al cargar este archivo de test
// (sin EAS_BUILD_PROFILE, igual que en EAS fuera de un build).
describe('app.config.ts: extra.entorno (28-c)', () => {
  const EAS_BUILD_PROFILE_ORIGINAL = process.env.EAS_BUILD_PROFILE

  afterEach(() => {
    if (EAS_BUILD_PROFILE_ORIGINAL === undefined) delete process.env.EAS_BUILD_PROFILE
    else process.env.EAS_BUILD_PROFILE = EAS_BUILD_PROFILE_ORIGINAL
  })

  it('extra.entorno existe', () => {
    expect(config.extra?.entorno).toBeDefined()
  })

  it("sin EAS_BUILD_PROFILE, extra.entorno es 'local'", async () => {
    delete process.env.EAS_BUILD_PROFILE
    vi.resetModules()
    const { default: configSinPerfil } = await import('../app.config')
    expect(configSinPerfil.extra?.entorno).toBe('local')
  })

  it('con EAS_BUILD_PROFILE=preview, extra.entorno es preview', async () => {
    process.env.EAS_BUILD_PROFILE = 'preview'
    vi.resetModules()
    const { default: configConPerfil } = await import('../app.config')
    expect(configConPerfil.extra?.entorno).toBe('preview')
  })

  it('con EAS_BUILD_PROFILE en blanco (solo espacios), cae a local (mismo trim que leerEnv)', async () => {
    process.env.EAS_BUILD_PROFILE = '   '
    vi.resetModules()
    const { default: configEnBlanco } = await import('../app.config')
    expect(configEnBlanco.extra?.entorno).toBe('local')
  })

  // `router` no aparece acá: lo agrega expo-router al resolver la config
  // (lo que muestra `config:public`), no este módulo. Esta prueba es sobre
  // lo que programador puede controlar: que `extra` no tenga ninguna otra
  // clave (ninguna variable de más, ningún secreto) además de `eas` y
  // `entorno`.
  it('extra no tiene más claves que eas y entorno', () => {
    expect(Object.keys(config.extra ?? {}).sort()).toEqual(['eas', 'entorno'])
  })
})
