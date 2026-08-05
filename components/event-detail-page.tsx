"use client"

import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createElement, useMemo, useState, useTransition } from "react"
import { Calendar, MapPin, Clock, Users, ExternalLink, Navigation, ArrowLeft, Pencil, Check, X, Instagram, Facebook, MessageCircle, User } from "lucide-react"
import { vibeLabels, Event, Category, Venue } from "@/lib/types"
import { Navbar } from "@/components/navbar"
import { MobileNav } from "@/components/mobile-nav"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FavoriteButton } from "@/components/favorite-button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { getCategoryIcon } from "@/lib/category-icons"
import { formatEventDate, formatEventTime, formatSaltaDayKey } from "@/lib/date-format"
import { createCategory, updateEventCategory, toggleEventFeatured } from "@/lib/admin-actions"
import { deferredRefresh } from "@/lib/deferred-refresh"
import { AdSenseBanner } from "@/components/adsense-banner"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"

type EventWithRelations = Event & { 
  category: Category | null; 
  venue: Venue | null; 
  profile?: { role: string; full_name: string | null; contact_type?: string | null; contact_value?: string | null } | null 
}

interface EventDetailPageProps {
  event: EventWithRelations
  isAdmin?: boolean
  categories?: Category[]
  isFavorite?: boolean
}

export function EventDetailPage({ event, isAdmin = false, categories = [], isFavorite = false }: EventDetailPageProps) {
  const router = useRouter()
  const [localCategories, setLocalCategories] = useState<Category[]>(categories)
  const [isEditingCategory, setIsEditingCategory] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [isPendingCreateCategory, startCreateCategoryTransition] = useTransition()
  const [categoryError, setCategoryError] = useState<string | null>(null)
  const [currentCategoryId, setCurrentCategoryId] = useState<string>(event.category_id ?? "")
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(event.category_id ?? "")
  const [newCategoryName, setNewCategoryName] = useState("")

  const [isFeatured, setIsFeatured] = useState(event.is_featured)
  const [isPendingFeatured, startFeaturedTransition] = useTransition()
  const { toast } = useToast()

  const handleToggleFeatured = (checked: boolean) => {
    startFeaturedTransition(async () => {
      const result = await toggleEventFeatured(event.id, checked)
      if (result.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
        return
      }
      setIsFeatured(checked)
      toast({
        title: checked ? "Evento destacado" : "Evento quitado de destacados",
        description: checked 
          ? "El evento ahora se mostrará con prioridad en la página principal."
          : "El evento ya no se mostrará como destacado.",
      })
      deferredRefresh(router.refresh)
    })
  }

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
    time: formatEventTime(startDate),
    category: currentCategory?.slug || 'uncategorized',
    categoryName: currentCategory?.name || 'Sin categorizar',
    price: event.is_free ? "gratis" as const : (event.price_min === 0 ? "confirmar" as const : event.price_min),
    image: event.image_url || '/placeholder.svg?height=600&width=400',
    description: event.description || event.short_description || '',
    address: event.venue?.address || '',
    ticketUrl: event.ticket_url || undefined,
    vibe: event.age_restriction >= 18 ? "adultos" as const : "familiar" as const,
  }

  const formattedDate = formatEventDate(displayEvent.date, true)

  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(displayEvent.address || displayEvent.venue)}`
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
    <div className="min-h-screen bg-background pb-20 sm:pb-0">
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
            <Image
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
          </div>

          <div className="flex flex-col">
            <div className="flex items-start justify-between gap-4 mb-4">
              <h1 className="text-3xl font-bold text-foreground lg:text-4xl flex-1 leading-tight">
                {displayEvent.title}
              </h1>
              <FavoriteButton 
                itemId={event.id}
                type="event"
                initialIsFavorite={isFavorite}
                className="size-10 bg-muted/40 hover:bg-muted text-foreground flex-shrink-0"
              />
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

                <div className="mt-4 border-t pt-3 flex items-center justify-between">
                  <div className="space-y-0.5 pr-2">
                    <Label htmlFor="featured-toggle" className="text-sm font-medium text-foreground cursor-pointer">
                      Destacar Evento
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Aparecerá en el carrusel de inicio y tendrá una etiqueta especial.
                    </p>
                  </div>
                  <Switch
                    id="featured-toggle"
                    checked={isFeatured}
                    onCheckedChange={handleToggleFeatured}
                    disabled={isPendingFeatured}
                  />
                </div>
              </div>
            )}

            <div className="mb-6 space-y-4">
              <div className="flex items-center gap-3 text-muted-foreground">
                <Calendar className="size-5 text-primary" />
                <span className="capitalize">{formattedDate}</span>
              </div>
              
              <div className="flex items-center gap-3 text-muted-foreground">
                <Clock className="size-5 text-primary" />
                <span>{displayEvent.time} hs</span>
              </div>
              
              <div className="flex items-center gap-3 text-muted-foreground">
                <MapPin className="size-5 text-primary" />
                <div>
                  <p className="font-medium text-foreground">{displayEvent.venue}</p>
                  <p className="text-sm">{displayEvent.address}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 text-muted-foreground">
                <Users className="size-5 text-primary" />
                <span>{vibeLabels[displayEvent.vibe as keyof typeof vibeLabels] || displayEvent.vibe}</span>
              </div>
            </div>

            <p className="mb-8 flex-1 text-muted-foreground">{displayEvent.description}</p>

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

            {event.profile?.role === "COLLABORATOR" && (
              <div className="mb-6 rounded-xl border bg-card p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <User className="size-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Publicado por:</p>
                    <p className="font-semibold">{event.profile.full_name || 'Colaborador Local'}</p>
                  </div>
                </div>
                {event.profile.contact_value && (
                  <Button 
                    variant="outline" 
                    className="w-full gap-2 justify-center"
                    asChild
                  >
                    <a href={
                      event.profile.contact_type === 'whatsapp' 
                        ? `https://wa.me/${event.profile.contact_value.replace(/[^0-9]/g, '')}` 
                        : event.profile.contact_value.startsWith('http') 
                          ? event.profile.contact_value 
                          : `https://${event.profile.contact_value}`
                    } target="_blank" rel="noopener noreferrer">
                      {event.profile.contact_type === 'whatsapp' ? <MessageCircle className="size-4" /> : null}
                      {event.profile.contact_type === 'instagram' ? <Instagram className="size-4" /> : null}
                      {event.profile.contact_type === 'facebook' ? <Facebook className="size-4" /> : null}
                      Contactar Organizador
                    </a>
                  </Button>
                )}
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button 
                size="lg"
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                asChild
              >
                <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer">
                  <Navigation className="mr-2 size-4" />
                  Como llegar
                </a>
              </Button>
              
              {displayEvent.ticketUrl && (
                <Button size="lg" variant="outline" className="flex-1" asChild>
                  <a href={displayEvent.ticketUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 size-4" />
                    Comprar tickets
                  </a>
                </Button>
              )}
            </div>
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
