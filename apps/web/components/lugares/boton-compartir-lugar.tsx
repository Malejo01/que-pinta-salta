"use client"

/**
 * Q5-5 · «Compartir» de la ficha de un lugar: la hoja del sistema
 * (`navigator.share`) o, si no hay, copiar el link. La URL es la canónica
 * de la ficha (la arma el servidor).
 */
import { Share2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { textosDe } from "@/lib/i18n"
import type { Idioma } from "@/lib/i18n/idiomas"

export function BotonCompartirLugar({ titulo, url, idioma }: { titulo: string; url: string; idioma: Idioma }) {
  const t = textosDe(idioma).fichaLugar
  const { toast } = useToast()
  async function compartir() {
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ title: titulo, url })
        return
      }
      await navigator.clipboard.writeText(url)
      toast({ title: t.linkCopiado })
    } catch (error) {
      // Cerrar la hoja de compartir no es un error.
      if (error instanceof DOMException && error.name === "AbortError") return
      toast({ title: t.noSePudoCompartir, variant: "destructive" })
    }
  }
  return (
    <button
      type="button"
      onClick={() => void compartir()}
      className="inline-flex min-h-11 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <Share2 className="size-4" aria-hidden="true" />
      {t.compartir}
    </button>
  )
}
