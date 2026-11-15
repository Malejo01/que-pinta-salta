// Q7-5 · Peso de la app: R8 y shrinkResources detrás de QPS_R8=1 (perfil
// production-r8 de eas.json), reglas de ProGuard para las librerías nativas y
// el mapeo de R8 a Sentry. Sin red ni build: se prueba la config.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { REGLAS_PROGUARD, plugins, pluginSentry, r8Activado, reglasProguard, type Plugin } from '../app.config'

const nombre = (p: Plugin) => (typeof p === 'string' ? p : p[0])
const opciones = (lista: Plugin[], n: string) =>
  (lista.find((p) => nombre(p) === n) as [string, Record<string, unknown>] | undefined)?.[1]

const RAIZ = path.resolve(__dirname, '..')
const eas = JSON.parse(fs.readFileSync(path.join(RAIZ, 'eas.json'), 'utf8'))
const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8'))

describe('R8 solo con QPS_R8=1', () => {
  it('sin la variable (el perfil production de siempre) no entra expo-build-properties', () => {
    expect(r8Activado({})).toBe(false)
    expect(r8Activado({ QPS_R8: '0' })).toBe(false)
    expect(r8Activado({ QPS_R8: 'true' })).toBe(false)
    expect(plugins({}).map(nombre)).not.toContain('expo-build-properties')
    expect(plugins({ SENTRY_AUTH_TOKEN: 't' })).toContain('@sentry/react-native/expo')
  })

  it('con QPS_R8=1: minify, shrinkResources y las reglas propias en el build de release', () => {
    const android = opciones(plugins({ QPS_R8: '1' }), 'expo-build-properties')?.android as Record<string, unknown>
    expect(android).toEqual({
      enableMinifyInReleaseBuilds: true,
      enableShrinkResourcesInReleaseBuilds: true,
      extraProguardRules: reglasProguard({ QPS_R8: '1' }),
    })
  })

  it('el perfil production-r8 de eas.json extiende production y prende la variable; production no la tiene', () => {
    expect(eas.build['production-r8']).toEqual({ extends: 'production', env: { QPS_R8: '1' } })
    expect(JSON.stringify(eas.build.production)).not.toContain('QPS_R8')
    expect(JSON.stringify(eas.build.preview)).not.toContain('QPS_R8')
  })

  it('expo-build-properties es la versión del SDK 57', () => {
    expect(pkg.dependencies['expo-build-properties']).toMatch(/^~57\./)
  })
})

describe('reglas de ProGuard/R8', () => {
  it.each([
    ['MapLibre (SDK nativo)', '-keep class org.maplibre.android.** { *; }'],
    ['MapLibre (módulo RN)', '-keep class org.maplibre.reactnative.** { *; }'],
    ['Sentry (puente RN)', '-keep class io.sentry.react.** { *; }'],
    ['Google Sign-In', '-keep class com.reactnativegooglesignin.** { *; }'],
    ['expo-notifications', '-keep class expo.modules.notifications.** { *; }'],
    ['Firebase Messaging', '-keep class com.google.firebase.messaging.FirebaseMessagingService { *; }'],
    ['AdMob (módulo RN)', '-keep class io.invertase.googlemobileads.** { *; }'],
    ['UMP (consentimiento)', '-keep class com.google.android.ump.** { *; }'],
    ['react-native-svg', '-keep public class com.horcrux.svg.** { *; }'],
    ['react-native-view-shot', '-keep class fr.greweb.reactnativeviewshot.** { *; }'],
  ])('%s', (_, regla) => {
    expect(REGLAS_PROGUARD.split('\n')).toContain(regla)
  })

  it('sin SENTRY_AUTH_TOKEN no se ofusca (el mapeo no se puede subir y los stack traces tienen que seguir legibles)', () => {
    expect(reglasProguard({ QPS_R8: '1' }).split('\n')).toContain('-dontobfuscate')
    expect(reglasProguard({ QPS_R8: '1', SENTRY_AUTH_TOKEN: '  ' }).split('\n')).toContain('-dontobfuscate')
  })

  it('con SENTRY_AUTH_TOKEN se ofusca y el mapeo sube solo a Sentry', () => {
    const env = { QPS_R8: '1', SENTRY_AUTH_TOKEN: 'token-de-prueba' }
    expect(reglasProguard(env).split('\n')).not.toContain('-dontobfuscate')
    const sentry = opciones(plugins(env), '@sentry/react-native/expo')
    expect(sentry).toEqual({
      experimental_android: {
        enableAndroidGradlePlugin: true,
        includeProguardMapping: true,
        autoUploadProguardMapping: true,
        uploadNativeSymbols: false,
        autoUploadNativeSymbols: false,
        includeNativeSources: false,
      },
    })
    expect(JSON.stringify(plugins(env))).not.toContain('token-de-prueba')
  })

  it('sin R8, el plugin de Sentry queda como antes (sin el plugin de Gradle)', () => {
    expect(pluginSentry({ SENTRY_AUTH_TOKEN: 't' })).toBe('@sentry/react-native/expo')
  })

  it('las reglas no esconden errores de compilación de todo el proyecto (-dontwarn solo de MapLibre) ni apagan R8', () => {
    const lineas = reglasProguard({}).split('\n').filter((l) => !l.startsWith('#'))
    expect(lineas.filter((l) => l.startsWith('-dontwarn'))).toEqual(['-dontwarn org.maplibre.**'])
    expect(lineas.join('\n')).not.toMatch(/-dontshrink|-dontoptimize|-keep class \*\* /)
  })
})
