import { ExternalLink, Sparkles } from "lucide-react"
import { estaDestacado, textoVenceDestacado } from "@qps/core/events/destacados"

/**
 * Q7-4 · El bloque de admin del modal de un evento (portada y /buscar): el
 * estado del destacado y un link a la ficha completa, que es donde vive el
 * control entero (`ControlDestacado`, que acá NO se duplica).
 *
 * Solo se dibuja si quien llama ya sabe que es ADMIN, y eso se lee en el
 * servidor (`profiles.role`): el modal recibe un booleano, nunca lo decide el
 * cliente. Igual no habilita nada: es un texto y un link, y la ficha vuelve a
 * chequear el rol antes de mostrar los controles.
 *
 * El link es un `<a>` común y no un `<Link>`: desde la portada el modal es la
 * ruta interceptada `@modal/(.)evento/[id]`, y una navegación del lado del
 * cliente a `/evento/<id>` volvería a abrir el mismo modal en vez de la ficha.
 */
export function AdminModalEvento({ eventId, featuredUntil }: { eventId: string; featuredUntil: string | null | undefined }) {
  const ahora = new Date()
  const vigente = estaDestacado(featuredUntil ?? null, ahora)
  const estado = textoVenceDestacado(featuredUntil ?? null, ahora)

  return (
    <section
      aria-label="Herramientas de admin"
      className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3"
    >
      <p className="flex items-center gap-2 text-sm text-foreground" suppressHydrationWarning>
        <Sparkles className={vigente ? "size-4 text-primary" : "size-4 text-muted-foreground"} aria-hidden="true" />
        <span>
          <span className="sr-only">Admin: </span>
          {estado}
        </span>
      </p>
      <a
        href={`/evento/${eventId}`}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ExternalLink className="size-4" aria-hidden="true" />
        Abrir ficha completa
      </a>
    </section>
  )
}
