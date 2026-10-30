import Link from "next/link"
import type { ReactNode } from "react"
import { Navbar } from "@/components/navbar"
import { MobileNav } from "@/components/mobile-nav"
import type { Idioma } from "@/lib/i18n/idiomas"
import { rutaEn } from "@/lib/i18n/rutas"

interface PaginaDeErrorProps {
  titulo: string
  texto: string
  /** Botón extra antes de las tres salidas fijas (ej. "Probar de nuevo"). */
  children?: ReactNode
  /** Idioma de los botones y del `lang` del bloque. Por defecto, castellano. */
  idioma?: Idioma
}

const BOTONES: Record<Idioma, { inicio: string; buscar: string; cines: string }> = {
  es: { inicio: "Ver qué pinta hoy", buscar: "Buscar", cines: "Cartelera de cines" },
  en: { inicio: "See what's on today", buscar: "Search", cines: "Movie showtimes" },
}

const BASE =
  "rounded-md px-4 py-2 text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"

/** Bloque visual compartido por not-found y error: con la marca del sitio y tres salidas. */
export function PaginaDeError({ titulo, texto, children, idioma = "es" }: PaginaDeErrorProps) {
  const botones = BOTONES[idioma]
  return (
    <div className="min-h-screen bg-background pb-page sm:pb-0">
      <Navbar />
      {/* Sin `idioma` los textos están en castellano: `lang="es"` para que en
          /en/lo-que-sea (bajo <html lang="en">) se lean bien. Con `idioma="en"`
          el título y el texto llegan ya en inglés. */}
      <main
        id="contenido"
        tabIndex={-1}
        lang={idioma}
        className="container mx-auto flex max-w-xl flex-col items-center px-4 py-20 text-center focus:outline-none"
      >
        <p lang={idioma === "es" ? undefined : "es"} className="text-sm font-semibold uppercase tracking-wide text-primary">Qué Pinta Salta</p>
        <h1 className="mt-3 text-3xl font-bold text-foreground">{titulo}</h1>
        <p className="mt-3 text-muted-foreground">{texto}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {children}
          <Link
            href={rutaEn(idioma, "/")}
            className={`bg-primary text-primary-foreground hover:opacity-90 ${BASE}`}
          >
            {botones.inicio}
          </Link>
          <Link href={rutaEn(idioma, "/buscar")} className={`border border-input text-foreground hover:bg-muted ${BASE}`}>
            {botones.buscar}
          </Link>
          <Link href={rutaEn(idioma, "/cines")} className={`border border-input text-foreground hover:bg-muted ${BASE}`}>
            {botones.cines}
          </Link>
        </div>
      </main>
      <MobileNav />
    </div>
  )
}
