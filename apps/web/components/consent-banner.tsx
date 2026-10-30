'use client'

import Link from 'next/link'
import { useEffect, useId, useRef, useSyncExternalStore } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { CONSENT_EVENT, dispatchConsentEvent, readConsent, writeConsent, type ConsentValue } from '@/lib/consent'
import { ADS_ENABLED } from '@/lib/config/monetization'
import { useIdioma, useTextos } from '@/lib/i18n/use-idioma'

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
 *
 * QPS-079: mientras está visible, mide su propio alto con `ResizeObserver` y
 * lo publica en `--consent-banner-h` (más `data-consent-open`) en `<html>`,
 * para que `.pb-page` (`app/globals.css`) le haga lugar al contenido de cada
 * página. Al ocultarse (el usuario elige, o el componente se desmonta) se
 * desconecta el observer y se sacan el atributo y la variable: no quedan
 * colgados.
 */
export function ConsentBanner() {
  const consent = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const bannerRef = useRef<HTMLDivElement>(null)
  const isOpen = consent === null
  const idioma = useIdioma()
  const t = useTextos().cookies
  const descripcionMasInfoId = useId()

  useEffect(() => {
    if (!isOpen) return
    const el = bannerRef.current
    if (!el) return

    const root = document.documentElement
    root.setAttribute('data-consent-open', '')

    const updateHeight = () => {
      root.style.setProperty('--consent-banner-h', `${el.offsetHeight}px`)
    }
    updateHeight()

    const observer = new ResizeObserver(updateHeight)
    observer.observe(el)

    return () => {
      observer.disconnect()
      root.removeAttribute('data-consent-open')
      root.style.removeProperty('--consent-banner-h')
    }
  }, [isOpen])

  if (!isOpen) return null

  function accept() {
    writeConsent(window.localStorage, 'granted')
    dispatchConsentEvent()
  }

  function reject() {
    writeConsent(window.localStorage, 'denied')
    clearAnalyticsCookies()
    dispatchConsentEvent()
  }

  return (
    <motion.div
      ref={bannerRef}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      role="region"
      aria-label={t.region}
      className="fixed inset-x-0 bottom-[calc(4rem+1px+env(safe-area-inset-bottom))] z-40 mx-3 sm:inset-x-0 sm:bottom-4 sm:mx-auto sm:max-w-xl"
    >
      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {ADS_ENABLED ? t.textoConAnuncios : t.textoSinAnuncios}{' '}
          {/* La Política de Privacidad existe solo en castellano. */}
          <Link
            href="/privacidad"
            hrefLang={idioma === 'es' ? undefined : 'es-AR'}
            // 77-a1 (label-content-name-mismatch): el nombre accesible es el texto
            // visible («Más info»); la frase larga pasa a ser la descripción.
            aria-describedby={descripcionMasInfoId}
            className="text-primary dark:text-[#F0585D] underline underline-offset-4 hover:text-primary/80 dark:hover:text-[#F58A8E]"
          >
            {t.masInfo}
          </Link>
          <span id={descripcionMasInfoId} hidden>
            {t.masInfoAria}
          </span>
        </p>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" onClick={reject} className="min-h-11 flex-1 sm:flex-none">
            {t.rechazar}
          </Button>
          <Button type="button" variant="outline" onClick={accept} className="min-h-11 flex-1 sm:flex-none">
            {t.aceptar}
          </Button>
        </div>
      </div>
    </motion.div>
  )
}
