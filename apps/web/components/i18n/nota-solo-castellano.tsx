import type { Metadata } from "next"
import Link from "next/link"
import { Navbar } from "@/components/navbar"
import { MobileNav } from "@/components/mobile-nav"

/**
 * Q4-6: las páginas legales quedan en castellano (no se traducen ni se tocan).
 * En /en/privacidad, /en/terminos y /en/eliminar-cuenta se muestra solo esta
 * nota en inglés con el link a la versión en castellano, que es la que vale.
 * noindex y canónica a la página en castellano: no compiten en buscadores.
 */
export interface NotaLegal {
  ruta: "/privacidad" | "/terminos" | "/eliminar-cuenta"
  titulo: string
  descripcion: string
}

export const NOTAS_LEGALES: Record<NotaLegal["ruta"], NotaLegal> = {
  "/privacidad": {
    ruta: "/privacidad",
    titulo: "Privacy policy",
    descripcion: "How Qué Pinta Salta collects, uses and protects your data.",
  },
  "/terminos": {
    ruta: "/terminos",
    titulo: "Terms of use",
    descripcion: "The terms for using the Qué Pinta Salta website and app.",
  },
  "/eliminar-cuenta": {
    ruta: "/eliminar-cuenta",
    titulo: "Delete your account",
    descripcion: "How to delete your Qué Pinta Salta account and its data.",
  },
}

export function metadataNotaLegal(nota: NotaLegal): Metadata {
  return {
    title: nota.titulo,
    description: `${nota.descripcion} Available in Spanish only.`,
    alternates: { canonical: nota.ruta },
    robots: { index: false, follow: true, googleBot: { index: false, follow: true } },
  }
}

export function NotaSoloCastellano({ nota }: { nota: NotaLegal }) {
  return (
    <div className="min-h-screen bg-background pb-page sm:pb-0">
      <Navbar />
      <main
        id="contenido"
        tabIndex={-1}
        lang="en"
        className="container mx-auto flex max-w-xl flex-col gap-4 px-4 py-16 focus:outline-none"
      >
        <h1 className="text-3xl font-bold text-foreground">{nota.titulo}</h1>
        <p className="text-foreground">{nota.descripcion}</p>
        <p className="text-muted-foreground">
          This page is only available in Spanish. The Spanish version is the one that applies.
        </p>
        <p>
          <Link
            href={nota.ruta}
            hrefLang="es-AR"
            className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Read it in Spanish
          </Link>
        </p>
      </main>
      <MobileNav />
    </div>
  )
}
