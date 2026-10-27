"use client"

import { usePathname } from "next/navigation"
import { textosDe, type Diccionario } from "./index"
import type { Idioma } from "./idiomas"
import { separarIdioma } from "./rutas"

/**
 * El idioma de la página actual, leído de la URL (`/en/...` es inglés). Sirve
 * en cualquier componente cliente, también en los del layout (navbar, pie),
 * que no reciben props de la página.
 */
export function useIdioma(): Idioma {
  const pathname = usePathname()
  return separarIdioma(pathname ?? "/").idioma
}

/** Los textos de la interfaz en el idioma de la página actual. */
export function useTextos(): Diccionario {
  return textosDe(useIdioma())
}
