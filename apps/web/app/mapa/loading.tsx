import { Skeleton } from "@/components/ui/skeleton"

// Esqueleto de carga de /mapa: mismo contenedor que la página, con el título,
// los filtros, el bloque del mapa (mismo alto fijo) y tres tarjetas de lugares.
export default function Loading() {
  return (
    <div role="status" aria-busy="true" className="min-h-screen bg-background pb-page sm:pb-0">
      <span className="sr-only">Cargando…</span>
      <div className="h-16 w-full border-b border-border/40 bg-background/95" />
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="mt-2 h-4 w-56 max-w-full" />
        <div className="mt-4 flex flex-wrap gap-2">
          <Skeleton className="h-11 w-20 rounded-full" />
          <Skeleton className="h-11 w-28 rounded-full" />
          <Skeleton className="h-11 w-48 rounded-full" />
        </div>
        <Skeleton className="mt-4 h-5 w-40" />
        <div className="mt-4 space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start lg:gap-6 lg:space-y-0">
          <Skeleton className="h-[45vh] min-h-64 w-full rounded-2xl lg:h-[70vh]" />
          <div className="space-y-3">
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    </div>
  )
}
