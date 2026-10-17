// Fase 0 de la R24: la configuración de la app.
// - El paquete de Android es el mismo que la R23 publica para assetlinks (una sola fuente de verdad).
// - Ninguna clave escrita en la config: lo que llega a `expo config --type public` no tiene secretos.
// Sin red ni teléfono.
import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import config, {
  COLOR_NOTIFICACION,
  TEXTO_PERMISO_CALENDARIO,
  googleServicesFile,
  plugins,
} from '../app.config'
import { COLORES_OSCURO } from '../lib/theme'
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

  // 36-d (G4): el intentFilter de App Links tiene que pedir la verificación
  // automática de Android (autoVerify: true) — si no, Android nunca mira
  // /.well-known/assetlinks.json y el link de evento abre el navegador, no
  // la app. No se suma el host sin `www`: los links que se comparten salen
  // de SITIO (con www), y verificar un host que redirige rompe la
  // verificación de Android.
  it('el intentFilter de App Links tiene autoVerify: true, scheme https, host www y pathPrefix /evento/', () => {
    const filtroAppLinks = config.android?.intentFilters?.find((f) => {
      const datos = Array.isArray(f.data) ? f.data : [f.data]
      return datos.some((d) => d?.host === 'www.quepintasalta.com.ar')
    })

    expect(filtroAppLinks).toBeDefined()
    expect(filtroAppLinks?.autoVerify).toBe(true)

    const datos = Array.isArray(filtroAppLinks?.data) ? filtroAppLinks.data : [filtroAppLinks?.data]
    expect(datos).toContainEqual({ scheme: 'https', host: 'www.quepintasalta.com.ar', pathPrefix: '/evento/' })

    // Ningún intentFilter de App Links apunta al host sin `www` (rompe la
    // verificación de Android: ver el comentario arriba).
    const todosLosDatos = config.android?.intentFilters?.flatMap((f) => (Array.isArray(f.data) ? f.data : [f.data])) ?? []
    expect(todosLosDatos.some((d) => d?.host === 'quepintasalta.com.ar')).toBe(false)
  })

  // Evasión encontrada por el revisor/seguridad (R36): el caso de arriba
  // busca con `.find` el intentFilter del host "bueno" y comprueba aparte
  // que ninguno tenga el host SIN `www` — pero no acota cuántos
  // `intentFilters` hay en total. Reproducido a mano (temporalmente, sin
  // commitear): agregar un SEGUNDO intentFilter con `autoVerify: true` y un
  // host parecido pero distinto (una letra cambiada, ni siquiera el host sin
  // `www`) pasaba inadvertido — Android lo tomaría como otro dominio a
  // verificar, sin que ningún test se diera cuenta. Este caso afirma el
  // CONJUNTO completo de hosts con `autoVerify: true`, no solo que el bueno
  // esté presente: tiene que ser exactamente `{ 'www.quepintasalta.com.ar' }`,
  // ni uno de más ni uno de menos.
  it('el conjunto completo de hosts con autoVerify: true es exactamente { www.quepintasalta.com.ar } (ningún intentFilter de más)', () => {
    const filtrosConAutoVerify = config.android?.intentFilters?.filter((f) => f.autoVerify === true) ?? []
    const hosts = filtrosConAutoVerify
      .flatMap((f) => (Array.isArray(f.data) ? f.data : [f.data]))
      .map((d) => d?.host)
      .sort()

    expect(hosts).toEqual(['www.quepintasalta.com.ar'])
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
    expect(plugins({}).map((p) => (typeof p === 'string' ? p : p[0]))).toEqual([
      'expo-router',
      'expo-secure-store',
      '@react-native-google-signin/google-signin',
      'expo-notifications',
      'expo-calendar',
    ])
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

// chore/deps-app-v1 (17/10): los plugins de expo-notifications y
// expo-calendar, y el google-services.json que monta EAS.
describe('app.config.ts: dependencias de la v1 (push, calendario, compartir)', () => {
  const opciones = (nombre: string) => {
    const p = plugins({}).find((x) => (typeof x === 'string' ? x : x[0]) === nombre)
    return typeof p === 'string' || p === undefined ? undefined : p[1]
  }

  it('expo-notifications usa el primario del tema oscuro (mismo color que la app)', () => {
    expect(COLOR_NOTIFICACION).toBe(COLORES_OSCURO.primary)
    expect(opciones('expo-notifications')).toEqual({ color: COLOR_NOTIFICACION })
  })

  it('expo-calendar trae los textos de permiso en español', () => {
    const o = opciones('expo-calendar')
    expect(o?.calendarPermission).toBe(TEXTO_PERMISO_CALENDARIO)
    expect(o?.writeOnlyCalendarPermission).toBe(TEXTO_PERMISO_CALENDARIO)
    expect(TEXTO_PERMISO_CALENDARIO).toMatch(/calendario/)
  })

  it('expo-sharing no lleva plugin (es para recibir lo compartido, y la app solo comparte hacia afuera)', () => {
    expect(JSON.stringify(plugins({}))).not.toContain('expo-sharing')
  })

  it('googleServicesFile sale de GOOGLE_SERVICES_JSON y, sin la variable, no se define', () => {
    expect(googleServicesFile({})).toBeUndefined()
    expect(googleServicesFile({ GOOGLE_SERVICES_JSON: '   ' })).toBeUndefined()
    expect(googleServicesFile({ GOOGLE_SERVICES_JSON: '/eas/ruta/google-services.json' })).toBe(
      '/eas/ruta/google-services.json'
    )
    expect(config.android).not.toHaveProperty('googleServicesFile')
  })
})

