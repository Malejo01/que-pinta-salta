'use client'

import { PaginaDeError } from "@/components/pagina-de-error"

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PaginaDeError titulo="Algo salió mal" texto="Tuvimos un problema de nuestro lado. Probá de nuevo en un momento.">
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
      >
        Probar de nuevo
      </button>
    </PaginaDeError>
  )
}
