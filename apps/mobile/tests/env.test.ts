// 24-c: `leerEnv` (lib/env.ts). Muta `process.env` antes de cada caso y lo
// restaura después: sin red, sin base, nada que dependa de un .env real.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { leerEnv } from '../lib/env'

const CLAVES = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
  'EXPO_PUBLIC_SENTRY_DSN',
  'EXPO_PUBLIC_ADMOB_BANNER_INICIO_ANDROID',
  'EXPO_PUBLIC_ADMOB_BANNER_BUSCAR_ANDROID',
  'EXPO_PUBLIC_ADS_ENABLED',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const

let valoresOriginales: Record<string, string | undefined> = {}

beforeEach(() => {
  valoresOriginales = {}
  for (const clave of CLAVES) {
    valoresOriginales[clave] = process.env[clave]
    delete process.env[clave]
  }
})

afterEach(() => {
  for (const clave of CLAVES) {
    const valor = valoresOriginales[clave]
    if (valor === undefined) delete process.env[clave]
    else process.env[clave] = valor
  }
})

describe('leerEnv', () => {
  it('con todo seteado, devuelve los 3 bloques completos', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://proyecto-de-prueba.supabase.co'
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-de-prueba'
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = 'google-client-id-de-prueba'
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://clave-de-prueba@sentry.example.org/1'
    process.env.EXPO_PUBLIC_ADMOB_BANNER_INICIO_ANDROID = 'ca-app-pub-1111111111111111/1111111111'
    process.env.EXPO_PUBLIC_ADMOB_BANNER_BUSCAR_ANDROID = 'ca-app-pub-1111111111111111/2222222222'
    process.env.EXPO_PUBLIC_ADS_ENABLED = 'true'

    expect(leerEnv()).toEqual({
      supabase: { url: 'https://proyecto-de-prueba.supabase.co', anonKey: 'anon-key-de-prueba' },
      googleWebClientId: 'google-client-id-de-prueba',
      sentryDsn: 'https://clave-de-prueba@sentry.example.org/1',
      admobBannerInicio: 'ca-app-pub-1111111111111111/1111111111',
      admobBannerBuscar: 'ca-app-pub-1111111111111111/2222222222',
      anunciosHabilitados: true,
    })
  })

  it('sin nada seteado, los 3 bloques son null y los anuncios quedan apagados', () => {
    expect(leerEnv()).toEqual({
      supabase: null,
      googleWebClientId: null,
      sentryDsn: null,
      admobBannerInicio: null,
      admobBannerBuscar: null,
      anunciosHabilitados: false,
    })
  })

  it('con valores en blanco (solo espacios), cuentan como faltantes', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = '   '
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = '  '
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = ''
    process.env.EXPO_PUBLIC_SENTRY_DSN = '\t\n'
    process.env.EXPO_PUBLIC_ADMOB_BANNER_INICIO_ANDROID = '   '
    process.env.EXPO_PUBLIC_ADMOB_BANNER_BUSCAR_ANDROID = ''

    const env = leerEnv()
    expect(env.supabase).toBeNull()
    expect(env.googleWebClientId).toBeNull()
    expect(env.sentryDsn).toBeNull()
    expect(env.admobBannerInicio).toBeNull()
    expect(env.admobBannerBuscar).toBeNull()
  })

  it('con solo la url de Supabase (sin anon key), supabase es null', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://proyecto-de-prueba.supabase.co'

    expect(leerEnv().supabase).toBeNull()
  })

  it('con solo la anon key (sin url), supabase es null', () => {
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-de-prueba'

    expect(leerEnv().supabase).toBeNull()
  })

  it('google y sentry son independientes entre sí y de supabase', () => {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = 'google-client-id-de-prueba'

    const env = leerEnv()
    expect(env.googleWebClientId).toBe('google-client-id-de-prueba')
    expect(env.sentryDsn).toBeNull()
    expect(env.supabase).toBeNull()
  })

  it('recorta espacios alrededor de un valor presente', () => {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = '  google-client-id-de-prueba  '

    expect(leerEnv().googleWebClientId).toBe('google-client-id-de-prueba')
  })

  it('EXPO_PUBLIC_ADS_ENABLED="true" (el string exacto) enciende los anuncios', () => {
    process.env.EXPO_PUBLIC_ADS_ENABLED = 'true'
    expect(leerEnv().anunciosHabilitados).toBe(true)
  })

  it.each(['', '1', 'TRUE', ' true ', 'false', '0', 'yes'])(
    'EXPO_PUBLIC_ADS_ENABLED=%j no enciende los anuncios (solo el string exacto "true" lo hace)',
    (valor) => {
      process.env.EXPO_PUBLIC_ADS_ENABLED = valor
      expect(leerEnv().anunciosHabilitados).toBe(false)
    },
  )

  it('sin EXPO_PUBLIC_ADS_ENABLED seteado, los anuncios quedan apagados', () => {
    expect(leerEnv().anunciosHabilitados).toBe(false)
  })

  it('nunca devuelve algo leído de SUPABASE_SERVICE_ROLE_KEY (sin el prefijo EXPO_PUBLIC_)', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-de-prueba-nunca-deberia-salir'
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://proyecto-de-prueba.supabase.co'
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-de-prueba'

    const env = leerEnv()
    const texto = JSON.stringify(env)
    expect(texto).not.toContain('service-role-de-prueba-nunca-deberia-salir')
    expect(texto).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    // Y específicamente: la anon key leída no es por accidente la service
    // role key (confusión de nombre de variable).
    expect(env.supabase?.anonKey).toBe('anon-key-de-prueba')
  })
})
