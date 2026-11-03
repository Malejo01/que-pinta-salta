"use client"

import { useState, useRef } from "react"
import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Loader2, ImageIcon } from "lucide-react"
import { createEvent, uploadFlyer, updateUserEvent } from "@/lib/actions"
import { formatSaltaInputValue } from "@/lib/date-format"
import type { Category, Venue } from "@/lib/types"
import { langDeCategoria, textosDe } from "@/lib/i18n"
import type { Idioma } from "@/lib/i18n/idiomas"
import { hrefLangDestino, rutaEn } from "@/lib/i18n/rutas"

interface EventFormProps {
  categories: Category[]
  venues: Venue[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- datos iniciales de evento desde consulta dinámica
  initialData?: any
  cloneId?: string
  editId?: string
  /**
   * Q6-2: el idioma de la página (/nuevo-evento o /en/nuevo-evento). Por
   * defecto, castellano. En inglés, las categorías ya vienen con su nombre
   * traducido (`localizarCategorias`); los lugares, con el de la base.
   */
  idioma?: Idioma
}

export function EventForm({ categories, venues, initialData, cloneId, editId, idioma = "es" }: EventFormProps) {
  const t = textosDe(idioma).formularioEvento
  const langContenido = idioma === "en" ? "es-AR" : undefined
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | null>(initialData?.image_url || null)
  const [isFree, setIsFree] = useState(initialData?.is_free || false)
  const [error, setError] = useState<string | null>(null)

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    setError(null)

    const formData = new FormData()
    formData.append("file", file)

    const result = await uploadFlyer(formData)

    if (result.error) {
      // En inglés, el error de la acción traducido (los textos de lib/actions.ts).
      setError(t.error(result.error))
    } else if (result.url) {
      setImageUrl(result.url)
    }

    setIsUploading(false)
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    const formData = new FormData(e.currentTarget)
    formData.set("isFree", isFree.toString())
    if (imageUrl) {
      formData.set("imageUrl", imageUrl)
    }

    const result = editId 
      ? await updateUserEvent(formData)
      : await createEvent(formData)

    if (result?.error) {
      setError(t.error(result.error))
      setIsSubmitting(false)
    }
  }
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center gap-4 px-4">
          <Button variant="ghost" size="icon" asChild>
            {/* Q6-2: el botón solo tenía el ícono; ahora tiene nombre accesible. */}
            <Link href={rutaEn(idioma, "/")} aria-label={t.volver}>
              <ArrowLeft className="size-5" aria-hidden="true" />
            </Link>
          </Button>
          <h1 className="text-xl font-bold">{editId ? t.tituloEditar : t.tituloCrear}</h1>
        </div>
      </header>

      <main id="contenido" tabIndex={-1} className="container mx-auto max-w-2xl px-4 py-8 focus:outline-none">
        <form onSubmit={handleSubmit} className="space-y-8">
          {cloneId && (
            <input type="hidden" name="cloneId" value={cloneId} />
          )}
          {editId && (
            <input type="hidden" name="editId" value={editId} />
          )}
          {/* Q6-2: el error se anuncia (antes aparecía sin aviso para el lector de pantalla). */}
          {error && (
            <div role="alert" className="rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Image Upload */}
          <Card>
            <CardHeader>
              <CardTitle>{t.flyer}</CardTitle>
              <CardDescription id="flyer-ayuda">{t.flyerBajada}</CardDescription>
            </CardHeader>
            <CardContent>
              {/* Q6-2: un botón (antes un div con onClick, que no se alcanzaba con el teclado). */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label={isUploading ? t.flyerSubiendo : t.flyerSubir}
                aria-describedby="flyer-ayuda"
                aria-busy={isUploading || undefined}
                className="relative flex aspect-[2/3] w-full max-w-xs cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border bg-muted/50 transition-colors hover:border-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {imageUrl ? (
                  <Image
                    src={imageUrl}
                    alt={t.flyerVistaPrevia}
                    fill
                    className="object-cover"
                  />
                ) : isUploading ? (
                  <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden="true" />
                ) : (
                  <>
                    <ImageIcon className="mb-2 size-8 text-muted-foreground" aria-hidden="true" />
                    <span className="text-sm text-muted-foreground">{t.flyerSubir}</span>
                  </>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleImageUpload}
                tabIndex={-1}
                aria-hidden="true"
                className="hidden"
              />
            </CardContent>
          </Card>

          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle>{t.infoBasica}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">{t.tituloEvento} *</Label>
                <Input
                  id="title"
                  name="title"
                  placeholder={t.tituloPlaceholder}
                  defaultValue={initialData?.title}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="shortDescription">{t.descripcionCorta}</Label>
                <Input
                  id="shortDescription"
                  name="shortDescription"
                  placeholder={t.descripcionCortaPlaceholder}
                  defaultValue={initialData?.short_description}
                  maxLength={500}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t.descripcionCompleta}</Label>
                <Textarea
                  id="description"
                  name="description"
                  placeholder={t.descripcionCompletaPlaceholder}
                  defaultValue={initialData?.description}
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="categoryId">{t.categoria} *</Label>
                <Select name="categoryId" defaultValue={initialData?.category_id} required>
                  {/* Q6-2: el id asocia el <Label> con el desplegable. */}
                  <SelectTrigger id="categoryId">
                    <SelectValue placeholder={t.categoriaPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id} lang={langDeCategoria(idioma, cat.slug)}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="venueId">{t.lugar}</Label>
                <Select name="venueId" defaultValue={initialData?.venue_id || undefined}>
                  <SelectTrigger id="venueId">
                    <SelectValue placeholder={t.lugarPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {venues.map((venue) => (
                      <SelectItem key={venue.id} value={venue.id} lang={langContenido}>
                        {venue.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Date & Time */}
          <Card>
            <CardHeader>
              <CardTitle>{t.fechaYHora}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="startDate">{t.inicio} *</Label>
                  <Input
                    id="startDate"
                    name="startDate"
                    type="datetime-local"
                    defaultValue={initialData?.start_date ? formatSaltaInputValue(initialData.start_date) : undefined}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">{t.fin}</Label>
                  <Input
                    id="endDate"
                    name="endDate"
                    type="datetime-local"
                    defaultValue={initialData?.end_date ? formatSaltaInputValue(initialData.end_date) : undefined}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Price */}
          <Card>
            <CardHeader>
              <CardTitle>{t.precio}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="isFree">{t.gratuito}</Label>
                <Switch
                  id="isFree"
                  checked={isFree}
                  onCheckedChange={setIsFree}
                />
              </div>

              {!isFree && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="priceMin">{t.precioMinimo}</Label>
                    <Input
                      id="priceMin"
                      name="priceMin"
                      type="number"
                      min="0"
                      placeholder="1000"
                      defaultValue={initialData?.price_min}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="priceMax">{t.precioMaximo}</Label>
                    <Input
                      id="priceMax"
                      name="priceMax"
                      type="number"
                      min="0"
                      placeholder="3000"
                      defaultValue={initialData?.price_max}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="ticketUrl">{t.linkEntradas}</Label>
                <Input
                  id="ticketUrl"
                  name="ticketUrl"
                  type="url"
                  placeholder="https://..."
                  defaultValue={initialData?.ticket_url}
                />
              </div>
            </CardContent>
          </Card>

          {/* Atmosphere */}
          <Card>
            <CardHeader>
              <CardTitle>{t.ambiente}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="ageRestriction">{t.restriccionEdad}</Label>
                <Select name="ageRestriction" defaultValue={initialData?.age_restriction?.toString() || "0"}>
                  <SelectTrigger id="ageRestriction">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">{t.todasLasEdades}</SelectItem>
                    <SelectItem value="16">+16</SelectItem>
                    <SelectItem value="18">+18</SelectItem>
                    <SelectItem value="21">+21</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex gap-4">
            <Button type="button" variant="outline" className="flex-1" asChild>
              <Link href={rutaEn(idioma, "/mis-eventos")} hrefLang={hrefLangDestino(idioma, "/mis-eventos")}>{t.cancelar}</Link>
            </Button>
            <Button type="submit" className="flex-1" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  {editId ? t.actualizando : t.creando}
                </>
              ) : (
                editId ? t.actualizar : t.crear
              )}
            </Button>
          </div>
        </form>
      </main>
    </div>
  )
}
