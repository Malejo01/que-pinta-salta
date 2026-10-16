import { Skeleton } from '@/components/ui/skeleton'

/**
 * Esqueletos de carga para los `app/**\/loading.tsx` (tarea 30-f, ronda 30).
 *
 * Cada uno es un bloque estático (Server Component, sin interactividad) que
 * solo usa `Skeleton` (components/ui/skeleton.tsx: `bg-accent animate-pulse`)
 * y las mismas clases de contenedor/`max-w`/gaps/proporciones que la pantalla
 * real, para que el contenido no "salte" cuando termina de cargar. Todo con
 * tokens del tema (`bg-muted`, `bg-card`, `border-border`, `bg-background`…)
 * — nada de `zinc`/`black`/`white` fijos — así anda igual en claro y oscuro.
 */

/** Región marcada como ocupada para lectores de pantalla; envuelve cada esqueleto de página. */
function LoadingRegion({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">Cargando…</span>
      {children}
    </div>
  )
}

/**
 * Misma altura y borde inferior que `Navbar` (components/navbar.tsx: `h-16`,
 * `border-b`, sticky), para que el contenido de abajo no se mueva cuando el
 * navbar real (un Client Component con su propio estado de sesión) se monta.
 */
function NavbarPlaceholder() {
  return <div className="h-16 w-full border-b border-border/40 bg-background/95" />
}

/**
 * Una tarjeta: misma proporción que la tarjeta real
 * (components/event-card.tsx: `aspect-[2/3]`) y el mismo ancho máximo que le
 * pasan las páginas que la grillan (`max-w-[200px] mx-auto`).
 */
function EventCardSkeleton() {
  return <Skeleton className="aspect-[2/3] w-full max-w-[200px] mx-auto rounded-xl" />
}

/** Grilla de tarjetas 2:3. `gridClassName` reproduce el `grid-cols-*` de cada pantalla. */
function EventCardGrid({
  count = 10,
  gridClassName = 'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5',
}: {
  count?: number
  gridClassName?: string
}) {
  return (
    <div className={gridClassName}>
      {Array.from({ length: count }).map((_, i) => (
        <EventCardSkeleton key={i} />
      ))}
    </div>
  )
}

/**
 * Portada (`app/page.tsx`) y `/buscar` (`app/buscar/page.tsx`): mismo
 * `container mx-auto px-4 py-8` y la misma grilla de tarjetas
 * (`grid-cols-2 ... lg:grid-cols-5`) que usan `HomeContent`/`BuscarContent`.
 */
export function EventsPageSkeleton() {
  return (
    <LoadingRegion className="min-h-screen bg-background pb-page sm:pb-0">
      <NavbarPlaceholder />
      <div className="container mx-auto px-4 py-8 space-y-6">
        <Skeleton className="h-11 w-full max-w-md rounded-xl" />
        <Skeleton className="h-7 w-40" />
        <EventCardGrid />
      </div>
    </LoadingRegion>
  )
}

/**
 * `/favoritos` (`app/favoritos/page.tsx` + `favoritos-list.tsx`): mismo
 * encabezado (título + botón de compartir) y la misma grilla
 * `grid-cols-2 ... xl:grid-cols-6` que agrupa los favoritos.
 */
export function FavoritosPageSkeleton() {
  return (
    <LoadingRegion className="min-h-screen bg-background pb-page sm:pb-0">
      <NavbarPlaceholder />
      <main className="container mx-auto px-4 py-8 space-y-8">
        <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-11 w-56 rounded-xl" />
        </div>
        <EventCardGrid gridClassName="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6" />
      </main>
    </LoadingRegion>
  )
}

/** Una tarjeta de película: mismo afiche 2:3 que `components/movie-card.tsx`. */
function MovieCardSkeleton() {
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-4">
      <Skeleton className="aspect-[2/3] w-full rounded-xl" />
      <div className="mt-4 space-y-2">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-2/3" />
      </div>
      <div className="mt-3 space-y-2 border-t border-border pt-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
      </div>
    </div>
  )
}

/**
 * `/cines` (`app/cines/page.tsx` + `components/cines-view.tsx`): mismo
 * `container mx-auto px-4 pt-12 md:pt-16 max-w-7xl`, encabezado centrado,
 * buscador y grilla (`grid-cols-1 ... lg:grid-cols-4`) de tarjetas de película.
 * Desde 30-d esta página sí renderiza `<Navbar />`, así que el esqueleto
 * también reserva su altura.
 */
export function CinesPageSkeleton() {
  return (
    <LoadingRegion className="min-h-screen bg-background pb-page">
      <NavbarPlaceholder />
      <div className="container mx-auto max-w-7xl px-4 pt-12 md:pt-16">
        <div className="mb-12 flex flex-col items-center space-y-4 text-center">
          <Skeleton className="size-14 rounded-2xl" />
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-5 w-full max-w-xl" />
        </div>
        <div className="space-y-8">
          <Skeleton className="mx-auto h-11 w-full max-w-md rounded-xl" />
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <MovieCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    </LoadingRegion>
  )
}

/** Una sección del formulario del Radar (`rounded-2xl border bg-card p-6 space-y-6`), con filas de campos. */
function RadarSectionSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="space-y-6 rounded-2xl border border-border bg-card p-6">
      <Skeleton className="h-6 w-56" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-md" />
        ))}
      </div>
    </div>
  )
}

/**
 * `/radar` (`app/radar/page.tsx` + `components/radar-form.tsx`): mismo
 * `container mx-auto px-4 py-12 max-w-4xl`, encabezado centrado y las 3
 * secciones del formulario (`max-w-3xl mx-auto space-y-8`).
 */
export function RadarPageSkeleton() {
  return (
    <LoadingRegion className="min-h-screen bg-background pb-page sm:pb-0">
      <NavbarPlaceholder />
      <main className="container mx-auto max-w-4xl px-4 py-12">
        <div className="mb-10 flex flex-col items-center space-y-3 text-center">
          <Skeleton className="size-14 rounded-2xl" />
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-5 w-full max-w-md" />
        </div>
        <div className="mx-auto max-w-3xl space-y-8">
          <RadarSectionSkeleton rows={2} />
          <RadarSectionSkeleton rows={3} />
          <RadarSectionSkeleton rows={1} />
        </div>
      </main>
    </LoadingRegion>
  )
}

/**
 * Ficha de evento (`app/evento/[id]/page.tsx` + `components/event-detail-page.tsx`):
 * mismo `container mx-auto px-4 py-8`, `grid gap-8 lg:grid-cols-2` con el
 * afiche (`aspect-[3/4] lg:aspect-[4/5]`) a la izquierda y los bloques de
 * info (título, fecha/lugar, precio, botones) a la derecha.
 */
export function EventDetailPageSkeleton() {
  return (
    <LoadingRegion className="min-h-screen bg-background pb-page sm:pb-0">
      <NavbarPlaceholder />
      <main className="container mx-auto px-4 py-8">
        <Skeleton className="mb-6 h-5 w-40" />
        <div className="grid gap-8 lg:grid-cols-2">
          <Skeleton className="aspect-[3/4] w-full rounded-2xl lg:aspect-[4/5]" />
          <div className="flex flex-col gap-4">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-2/3" />
            <div className="space-y-4">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-56" />
            </div>
            <Skeleton className="h-24 w-full rounded-xl" />
            <div className="flex flex-col gap-3 sm:flex-row">
              <Skeleton className="h-11 w-full rounded-md sm:flex-1" />
              <Skeleton className="h-11 w-full rounded-md sm:flex-1" />
            </div>
          </div>
        </div>
      </main>
    </LoadingRegion>
  )
}
