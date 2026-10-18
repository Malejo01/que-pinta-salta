import type { LucideIcon } from "lucide-react"
import { Navbar } from "@/components/navbar"
import { MobileNav } from "@/components/mobile-nav"

/** El `linkClass` de hoy, exportado para que las páginas legales armen sus links con el mismo estilo. */
export const claseLink = "text-primary underline underline-offset-4 hover:text-primary/80"

/**
 * Resalta un fragmento pendiente de revisión o de completar. No escribe
 * texto propio: las páginas le pasan el literal como hijo (por ejemplo
 * `<Marca>[REVISIÓN LEGAL]</Marca>`), así el literal queda en el archivo de
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

/** El aviso que aparece arriba de las dos páginas legales mientras siguen siendo un borrador. */
function AvisoBorrador() {
  return (
    <div
      role="note"
      className="mb-10 space-y-1 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200"
    >
      <p className="font-semibold">Borrador pendiente de revisión legal</p>
      <p>Este texto todavía no lo revisó un abogado y puede cambiar antes de publicarse.</p>
    </div>
  )
}

/**
 * Armazón compartido de las páginas legales (`/privacidad` y `/terminos`):
 * `Navbar`, el encabezado centrado con ícono, el aviso de borrador cuando
 * corresponde, las secciones (`children`) y `MobileNav`.
 */
export function PaginaLegal({
  titulo,
  icono: Icono,
  ultimaActualizacion,
  borrador,
  children,
}: {
  titulo: string
  icono: LucideIcon
  ultimaActualizacion: string
  borrador?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background pb-page sm:pb-0">
      <Navbar />

      <main className="container mx-auto max-w-3xl px-4 py-12">
        <div className="mb-10 flex flex-col items-center space-y-3 text-center">
          <div className="mb-1 flex size-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
            <Icono className="size-7" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{titulo}</h1>
          <p className="text-sm text-muted-foreground">Última actualización: {ultimaActualizacion}</p>
        </div>

        {borrador ? <AvisoBorrador /> : null}

        <div className="space-y-10">{children}</div>
      </main>

      <MobileNav />
    </div>
  )
}
