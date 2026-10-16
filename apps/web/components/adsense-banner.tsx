"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { ExternalLink, Sparkles } from "lucide-react"
import { ADS_ENABLED, ADSENSE_CLIENT_ID } from "@/lib/config/monetization"
import { ANUNCIANTES } from "@/lib/config/anunciantes"
import { TEXTO_ANUNCIAR, whatsappUrl } from "@/lib/contacto"

interface AdSenseBannerProps {
  /** ID numérico del bloque de anuncios en AdSense (p. ej. "1234567890"). */
  slot: string
  format?: "auto" | "fluid" | "rectangle" | "vertical" | "horizontal"
  responsive?: boolean
  className?: string
}

/**
 * Con la monetización apagada (NEXT_PUBLIC_ADS_ENABLED != "true") no se
 * renderiza nada: ni el slot ni el cartel de "Anunciá". Ver
 * lib/config/monetization.ts.
 */
export function AdSenseBanner(props: AdSenseBannerProps) {
  if (!ADS_ENABLED) return null
  return <AdSenseSlot {...props} />
}

function AdSenseSlot({
  slot,
  format = "auto",
  responsive = true,
  className = "",
}: AdSenseBannerProps) {
  const [adError, setAdError] = useState(false)
  const [isClient, setIsClient] = useState(false)
  const insRef = useRef<HTMLModElement>(null)

  const adClientId = ADSENSE_CLIENT_ID
  const isDev = process.env.NODE_ENV === "development"
  // data-ad-slot tiene que ser el ID numérico de un bloque de anuncios; con
  // un nombre ("home-middle-banner") el slot nunca se llena.
  const isValidSlot = /^\d+$/.test(slot)
  
  const anunciarWhatsappUrl = whatsappUrl(TEXTO_ANUNCIAR)

  useEffect(() => {
    setIsClient(true)
  }, [])

  useEffect(() => {
    if (isClient && adClientId && !isDev && !isValidSlot) {
      console.warn(`[AdSense] data-ad-slot inválido ("${slot}"): tiene que ser el ID numérico del bloque`)
    }
  }, [isClient, adClientId, isDev, isValidSlot, slot])

  useEffect(() => {
    if (isClient && adClientId && !isDev && isValidSlot && insRef.current) {
      const ins = insRef.current

      // adsbygoogle.push() mide el ancho del <ins> en ese instante; si todavía
      // es 0 (contenedor animándose o sin layout) tira "No slot size for
      // availableWidth=0" y el slot queda vacío. Se espera a que tenga ancho.
      const pushAd = () => {
        try {
          // @ts-ignore -- adsbygoogle no está tipado en Window; @ts-expect-error
          // tira "Unused directive" porque esta línea no da error de tipos acá.
          const ads = window.adsbygoogle || []
          // @ts-ignore -- ídem arriba
          window.adsbygoogle = ads
          ads.push({})
        } catch (err) {
          console.error("AdSense initialization failed:", err)
          setAdError(true)
        }
      }

      let resizeObserver: ResizeObserver | null = null
      if (ins.offsetWidth > 0) {
        pushAd()
      } else {
        resizeObserver = new ResizeObserver((entries) => {
          if (entries.some((entry) => entry.contentRect.width > 0)) {
            resizeObserver?.disconnect()
            resizeObserver = null
            pushAd()
          }
        })
        resizeObserver.observe(ins)
      }

      // Observador para detectar cambios en los atributos que mete AdSense
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === "attributes" && mutation.attributeName === "data-ad-status") {
            const status = insRef.current?.getAttribute("data-ad-status")
            if (status === "unfilled") {
              setAdError(true)
            }
          }
        })
      })

      observer.observe(insRef.current, {
        attributes: true,
        attributeFilter: ["data-ad-status"],
      })

      // Verificación de respaldo pasados unos segundos
      const checkAdStatus = () => {
        try {
          // @ts-ignore -- adsbygoogle no está tipado en Window; @ts-expect-error
          // tira "Unused directive" porque esta línea no da error de tipos acá.
          const isScriptLoaded = window.adsbygoogle && (window.adsbygoogle.loaded === true || typeof window.adsbygoogle === "object")
          
          if (!isScriptLoaded) {
            setAdError(true)
            return
          }

          if (insRef.current) {
            const status = insRef.current.getAttribute("data-ad-status")
            const height = insRef.current.offsetHeight
            
            // Si el estado es unfilled o si se detecta altura 0 (bloqueo)
            if (status === "unfilled" || height === 0) {
              setAdError(true)
            }
          }
        } catch {
          setAdError(true)
        }
      }

      const timer = setTimeout(checkAdStatus, 3000)
      return () => {
        resizeObserver?.disconnect()
        observer.disconnect()
        clearTimeout(timer)
      }
    }
  }, [isClient, adClientId, isDev, isValidSlot])

  if (!isClient) return null

  // Si no hay un ID de cliente, estamos en desarrollo, el slot no es un ID
  // válido u ocurrió un error/bloqueo de AdSense, mostramos un banner premium
  // para anunciantes locales
  if (!adClientId || isDev || !isValidSlot || adError) {
    return (
      <div 
        className={`w-full overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 via-card to-primary/5 p-6 text-center shadow-sm backdrop-blur-sm transition-all duration-300 hover:border-primary/40 hover:shadow-md ${className}`}
      >
        <div className="mx-auto max-w-lg flex flex-col items-center">
          <div className="mb-2 flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary uppercase tracking-wider">
            <Sparkles className="size-3" />
            Anunciá en Qué Pinta Salta
          </div>
          <p className="text-lg font-bold text-foreground mb-1">
            ¿Querés destacar tu evento o promocionar tu marca acá?
          </p>
          <p className="text-sm text-muted-foreground mb-4 max-w-md">
            Llegá directamente al público que está buscando salidas en Salta Capital. ¡Simple, rápido y efectivo!
          </p>
          {ANUNCIANTES.publicada ? (
            <Link
              href="/anunciantes"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98]"
            >
              Ver paquetes para anunciantes
            </Link>
          ) : (
            <a
              href={anunciarWhatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98]"
            >
              Contactar por WhatsApp
              <ExternalLink className="size-4" />
            </a>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`w-full overflow-hidden py-2 ${className}`}>
      <ins
        ref={insRef}
        className="adsbygoogle text-center"
        style={{ display: "block" }}
        data-ad-client={adClientId}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive={responsive ? "true" : "false"}
      />
    </div>
  )
}
