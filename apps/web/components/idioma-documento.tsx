"use client"

import { useEffect } from "react"
import { LANG_HTML } from "@/lib/i18n/idiomas"
import { useIdioma } from "@/lib/i18n/use-idioma"

/**
 * Mantiene `document.documentElement.lang` al día en las navegaciones del
 * cliente. El `<html lang>` lo pone el layout raíz en el servidor, pero el
 * layout raíz no se vuelve a renderizar al navegar con `<Link>` (por ejemplo
 * de /en a una ruta que solo existe en castellano). No dibuja nada.
 */
export function IdiomaDocumento() {
  const idioma = useIdioma()

  useEffect(() => {
    document.documentElement.lang = LANG_HTML[idioma]
  }, [idioma])

  return null
}
