"use client"

import { useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { Building2, CalendarDays, ChevronDown, MapPin, Search, SlidersHorizontal, X } from "lucide-react"
import { motion } from "framer-motion"
import type { Category } from "@/lib/types"
// QPS-083: vive en packages/core/src/home/types.ts; se reexporta con el mismo
// nombre para no cambiar a los importadores de este módulo.
import type { DateFilter } from "@qps/core/home/types"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { getCategoryIcon } from "@/lib/category-icons"
import { Switch } from "@/components/ui/switch"
import { langDeCategoria, type Diccionario } from "@/lib/i18n"
import type { Idioma } from "@/lib/i18n/idiomas"
import { fechaDeFiltro } from "@/lib/i18n/fechas"
import { useIdioma, useTextos } from "@/lib/i18n/use-idioma"

// Lo que se ve mientras carga el calendario: sale del idioma de la página
// (`loading` de next/dynamic no recibe props).
function CargandoCalendario() {
  const textos = useTextos()
  return (
    <div className="flex h-[308px] w-[252px] items-center justify-center p-3 text-sm text-muted-foreground">
      {textos.portada.cargandoCalendario}
    </div>
  )
}

// El date picker (react-day-picker, vía components/ui/calendar) solo se
// monta dentro de este Popover cuando el usuario lo abre: nunca hace falta
// en la carga inicial. `ssr: false` porque el Popover arranca cerrado y
// Radix ni siquiera llega a montar su contenido en el servidor.
const Calendar = dynamic(
  () => import("@/components/ui/calendar").then((mod) => mod.Calendar),
  {
    ssr: false,
    loading: () => <CargandoCalendario />,
  }
)

export type { DateFilter }

// `etiqueta`: clave del texto en el diccionario (`portada`).
const dateFilters: { value: DateFilter; etiqueta: "filtroHoy" | "filtroSemana" | "filtroMes" | "filtroTendencias" }[] = [
  { value: "hoy", etiqueta: "filtroHoy" },
  { value: "semana", etiqueta: "filtroSemana" },
  { value: "mes", etiqueta: "filtroMes" },
  { value: "tendencias", etiqueta: "filtroTendencias" },
]

interface FiltersBarProps {
  categories: Category[]
  filters: {
    search: string
    date: DateFilter | null
    category: string | null
    establishment: string
    location: string
    dateExact: string | null
    instagram: boolean
  }
  onFilterChange: (updates: {
    search?: string
    date?: DateFilter | null
    category?: string | null
    establishment?: string
    location?: string
    dateExact?: string | null
    instagram?: boolean
  }) => void
}

function formatDateParam(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function formatDateLabel(value: string | null, idioma: Idioma, textos: Diccionario) {
  if (!value) return textos.portada.todasLasFechas
  return fechaDeFiltro(idioma, value)
}

export function FiltersBar({ categories, filters, onFilterChange }: FiltersBarProps) {
  const idioma = useIdioma()
  const textos = useTextos()
  const t = textos.portada
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false)
  const [isInteracting, setIsInteracting] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const interactionTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    // Pausar el auto-scroll durante los primeros 2.6 segundos para el nudge inicial
    const timer = setTimeout(() => {
      setIsInteracting(false)
    }, 2600)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    let animationId: number
    const speed = 0.25 // píxeles por frame
    let direction = 1 // 1 = derecha, -1 = izquierda

    const step = () => {
      if (!isInteracting) {
        el.scrollLeft += speed * direction

        const maxScroll = el.scrollWidth - el.clientWidth
        if (maxScroll > 0) {
          if (el.scrollLeft >= maxScroll - 1) {
            direction = -1
          } else if (el.scrollLeft <= 1) {
            direction = 1
          }
        }
      }
      animationId = requestAnimationFrame(step)
    }

    animationId = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(animationId)
    }
  }, [isInteracting])

  const handleInteractionStart = () => {
    setIsInteracting(true)
    if (interactionTimeoutRef.current) {
      window.clearTimeout(interactionTimeoutRef.current)
    }
  }

  const handleInteractionEnd = () => {
    if (interactionTimeoutRef.current) {
      window.clearTimeout(interactionTimeoutRef.current)
    }
    interactionTimeoutRef.current = window.setTimeout(() => {
      setIsInteracting(false)
    }, 2500)
  }

  const searchInputRef = useRef<HTMLInputElement>(null)
  const establishmentInputRef = useRef<HTMLInputElement>(null)
  const locationInputRef = useRef<HTMLInputElement>(null)
  const searchTimeoutRef = useRef<number | null>(null)
  const establishmentTimeoutRef = useRef<number | null>(null)
  const locationTimeoutRef = useRef<number | null>(null)
  
  const {
    search: searchQuery,
    date: selectedDate,
    category: selectedCategory,
    establishment: selectedEstablishment,
    location: selectedLocation,
    dateExact: selectedExactDate,
    instagram: instagramEnabled,
  } = filters

  const advancedFiltersCount = [selectedEstablishment, selectedLocation].filter(Boolean).length

  const handleClearAll = () => {
    onFilterChange({
      search: "",
      date: null,
      category: null,
      establishment: "",
      location: "",
      dateExact: null,
    })
  }

  const activeCategoryName = selectedCategory
    ? categories.find((c) => c.slug === selectedCategory)?.name || selectedCategory
    : null

  const activeChips: { id: string; label: string; onClear: () => void; lang?: string }[] = []
  if (searchQuery) {
    activeChips.push({
      id: "search",
      label: t.chipBusqueda(searchQuery),
      onClear: () => onFilterChange({ search: "" }),
    })
  }
  if (selectedDate) {
    const labels: Record<DateFilter, string> = {
      hoy: t.filtroHoy,
      semana: t.filtroSemana,
      mes: t.filtroMes,
      tendencias: t.filtroTendencias,
    }
    activeChips.push({
      id: "date",
      label: labels[selectedDate],
      onClear: () => onFilterChange({ date: null }),
    })
  }
  if (selectedExactDate) {
    activeChips.push({
      id: "dateExact",
      label: formatDateLabel(selectedExactDate, idioma, textos),
      onClear: () => onFilterChange({ dateExact: null }),
    })
  }
  if (selectedCategory) {
    activeChips.push({
      id: "category",
      label: activeCategoryName || selectedCategory,
      lang: langDeCategoria(idioma, selectedCategory),
      onClear: () => onFilterChange({ category: null }),
    })
  }
  if (selectedEstablishment) {
    activeChips.push({
      id: "establishment",
      label: t.chipLugar(selectedEstablishment),
      onClear: () => onFilterChange({ establishment: "" }),
    })
  }
  if (selectedLocation) {
    activeChips.push({
      id: "location",
      label: t.chipZona(selectedLocation),
      onClear: () => onFilterChange({ location: "" }),
    })
  }

  const hasActiveFilters = activeChips.length > 0

  const handleInstagramChange = (checked: boolean) => {
    onFilterChange({ instagram: checked })
  }

  const handleDateChange = (date: DateFilter | null) => {
    onFilterChange({ date, dateExact: null })
  }

  const handleCategoryChange = (category: string | null) => {
    onFilterChange({ category })
  }

  const handleExactDateChange = (date: Date | undefined) => {
    onFilterChange({
      date: null,
      dateExact: date ? formatDateParam(date) : null,
    })
  }

  useEffect(() => {
    if (searchInputRef.current && searchInputRef.current.value !== searchQuery) {
      searchInputRef.current.value = searchQuery
    }
  }, [searchQuery])

  useEffect(() => {
    if (establishmentInputRef.current && establishmentInputRef.current.value !== selectedEstablishment) {
      establishmentInputRef.current.value = selectedEstablishment
    }
  }, [selectedEstablishment])

  useEffect(() => {
    if (locationInputRef.current && locationInputRef.current.value !== selectedLocation) {
      locationInputRef.current.value = selectedLocation
    }
  }, [selectedLocation])

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current !== null) window.clearTimeout(searchTimeoutRef.current)
      if (establishmentTimeoutRef.current !== null) window.clearTimeout(establishmentTimeoutRef.current)
      if (locationTimeoutRef.current !== null) window.clearTimeout(locationTimeoutRef.current)
    }
  }, [])

  const handleDebouncedTextFilterChange = (
    key: "search" | "establishment" | "location",
    value: string,
    timeoutRef: React.MutableRefObject<number | null>
  ) => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
    }

    timeoutRef.current = window.setTimeout(() => {
      onFilterChange({ [key]: value })
      timeoutRef.current = null
    }, 250)
  }

  return (
    <div className="border-b border-border bg-background/95 py-2 md:py-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex flex-col gap-3 md:gap-4">
          <div className="relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              type="search"
              placeholder={t.buscarPlaceholder}
              defaultValue={searchQuery}
              onChange={(e) => handleDebouncedTextFilterChange("search", e.target.value, searchTimeoutRef)}
              className="pl-10"
            />
          </div>

          <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1">
            {dateFilters.map((filter) => {
              const isActive = selectedDate === filter.value
              return (
                <Button
                  key={filter.value}
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDateChange(selectedDate === filter.value ? null : filter.value)}
                  className={cn(
                    "shrink-0 relative transition-colors border",
                    isActive
                      ? "text-primary-foreground font-semibold border-transparent"
                      : "text-foreground border-border hover:bg-muted"
                  )}
                >
                  <span className="relative z-10">{t[filter.etiqueta]}</span>
                  {isActive && (
                    <motion.div
                      layoutId="activeDatePill"
                      className="absolute inset-0 bg-primary rounded-[calc(var(--radius)-2px)]"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                </Button>
              )
            })}

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={selectedExactDate ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "shrink-0",
                    selectedExactDate && "bg-primary text-primary-foreground"
                  )}
                >
                  <CalendarDays className="mr-1.5 size-4" />
                  {formatDateLabel(selectedExactDate, idioma, textos)}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={selectedExactDate ? new Date(`${selectedExactDate}T00:00:00`) : undefined}
                  onSelect={handleExactDateChange}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            {selectedExactDate && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleExactDateChange(undefined)}
                className="shrink-0"
              >
                {t.limpiarFecha}
              </Button>
            )}
          </div>

          <div className="space-y-1.5 md:space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t.categorias}
            </p>
            <div 
              ref={scrollRef}
              className="scrollbar-hide flex gap-2 overflow-x-auto pb-1 w-full min-w-0"
              onTouchStart={handleInteractionStart}
              onTouchEnd={handleInteractionEnd}
              onMouseDown={handleInteractionStart}
              onMouseUp={handleInteractionEnd}
              onMouseLeave={handleInteractionEnd}
            >
              <motion.div 
                className="flex gap-2 shrink-0"
                initial={{ x: 0 }}
                animate={{ x: [0, -35, 0] }}
                transition={{
                  duration: 1.6,
                  ease: "easeInOut",
                  delay: 0.8,
                }}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCategoryChange(null)}
                  className={cn(
                    "shrink-0 relative transition-colors border",
                    !selectedCategory
                      ? "text-primary-foreground font-semibold border-transparent"
                      : "text-foreground border-border hover:bg-muted"
                  )}
                >
                  <span className="relative z-10">{t.todas}</span>
                  {!selectedCategory && (
                    <motion.div
                      layoutId="activeCategoryPill"
                      className="absolute inset-0 bg-primary rounded-[calc(var(--radius)-2px)]"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                </Button>

                {categories.map((category) => {
                  const Icon = getCategoryIcon(category.slug)
                  const isActive = selectedCategory === category.slug

                  return (
                    <Button
                      key={category.id}
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCategoryChange(isActive ? null : category.slug)}
                      className={cn(
                        "shrink-0 relative transition-colors border",
                        isActive
                          ? "text-primary-foreground font-semibold border-transparent"
                          : "text-foreground border-border hover:bg-muted"
                      )}
                    >
                      <Icon className="mr-1.5 size-4 relative z-10" />
                      <span lang={langDeCategoria(idioma, category.slug)} className="relative z-10">{category.name}</span>
                      {isActive && (
                        <motion.div
                          layoutId="activeCategoryPill"
                          className="absolute inset-0 bg-primary rounded-[calc(var(--radius)-2px)]"
                          transition={{ type: "spring", stiffness: 380, damping: 30 }}
                        />
                      )}
                    </Button>
                  )
                })}
              </motion.div>
            </div>
          </div>

          <Collapsible open={advancedFiltersOpen} onOpenChange={setAdvancedFiltersOpen}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CollapsibleTrigger asChild>
                <Button
                  variant="outline"
                  className="flex w-full items-center justify-between sm:w-auto"
                >
                  <span className="flex items-center gap-2 text-sm">
                    <SlidersHorizontal className="size-4" />
                    {t.masFiltros}
                    {advancedFiltersCount > 0 && (
                      <span className="rounded-full bg-primary/12 px-2 py-0.5 text-xs font-medium text-primary">
                        {advancedFiltersCount}
                      </span>
                    )}
                  </span>
                  <ChevronDown
                    className={cn(
                      "size-4 transition-transform",
                      advancedFiltersOpen && "rotate-180"
                    )}
                  />
                </Button>
              </CollapsibleTrigger>

              <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 shadow-xs sm:justify-start sm:gap-3">
                <span className="text-xs font-medium text-muted-foreground select-none">
                  {t.mostrarFlyers}
                </span>
                {/* Envoltorio con área de toque ampliada (pseudo-elemento invisible):
                    el switch visible (32x18) no cambia de tamaño. Horizontal queda
                    contenido dentro del padding del contenedor (px-3) para no salirse
                    de esta píldora; vertical queda contenido en su padding (py-2) para
                    no pisar al botón "Más filtros", que en mobile está arriba en la misma
                    columna (flex-col gap-2) y a partir de sm: al costado (sm:flex-row).
                    Resultado: ~56x34, no llega a 44 de alto por ese límite. */}
                <span className="relative inline-flex after:absolute after:content-[''] after:-left-3 after:-right-3 after:-top-2 after:-bottom-2">
                  <Switch
                    id="instagram-toggle"
                    aria-label={t.mostrarFlyers}
                    checked={instagramEnabled}
                    onCheckedChange={handleInstagramChange}
                  />
                </span>
              </div>
            </div>

            <CollapsibleContent className="pt-2 md:pt-3">
              <div className="grid grid-cols-2 gap-2 md:gap-3">
              <div className="space-y-1.5 md:space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t.establecimiento}
                    </p>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        ref={establishmentInputRef}
                        defaultValue={selectedEstablishment}
                        onChange={(e) => handleDebouncedTextFilterChange("establishment", e.target.value, establishmentTimeoutRef)}
                        placeholder={t.lugarPlaceholder}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 md:space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t.ubicacion}
                    </p>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        ref={locationInputRef}
                        defaultValue={selectedLocation}
                        onChange={(e) => handleDebouncedTextFilterChange("location", e.target.value, locationTimeoutRef)}
                        placeholder={t.zonaPlaceholder}
                        className="pl-10"
                      />
                    </div>
                  </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3 mt-1">
              <span className="text-xs font-semibold text-muted-foreground mr-1">
                {t.filtrosActivos}
              </span>
              
              <div className="flex flex-wrap items-center gap-2">
                {activeChips.map((chip) => (
                  <span
                    key={chip.id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 border border-border/80 px-2.5 py-0.5 text-xs text-foreground font-medium transition-colors hover:bg-muted"
                  >
                    <span lang={chip.lang}>{chip.label}</span>
                    {/* Área de toque ampliada con pseudo-elemento invisible: el botón
                        visible (16x16) no cambia. A la izquierda se limita a 3px (mitad
                        del gap-1.5 con la etiqueta) y arriba/abajo a 6px (la píldora mide
                        ~20px de alto, con gap-2 entre chips) para no pisar los vecinos
                        cuando los chips se acumulan o pasan a otra línea. A la derecha hay
                        de sobra (padding de la píldora + gap-2 antes del siguiente chip),
                        así que se usa para compensar: resultado ~31x28, no llega a 44. */}
                    <button
                      onClick={chip.onClear}
                      className="relative rounded-full p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted-foreground/10 transition-colors after:absolute after:content-[''] after:-left-[3px] after:-right-3 after:-top-1.5 after:-bottom-1.5"
                      title={t.quitarFiltro}
                      aria-label={t.quitarFiltroDe(chip.label)}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearAll}
                /* Área de toque ampliada con pseudo-elemento invisible: el botón
                   visible (103x28) no cambia. Con ml-auto queda al final de la fila
                   (o solo en su propia línea si no entra), así que hay margen de
                   sobra alrededor: 8px por lado alcanza para llegar a 44 de alto
                   (28 + 8 + 8) sin pisar nada. */
                className="relative h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 rounded-full px-3 font-semibold transition-colors ml-auto sm:ml-2 after:absolute after:content-[''] after:-inset-2"
              >
                {t.limpiarTodo}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
