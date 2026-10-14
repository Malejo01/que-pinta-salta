'use client'

import { useSyncExternalStore } from 'react'
import { GoogleTagManager } from '@next/third-parties/google'
import { CONSENT_EVENT, readConsent, type ConsentValue } from '@/lib/consent'

const GTM_ID = 'GTM-WZK9W6BJ'

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
 * Carga Google Tag Manager (y con él GA) solo si el visitante aceptó.
 *
 * `useSyncExternalStore` es lo que mantiene esto sincronizado con
 * `localStorage` sin desajuste de hidratación: en el servidor (y durante la
 * hidratación) el snapshot es siempre `'unknown'`, así que nunca se manda
 * `<GoogleTagManager>` en el HTML del servidor. Recién después de montar se
 * lee la elección real, y el evento `qps-consent` (disparado por el banner o
 * por el botón "Cookies" del pie de página) la vuelve a sincronizar.
 */
export function AnalyticsConsent() {
  const consent = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  if (consent !== 'granted') return null

  return <GoogleTagManager gtmId={GTM_ID} />
}
