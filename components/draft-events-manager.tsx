'use client'

import React, { useState, useEffect } from 'react'
import {
  Sparkles,
  Clock,
  Calendar,
  MapPin,
  Ticket,
  Tag,
  Trash2,
  Check,
  FileText,
  ExternalLink,
  AlertCircle,
  Inbox,
  Search,
  Image as ImageIcon
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { publishDraftEvent, deleteDraftEvent, triggerAIProcessing } from '@/lib/admin-actions'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'

interface Category {
  id: string
  name: string
  slug: string
}

interface Venue {
  id: string
  name: string
  address: string
}

interface DraftEvent {
  id: string
  title: string
  slug: string
  description: string | null
  short_description: string | null
  category_id: string | null
  venue_id: string | null
  image_url: string | null
  gallery_urls: string[]
  start_date: string
  end_date: string | null
  is_recurring: boolean
  recurrence_rule: string | null
  price_min: number
  price_max: number | null
  is_free: boolean
  ticket_url: string | null
  status: string
  ai_metadata?: any | null
  created_at: string
  category?: Category
  venue?: Venue
}

interface DraftEventsManagerProps {
  initialEvents: DraftEvent[]
  categories: Category[]
  venues: Venue[]
  pendingCount: number
}

export function DraftEventsManager({
  initialEvents,
  categories,
  venues,
  pendingCount,
}: DraftEventsManagerProps) {
  const router = useRouter()
  const [events, setEvents] = useState<DraftEvent[]>(initialEvents)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(
    initialEvents.length > 0 ? initialEvents[0].id : null
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isProcessingAI, setIsProcessingAI] = useState(false)
  const [batchSize, setBatchSize] = useState(3)

  // Form State
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [venueId, setVenueId] = useState('')
  const [startDateDay, setStartDateDay] = useState('')
  const [startDateTime, setStartDateTime] = useState('')
  const [priceMin, setPriceMin] = useState(0)
  const [isFree, setIsFree] = useState(false)
  const [ticketUrl, setTicketUrl] = useState('')
  const [imageUrl, setImageUrl] = useState('')

  // Encontrar el evento seleccionado actual
  const selectedEvent = events.find((e) => e.id === selectedEventId) || null

  // Sincronizar estado del formulario cuando cambia el evento seleccionado
  useEffect(() => {
    if (selectedEvent) {
      setTitle(selectedEvent.title || '')
      setDescription(selectedEvent.description || '')
      setCategoryId(selectedEvent.category_id || '')
      setVenueId(selectedEvent.venue_id || '')
      setPriceMin(selectedEvent.price_min || 0)
      setIsFree(selectedEvent.is_free || false)
      setTicketUrl(selectedEvent.ticket_url || '')
      setImageUrl(selectedEvent.image_url || '')

      // Formatear la fecha para inputs HTML sin corrimiento de zona horaria
      const isoString = selectedEvent.start_date || ''
      const parts = isoString.split('T')
      setStartDateDay(parts[0] || '')
      const timePart = parts[1] ? parts[1].substring(0, 5) : '20:00'
      setStartDateTime(timePart)
    } else {
      setTitle('')
      setDescription('')
      setCategoryId('')
      setVenueId('')
      setStartDateDay('')
      setStartDateTime('')
      setPriceMin(0)
      setIsFree(false)
      setTicketUrl('')
      setImageUrl('')
    }
  }, [selectedEventId, events])

  // Sincronizar eventos cuando cambian las props iniciales (ej: tras procesar con la IA)
  useEffect(() => {
    setEvents(initialEvents)
    if (initialEvents.length > 0 && !selectedEventId) {
      setSelectedEventId(initialEvents[0].id)
    }
  }, [initialEvents])

  // Dispara el procesamiento asíncrono de un lote con la IA
  const handleTriggerAI = async () => {
    if (isProcessingAI) return
    setIsProcessingAI(true)
    const toastId = toast.loading('Procesando lote de flyers con IA...')

    try {
      const res = await triggerAIProcessing(batchSize)
      if (res.error) {
        toast.error(`Error: ${res.error}`, { id: toastId })
      } else {
        toast.success(res.message || 'Lote procesado exitosamente.', { id: toastId })
        // Forzar a Next.js a actualizar los datos del Server Component
        router.refresh()
      }
    } catch (err: any) {
      toast.error(`Error de red: ${err.message}`, { id: toastId })
    } finally {
      setIsProcessingAI(false)
    }
  }

  // Filtrar eventos en borrador según búsqueda
  const filteredEvents = events.filter((e) =>
    e.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handlePublish = async () => {
    if (!selectedEvent) return
    if (!title.trim()) {
      toast.error('El título es requerido.')
      return
    }
    if (!startDateDay) {
      toast.error('La fecha es requerida.')
      return
    }

    setIsSubmitting(true)
    const combinedStartDate = `${startDateDay}T${startDateTime || '20:00'}:00`

    const eventData = {
      title,
      description,
      category_id: categoryId || null,
      venue_id: venueId || null,
      start_date: combinedStartDate,
      price_min: isFree ? 0 : priceMin,
      is_free: isFree,
      ticket_url: ticketUrl || null,
      image_url: imageUrl || null,
      ai_metadata: selectedEvent.ai_metadata, // Mantener trazabilidad
      slug: selectedEvent.slug
    }

    try {
      const res = await publishDraftEvent(selectedEvent.id, eventData)
      if (res.error) {
        toast.error(`Error al publicar: ${res.error}`)
      } else {
        toast.success('¡Evento publicado exitosamente!')
        
        // Quitar el evento publicado de la lista local
        const updatedEvents = events.filter((e) => e.id !== selectedEvent.id)
        setEvents(updatedEvents)
        
        // Seleccionar el siguiente
        setSelectedEventId(updatedEvents.length > 0 ? updatedEvents[0].id : null)
      }
    } catch (err: any) {
      toast.error(`Excepción publicando evento: ${err.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedEvent) return
    
    const confirmDelete = window.confirm('¿Estás seguro de que deseas eliminar este evento en borrador? Esta acción no se puede deshacer.')
    if (!confirmDelete) return

    setIsSubmitting(true)
    const flyerId = selectedEvent.ai_metadata?.flyer_id

    try {
      const res = await deleteDraftEvent(selectedEvent.id, flyerId)
      if (res.error) {
        toast.error(`Error al eliminar: ${res.error}`)
      } else {
        toast.success('Evento en borrador eliminado.')
        
        // Quitar el evento de la lista local
        const updatedEvents = events.filter((e) => e.id !== selectedEvent.id)
        setEvents(updatedEvents)
        
        // Seleccionar el siguiente
        setSelectedEventId(updatedEvents.length > 0 ? updatedEvents[0].id : null)
      }
    } catch (err: any) {
      toast.error(`Excepción eliminando evento: ${err.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-12 items-start">
      {/* Panel Izquierdo: Lista de Borradores (33% del ancho de pantalla) */}
      <div className="lg:col-span-4 space-y-4">
        <Card className="bg-card/45 backdrop-blur-md border-border/80 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Inbox className="size-5 text-primary shrink-0" />
              <span>Eventos en Borrador ({filteredEvents.length})</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Seleccioná un evento para auditar su extracción de IA y publicarlo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Sección de Procesamiento por Lotes de la IA */}
            <div className="bg-muted/40 border border-border/80 p-3 rounded-lg space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-primary" />
                  Cola Instagram:
                </span>
                <Badge variant="secondary" className="font-bold text-xs bg-primary/10 text-primary">
                  {pendingCount}
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                <select
                  value={batchSize}
                  onChange={(e) => setBatchSize(parseInt(e.target.value, 10))}
                  disabled={isProcessingAI || pendingCount === 0}
                  className="col-span-1 h-8 text-xs rounded-md border border-input bg-background/50 px-1 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer hover:bg-background/80"
                >
                  <option value={1}>1 u.</option>
                  <option value={3}>3 u.</option>
                  <option value={5}>5 u.</option>
                  <option value={10}>10 u.</option>
                </select>
                
                <Button
                  onClick={handleTriggerAI}
                  disabled={isProcessingAI || pendingCount === 0}
                  className="col-span-2 text-xs font-semibold h-8 bg-primary hover:bg-primary/95 text-primary-foreground flex items-center justify-center"
                >
                  {isProcessingAI ? (
                    <>
                      <Clock className="size-3.5 mr-1 animate-spin shrink-0" />
                      Analizando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-3.5 mr-1 shrink-0" />
                      Analizar
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="relative">
              <Input
                type="search"
                placeholder="Buscar borrador..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-background/60 pl-9"
              />
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            </div>

            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {filteredEvents.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground flex flex-col items-center gap-2">
                  <AlertCircle className="size-8 text-muted-foreground/50" />
                  <p className="text-sm">No hay borradores pendientes</p>
                </div>
              ) : (
                filteredEvents.map((item) => {
                  const isFallback = item.ai_metadata?.is_fallback === true
                  const hasError = item.ai_metadata?.error !== undefined

                  return (
                    <button
                      key={item.id}
                      onClick={() => setSelectedEventId(item.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-all flex gap-3 ${
                        selectedEventId === item.id
                          ? 'border-primary bg-primary/10 shadow-sm'
                          : 'border-border/60 hover:bg-muted/50 bg-background/40'
                      }`}
                    >
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.title}
                          className="size-14 object-cover rounded-md border border-border/80 shrink-0 bg-muted"
                        />
                      ) : (
                        <div className="size-14 rounded-md border border-border/80 shrink-0 bg-muted flex items-center justify-center text-muted-foreground">
                          <ImageIcon className="size-6" />
                        </div>
                      )}

                      <div className="min-w-0 flex-1 flex flex-col justify-between py-0.5">
                        <div>
                          <h4 className="text-sm font-semibold truncate text-foreground">
                            {item.title}
                          </h4>
                          <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                            <Calendar className="size-3 shrink-0" />
                            {item.start_date ? item.start_date.split('T')[0] : 'Sin fecha'}
                          </p>
                        </div>
                        <div className="flex gap-1.5 mt-1.5">
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 max-w-[100px] truncate">
                            {item.category?.name || 'Sin Categoría'}
                          </Badge>
                          {isFallback || hasError ? (
                            <Badge variant="destructive" className="text-[10px] py-0 px-1.5 h-4 bg-rose-500/20 text-rose-500 hover:bg-rose-500/30 border-rose-500/30">
                              Error / Fallback
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20">
                              <Sparkles className="size-2.5 mr-0.5 text-emerald-500 shrink-0" />
                              IA Exitosa
                            </Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Panel Derecho: Detalle, Edición y Publicación */}
      <div className="lg:col-span-8">
        {selectedEvent ? (
          <div className="space-y-6">
            {/* Header del Borrador Seleccionado */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-card/40 backdrop-blur-sm border border-border p-4 rounded-xl">
              <div>
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Auditar Borrador</span>
                <h2 className="text-xl font-bold text-foreground mt-0.5">{selectedEvent.title}</h2>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={isSubmitting}
                  className="bg-rose-600 hover:bg-rose-700 text-white"
                >
                  <Trash2 className="size-4 mr-2" />
                  Rechazar
                </Button>
                <Button
                  onClick={handlePublish}
                  disabled={isSubmitting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                >
                  {isSubmitting ? (
                    <Clock className="size-4 mr-2 animate-spin" />
                  ) : (
                    <Check className="size-4 mr-2" />
                  )}
                  Aprobar y Publicar
                </Button>
              </div>
            </div>

            {/* Grid Detalle */}
            <div className="grid gap-6 md:grid-cols-12">
              {/* Imagen del Flyer */}
              <div className="md:col-span-5 space-y-4">
                <Card className="bg-card/40 backdrop-blur-sm border-border overflow-hidden sticky top-20">
                  <CardHeader className="p-3 border-b border-border">
                    <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                      <ImageIcon className="size-4 text-primary" />
                      Flyer Original
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {imageUrl ? (
                      <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="relative group block overflow-hidden aspect-[3/4] bg-muted">
                        <img
                          src={imageUrl}
                          alt="Instagram Flyer"
                          className="w-full h-full object-contain group-hover:scale-105 transition-all duration-300"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center text-white text-xs font-semibold gap-1">
                          <ExternalLink className="size-4" />
                          Abrir original
                        </div>
                      </a>
                    ) : (
                      <div className="aspect-[3/4] bg-muted flex items-center justify-center text-muted-foreground flex-col gap-2 p-4 text-center">
                        <AlertCircle className="size-8 text-muted-foreground/40" />
                        <p className="text-xs">No hay imagen disponible</p>
                      </div>
                    )}
                    <div className="p-3 border-t border-border">
                      <Label htmlFor="imageUrl" className="text-xs text-muted-foreground font-medium">URL de la Imagen</Label>
                      <Input
                        id="imageUrl"
                        type="url"
                        value={imageUrl}
                        onChange={(e) => setImageUrl(e.target.value)}
                        className="mt-1 text-xs bg-background/50 h-8"
                        placeholder="https://..."
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Contenido / Edición */}
              <div className="md:col-span-7">
                <Tabs defaultValue="edit" className="w-full">
                  <TabsList className="grid w-full grid-cols-3 bg-muted/60 border border-border p-1 rounded-lg">
                    <TabsTrigger value="edit" className="rounded-md text-xs font-semibold">Editar Datos</TabsTrigger>
                    <TabsTrigger value="caption" className="rounded-md text-xs font-semibold">Texto de IG</TabsTrigger>
                    <TabsTrigger value="raw" className="rounded-md text-xs font-semibold">Auditoría IA</TabsTrigger>
                  </TabsList>
                  {/* Pestaña Editar */}
                  <TabsContent value="edit" className="mt-4">
                    <Card className="bg-card/40 backdrop-blur-sm border-border shadow-inner">
                      <CardContent className="pt-6 space-y-5">
                        {/* Título */}
                        <div className="space-y-1.5">
                          <Label htmlFor="title" className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                            Título del Evento
                          </Label>
                          <Input
                            id="title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="bg-background/50 text-sm font-semibold border-border/80 focus:border-primary"
                            placeholder="Ej: La Fiesta del Año"
                          />
                        </div>

                        {/* Fila: Lugar y Categoría */}
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label htmlFor="venue" className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                              <MapPin className="size-3.5 text-primary shrink-0" />
                              Lugar / Establecimiento
                            </Label>
                            <select
                              id="venue"
                              value={venueId}
                              onChange={(e) => setVenueId(e.target.value)}
                              className="flex h-9 w-full rounded-md border border-input bg-background/50 px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer hover:bg-background/80"
                            >
                              <option value="">-- Seleccionar Lugar --</option>
                              {venues.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-1.5">
                            <Label htmlFor="category" className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                              <Tag className="size-3.5 text-primary shrink-0" />
                              Categoría
                            </Label>
                            <select
                              id="category"
                              value={categoryId}
                              onChange={(e) => setCategoryId(e.target.value)}
                              className="flex h-9 w-full rounded-md border border-input bg-background/50 px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer hover:bg-background/80"
                            >
                              <option value="">-- Seleccionar Categoría --</option>
                              {categories.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Fila: Fecha y Hora */}
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label htmlFor="startDateDay" className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                              <Calendar className="size-3.5 text-primary shrink-0" />
                              Fecha del Evento
                            </Label>
                            <Input
                              id="startDateDay"
                              type="date"
                              value={startDateDay}
                              onChange={(e) => setStartDateDay(e.target.value)}
                              className="bg-background/50 border-border/80"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <Label htmlFor="startDateTime" className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                              <Clock className="size-3.5 text-primary shrink-0" />
                              Hora de Inicio
                            </Label>
                            <Input
                              id="startDateTime"
                              type="time"
                              value={startDateTime}
                              onChange={(e) => setStartDateTime(e.target.value)}
                              className="bg-background/50 border-border/80"
                            />
                          </div>
                        </div>

                        {/* Fila: Precio y Ticket */}
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label htmlFor="priceMin" className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                              Precio General ($)
                            </Label>
                            <div className="flex items-center gap-4">
                              <Input
                                id="priceMin"
                                type="number"
                                value={priceMin}
                                onChange={(e) => setPriceMin(parseInt(e.target.value, 10) || 0)}
                                disabled={isFree}
                                className="bg-background/50 flex-1 border-border/80"
                                min={0}
                              />
                              <div className="flex items-center gap-2 shrink-0">
                                <Switch
                                  id="isFree"
                                  checked={isFree}
                                  onCheckedChange={setIsFree}
                                />
                                <Label htmlFor="isFree" className="text-xs font-bold text-muted-foreground uppercase tracking-wider cursor-pointer">Gratis</Label>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <Label htmlFor="ticketUrl" className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                              <Ticket className="size-3.5 text-primary shrink-0" />
                              Enlace de Compra / Post IG
                            </Label>
                            <Input
                              id="ticketUrl"
                              type="url"
                              value={ticketUrl}
                              onChange={(e) => setTicketUrl(e.target.value)}
                              className="bg-background/50 border-border/80 text-xs"
                              placeholder="https://instagram.com/p/..."
                            />
                          </div>
                        </div>

                        {/* Descripción / Notas */}
                        <div className="space-y-1.5">
                          <Label htmlFor="description" className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                            Descripción / Notas del Evento
                          </Label>
                          <Textarea
                            id="description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="bg-background/50 min-h-[100px] text-sm border-border/80 leading-relaxed"
                            placeholder="Escribe notas, line-up, restricciones de edad..."
                          />
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Pestaña Caption de IG */}
                  <TabsContent value="caption" className="mt-4">
                    <Card className="bg-card/40 backdrop-blur-sm border-border">
                      <CardContent className="pt-6">
                        <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider block mb-2">Texto original del post de Instagram</Label>
                        <div className="bg-background/60 border border-border/80 p-4 rounded-lg text-sm leading-relaxed whitespace-pre-wrap max-h-[350px] overflow-y-auto">
                          {selectedEvent.ai_metadata?.original_caption || selectedEvent.description || 'El post no tenía texto descriptivo.'}
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Pestaña Auditoría de IA */}
                  <TabsContent value="raw" className="mt-4">
                    <Card className="bg-card/40 backdrop-blur-sm border-border">
                      <CardContent className="pt-6 space-y-4">
                        {/* Estado y Errores */}
                        {selectedEvent.ai_metadata?.error && (
                          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs p-3 rounded-lg flex items-start gap-2">
                            <AlertCircle className="size-4 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-semibold">Ocurrió un error en el pipeline de IA:</p>
                              <p className="mt-0.5">{selectedEvent.ai_metadata.error}</p>
                            </div>
                          </div>
                        )}

                        <div>
                          <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider block mb-2">Datos extraídos en JSON por Gemini</Label>
                          <pre className="bg-background/60 border border-border/80 p-4 rounded-lg text-xs leading-normal overflow-x-auto max-h-[300px] text-primary">
                            {JSON.stringify(selectedEvent.ai_metadata?.extracted_data || selectedEvent.ai_metadata?.extracted_json || { info: 'No hay datos estructurados (Fallback)' }, null, 2)}
                          </pre>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-[450px] border border-dashed border-border rounded-xl flex flex-col items-center justify-center text-muted-foreground gap-3 bg-card/20">
            <Sparkles className="size-12 text-muted-foreground/30 animate-pulse" />
            <div className="text-center">
              <h3 className="text-lg font-semibold text-foreground">No se ha seleccionado ningún borrador</h3>
              <p className="text-sm mt-1">Hacé clic en cualquiera de los borradores de la izquierda para comenzar a revisarlo.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
