"use client"

import { useTextos } from "@/lib/i18n/use-idioma"

/**
 * Link de salto (77-a1): primer elemento enfocable del `<body>`. Solo se ve al
 * recibir foco; lleva a `#contenido` (el `<main>` de cada página). El texto
 * sigue el idioma de la URL (`/en/...` en inglés).
 *
 * `z-[100]`: por encima de la navbar (`z-50`) y de la barra inferior.
 * Colores: `bg-foreground` sobre `text-background` es el par de mayor
 * contraste del tema, en claro y en oscuro; el anillo usa `--ring`.
 */
export function SaltarAlContenido() {
  const t = useTextos().nav
  return (
    <a
      href="#contenido"
      className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-foreground focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-background focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
    >
      {t.saltarAlContenido}
    </a>
  )
}
