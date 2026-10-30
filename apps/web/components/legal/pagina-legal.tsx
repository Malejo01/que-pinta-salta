import type { LucideIcon } from "lucide-react"
import { Navbar } from "@/components/navbar"
import { MobileNav } from "@/components/mobile-nav"
import { VERSION_LEGAL, VIGENTE_DESDE } from "./vigencia"

/** El `linkClass` de hoy, exportado para que las páginas legales armen sus links con el mismo estilo. */
export const claseLink = "text-primary underline underline-offset-4 hover:text-primary/80"

/**
 * Resalta un dato pendiente de completar. No escribe texto propio: las
 * páginas le pasan el literal como hijo (por ejemplo
 * `<Marca>[COMPLETAR: …]</Marca>`), así el literal queda en el archivo de
 * cada página y los tests lo pueden contar.
 */
export function Marca({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-amber-500/15 px-1 font-semibold text-amber-800 dark:text-amber-200">{children}</span>
  )
}

/** Igual al `Section` de hoy en `/privacidad`, con un `id` opcional para anclas. */
export function SeccionLegal({
  titulo,
  id,
  children,
}: {
  titulo: string
  id?: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3" id={id}>
      <h2 className="text-xl font-bold text-foreground">{titulo}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  )
}

/**
 * Armazón compartido de las páginas legales (`/privacidad` y `/terminos`):
 * `Navbar`, el encabezado centrado con ícono y la versión vigente (de
 * `./vigencia`, el único lugar con la versión y la fecha), las secciones
 * (`children`) y `MobileNav`.
 */
export function PaginaLegal({
  titulo,
  icono: Icono,
  children,
}: {
  titulo: string
  icono: LucideIcon
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background pb-page sm:pb-0">
      <Navbar />

      <main id="contenido" tabIndex={-1} className="container mx-auto max-w-3xl px-4 py-12 focus:outline-none">
        <div className="mb-10 flex flex-col items-center space-y-3 text-center">
          <div className="mb-1 flex size-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
            <Icono className="size-7" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{titulo}</h1>
          <p className="text-sm text-muted-foreground">
            Versión {VERSION_LEGAL} — vigente desde el {VIGENTE_DESDE}
          </p>
        </div>

        <div className="space-y-10">{children}</div>
      </main>

      <MobileNav />
    </div>
  )
}
