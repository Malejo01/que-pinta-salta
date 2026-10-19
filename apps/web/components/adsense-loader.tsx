'use client'

import Script from 'next/script'
import type { ReactElement } from 'react'
import { useEffect, useSyncExternalStore } from 'react'
import { ADS_ENABLED, ADSENSE_CLIENT_ID } from '@/lib/config/monetization'
import { CONSENT_EVENT, readConsent, type ConsentValue } from '@/lib/consent'

/**
 * `window.adsbygoogle` según la API de Non-Personalized Ads de AdSense
 * (fuente: support.google.com/adsense/answer/9042142, verificado por el
 * planificador el 18/10): es un arreglo de "comandos" al que se le puede
 * colgar `requestNonPersonalizedAds` (0 = personalizados, 1 = no
 * personalizados) ANTES de que cargue adsbygoogle.js.
 */
interface AdsByGoogleArray extends Array<Record<string, unknown>> {
  requestNonPersonalizedAds?: 0 | 1
}

declare global {
  interface Window {
    adsbygoogle?: AdsByGoogleArray
  }
}

/** Durante el render del servidor (y la hidratación) nunca leemos `localStorage`: no existe. */
type Snapshot = ConsentValue | 'unknown'

function subscribe(onStoreChange: () => void) {
  window.addEventListener(CONSENT_EVENT, onStoreChange)
  return () => window.removeEventListener(CONSENT_EVENT, onStoreChange)
}

function getSnapshot(): Snapshot {
  return readConsent(window.localStorage)
}

function getServerSnapshot(): Snapshot {
  return 'unknown'
}

/**
 * Fija `requestNonPersonalizedAds` en `target.adsbygoogle` según la
 * elección de consentimiento: 0 (personalizados) si `'granted'`, 1 (no
 * personalizados) si `'denied'`. Si la persona cambia de respuesta después
 * de que el script ya cargó, se vuelve a llamar y el valor se actualiza —
 * pero los anuncios que ya se pidieron con el valor anterior no se vuelven
 * a pedir (eso lo decide el script de Google, no este código).
 */
export function configurarAnunciosNoPersonalizados(target: Window, consent: 'granted' | 'denied'): void {
  target.adsbygoogle = target.adsbygoogle || ([] as AdsByGoogleArray)
  target.adsbygoogle.requestNonPersonalizedAds = consent === 'granted' ? 0 : 1
}

/**
 * Sin hooks (así se puede testear llamándola directo): mientras el
 * consentimiento sea `null` (todavía no respondió el aviso) o `'unknown'`
 * (en el servidor) no hay `<Script>` ni `adsbygoogle`. Con una respuesta, el
 * script de AdSense carga en `lazyOnload` (después de que la página terminó
 * de cargar: nunca compite con el primer pantallazo).
 */
export function renderAdsenseScript(clientId: string, consent: Snapshot): ReactElement | null {
  if (consent !== 'granted' && consent !== 'denied') return null

  return (
    <Script
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`}
      strategy="lazyOnload"
      crossOrigin="anonymous"
    />
  )
}

function AdsenseLoaderInner({ clientId }: { clientId: string }) {
  const consent = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  useEffect(() => {
    if (consent !== 'granted' && consent !== 'denied') return
    configurarAnunciosNoPersonalizados(window, consent)
  }, [consent])

  return renderAdsenseScript(clientId, consent)
}

/**
 * Carga el script de AdSense, pero solo si la monetización está prendida
 * (`lib/config/monetization.ts`) y solo después de que la persona respondió
 * el aviso de cookies (`ConsentBanner`): el consentimiento se fija ANTES del
 * `<Script>`, nunca después.
 */
export function AdsenseLoader() {
  if (!ADS_ENABLED || !ADSENSE_CLIENT_ID) return null
  return <AdsenseLoaderInner clientId={ADSENSE_CLIENT_ID} />
}
