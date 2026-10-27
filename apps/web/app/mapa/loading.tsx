import { Skeleton } from "@/components/ui/skeleton"

// Esqueleto de carga de /mapa: mismo contenedor que la página, con el título,
// las dos filas de filtros ("Cuándo" y "Qué"), el bloque del mapa (mismo alto
// fijo) y tres tarjetas de lugares.
//
// Sin JavaScript este esqueleto no se iría nunca: la página llega en el mismo
// HTML, pero React la manda escondida (en un `<div hidden>`) y la pone en su
// lugar con un script. El `<style>` del `<noscript>` muestra la página
// (`data-pagina-mapa`, en `page.tsx`), la sube arriba de todo (React la deja al
// final del <body>, después del pie) y esconde el esqueleto. Con JavaScript el
// navegador no lee el `<noscript>`, así que no cambia nada.
//
// Va en `@layer theme` a propósito: el preflight de Tailwind esconde `[hidden]`
// con `!important` en `@layer base`, y entre declaraciones `!important` gana la
// capa declarada ANTES (`theme`); una regla sin capa perdería.
const SIN_JS_MOSTRAR_LA_PAGINA =
  "@layer theme{body{display:flex!important;flex-direction:column}div[hidden]:has(> [data-pagina-mapa]){display:block!important;order:-1}[data-cargando-mapa]{display:none!important}}"

export default function Loading() {
  return (
    <div role="status" aria-busy="true" data-cargando-mapa="" className="min-h-screen bg-background pb-page sm:pb-0">
      <noscript>
        <style>{SIN_JS_MOSTRAR_LA_PAGINA}</style>
      </noscript>
      <span className="sr-only">Cargando…</span>
      <div className="h-[65px] w-full border-b border-border/40 bg-background/95" />
      <div className="container mx-auto px-4 py-4 sm:py-8">
        <Skeleton className="h-8 w-72 max-w-full sm:h-9" />
        <Skeleton className="mt-2 h-4 w-56 max-w-full" />
        <div className="mt-4 flex flex-wrap gap-2">
          <Skeleton className="h-11 w-20 rounded-full" />
          <Skeleton className="h-11 w-28 rounded-full" />
          <Skeleton className="h-11 w-48 rounded-full" />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Skeleton className="h-11 w-20 rounded-full" />
          <Skeleton className="h-11 w-28 rounded-full" />
          <Skeleton className="h-11 w-40 rounded-full" />
        </div>
        <Skeleton className="mt-4 h-5 w-40" />
        <div className="mt-4 space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start lg:gap-6 lg:space-y-0">
          <Skeleton className="h-[45dvh] min-h-64 w-full rounded-2xl lg:h-[max(24rem,calc(100dvh-24rem))]" />
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
