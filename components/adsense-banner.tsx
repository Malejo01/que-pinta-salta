"use client"

import { useEffect, useRef, useState } from "react"
import { ExternalLink, Sparkles } from "lucide-react"

interface AdSenseBannerProps {
  slot: string
  format?: "auto" | "fluid" | "rectangle" | "vertical" | "horizontal"
  responsive?: boolean
  className?: string
}

export function AdSenseBanner({
  slot,
  format = "auto",
  responsive = true,
  className = "",
}: AdSenseBannerProps) {
  const [adLoaded, setAdLoaded] = useState(false)
  const [adError, setAdError] = useState(false)
  const [isClient, setIsClient] = useState(false)
  const insRef = useRef<HTMLModElement>(null)
  
  const adClientId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID
  const isDev = process.env.NODE_ENV === "development"
  
  // Si no está definida la variable de WhatsApp, usamos la por defecto para Salta
  const whatsappNumber = process.env.NEXT_PUBLIC_CONTACT_WHATSAPP || "5493875813233"
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=Hola!%20Me%20interesa%20anunciar%20mi%20negocio%20o%20evento%20en%20Que%20Pinta%20Salta.`

  useEffect(() => {
    setIsClient(true)
  }, [])

  useEffect(() => {
    if (isClient && adClientId && !isDev) {
      try {
        // @ts-ignore
        const ads = window.adsbygoogle || []
        // @ts-ignore
        window.adsbygoogle = ads
        ads.push({})
        setAdLoaded(true)
      } catch (err) {
        console.error("AdSense initialization failed:", err)
        setAdError(true)
        return
      }

      // Configurar una verificación de estado del anuncio después de que cargue
      const checkAdStatus = () => {
        try {
          // Verificar si el script de adsbygoogle cargó correctamente en el objeto window
          // @ts-ignore
          const isScriptLoaded = window.adsbygoogle && (window.adsbygoogle.loaded === true || typeof window.adsbygoogle === "object")
          
          if (!isScriptLoaded) {
            setAdError(true)
            return
          }

          if (insRef.current) {
            const status = insRef.current.getAttribute("data-ad-status")
            const height = insRef.current.offsetHeight
            
            // Si AdSense explícitamente dice 'unfilled' (no hay anuncios para mostrar)
            // o si la altura quedó en 0 (bloqueado por AdBlocker)
            if (status === "unfilled" || height === 0) {
              setAdError(true)
            }
          }
        } catch (e) {
          setAdError(true)
        }
      }

      const timer = setTimeout(checkAdStatus, 2000)
      return () => clearTimeout(timer)
    }
  }, [isClient, adClientId, isDev])

  if (!isClient) return null

  // Si no hay un ID de cliente, estamos en desarrollo, o ocurrió un error/bloqueo de AdSense,
  // mostramos un banner premium para anunciantes locales
  if (!adClientId || isDev || adError) {
    return (
      <div 
        className={`w-full overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 via-card to-primary/5 p-6 text-center shadow-sm backdrop-blur-sm transition-all duration-300 hover:border-primary/40 hover:shadow-md ${className}`}
      >
        <div className="mx-auto max-w-lg flex flex-col items-center">
          <div className="mb-2 flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary uppercase tracking-wider">
            <Sparkles className="size-3" />
            Anunciá en Qué Pinta Salta
          </div>
          <h4 className="text-lg font-bold text-foreground mb-1">
            ¿Querés destacar tu evento o promocionar tu marca acá?
          </h4>
          <p className="text-sm text-muted-foreground mb-4 max-w-md">
            Llegá directamente al público que está buscando salidas en Salta Capital. ¡Simple, rápido y efectivo!
          </p>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98]"
          >
            Contactar por WhatsApp
            <ExternalLink className="size-4" />
          </a>
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
