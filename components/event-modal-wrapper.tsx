"use client"

import { useRouter } from "next/navigation"
import { createElement, useMemo, useState, useTransition } from "react"
import Image from "next/image"
import { Calendar, MapPin, Clock, Users, ExternalLink, Navigation, Pencil, Check, X } from "lucide-react"
import { vibeLabels, Event, Category, Venue } from "@/lib/types"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { createCategory, updateEventCategory } from "@/lib/admin-actions"
import { deferredRefresh } from "@/lib/deferred-refresh"

type EventWithRelations = Event & { category: Category | null; venue: Venue | null }

interface EventModalWrapperProps {
  event: EventWithRelations
  isAdmin?: boolean
  categories?: Category[]
}

export function EventModalWrapper({ event, isAdmin = false, categories = [] }: EventModalWrapperProps) {
  const router = useRouter()
  const [localCategories, setLocalCategories] = useState<Category[]>(categories)
  const [hasCategoryChanges, setHasCategoryChanges] = useState(false)
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
      setHasCategoryChanges(true)
      router.refresh()
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
      setHasCategoryChanges(true)
      router.refresh()
    })
  }

  const handleClose = (open: boolean) => {
    if (open) return
    router.back()

    if (hasCategoryChanges) {
      setHasCategoryChanges(false)
      deferredRefresh(router.refresh)
    }
  }

  return (
    <Dialog open onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto p-0">
        <div className="relative aspect-[3/2] w-full">
          <Image
            src={displayEvent.image}
            alt={displayEvent.title}
            fill
            className="object-cover"
          />
          <Badge className="absolute left-4 top-4 bg-primary text-primary-foreground">
            {createElement(iconComponent, { className: "mr-1 size-3" })}
            {displayEvent.categoryName}
          </Badge>
        </div>

        <div className="p-6">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-2xl">{displayEvent.title}</DialogTitle>
          </DialogHeader>

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
            </div>
          )}

          <div className="mb-6 space-y-3">
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

          <p className="mb-6 text-muted-foreground">{displayEvent.description}</p>

          {displayEvent.price !== "confirmar" && (
            <div className="mb-6 rounded-lg bg-muted p-4">
              <p className="mb-1 text-sm text-muted-foreground">Precio de entrada</p>
              <p className="text-2xl font-bold text-foreground">
                {displayEvent.price === "gratis" 
                  ? "Entrada Gratuita" 
                  : `$${displayEvent.price.toLocaleString("es-AR")}`}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button 
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
              asChild
            >
              <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer">
                <Navigation className="mr-2 size-4" />
                Como llegar
              </a>
            </Button>
            
            {displayEvent.ticketUrl && (
              <Button variant="outline" className="flex-1" asChild>
                <a href={displayEvent.ticketUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 size-4" />
                  Comprar tickets
                </a>
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
