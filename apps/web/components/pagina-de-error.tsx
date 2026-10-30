import Link from "next/link"
import type { ReactNode } from "react"
import { Navbar } from "@/components/navbar"
import { MobileNav } from "@/components/mobile-nav"

interface PaginaDeErrorProps {
  titulo: string
  texto: string
  /** Botón extra antes de las dos salidas fijas (ej. "Probar de nuevo"). */
  children?: ReactNode
}

const BASE =
  "rounded-md px-4 py-2 text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"

/** Bloque visual compartido por not-found y error: con la marca del sitio y dos salidas. */
export function PaginaDeError({ titulo, texto, children }: PaginaDeErrorProps) {
  return (
    <div className="min-h-screen bg-background pb-page sm:pb-0">
      <Navbar />
      {/* Los textos de esta página están solo en castellano: `lang="es"` para
          que en /en/lo-que-sea (bajo <html lang="en">) se lean bien. */}
      <main
        id="contenido"
        tabIndex={-1}
        lang="es"
        className="container mx-auto flex max-w-xl flex-col items-center px-4 py-20 text-center focus:outline-none"
      >
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">Qué Pinta Salta</p>
        <h1 className="mt-3 text-3xl font-bold text-foreground">{titulo}</h1>
        <p className="mt-3 text-muted-foreground">{texto}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {children}
          <Link
            href="/"
            className={`bg-primary text-primary-foreground hover:opacity-90 ${BASE}`}
          >
            Ver qué pinta hoy
          </Link>
          <Link href="/buscar" className={`border border-input text-foreground hover:bg-muted ${BASE}`}>
            Buscar
          </Link>
          <Link href="/cines" className={`border border-input text-foreground hover:bg-muted ${BASE}`}>
            Cartelera de cines
          </Link>
        </div>
      </main>
      <MobileNav />
    </div>
  )
}
