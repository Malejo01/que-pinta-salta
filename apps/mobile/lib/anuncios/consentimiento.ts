// R60/52-c: AdMob en la app, consentimiento GDPR/UMP (igual que la web desde
// la R52 principal, pero del lado del SDK nativo). Único módulo de `lib/`
// que importa `react-native-google-mobile-ads` (el otro import del SDK vive
// en `components/BannerAnuncio.tsx` — ver `tests/anuncios-ids.test.ts`, el
// detector que lo exige).
//
// Fuentes (verificadas por el planificador el 18/10):
//   https://docs.page/invertase/react-native-google-mobile-ads/european-user-consent
//   https://developers.google.com/admob/android/test-ads
//
// `AdsConsent.gatherConsent()` es el helper recomendado por la doc de arriba:
// pide (o reusa) la info de consentimiento y, si corresponde, carga y
// muestra el formulario de Google. Si falla, el SDK sigue con el estado de
// consentimiento anterior (misma doc) — por eso el `catch` de abajo no
// interrumpe nada, solo sigue a `getConsentInfo()`.
import * as Sentry from '@sentry/react-native'
import mobileAds, {
  AdsConsent,
  AdsConsentPrivacyOptionsRequirementStatus,
  type AdsConsentInfo,
} from 'react-native-google-mobile-ads'
import { leerEnv } from '@/lib/env'

// Bandera de módulo: `iniciarAnuncios` hace su trabajo una sola vez por
// arranque del proceso (mismo patrón que `versionesViejasLimpiadas` en
// `lib/sin-conexion/cache.ts`).
let iniciado = false
let listo = false
let ultimaInfo: AdsConsentInfo | null = null
const suscriptores = new Set<() => void>()

function avisarSuscriptores(): void {
  for (const cb of suscriptores) cb()
}

/**
 * Manda a Sentry (si hay DSN configurado) que falló un paso del flujo de
 * consentimiento, SIN el mensaje crudo del SDK: puede traer datos del
 * dispositivo (ver `lib/sentry.ts`, que sanea `message`/`exception` por las
 * mismas razones). Solo viaja esta cadena fija, nunca `String(error)`.
 */
function registrarErrorDeConsentimiento(): void {
  if (!leerEnv().sentryDsn) return
  Sentry.captureMessage('admob_consent_error')
}

/**
 * El flujo real, async, disparado una sola vez por `iniciarAnuncios` (nunca
 * se expone directo: nadie debe `await`earlo desde una pantalla).
 */
async function ejecutarFlujoDeConsentimiento(): Promise<void> {
  try {
    ultimaInfo = await AdsConsent.gatherConsent()
  } catch {
    registrarErrorDeConsentimiento()
    // Sigue: el SDK usa el estado de consentimiento anterior (ver fuente,
    // arriba) — `getConsentInfo()` es la única fuente de verdad después de
    // este intento, haya fallado o no.
  }

  let info: AdsConsentInfo
  try {
    info = await AdsConsent.getConsentInfo()
  } catch {
    registrarErrorDeConsentimiento()
    return
  }
  ultimaInfo = info
  // Vuelta 1 de revisión: el aviso va ACÁ, antes del corte por
  // `canRequestAds` — quien rechaza el consentimiento (canRequestAds false)
  // puede tener `privacyOptionsRequirementStatus: REQUIRED` (necesita ver el
  // formulario para cambiar de opinión, exigencia de UMP) y nadie suscripto
  // se enteraría de que `necesitaOpcionesDePrivacidad()` ya da `true` si
  // este aviso quedara más abajo, detrás del `return`.
  avisarSuscriptores()

  if (!info.canRequestAds) return

  try {
    await mobileAds().initialize()
    listo = true
    avisarSuscriptores()
  } catch {
    registrarErrorDeConsentimiento()
  }
}

/**
 * Arranca el flujo de consentimiento + inicialización de AdMob. No devuelve
 * una promesa que haya que esperar: la pantalla nunca bloquea su primer
 * render por esto, es "fire and forget" a propósito. Con los anuncios
 * apagados (`EXPO_PUBLIC_ADS_ENABLED` distinto de `"true"`), no hace nada:
 * ni pide consentimiento ni inicializa el SDK.
 */
export function iniciarAnuncios(): void {
  if (iniciado) return
  iniciado = true

  if (!leerEnv().anunciosHabilitados) return

  void ejecutarFlujoDeConsentimiento()
}

/** `true` recién después de que `mobileAds().initialize()` resolvió. Hasta
 * entonces (incluso con los anuncios habilitados, mientras el flujo de
 * consentimiento todavía está en curso), `false`. */
export function anunciosListos(): boolean {
  return listo
}

/** Avisa a `cb` cada vez que algo del estado de consentimiento puede haber
 * cambiado — `anunciosListos()` (pasa, como mucho una vez, de `false` a
 * `true`) O `necesitaOpcionesDePrivacidad()` (puede pasar de `false` a
 * `true` apenas se conoce el `AdsConsentInfo`, incluso si `canRequestAds` es
 * `false` y el flujo nunca llega a inicializar el SDK — vuelta 1 de
 * revisión, exigencia de UMP). Quien suscribe tiene que volver a mirar
 * AMBAS funciones dentro del callback, no asumir que el aviso es solo por
 * `anunciosListos()`. Devuelve el desuscriptor. */
export function suscribirse(cb: () => void): () => void {
  suscriptores.add(cb)
  return () => suscriptores.delete(cb)
}

/**
 * `true` si hace falta mostrar un acceso a "Opciones de privacidad" en algún
 * lugar de la app (hoy, decisión de dónde queda para 52-q/52-d). Sincrónica
 * sobre el último `AdsConsentInfo` leído en este arranque (de
 * `gatherConsent`/`getConsentInfo`, dentro de `iniciarAnuncios`, o de
 * `mostrarOpcionesDePrivacidad` después de cerrarse): no hace falta otra
 * llamada nativa solo para decidir si se dibuja un botón, y el valor no
 * cambia dentro de la misma sesión salvo que el propio formulario lo
 * actualice. Sin ninguna info leída todavía (antes de que `iniciarAnuncios`
 * termine, o con los anuncios apagados), da `false`.
 */
export function necesitaOpcionesDePrivacidad(): boolean {
  return ultimaInfo?.privacyOptionsRequirementStatus === AdsConsentPrivacyOptionsRequirementStatus.REQUIRED
}

/** Presenta el formulario de opciones de privacidad de Google. Actualiza el
 * `AdsConsentInfo` que usa `necesitaOpcionesDePrivacidad`; si falla, se
 * registra el error (sin el mensaje crudo) y no se actualiza nada. */
export async function mostrarOpcionesDePrivacidad(): Promise<void> {
  try {
    ultimaInfo = await AdsConsent.showPrivacyOptionsForm()
  } catch {
    registrarErrorDeConsentimiento()
  }
}

/** Solo para los tests: vuelve al estado inicial (sin iniciar, sin listo,
 * sin info guardada, sin suscriptores) para que cada caso arranque limpio. */
export function reiniciarAnunciosParaTests(): void {
  iniciado = false
  listo = false
  ultimaInfo = null
  suscriptores.clear()
}
