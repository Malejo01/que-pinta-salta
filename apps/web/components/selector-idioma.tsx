"use client"

import { Suspense } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { Languages } from "lucide-react"
import { LANG_HTML, type Idioma } from "@/lib/i18n/idiomas"
import { rutaEnOtroIdioma } from "@/lib/i18n/rutas"
import { useIdioma, useTextos } from "@/lib/i18n/use-idioma"
import { cn } from "@/lib/utils"

interface SelectorIdiomaProps {
  className?: string
  /**
   * En celular muestra solo «EN» / «ES» (el header no tiene lugar para la
   * palabra entera a 360 px); desde `sm:` la palabra completa. El nombre
   * accesible es siempre el `aria-label` completo.
   */
  compacto?: boolean
}

/**
 * Link para ver el sitio en el otro idioma: en castellano dice «English»; en
 * inglés, «Español». Cada uno escrito en su idioma, con `lang` y `hrefLang`
 * del destino, para que el lector de pantalla lo pronuncie bien.
 *
 * Es un `<a>` común y no un `<Link>` a propósito: el cambio de idioma recarga
 * la página entera, así el servidor arma `<html lang>` y la metadata en el
 * idioma nuevo. Conserva la query (`/cines?x=1` → `/en/cines?x=1`); si la
 * página no existe en inglés, lleva a `/en`.
 *
 * `useSearchParams` va adentro de un Suspense (lo pide Next en las páginas
 * que se prerenderizan); mientras tanto, el mismo link sin la query.
 */
export function SelectorIdioma(props: SelectorIdiomaProps) {
  return (
    <Suspense fallback={<EnlaceIdioma {...props} query="" />}>
      <SelectorConQuery {...props} />
    </Suspense>
  )
}

function SelectorConQuery(props: SelectorIdiomaProps) {
  const searchParams = useSearchParams()
  return <EnlaceIdioma {...props} query={searchParams?.toString() ?? ""} />
}

function EnlaceIdioma({ className, compacto = false, query }: SelectorIdiomaProps & { query: string }) {
  const idioma = useIdioma()
  const textos = useTextos()
  const pathname = usePathname() ?? "/"

  const destino: Idioma = idioma === "es" ? "en" : "es"
  const href = rutaEnOtroIdioma(query ? `${pathname}?${query}` : pathname, destino)

  return (
    <a
      href={href}
      hrefLang={LANG_HTML[destino]}
      lang={destino}
      aria-label={textos.idioma.otroAria}
      // Alto mínimo de 44 px (área táctil) y foco visible con teclado, como la
      // barra inferior: anillo `inset` y `outline-hidden` (ver mobile-nav.tsx).
      className={cn(
        "inline-flex min-h-11 min-w-11 shrink-0 justify-center items-center gap-1.5 rounded-md px-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-hidden hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        className
      )}
    >
      <Languages aria-hidden className={cn("size-4 shrink-0", compacto && "hidden sm:block")} />
      {compacto ? (
        <>
          <span className="sm:hidden">{textos.idioma.otroCorto}</span>
          <span className="hidden sm:inline">{textos.idioma.otro}</span>
        </>
      ) : (
        <span>{textos.idioma.otro}</span>
      )}
    </a>
  )
}
