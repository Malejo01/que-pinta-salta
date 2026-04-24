"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Upload } from "lucide-react"
import { EventCategory, EventVibe, categoryLabels, vibeLabels } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Navbar } from "@/components/navbar"
import { MobileNav } from "@/components/mobile-nav"

const categories = Object.entries(categoryLabels) as [EventCategory, string][]
const vibes = Object.entries(vibeLabels) as [EventVibe, string][]

export default function NuevoEventoPage() {
  const router = useRouter()
  const [noiseLevel, setNoiseLevel] = useState([50])
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    
    // Simular envío
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // En una implementación real, aquí se enviarían los datos al servidor
    router.push("/")
  }

  return (
    <div className="min-h-screen bg-background pb-20 sm:pb-0">
      <Navbar />
      
      <main className="container mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6">
          <Button variant="ghost" asChild className="mb-4">
            <Link href="/">
              <ArrowLeft className="mr-2 size-4" />
              Volver
            </Link>
          </Button>
          <h1 className="text-3xl font-bold text-foreground">Agregar nuevo evento</h1>
          <p className="mt-2 text-muted-foreground">
            Completa el formulario para publicar tu evento en Salta
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title">Titulo del evento *</Label>
            <Input 
              id="title" 
              name="title" 
              placeholder="Ej: Pena Folklorica en Balcarce" 
              required 
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="venue">Lugar *</Label>
            <Input 
              id="venue" 
              name="venue" 
              placeholder="Ej: La Casona del Molino" 
              required 
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Direccion *</Label>
            <Input 
              id="address" 
              name="address" 
              placeholder="Ej: Calle Balcarce 980, Salta" 
              required 
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="date">Fecha *</Label>
              <Input 
                id="date" 
                name="date" 
                type="date" 
                required 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="time">Hora *</Label>
              <Input 
                id="time" 
                name="time" 
                type="time" 
                required 
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="category">Categoria *</Label>
              <Select name="category" required>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar categoria" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Precio (ARS)</Label>
              <Input 
                id="price" 
                name="price" 
                type="number" 
                min="0"
                placeholder="0 para gratis" 
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="vibe">Ambiente *</Label>
            <Select name="vibe" required>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar ambiente" />
              </SelectTrigger>
              <SelectContent>
                {vibes.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Nivel de ruido</Label>
              <span className="text-sm text-muted-foreground">{noiseLevel[0]}%</span>
            </div>
            <Slider
              value={noiseLevel}
              onValueChange={setNoiseLevel}
              max={100}
              step={5}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Tranquilo</span>
              <span>Moderado</span>
              <span>Muy ruidoso</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descripcion *</Label>
            <Textarea 
              id="description" 
              name="description" 
              placeholder="Describe tu evento..." 
              rows={4}
              required 
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ticketUrl">Link de tickets (opcional)</Label>
            <Input 
              id="ticketUrl" 
              name="ticketUrl" 
              type="url"
              placeholder="https://..." 
            />
          </div>

          <div className="space-y-2">
            <Label>Imagen del evento</Label>
            <div className="flex h-32 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border transition-colors hover:border-primary/50 hover:bg-muted/50">
              <div className="text-center">
                <Upload className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">
                  Click para subir imagen
                </p>
                <p className="text-xs text-muted-foreground">
                  PNG, JPG hasta 5MB
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              className="flex-1"
              onClick={() => router.back()}
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Publicando..." : "Publicar evento"}
            </Button>
          </div>
        </form>
      </main>
      
      <MobileNav />
    </div>
  )
}
