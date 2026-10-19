"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { createElement, useMemo, useState, useTransition } from "react"
import { Calendar, MapPin, Clock, Users, ExternalLink, Navigation, ArrowLeft, Pencil, Check, X } from "lucide-react"
import { vibeLabels, Event, Category, Venue } from "@/lib/types"
import { Navbar } from "@/components/navbar"
import { MobileNav } from "@/components/mobile-nav"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ShareButton } from "@/components/share-button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { getCategoryIcon } from "@/lib/category-icons"
import { formatEventDate, formatSaltaDayKey } from "@/lib/date-format"
import { ageChip, capitalizeFirst, cleanDescription, formatEventTimeDisplay } from "@/lib/event-display"
import { createCategory, updateEventCategory } from "@/lib/admin-actions"
import { deferredRefresh } from "@/lib/deferred-refresh"
import { AdSenseBanner } from "@/components/adsense-banner"
import { ViewBeacon } from "@/components/view-beacon"
import { goHref, urlComoLlegar, type MetricOrigin } from "@/lib/metricas/links"
import { FlyerImage } from "@/components/flyer-image"
import { FilaAccionesEvento } from "@/components/fila-acciones-evento"
import { BotonSeguir } from "@/components/boton-seguir"
import { InsigniaDestacado } from "@/components/insignia-destacado"
import { ControlDestacado } from "@/components/admin/control-destacado"
import { estaDestacado } from "@qps/core/events/destacados"
import type { CantidadesAsistencia } from "@/lib/asistencia"
import { debenMostrarseBotonesAsistencia } from "@/lib/asistencia-visibilidad"
import type { TipoAsistencia } from "@qps/core/asistencia"
import type { obtenerSeguimientoDeEvento } from "@/lib/actions/radar"

type EventWithRelations = Event & {
  category: Category | null;
  venue: Venue | null;
}

/** Lo que devuelve `obtenerSeguimientoDeEvento` (lugar y, si hay, cuenta de Instagram a seguir). */
type SeguimientoEvento = Awaited<ReturnType<typeof obtenerSeguimientoDeEvento>>

interface EventDetailPageProps {
  event: EventWithRelations
  isAdmin?: boolean
  categories?: Category[]
  isFavorite?: boolean
  /** Origen de la visita (`?o=`), ya validado en el servidor. */
  origin?: MetricOrigin
  /**
   * "Voy" (R38, reescrito en la R47, QPS-197): opcionales para no romper
   * otros call sites. Si falta `cantidadesAsistencia`, la fila igual
   * muestra ♥ y Compartir, solo sin el botón de Voy (`mostrarVoy: false`).
   */
  cantidadesAsistencia?: CantidadesAsistencia
  marcaAsistencia?: TipoAsistencia | null
  /** "+ Seguir" (lugar y, si hay, cuenta de Instagram): `null` si no se pudo leer o no hay nada que seguir. */
  seguimiento?: SeguimientoEvento | null
  haySesion?: boolean
}

export function EventDetailPage({
  event,
  isAdmin = false,
  categories = [],
  isFavorite = false,
  origin = "directo",
  cantidadesAsistencia,
  marcaAsistencia = null,
  seguimiento = null,
  haySesion = false,
}: EventDetailPageProps) {
  const router = useRouter()
  const [localCategories, setLocalCategories] = useState<Category[]>(categories)
  const [isEditingCategory, setIsEditingCategory] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [isPendingCreateCategory, startCreateCategoryTransition] = useTransition()
  const [categoryError, setCategoryError] = useState<string | null>(null)
  const [currentCategoryId, setCurrentCategoryId] = useState<string>(event.category_id ?? "")
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(event.category_id ?? "")
  const [newCategoryName, setNewCategoryName] = useState("")

  const currentCategory = useMemo(() => {
    if (!currentCategoryId) return null
    return localCategories.find((category) => category.id === currentCategoryId) ?? event.category
  }, [localCategories, currentCategoryId, event.category])

  const startDate = new Date(event.start_date)
  const displayEvent = {
    id: event.id,
    title: event.title,
    venue: event.venue?.name || 'Lugar por confirmar',
    date: formatSaltaDayKey(startDate),
    time: formatEventTimeDisplay(startDate),
    category: currentCategory?.slug || 'uncategorized',
    categoryName: currentCategory?.name || 'Sin categorizar',
    price: event.is_free ? "gratis" as const : (event.price_min === 0 ? "confirmar" as const : event.price_min),
    image: event.image_url || '/placeholder.svg?height=600&width=400',
    description: cleanDescription(event.description) ?? cleanDescription(event.short_description),
    address: event.venue?.address || '',
    ticketUrl: event.ticket_url || undefined,
    vibe: ageChip(event.age_restriction),
  }

  const formattedDate = formatEventDate(displayEvent.date, true)

  // null sin dirección ni lugar: entonces no hay botón (QPS-137), en vez de un link a '#'.
  const googleMapsUrl = urlComoLlegar({ address: displayEvent.address, venue: displayEvent.venue })
  const iconComponent = getCategoryIcon(displayEvent.category)

  const handleSaveCategory = () => {
    if (!selectedCategoryId) return
    setCategoryError(null)

    startTransition(async () => {
      const result = await updateEventCategory(event.id, selectedCategoryId)
      if (result.error) {
        setCategoryError(result.error)
        return
      }

      setCurrentCategoryId(selectedCategoryId)
      setIsEditingCategory(false)
      deferredRefresh(router.refresh)
    })
  }

  const handleCreateCategoryAndAssign = () => {
    const name = newCategoryName.trim()
    if (!name) return
    setCategoryError(null)

    startCreateCategoryTransition(async () => {
      const created = await createCategory(name)
      if (created.error || !created.category) {
        setCategoryError(created.error ?? 'No se pudo crear la categoría')
        return
      }

      setLocalCategories((prev) => {
        if (prev.some((category) => category.id === created.category.id)) return prev
        return [...prev, created.category]
      })

      const assign = await updateEventCategory(event.id, created.category.id)
      if (assign.error) {
        setCategoryError(assign.error)
        return
      }

      setCurrentCategoryId(created.category.id)
      setSelectedCategoryId(created.category.id)
      setNewCategoryName("")
      setIsEditingCategory(false)
      deferredRefresh(router.refresh)
    })
  }

  return (
    <div className="min-h-screen bg-background pb-page sm:pb-0">
      <ViewBeacon eventId={event.id} origin={origin} />
      <Navbar />
      
      <main className="container mx-auto px-4 py-8">
        <Link 
          href="/"
          className="mb-6 inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Volver a eventos
        </Link>

        <div className="grid gap-8 lg:grid-cols-2">
          <div className="relative aspect-[3/4] overflow-hidden rounded-2xl lg:aspect-[4/5]">
            <FlyerImage
              variant={800}
              src={displayEvent.image}
              alt={displayEvent.title}
              fill
              className="object-cover"
              priority
            />
            <Badge className="absolute left-4 top-4 bg-primary text-primary-foreground">
              {createElement(iconComponent, { className: "mr-1 size-3" })}
              {displayEvent.categoryName}
            </Badge>
            {/*
              `event` es la fila cruda (`EventWithRelations`), no pasa por
              `transformEvent`: no trae `isFeatured` calculado, así que acá sí
              se llama a `estaDestacado()` (`@qps/core/events/destacados`)
              con `event.featured_until` y la hora actual. En `event-card.tsx`
              y `hero-carousel.tsx` no hace falta: reciben un `DisplayEvent`
              con `isFeatured` ya resuelto por `transformEvent`.
            */}
            <InsigniaDestacado
              visible={estaDestacado(event.featured_until, new Date())}
              className="absolute left-4 top-14"
            />
          </div>

          <div className="flex flex-col">
            {/*
              Ancla del bloque del título (QPS-199): este es el único <h1>
              de la ficha, y antes el ♥ y Compartir vivían pegados a él. El
              detector estático de `tests/asistencia/orden-ficha.test.ts`
              busca este bloque (no la palabra "FavoriteButton" ni
              "ShareButton" sueltas, que también aparecen más abajo, dentro
              de la fila nueva) para confirmar que salieron de acá.
            */}
            <div className="flex items-start justify-between gap-4 mb-4">
              <h1 className="text-3xl font-bold text-foreground lg:text-4xl flex-1 leading-tight">
                {displayEvent.title}
              </h1>
            </div>

            {isAdmin && (
              <div className="mb-6 rounded-lg border bg-muted/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Categoría (Admin)</p>
                    {!isEditingCategory && (
                      <p className="text-sm font-medium text-foreground">{displayEvent.categoryName}</p>
                    )}
                  </div>

                  {!isEditingCategory ? (
                    <Button size="sm" variant="outline" onClick={() => setIsEditingCategory(true)}>
                      <Pencil className="mr-2 size-4" />
                      Editar
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setSelectedCategoryId(currentCategoryId)
                          setIsEditingCategory(false)
                          setCategoryError(null)
                        }}
                      >
                        <X className="mr-1 size-4" />
                        Cancelar
                      </Button>
                      <Button size="sm" onClick={handleSaveCategory} disabled={isPending || !selectedCategoryId}>
                        <Check className="mr-1 size-4" />
                        Guardar
                      </Button>
                    </div>
                  )}
                </div>

                {isEditingCategory && (
                  <div className="mt-3 space-y-3">
                    <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar categoría" />
                      </SelectTrigger>
                      <SelectContent>
                        {localCategories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div className="flex flex-col gap-2 rounded-md border bg-background p-3">
                      <p className="text-xs text-muted-foreground">Crear nueva categoría y asignar este evento</p>
                      <div className="flex items-center gap-2">
                        <Input
                          value={newCategoryName}
                          onChange={(e) => setNewCategoryName(e.target.value)}
                          placeholder="Ej: Automovilismo"
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={handleCreateCategoryAndAssign}
                          disabled={isPendingCreateCategory || !newCategoryName.trim()}
                        >
                          {isPendingCreateCategory ? 'Creando...' : 'Crear y asignar'}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {categoryError && <p className="mt-2 text-xs text-destructive">{categoryError}</p>}

                <div className="mt-4 border-t pt-3">
                  <ControlDestacado eventId={event.id} featuredUntil={event.featured_until ?? null} />
                </div>

                <Link
                  href={`/admin/reporte/${event.id}`}
                  prefetch={false}
                  className="mt-2 flex min-h-11 items-center text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  Reporte para el organizador
                </Link>
              </div>
            )}

            <div className="mb-6 space-y-4">
              <div className="flex items-center gap-3 text-muted-foreground">
                <Calendar className="size-5 text-primary" />
                <span>{capitalizeFirst(formattedDate)}</span>
              </div>
              
              {displayEvent.time && (
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Clock className="size-5 text-primary" />
                  <span>{displayEvent.time} hs</span>
                </div>
              )}
              
              <div className="flex items-center gap-3 text-muted-foreground">
                <MapPin className="size-5 text-primary" />
                <div className="flex flex-wrap items-center gap-2">
                  <div>
                    <p className="font-medium text-foreground">{displayEvent.venue}</p>
                    <p className="text-sm">{displayEvent.address}</p>
                  </div>
                  {seguimiento?.lugar && (
                    <BotonSeguir
                      tipo="lugar"
                      id={seguimiento.lugar.id}
                      etiqueta={seguimiento.lugar.nombre}
                      siguiendoInicial={seguimiento.lugar.siguiendo}
                      haySesion={haySesion}
                    />
                  )}
                </div>
              </div>

              {seguimiento?.cuenta && (
                <BotonSeguir
                  tipo="cuenta"
                  id={seguimiento.cuenta.id}
                  etiqueta={seguimiento.cuenta.username}
                  siguiendoInicial={seguimiento.cuenta.siguiendo}
                  haySesion={haySesion}
                />
              )}

              {displayEvent.vibe && (
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Users className="size-5 text-primary" />
                  <span>{vibeLabels[displayEvent.vibe]}</span>
                </div>
              )}
            </div>

            {displayEvent.description ? (
              <p className="mb-8 flex-1 text-muted-foreground">{displayEvent.description}</p>
            ) : (
              <div className="flex-1" />
            )}

            {displayEvent.price !== "confirmar" && (
              <div className="mb-6 rounded-xl bg-muted p-6">
                <p className="mb-1 text-sm text-muted-foreground">Precio de entrada</p>
                <p className="text-3xl font-bold text-foreground">
                  {displayEvent.price === "gratis" 
                    ? "Entrada Gratuita" 
                    : `$${displayEvent.price.toLocaleString("es-AR")}`}
                </p>
              </div>
            )}


            <div className="flex flex-col gap-3 sm:flex-row">
              {googleMapsUrl && (
                <Button
                  size="lg"
                  className="w-full sm:flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                  asChild
                >
                  <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer">
                    <Navigation className="mr-2 size-4" />
                    Cómo llegar
                  </a>
                </Button>
              )}

              {displayEvent.ticketUrl && (
                <Button size="lg" variant="outline" className="w-full sm:flex-1" asChild>
                  <a href={goHref(event.id, "ficha")} target="_blank" rel="nofollow noopener noreferrer">
                    <ExternalLink className="mr-2 size-4" />
                    Comprar tickets
                  </a>
                </Button>
              )}
            </div>

            {/*
              Bloqueante 2, vuelta 1 (sigue vigente en la R47): la fuente de
              verdad real es `app/evento/[id]/page.tsx`, que ya no pasa
              `cantidadesAsistencia` para eventos que no son PUBLISHED (la
              vista `event_attendance_counts` solo agrega votos PUBLISHED,
              así que en CANCELLED/PAST el contador quedaría clavado en 0).
              Este chequeo repite la MISMA función
              (`debenMostrarseBotonesAsistencia`, una sola fuente de verdad)
              como defensa en profundidad, para que ningún otro call site
              futuro de este componente pueda dibujar el botón de Voy fuera
              de PUBLISHED. Sin `cantidadesAsistencia` la fila IGUAL se
              dibuja (♥ y Compartir), solo sin el botón de Voy
              (`mostrarVoy: false`): es un cambio buscado de esta tarea.
            */}
            <FilaAccionesEvento
              eventId={event.id}
              titulo={event.title}
              guardadoInicial={isFavorite}
              voyInicial={marcaAsistencia === "voy"}
              cantidadesIniciales={cantidadesAsistencia ?? { voy: 0 }}
              haySesion={haySesion}
              mostrarVoy={Boolean(cantidadesAsistencia) && debenMostrarseBotonesAsistencia(event.status)}
              compartir={
                <ShareButton
                  eventId={event.id}
                  title={event.title}
                  className="size-10 bg-muted/40 hover:bg-muted text-foreground"
                />
              }
              className="mt-6"
            />
          </div>
        </div>

        <div className="mt-12 border-t border-border pt-8 max-w-4xl mx-auto">
          <AdSenseBanner slot="event-detail-bottom-banner" />
        </div>
      </main>

      <MobileNav />
    </div>
  )
}
