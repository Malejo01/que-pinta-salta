"use client"

import { Languages } from "lucide-react"
import { useTextos } from "@/lib/i18n/use-idioma"

/**
 * Aviso discreto arriba del listado en las páginas en inglés: la interfaz
 * está traducida, pero los títulos y las descripciones de los eventos llegan
 * de las fuentes (ticketeras, flyers) en castellano y se muestran tal cual.
 */
export function AvisoContenidoEs() {
  const textos = useTextos()

  return (
    <div className="container mx-auto px-4 pt-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Languages aria-hidden className="size-3.5 shrink-0" />
        {textos.comun.avisoContenidoEs}
      </p>
    </div>
  )
}
