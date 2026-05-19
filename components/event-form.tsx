"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Upload, Loader2, ImageIcon, Volume2 } from "lucide-react"
import { createEvent, uploadFlyer } from "@/lib/actions"
import type { Category, Venue } from "@/lib/types"

interface EventFormProps {
  categories: Category[]
  venues: Venue[]
}

export function EventForm({ categories, venues }: EventFormProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [isFree, setIsFree] = useState(false)
  const [noiseLevel, setNoiseLevel] = useState([3])
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
      setError(result.error)
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
    formData.set("noiseLevel", noiseLevel[0].toString())
    if (imageUrl) {
      formData.set("imageUrl", imageUrl)
    }

    const result = await createEvent(formData)

    if (result?.error) {
      setError(result.error)
      setIsSubmitting(false)
    }
  }

  const noiseLevelLabels = ["Silencioso", "Tranquilo", "Moderado", "Animado", "Muy ruidoso"]

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center gap-4 px-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/">
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
          <h1 className="text-xl font-bold">Crear Nuevo Evento</h1>
        </div>
      </header>

      <main className="container mx-auto max-w-2xl px-4 py-8">
        <form onSubmit={handleSubmit} className="space-y-8">
          {error && (
            <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Image Upload */}
          <Card>
            <CardHeader>
              <CardTitle>Flyer del Evento</CardTitle>
              <CardDescription>Sube una imagen para tu evento (máx. 5MB)</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="relative flex aspect-[2/3] max-w-xs cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border bg-muted/50 transition-colors hover:border-primary hover:bg-muted"
              >
                {imageUrl ? (
                  <Image
                    src={imageUrl}
                    alt="Preview"
                    fill
                    className="object-cover"
                  />
                ) : isUploading ? (
                  <Loader2 className="size-8 animate-spin text-muted-foreground" />
                ) : (
                  <>
                    <ImageIcon className="mb-2 size-8 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Click para subir imagen</span>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleImageUpload}
                className="hidden"
              />
            </CardContent>
          </Card>

          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle>Información Básica</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Título del Evento *</Label>
                <Input
                  id="title"
                  name="title"
                  placeholder="Ej: Peña Folklorica en La Casona"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="shortDescription">Descripción Corta</Label>
                <Input
                  id="shortDescription"
                  name="shortDescription"
                  placeholder="Una línea describiendo el evento"
                  maxLength={500}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descripción Completa</Label>
                <Textarea
                  id="description"
                  name="description"
                  placeholder="Describe el evento en detalle..."
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="categoryId">Categoría *</Label>
                <Select name="categoryId" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="venueId">Lugar</Label>
                <Select name="venueId">
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un lugar (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {venues.map((venue) => (
                      <SelectItem key={venue.id} value={venue.id}>
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
              <CardTitle>Fecha y Hora</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Inicio *</Label>
                  <Input
                    id="startDate"
                    name="startDate"
                    type="datetime-local"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">Fin (opcional)</Label>
                  <Input
                    id="endDate"
                    name="endDate"
                    type="datetime-local"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Price */}
          <Card>
            <CardHeader>
              <CardTitle>Precio</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="isFree">Evento gratuito</Label>
                <Switch
                  id="isFree"
                  checked={isFree}
                  onCheckedChange={setIsFree}
                />
              </div>

              {!isFree && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="priceMin">Precio Mínimo (ARS)</Label>
                    <Input
                      id="priceMin"
                      name="priceMin"
                      type="number"
                      min="0"
                      placeholder="1000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="priceMax">Precio Máximo (ARS)</Label>
                    <Input
                      id="priceMax"
                      name="priceMax"
                      type="number"
                      min="0"
                      placeholder="3000"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="ticketUrl">Link de Entradas (opcional)</Label>
                <Input
                  id="ticketUrl"
                  name="ticketUrl"
                  type="url"
                  placeholder="https://..."
                />
              </div>
            </CardContent>
          </Card>

          {/* Atmosphere */}
          <Card>
            <CardHeader>
              <CardTitle>Ambiente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Nivel de Ruido</Label>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Volume2 className="size-4" />
                    <span>{noiseLevelLabels[noiseLevel[0] - 1]}</span>
                  </div>
                </div>
                <Slider
                  value={noiseLevel}
                  onValueChange={setNoiseLevel}
                  min={1}
                  max={5}
                  step={1}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ageRestriction">Restricción de Edad</Label>
                <Select name="ageRestriction" defaultValue="0">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Todas las edades</SelectItem>
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
              <Link href="/">Cancelar</Link>
            </Button>
            <Button type="submit" className="flex-1" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Creando...
                </>
              ) : (
                "Crear Evento"
              )}
            </Button>
          </div>
        </form>
      </main>
    </div>
  )
}
