"use client"

import type { ComponentProps } from "react"
import { Languages } from "lucide-react"
import { useTextos } from "@/lib/i18n/use-idioma"
import { cn } from "@/lib/utils"

/**
 * Aviso discreto en las páginas en inglés, justo debajo del encabezado
 * principal (/en y /en/cines): la interfaz está traducida, pero los títulos y
 * las descripciones de los eventos llegan de las fuentes (ticketeras, flyers,
 * cines) en castellano y se muestran tal cual. El lugar y el ancho los pone
 * quien lo usa (`className`). El resto de las props van al `<p>`: así puede
 * ir dentro de `<DialogDescription asChild>` (que le pasa su `id`).
 */
export function AvisoContenidoEs({ className, ...props }: ComponentProps<"p">) {
  const textos = useTextos()

  return (
    <p {...props} className={cn("flex items-start gap-1.5 text-xs text-muted-foreground", className)}>
      <Languages aria-hidden className="mt-px size-3.5 shrink-0" />
      <span>{textos.comun.avisoContenidoEs}</span>
    </p>
  )
}
