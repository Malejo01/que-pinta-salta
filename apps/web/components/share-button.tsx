"use client"

import { Share2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { urlEvento } from "@/lib/metricas/links"
import { es } from "@/lib/i18n/diccionarios/es"
import type { Diccionario } from "@/lib/i18n"
import type { Idioma } from "@/lib/i18n/idiomas"
import { rutaEn } from "@/lib/i18n/rutas"
import { useIdioma, useTextos } from "@/lib/i18n/use-idioma"

export interface ShareData {
  title: string
  url: string
}

/**
 * Título y URL para compartir la ficha del evento. Pura: la URL siempre es
 * la de `urlEvento` (`@qps/core`), la misma que usa el resto de la web y la
 * app — nunca armada a mano. `null` si `eventId` no es un uuid válido (no
 * debería pasar desde la ficha). En inglés, la misma URL con el camino de
 * la ficha en inglés (`/en/evento/<id>`, vía `rutaEn`).
 */
export function buildShareData(eventId: string, title: string, idioma: Idioma = "es"): ShareData | null {
  const url = urlEvento(eventId)
  if (!url) return null
  if (idioma === "es") return { title, url }
  const destino = new URL(url)
  return { title, url: destino.origin + rutaEn(idioma, destino.pathname + destino.search + destino.hash) }
}

interface ShareDeps {
  /** `navigator.share`, cuando el navegador lo soporta. */
  share?: (data: ShareData) => Promise<void>
  /** `navigator.clipboard.writeText`, como respaldo sin Web Share API. */
  writeText?: (text: string) => Promise<void>
  toast: (opts: { title: string; description?: string; variant?: "destructive" }) => void
  /**
   * QPS-159: se llama solo si se compartió de verdad (la Web Share API
   * resolvió) o se copió el link al portapapeles; nunca si el usuario
   * canceló el diálogo nativo (`AbortError`), si otro error de `share`
   * dejó en duda si se compartió, o si falló el copiado. Pensado para el
   * modal de donación que se abre después de compartir desde la tarjeta.
   */
  onShared?: () => void
  /** Textos de los toasts en el idioma de la página; sin pasarlos, en castellano. */
  textos?: Diccionario["compartir"]
}

/**
 * Comparte con la Web Share API si está disponible (título + URL); si no,
 * copia el link al portapapeles y avisa con un toast. Si el usuario cancela
 * el diálogo nativo (`AbortError`), no se muestra nada.
 */
export async function shareEvent(data: ShareData, deps: ShareDeps): Promise<void> {
  if (deps.share) {
    try {
      await deps.share(data)
      deps.onShared?.()
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return
      // Otros errores al compartir (p. ej. sin apps instaladas): no molestamos
      // con un toast de error, el usuario ya ve que no pasó nada. Tampoco
      // onShared: no hay certeza de que se haya compartido.
    }
    return
  }

  if (deps.writeText) {
    // El portapapeles puede negarse (permisos, pestaña sin foco, contexto no
    // seguro): sin try/catch la promesa rechazada quedaba sin manejar
    // (revisión del #54).
    try {
      await deps.writeText(data.url)
    } catch {
      deps.toast({ title: (deps.textos ?? es.compartir).noSePudoCopiar, variant: "destructive" })
      return
    }
    deps.toast({ title: (deps.textos ?? es.compartir).linkCopiado })
    deps.onShared?.()
  }
}

interface ShareButtonProps {
  eventId: string
  title: string
  className?: string
  /**
   * URL a compartir, cuando no es la ficha del evento (QPS-159: la tarjeta
   * comparte distinto según el tipo de `DisplayEvent` — película, flyer,
   * evento — y esos ids no son uuids de la tabla `events`). Si no se pasa,
   * se usa `buildShareData(eventId, title)` (la URL de la ficha, vía
   * `urlEvento`), como hacían siempre `event-detail-page.tsx` y
   * `event-modal-wrapper.tsx`.
   */
  url?: string
  /** Ver `ShareDeps.onShared`. */
  onShared?: () => void
}

export function ShareButton({ eventId, title, className, url, onShared }: ShareButtonProps) {
  const { toast } = useToast()
  const idioma = useIdioma()
  const textos = useTextos().compartir

  const handleShare = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const data = url ? { title, url } : buildShareData(eventId, title, idioma)
    if (!data) return

    const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function"
    const canCopy = typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function"

    await shareEvent(data, {
      share: canShare ? (d) => navigator.share(d) : undefined,
      writeText: canCopy ? (text) => navigator.clipboard.writeText(text) : undefined,
      toast,
      onShared,
      textos,
    })
  }

  return (
    <button
      onClick={handleShare}
      className={cn(
        // Mismo tamaño y estilo visual que el corazón (favorite-button.tsx):
        // size-8, fondo oscuro translúcido, ícono blanco. El pseudo-elemento
        // after:-inset-2 amplía la zona de toque a 48x48 sin cambiar el
        // tamaño visible, por encima del mínimo de 44x44.
        "relative flex size-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md transition-all hover:scale-110 active:scale-95 cursor-pointer z-10 after:absolute after:content-[''] after:-inset-2",
        className
      )}
      aria-label={textos.compartirEvento}
    >
      <Share2 className="size-4.5" />
    </button>
  )
}
