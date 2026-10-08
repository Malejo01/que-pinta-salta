'use client'

import Link from 'next/link'
import { useSyncExternalStore } from 'react'
import { motion } from 'framer-motion'
import { CONSENT_EVENT, dispatchConsentEvent, readConsent, writeConsent, type ConsentValue } from '@/lib/consent'

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
 * Borra las cookies `_ga` y `_ga_*` del dominio actual y, con punto inicial,
 * del dominio completo (donde GA suele dejarlas). Es lo máximo que se puede
 * hacer desde el cliente: si hubiera alguna cookie HttpOnly no se puede
 * tocar, pero GA no las usa. No hace nada si no hay cookies de GA.
 */
function clearAnalyticsCookies() {
  if (typeof document === 'undefined') return

  const names = document.cookie
    .split(';')
    .map((entry) => entry.split('=')[0]?.trim())
    .filter((name): name is string => !!name && (name === '_ga' || name.startsWith('_ga_')))

  if (names.length === 0) return

  const hostname = window.location.hostname
  const domains = [hostname, `.${hostname}`]
  const expire = 'expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'

  for (const name of names) {
    document.cookie = `${name}=; ${expire}`
    for (const domain of domains) {
      document.cookie = `${name}=; ${expire}; domain=${domain}`
    }
  }
}

/**
 * Aviso de cookies: visible solo cuando no hay elección guardada (`null`).
 *
 * `useSyncExternalStore` evita el desajuste de hidratación sin un booleano
 * "mounted" aparte: en el servidor (y durante la hidratación) el snapshot es
 * siempre `'unknown'` (banner oculto, el HTML del servidor nunca lo
 * incluye); recién después de montar se lee la elección real de
 * `localStorage` y, si es `null`, aparece.
 *
 * Va pegado arriba de la barra de navegación del celular (mismo alto, 4rem,
 * más el área segura que ya respeta `components/mobile-nav.tsx`), para no
 * tapar ni la barra ni el contenido.
 */
export function ConsentBanner() {
  const consent = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  if (consent !== null) return null

  function accept() {
    writeConsent(window.localStorage, 'granted')
    dispatchConsentEvent()
  }

  function reject() {
    writeConsent(window.localStorage, 'denied')
    clearAnalyticsCookies()
    dispatchConsentEvent()
  }

  const buttonClass =
    'min-h-11 min-w-11 flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted sm:flex-none'

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      role="region"
      aria-label="Aviso de cookies"
      className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 mx-3 sm:inset-x-0 sm:bottom-4 sm:mx-auto sm:max-w-xl"
    >
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card/95 p-4 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Usamos Google Analytics para saber qué se usa del sitio. Solo si aceptás.{' '}
          <Link href="/privacidad" className="text-primary underline underline-offset-4 hover:text-primary/80">
            Más info
          </Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={reject} className={buttonClass}>
            Rechazar
          </button>
          <button type="button" onClick={accept} className={buttonClass}>
            Aceptar
          </button>
        </div>
      </div>
    </motion.div>
  )
}
