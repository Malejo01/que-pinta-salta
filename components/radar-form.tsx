"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Search, X, Check, Mail, Settings, Radio, Instagram, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { updateRadarSettings, triggerTestRadarEmail, type EmailFrequency, type RadarSettingsData } from "@/lib/actions/radar"
import type { Category, Venue } from "@/lib/types"
import { cn } from "@/lib/utils"

interface RadarFormProps {
  initialSettings: RadarSettingsData | null
  categories: Category[]
  venues: Venue[]
  instagramAccounts: any[]
}

export function RadarForm({ initialSettings, categories, venues, instagramAccounts }: RadarFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  
  // Estados de formulario
  const [frequency, setFrequency] = useState<EmailFrequency>(
    initialSettings?.email_frequency || "weekly"
  )
  const [email, setEmail] = useState(initialSettings?.email_target || "")
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(
    initialSettings?.categoryIds || []
  )
  const [selectedVenueIds, setSelectedVenueIds] = useState<string[]>(
    initialSettings?.venueIds || []
  )
  const [selectedInstagramIds, setSelectedInstagramIds] = useState<string[]>(
    initialSettings?.instagramAccountIds || []
  )

  const [isPending, setIsPending] = useState(false)
  const [isSendingTest, setIsSendingTest] = useState(false)

  // Autocompletado de Locales y Cuentas (Radar Targets)
  const [searchQuery, setSearchQuery] = useState("")
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const searchContainerRef = useRef<HTMLDivElement>(null)

  // Cerrar buscador al hacer click afuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setIsSearchOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Combinar locales y organizadores en un solo array de búsqueda unificado
  const searchCandidates = useMemo(() => {
    const venueCandidates = venues.map(v => ({
      id: v.id,
      name: v.name,
      subtitle: v.address || "Local físico",
      type: "venue" as const
    }))

    const instagramCandidates = instagramAccounts.map(ig => ({
      id: ig.id,
      name: ig.display_name,
      subtitle: `@${ig.username} (Organizador / Boliche)`,
      type: "instagram" as const
    }))

    return [...venueCandidates, ...instagramCandidates]
  }, [venues, instagramAccounts])

  // Filtrar los candidatos según la búsqueda local
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return []
    const query = searchQuery.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    
    return searchCandidates
      .filter(item => {
        // Excluir elementos ya seleccionados
        if (item.type === "venue") {
          return !selectedVenueIds.includes(item.id)
        } else {
          return !selectedInstagramIds.includes(item.id)
        }
      })
      .filter(item => {
        const nameClean = item.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        const subClean = item.subtitle.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        return nameClean.includes(query) || subClean.includes(query)
      })
      .slice(0, 6) // limitar a 6 sugerencias
  }, [searchQuery, searchCandidates, selectedVenueIds, selectedInstagramIds])

  // Mapear IDs de vuelta a objetos completos
  const selectedVenues = useMemo(() => {
    return venues.filter(v => selectedVenueIds.includes(v.id))
  }, [selectedVenueIds, venues])

  const selectedInstagrams = useMemo(() => {
    return instagramAccounts.filter(ig => selectedInstagramIds.includes(ig.id))
  }, [selectedInstagramIds, instagramAccounts])

  // Agregar elemento (local o instagram)
  const handleSelectItem = (item: typeof searchCandidates[0]) => {
    if (item.type === "venue") {
      setSelectedVenueIds(prev => [...prev, item.id])
    } else {
      setSelectedInstagramIds(prev => [...prev, item.id])
    }
    setSearchQuery("")
    setIsSearchOpen(false)
  }

  // Quitar local
  const handleRemoveVenue = (id: string) => {
    setSelectedVenueIds(prev => prev.filter(vId => vId !== id))
  }

  // Quitar Instagram
  const handleRemoveInstagram = (id: string) => {
    setSelectedInstagramIds(prev => prev.filter(igId => igId !== id))
  }

  // Toggle Categorías
  const handleToggleCategory = (id: string) => {
    setSelectedCategoryIds(prev =>
      prev.includes(id) ? prev.filter(cId => cId !== id) : [...prev, id]
    )
  }

  // Guardar configuración
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !email.includes("@")) {
      toast({
        title: "Correo no válido",
        description: "Por favor introduce una dirección de correo válida.",
        variant: "destructive",
      })
      return
    }

    setIsPending(true)
    try {
      const result = await updateRadarSettings({
        email_frequency: frequency,
        email_target: email,
        categoryIds: selectedCategoryIds,
        venueIds: selectedVenueIds,
        instagramAccountIds: selectedInstagramIds,
      })

      if (result.error) {
        toast({
          title: "Error al guardar",
          description: result.message || "Ocurrió un error inesperado.",
          variant: "destructive",
        })
        return
      }

      toast({
        title: "¡Configuración guardada!",
        description: "Tu Radar Salteño se ha actualizado con tus preferencias.",
      })
      router.refresh()
    } catch (err) {
      toast({
        title: "Error de conexión",
        description: "No se pudo comunicar con el servidor.",
        variant: "destructive",
      })
    } finally {
      setIsPending(false)
    }
  }

  // Acción para enviar correo de prueba
  const handleSendTestEmail = async () => {
    setIsSendingTest(true)
    try {
      const result = await triggerTestRadarEmail()
      if (result.success) {
        toast({
          title: "¡Correo enviado!",
          description: result.message || `Se envió tu radar con ${result.count} novedades a tu email.`,
        })
      } else {
        toast({
          title: "Prueba de envío",
          description: result.message || "No se pudo enviar el correo de prueba.",
          variant: "destructive",
        })
      }
    } catch (err) {
      toast({
        title: "Error de conexión",
        description: "No se pudo iniciar la prueba de correo.",
        variant: "destructive",
      })
    } finally {
      setIsSendingTest(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-3xl mx-auto">
      {/* Sección 1: Frecuencia y Correo */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6 space-y-6 backdrop-blur-xs">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Settings className="size-5 text-primary" />
          Frecuencia y Destinatario
        </h2>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="radar-frequency">¿Cada cuánto quieres recibir novedades?</Label>
            <Select 
              value={frequency} 
              onValueChange={(val) => setFrequency(val as EmailFrequency)}
            >
              <SelectTrigger id="radar-frequency" className="w-full bg-zinc-950 border-zinc-800">
                <SelectValue placeholder="Selecciona frecuencia" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-950 border-zinc-800">
                <SelectItem value="weekly">Semanalmente (Todos los Jueves 18:00hs)</SelectItem>
                <SelectItem value="biweekly">Cada 2 semanas (Quincenal)</SelectItem>
                <SelectItem value="monthly">Mensualmente</SelectItem>
                <SelectItem value="disabled">Desactivado (Pausar alertas)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="radar-email">Dirección de correo electrónico</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
              <Input
                id="radar-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                className="pl-10 bg-zinc-950 border-zinc-800"
              />
            </div>
            <p className="text-[11px] text-zinc-500 italic">
              * (En fase beta, los correos de prueba solo se enviarán a tu casilla asociada).
            </p>
          </div>
        </div>
      </div>

      {/* Sección 2: Categorías */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6 space-y-6 backdrop-blur-xs">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-1">
            <Radio className="size-5 text-primary animate-pulse" />
            Categorías que te interesan
          </h2>
          <p className="text-xs text-muted-foreground">
            Recibirás alertas de todos los eventos que se clasifiquen en las categorías seleccionadas.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {categories.map((category) => {
            const isSelected = selectedCategoryIds.includes(category.id)
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => handleToggleCategory(category.id)}
                className={cn(
                  "flex items-center justify-between p-3.5 rounded-xl border text-sm font-semibold transition-all hover:scale-[1.02] cursor-pointer",
                  isSelected
                    ? "bg-primary/10 border-primary text-white shadow-md shadow-primary/5"
                    : "bg-zinc-950/40 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                )}
              >
                <span>{category.name}</span>
                {isSelected && <Check className="size-4.5 text-primary flex-shrink-0" />}
              </button>
            )
          })}
        </div>
      </div>

      {/* Sección 3: Locales y Cuentas de Instagram */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6 space-y-6 backdrop-blur-xs">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-1">
            <Search className="size-5 text-primary" />
            Lugares y Organizadores Preferidos
          </h2>
          <p className="text-xs text-muted-foreground">
            Sigue locales físicos o directamente a organizadores/boliches de Instagram (ej: La Metro, Sex Us Machina) para enterarte de sus novedades.
          </p>
        </div>

        {/* Buscador Autocompletable Unificado */}
        <div ref={searchContainerRef} className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4.5 text-zinc-500" />
            <Input
              type="text"
              placeholder="Busca locales físicos o cuentas de Instagram (ej: Usina, Metro, Sex Us...)"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setIsSearchOpen(true)
              }}
              onFocus={() => setIsSearchOpen(true)}
              className="pl-10 bg-zinc-950 border-zinc-800"
            />
          </div>

          {/* Sugerencias de Autocompletado */}
          {isSearchOpen && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 z-50 rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl p-1.5 space-y-0.5 max-h-72 overflow-y-auto scrollbar-hide">
              {searchResults.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectItem(item)}
                  className="w-full text-left p-3 hover:bg-zinc-900 rounded-lg text-sm transition-colors flex items-center justify-between cursor-pointer"
                >
                  <div className="flex flex-col">
                    <span className="font-semibold text-zinc-200">{item.name}</span>
                    <span className="text-xs text-zinc-500 truncate">{item.subtitle}</span>
                  </div>
                  <Badge variant="outline" className={cn(
                    "text-[10px] uppercase font-bold",
                    item.type === "instagram" ? "border-pink-500/30 text-pink-400 bg-pink-500/5" : "border-emerald-500/30 text-emerald-400 bg-emerald-500/5"
                  )}>
                    {item.type === "instagram" ? "Instagram" : "Lugar"}
                  </Badge>
                </button>
              ))}
            </div>
          )}

          {isSearchOpen && searchQuery.trim() && searchResults.length === 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 z-50 rounded-xl border border-zinc-850 bg-zinc-950 p-4 text-center text-xs text-zinc-500 italic">
              No se encontraron coincidencias.
            </div>
          )}
        </div>

        {/* Lista de Suscripciones Seleccionadas */}
        {(selectedVenues.length > 0 || selectedInstagrams.length > 0) ? (
          <div className="flex flex-wrap gap-2 pt-2">
            {/* Locales Físicos */}
            {selectedVenues.map((venue) => (
              <Badge
                key={venue.id}
                variant="secondary"
                className="bg-emerald-950/20 border border-emerald-800/40 text-emerald-300 font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5"
              >
                <MapPin className="size-3.5 text-emerald-400 flex-shrink-0" />
                <span>{venue.name}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveVenue(venue.id)}
                  className="hover:text-red-500 cursor-pointer"
                  title={`Dejar de seguir ${venue.name}`}
                >
                  <X className="size-3.5" />
                </button>
              </Badge>
            ))}

            {/* Cuentas de Instagram */}
            {selectedInstagrams.map((ig) => (
              <Badge
                key={ig.id}
                variant="secondary"
                className="bg-pink-950/20 border border-pink-800/40 text-pink-300 font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5"
              >
                <Instagram className="size-3.5 text-pink-400 flex-shrink-0" />
                <span>@{ig.username}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveInstagram(ig.id)}
                  className="hover:text-red-500 cursor-pointer"
                  title={`Dejar de seguir @${ig.username}`}
                >
                  <X className="size-3.5" />
                </button>
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-500 italic pt-2">
            No estás siguiendo ningún local ni cuenta de Instagram aún. Escribe arriba para buscarlos y agregarlos.
          </p>
        )}
      </div>

      {/* Botones de Guardado y Prueba */}
      <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4">
        <Button
          type="button"
          onClick={handleSendTestEmail}
          variant="outline"
          className="border-zinc-800 hover:bg-zinc-900 font-semibold px-6 py-5 rounded-xl cursor-pointer"
          disabled={isPending || isSendingTest}
        >
          {isSendingTest ? "Enviando prueba..." : "Enviar Correo de Prueba"}
        </Button>
        <Button
          type="submit"
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-8 py-5 rounded-xl shadow-lg shadow-primary/10 cursor-pointer"
          disabled={isPending || isSendingTest}
        >
          {isPending ? "Guardando..." : "Guardar Preferencias de Radar"}
        </Button>
      </div>
    </form>
  )
}
