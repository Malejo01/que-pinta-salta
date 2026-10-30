"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Search, X, Check, Mail, Settings, Radio, Instagram, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { ToastAction } from "@/components/ui/toast"
import { useDonation } from "@/components/donation-context"
import { DONATIONS_ENABLED } from "@/lib/config/monetization"
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
import { langDeCategoria, nombreCategoria, textosDe } from "@/lib/i18n"
import type { Idioma } from "@/lib/i18n/idiomas"

interface RadarFormProps {
  initialSettings: RadarSettingsData | null
  categories: Category[]
  venues: Venue[]
  instagramAccounts: any[]
  /** Determinado en el servidor; solo habilita la interfaz de prueba (el freno real está en la acción). */
  isAdmin?: boolean
  /** Idioma de la interfaz; por omisión castellano. Los nombres de lugares y cuentas quedan como están. */
  idioma?: Idioma
}

export function RadarForm({ initialSettings, categories, venues, instagramAccounts, isAdmin = false, idioma = "es" }: RadarFormProps) {
  const textos = textosDe(idioma)
  const t = textos.radar
  // Lo que viene de la base (lugares, direcciones, cuentas) está en castellano.
  const langContenido = idioma === "en" ? "es" : undefined
  const router = useRouter()
  const { toast } = useToast()
  const { openDonationModal } = useDonation()
  
  // Estados de formulario
  const [frequency, setFrequency] = useState<EmailFrequency>(
    initialSettings?.email_frequency || "weekly"
  )
  const email = initialSettings?.email_target || ""
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
    const t = textosDe(idioma).radar
    const venueCandidates = venues.map(v => ({
      id: v.id,
      name: v.name,
      subtitle: v.address || t.localFisico,
      // La dirección es dato del lugar (castellano); el texto de respaldo es de la interfaz.
      subtitleEsDato: Boolean(v.address),
      type: "venue" as const
    }))

    const instagramCandidates = instagramAccounts.map(ig => ({
      id: ig.id,
      name: ig.display_name,
      subtitle: t.subtituloCuenta(ig.username),
      subtitleEsDato: false,
      type: "instagram" as const
    }))

    return [...venueCandidates, ...instagramCandidates]
  }, [venues, instagramAccounts, idioma])

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

    setIsPending(true)
    try {
      const result = await updateRadarSettings({
        email_frequency: frequency,
        categoryIds: selectedCategoryIds,
        venueIds: selectedVenueIds,
        instagramAccountIds: selectedInstagramIds,
      })

      if (result.error) {
        toast({
          title: t.errorGuardarTitulo,
          // En castellano, el mensaje del servidor tal cual; en inglés, el
          // texto del diccionario según el código del error.
          description: idioma === "es" ? result.message || t.errorInesperado : t.errorServidor(result.error),
          variant: "destructive",
        })
        return
      }

      toast({
        title: t.listoTitulo,
        description: DONATIONS_ENABLED ? t.listoConDonacion : t.listoSinDonacion,
        action: DONATIONS_ENABLED ? (
          <ToastAction
            altText={t.donarAhora}
            onClick={() => openDonationModal(t.mensajeDonacion)}
            // Botón con el rojo de marca fijo (#C12026) en ambos temas: el texto
            // queda blanco a propósito, no depende de claro/oscuro.
            className="bg-[#C12026] text-white hover:bg-[#A0191F] border-none"
          >
            {t.donarAhora}
          </ToastAction>
        ) : undefined,
      })
      router.refresh()
    } catch (err) {
      toast({
        title: t.errorConexionTitulo,
        description: t.errorConexionTexto,
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
          title: t.pruebaEnviadaTitulo,
          // El mensaje del servidor no trae código: en inglés se arma con el diccionario.
          description:
            idioma === "es"
              ? result.message || t.pruebaEnviada(result.count ?? 0)
              : t.pruebaEnviada(result.count ?? 0),
        })
      } else {
        toast({
          title: t.pruebaTitulo,
          description: idioma === "es" ? result.message || t.pruebaNoEnviada : t.pruebaNoEnviada,
          variant: "destructive",
        })
      }
    } catch (err) {
      toast({
        title: t.errorConexionTitulo,
        description: t.pruebaErrorTexto,
        variant: "destructive",
      })
    } finally {
      setIsSendingTest(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-3xl mx-auto">
      {/* Sección 1: Frecuencia y Correo */}
      <div className="rounded-2xl border border-border bg-card/30 p-6 space-y-6 backdrop-blur-xs">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Settings className="size-5 text-primary" />
          {t.frecuenciaTitulo}
        </h2>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="radar-frequency">{t.frecuenciaPregunta}</Label>
            <Select
              value={frequency}
              onValueChange={(val) => setFrequency(val as EmailFrequency)}
            >
              <SelectTrigger id="radar-frequency" className="w-full">
                <SelectValue placeholder={t.frecuenciaPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">{t.semanal}</SelectItem>
                <SelectItem value="biweekly">{t.quincenal}</SelectItem>
                <SelectItem value="monthly">{t.mensual}</SelectItem>
                <SelectItem value="disabled">{t.desactivado}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="radar-email">{t.emailLabel}</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <div
                id="radar-email"
                className="pl-10 flex h-10 w-full items-center rounded-md border border-border bg-muted text-sm text-muted-foreground"
              >
                {email}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t.emailNota}
            </p>
            {isAdmin && (
              <p className="text-[11px] text-muted-foreground italic">
                {t.emailNotaAdmin}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Sección 2: Categorías */}
      <div className="rounded-2xl border border-border bg-card/30 p-6 space-y-6 backdrop-blur-xs">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2 mb-1">
            <Radio className="size-5 text-primary animate-pulse" />
            {t.categoriasTitulo}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t.categoriasTexto}
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
                    ? "bg-primary/10 border-primary text-foreground shadow-md shadow-primary/5"
                    : "bg-muted/40 border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                )}
              >
                <span lang={langDeCategoria(idioma, category.slug)}>
                  {nombreCategoria(textos, category.slug, category.name)}
                </span>
                {isSelected && <Check className="size-4.5 text-primary flex-shrink-0" />}
              </button>
            )
          })}
        </div>
      </div>

      {/* Sección 3: Locales y Cuentas de Instagram */}
      <div className="rounded-2xl border border-border bg-card/30 p-6 space-y-6 backdrop-blur-xs">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2 mb-1">
            <Search className="size-5 text-primary" />
            {t.lugaresTitulo}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t.lugaresTexto}
          </p>
        </div>

        {/* Buscador Autocompletable Unificado */}
        <div ref={searchContainerRef} className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t.buscadorPlaceholder}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setIsSearchOpen(true)
              }}
              onFocus={() => setIsSearchOpen(true)}
              className="pl-10"
            />
          </div>

          {/* Sugerencias de Autocompletado */}
          {isSearchOpen && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 z-50 rounded-xl border border-border bg-popover shadow-2xl p-1.5 space-y-0.5 max-h-72 overflow-y-auto scrollbar-hide">
              {searchResults.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectItem(item)}
                  className="w-full text-left p-3 hover:bg-muted rounded-lg text-sm transition-colors flex items-center justify-between cursor-pointer"
                >
                  <div className="flex flex-col">
                    <span lang={langContenido} className="font-semibold text-foreground">{item.name}</span>
                    <span lang={item.subtitleEsDato ? langContenido : undefined} className="text-xs text-muted-foreground truncate">{item.subtitle}</span>
                  </div>
                  <Badge variant="outline" className={cn(
                    "text-[10px] uppercase font-bold",
                    item.type === "instagram" ? "border-pink-500/30 text-pink-400 bg-pink-500/5" : "border-emerald-500/30 text-emerald-400 bg-emerald-500/5"
                  )}>
                    {item.type === "instagram" ? t.tipoInstagram : t.tipoLugar}
                  </Badge>
                </button>
              ))}
            </div>
          )}

          {isSearchOpen && searchQuery.trim() && searchResults.length === 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 z-50 rounded-xl border border-border bg-popover p-4 text-center text-xs text-muted-foreground italic">
              {t.sinCoincidencias}
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
                <span lang={langContenido}>{venue.name}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveVenue(venue.id)}
                  className="hover:text-red-500 cursor-pointer"
                  title={t.dejarDeSeguir(venue.name)}
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
                  title={t.dejarDeSeguir(`@${ig.username}`)}
                >
                  <X className="size-3.5" />
                </button>
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic pt-2">
            {t.sinSeguimientos}
          </p>
        )}
      </div>

      {/* Botones de Guardado y Prueba */}
      <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4">
        {isAdmin && (
          <Button
            type="button"
            onClick={handleSendTestEmail}
            variant="outline"
            className="border-border hover:bg-muted font-semibold px-6 py-5 rounded-xl cursor-pointer"
            disabled={isPending || isSendingTest}
          >
            {isSendingTest ? t.enviandoPrueba : t.enviarPrueba}
          </Button>
        )}
        <Button
          type="submit"
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-8 py-5 rounded-xl shadow-lg shadow-primary/10 cursor-pointer"
          disabled={isPending || isSendingTest}
        >
          {isPending ? t.guardando : t.guardar}
        </Button>
      </div>
    </form>
  )
}
