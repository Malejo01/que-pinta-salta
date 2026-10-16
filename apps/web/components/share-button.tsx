"use client"

import { Share2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { urlEvento } from "@/lib/metricas/links"

export interface ShareData {
  title: string
  url: string
}

/**
 * Título y URL para compartir la ficha del evento. Pura: la URL siempre es
 * la de `urlEvento` (`@qps/core`), la misma que usa el resto de la web y la
 * app — nunca armada a mano. `null` si `eventId` no es un uuid válido (no
 * debería pasar desde la ficha).
 */
export function buildShareData(eventId: string, title: string): ShareData | null {
  const url = urlEvento(eventId)
  return url ? { title, url } : null
}

interface ShareDeps {
  /** `navigator.share`, cuando el navegador lo soporta. */
  share?: (data: ShareData) => Promise<void>
  /** `navigator.clipboard.writeText`, como respaldo sin Web Share API. */
  writeText?: (text: string) => Promise<void>
  toast: (opts: { title: string; description?: string; variant?: "destructive" }) => void
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
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return
      // Otros errores al compartir (p. ej. sin apps instaladas): no molestamos
      // con un toast de error, el usuario ya ve que no pasó nada.
    }
    return
  }

  if (deps.writeText) {
    await deps.writeText(data.url)
    deps.toast({ title: "Link copiado" })
  }
}

interface ShareButtonProps {
  eventId: string
  title: string
  className?: string
}

export function ShareButton({ eventId, title, className }: ShareButtonProps) {
  const { toast } = useToast()

  const handleShare = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const data = buildShareData(eventId, title)
    if (!data) return

    const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function"
    const canCopy = typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function"

    await shareEvent(data, {
      share: canShare ? (d) => navigator.share(d) : undefined,
      writeText: canCopy ? (text) => navigator.clipboard.writeText(text) : undefined,
      toast,
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
      aria-label="Compartir evento"
    >
      <Share2 className="size-4.5" />
    </button>
  )
}
