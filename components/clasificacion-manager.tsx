"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { CheckCircle2, Plus, Tag, MapPin, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { categorizeEvent, createAlias, createCategory, deleteAlias } from "@/lib/admin-actions"
import { deferredRefresh } from "@/lib/deferred-refresh"
import type { Category, Venue } from "@/lib/types"

interface UncategorizedEvent {
  id: string
  title: string
  slug: string
  start_date: string
  scrape_source_key: string | null
  created_at: string
  venue: { id: string; name: string } | null
}

interface Alias {
  id: string
  alias: string
  target_type: "category" | "venue"
  target_id: string
  created_at: string
}

interface ClasificacionManagerProps {
  uncategorizedEvents: UncategorizedEvent[]
  categories: Category[]
  venues: Venue[]
  initialAliases: Alias[]
}

const SOURCE_LABELS: Record<string, string> = {
  norteticket: "Norteticket",
  paseshow: "Paseshow",
  tuentrada: "TuEntrada",
  ticketek: "Ticketek",
  passline: "Passline",
  eventbrite: "Eventbrite",
  alpogo: "AlPogo",
  independientes: "Independientes",
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/Argentina/Salta",
  })
}

export function ClasificacionManager({
  uncategorizedEvents: initialEvents,
  categories,
  venues,
  initialAliases,
}: ClasificacionManagerProps) {
  const router = useRouter()
  const [events, setEvents] = useState<UncategorizedEvent[]>(initialEvents)
  const [aliases, setAliases] = useState<Alias[]>(initialAliases)
  const [localCategories, setLocalCategories] = useState<Category[]>(categories)

  // — Clasificar estado por fila —
  const [classifyingId, setClassifyingId] = useState<string | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState("")
  const [isPendingClassify, startClassifyTransition] = useTransition()
  const [newCategoryName, setNewCategoryName] = useState("")
  const [categoryError, setCategoryError] = useState<string | null>(null)
  const [isPendingCreateCategory, startCreateCategoryTransition] = useTransition()

  // — Dialog propuesta alias —
  const [aliasDialogOpen, setAliasDialogOpen] = useState(false)
  const [proposedAlias, setProposedAlias] = useState("")
  const [proposedCategoryId, setProposedCategoryId] = useState("")
  const [isPendingAlias, startAliasTransition] = useTransition()

  // — Crear alias (tab reglas) —
  const [aliasTargetType, setAliasTargetType] = useState<"category" | "venue">("category")
  const [aliasTargetId, setAliasTargetId] = useState("")
  const [aliasValue, setAliasValue] = useState("")
  const [aliasError, setAliasError] = useState<string | null>(null)
  const [isPendingCreateAlias, startCreateAliasTransition] = useTransition()

  // ——— Handlers clasificación ———

  const handleStartClassify = (eventId: string) => {
    setClassifyingId(eventId)
    setSelectedCategoryId("")
  }

  const handleCancelClassify = () => {
    setClassifyingId(null)
    setSelectedCategoryId("")
  }

  const handleConfirmClassify = (event: UncategorizedEvent) => {
    if (!selectedCategoryId) return

    startClassifyTransition(async () => {
      const result = await categorizeEvent(event.id, selectedCategoryId)
      if (!result.error) {
        setEvents((prev) => prev.filter((e) => e.id !== event.id))
        setClassifyingId(null)

        // Sugerir alias basado en el venue o en las primeras palabras del título
        const venueName = event.venue?.name?.trim() ?? ""
        const titleKeyword = event.title
          .split(/\s+/)
          .slice(0, 2)
          .join(" ")
          .toLowerCase()
        setProposedAlias(venueName || titleKeyword)
        setProposedCategoryId(selectedCategoryId)
        setAliasDialogOpen(true)
        deferredRefresh(router.refresh)
      }
    })
  }

  // ——— Handlers alias dialog ———

  const handleConfirmAlias = () => {
    if (!proposedAlias || !proposedCategoryId) {
      setAliasDialogOpen(false)
      return
    }

    startAliasTransition(async () => {
      const formData = new FormData()
      formData.append("alias", proposedAlias)
      formData.append("target_type", "category")
      formData.append("target_id", proposedCategoryId)

      const result = await createAlias(formData)
      if (!result.error) {
        setAliases((prev) => [
          {
            id: crypto.randomUUID(),
            alias: proposedAlias.toLowerCase().trim(),
            target_type: "category",
            target_id: proposedCategoryId,
            created_at: new Date().toISOString(),
          },
          ...prev,
        ])
        deferredRefresh(router.refresh)
      }
      setAliasDialogOpen(false)
    })
  }

  // ——— Handlers tab reglas ———

  const handleCreateAlias = (e: React.FormEvent) => {
    e.preventDefault()
    setAliasError(null)

    const formData = new FormData()
    formData.append("alias", aliasValue)
    formData.append("target_type", aliasTargetType)
    formData.append("target_id", aliasTargetId)

    startCreateAliasTransition(async () => {
      const result = await createAlias(formData)
      if (result.error) {
        setAliasError(result.error)
      } else {
        setAliases((prev) => [
          {
            id: crypto.randomUUID(),
            alias: aliasValue.toLowerCase().trim(),
            target_type: aliasTargetType,
            target_id: aliasTargetId,
            created_at: new Date().toISOString(),
          },
          ...prev,
        ])
        setAliasValue("")
        setAliasTargetId("")
        deferredRefresh(router.refresh)
      }
    })
  }

  const handleDeleteAlias = (id: string) => {
    startCreateAliasTransition(async () => {
      const result = await deleteAlias(id)
      if (!result.error) {
        setAliases((prev) => prev.filter((a) => a.id !== id))
        deferredRefresh(router.refresh)
      }
    })
  }

  const handleCreateCategory = () => {
    const name = newCategoryName.trim()
    if (!name) return
    setCategoryError(null)

    startCreateCategoryTransition(async () => {
      const result = await createCategory(name)
      if (result.error || !result.category) {
        setCategoryError(result.error ?? 'No se pudo crear la categoría')
        return
      }

      setLocalCategories((prev) => {
        if (prev.some((category) => category.id === result.category.id)) return prev
        return [...prev, result.category]
      })

      setSelectedCategoryId(result.category.id)
      setNewCategoryName("")
      deferredRefresh(router.refresh)
    })
  }

  const getAliasTargetName = (alias: Alias) => {
    if (alias.target_type === "category") {
      return localCategories.find((c) => c.id === alias.target_id)?.name ?? "Desconocido"
    }
    return venues.find((v) => v.id === alias.target_id)?.name ?? "Desconocido"
  }

  // ——— Render ———

  return (
    <>
      <Tabs defaultValue="sin-categorizar">
        <TabsList className="mb-6">
          <TabsTrigger value="sin-categorizar" className="gap-2">
            Sin categorizar
            {events.length > 0 && (
              <Badge
                variant="destructive"
                className="flex size-5 items-center justify-center rounded-full p-0 text-[11px]"
              >
                {events.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="reglas" className="gap-2">
            Reglas de clasificación
            <Badge
              variant="secondary"
              className="flex size-5 items-center justify-center rounded-full p-0 text-[11px]"
            >
              {aliases.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* ——— Tab: Sin categorizar ——— */}
        <TabsContent value="sin-categorizar">
          {events.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
              <CheckCircle2 className="mb-3 size-10 text-green-500" />
              <p className="text-lg font-medium">¡Todo clasificado!</p>
              <p className="mt-1 text-sm text-muted-foreground">
                No hay eventos pendientes de clasificación.
              </p>
            </div>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Eventos sin categorizar</CardTitle>
                <CardDescription>
                  {events.length} evento{events.length !== 1 ? "s" : ""} importado
                  {events.length !== 1 ? "s" : ""} sin categoría asignada. Clasificá cada uno
                  para que aparezca en los filtros.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4 rounded-md border bg-muted/30 p-3">
                  <p className="mb-2 text-xs text-muted-foreground">Crear nueva categoría</p>
                  <div className="flex items-center gap-2">
                    <Input
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="Ej: Automovilismo"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleCreateCategory}
                      disabled={isPendingCreateCategory || !newCategoryName.trim()}
                    >
                      {isPendingCreateCategory ? "Creando..." : "Crear"}
                    </Button>
                  </div>
                  {categoryError && <p className="mt-2 text-xs text-destructive">{categoryError}</p>}
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Evento</TableHead>
                      <TableHead>Venue</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Fuente</TableHead>
                      <TableHead className="text-right">Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell className="max-w-[220px] truncate font-medium">
                          {event.title}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {event.venue?.name ?? "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatDate(event.start_date)}
                        </TableCell>
                        <TableCell>
                          {event.scrape_source_key && (
                            <Badge variant="outline" className="text-xs">
                              {SOURCE_LABELS[event.scrape_source_key] ?? event.scrape_source_key}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {classifyingId === event.id ? (
                            <div className="flex items-center justify-end gap-2">
                              <Select
                                value={selectedCategoryId}
                                onValueChange={setSelectedCategoryId}
                              >
                                <SelectTrigger className="w-[150px]">
                                  <SelectValue placeholder="Categoría..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {localCategories.map((cat) => (
                                    <SelectItem key={cat.id} value={cat.id}>
                                      {cat.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                size="sm"
                                disabled={!selectedCategoryId || isPendingClassify}
                                onClick={() => handleConfirmClassify(event)}
                              >
                                {isPendingClassify ? "..." : "Guardar"}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={handleCancelClassify}
                              >
                                Cancelar
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleStartClassify(event.id)}
                            >
                              Clasificar
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ——— Tab: Reglas de clasificación ——— */}
        <TabsContent value="reglas">
          <div className="grid gap-8 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="size-5" />
                  Crear Regla de Clasificación
                </CardTitle>
                <CardDescription>
                  Los aliases permiten que el scraper clasifique automáticamente eventos
                  por nombre de venue o palabras clave del título.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateAlias} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Select
                      value={aliasTargetType}
                      onValueChange={(v) => {
                        setAliasTargetType(v as "category" | "venue")
                        setAliasTargetId("")
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="category">
                          <span className="flex items-center gap-2">
                            <Tag className="size-4" />
                            Categoría
                          </span>
                        </SelectItem>
                        <SelectItem value="venue">
                          <span className="flex items-center gap-2">
                            <MapPin className="size-4" />
                            Venue
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>{aliasTargetType === "category" ? "Categoría" : "Venue"}</Label>
                    <Select value={aliasTargetId} onValueChange={setAliasTargetId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar..." />
                      </SelectTrigger>
                      <SelectContent>
                        {aliasTargetType === "category"
                          ? localCategories.map((cat) => (
                              <SelectItem key={cat.id} value={cat.id}>
                                {cat.name}
                              </SelectItem>
                            ))
                          : venues.map((venue) => (
                              <SelectItem key={venue.id} value={venue.id}>
                                {venue.name}
                              </SelectItem>
                            ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Alias (palabra clave)</Label>
                    <Input
                      value={aliasValue}
                      onChange={(e) => setAliasValue(e.target.value)}
                      placeholder="ej: peña, teatro, disco..."
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Se guardará en minúsculas. El scraper buscará este texto en el título y
                      venue de futuros eventos.
                    </p>
                  </div>

                  {aliasError && <p className="text-sm text-destructive">{aliasError}</p>}

                  <Button
                    type="submit"
                    disabled={isPendingCreateAlias || !aliasTargetId || !aliasValue}
                  >
                    {isPendingCreateAlias ? "Guardando..." : "Crear regla"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Reglas existentes</CardTitle>
                <CardDescription>
                  {aliases.length} regla{aliases.length !== 1 ? "s" : ""} configurada
                  {aliases.length !== 1 ? "s" : ""}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {aliases.length === 0 ? (
                  <p className="py-8 text-center text-muted-foreground">
                    No hay reglas configuradas
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Alias</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Destino</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {aliases.map((alias) => (
                        <TableRow key={alias.id}>
                          <TableCell className="font-mono text-sm">{alias.alias}</TableCell>
                          <TableCell>
                            <Badge
                              variant={alias.target_type === "category" ? "default" : "secondary"}
                            >
                              {alias.target_type === "category" ? (
                                <Tag className="mr-1 size-3" />
                              ) : (
                                <MapPin className="mr-1 size-3" />
                              )}
                              {alias.target_type === "category" ? "Categoría" : "Venue"}
                            </Badge>
                          </TableCell>
                          <TableCell>{getAliasTargetName(alias)}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteAlias(alias.id)}
                              disabled={isPendingCreateAlias}
                            >
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ——— Dialog: propuesta de alias post-clasificación ——— */}
      <Dialog open={aliasDialogOpen} onOpenChange={setAliasDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Crear regla de clasificación?</DialogTitle>
            <DialogDescription>
              Podés guardar una regla para que el scraper clasifique automáticamente eventos
              similares en el futuro. Podés editar el texto antes de confirmar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Texto del alias (palabra clave)</Label>
              <Input
                value={proposedAlias}
                onChange={(e) => setProposedAlias(e.target.value)}
                placeholder="ej: peña, teatro, disco..."
              />
              <p className="text-xs text-muted-foreground">
                El scraper buscará este texto en el título o venue de futuros eventos.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Categoría destino</Label>
              <Select value={proposedCategoryId} onValueChange={setProposedCategoryId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {localCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAliasDialogOpen(false)}>
              Saltar
            </Button>
            <Button
              onClick={handleConfirmAlias}
              disabled={!proposedAlias || !proposedCategoryId || isPendingAlias}
            >
              {isPendingAlias ? "Guardando..." : "Crear regla"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
