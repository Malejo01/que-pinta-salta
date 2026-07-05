"use client"

import { useEffect, useRef, useState } from "react"
import { Building2, CalendarDays, ChevronDown, MapPin, Search, SlidersHorizontal } from "lucide-react"
import type { Category } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
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

export type DateFilter = "hoy" | "semana" | "mes" | "tendencias"

const dateFilters: { value: DateFilter; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "semana", label: "Esta semana" },
  { value: "mes", label: "Este mes" },
  { value: "tendencias", label: "Tendencias" },
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

function formatDateLabel(value: string | null) {
  if (!value) return "Todas las fechas"

  const parsed = new Date(`${value}T00:00:00`)
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeZone: "America/Argentina/Salta",
  }).format(parsed)
}

export function FiltersBar({ categories, filters, onFilterChange }: FiltersBarProps) {
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false)
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
              placeholder="Buscar por evento o lugar..."
              defaultValue={searchQuery}
              onChange={(e) => handleDebouncedTextFilterChange("search", e.target.value, searchTimeoutRef)}
              className="pl-10"
            />
          </div>

          <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1">
            {dateFilters.map((filter) => (
              <Button
                key={filter.value}
                variant={selectedDate === filter.value ? "default" : "outline"}
                size="sm"
                onClick={() => handleDateChange(selectedDate === filter.value ? null : filter.value)}
                className={cn(
                  "shrink-0",
                  selectedDate === filter.value && "bg-primary text-primary-foreground"
                )}
              >
                {filter.label}
              </Button>
            ))}

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
                  {formatDateLabel(selectedExactDate)}
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
                Limpiar fecha
              </Button>
            )}
          </div>

          <div className="space-y-1.5 md:space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Categorías
            </p>
            <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible">
              <Button
                variant={!selectedCategory ? "default" : "outline"}
                size="sm"
                onClick={() => handleCategoryChange(null)}
                className={cn(
                  "shrink-0",
                  !selectedCategory && "bg-primary text-primary-foreground"
                )}
              >
                Todas
              </Button>

              {categories.map((category) => {
                const Icon = getCategoryIcon(category.slug)
                const isActive = selectedCategory === category.slug

                return (
                  <Button
                    key={category.id}
                    variant={isActive ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleCategoryChange(isActive ? null : category.slug)}
                    className={cn(
                      "shrink-0",
                      isActive && "bg-primary text-primary-foreground"
                    )}
                  >
                    <Icon className="mr-1.5 size-4" />
                    {category.name}
                  </Button>
                )
              })}
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
                    Más filtros
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
                  Mostrar flyers de redes
                </span>
                <Switch
                  id="instagram-toggle"
                  checked={instagramEnabled}
                  onCheckedChange={handleInstagramChange}
                />
              </div>
            </div>

            <CollapsibleContent className="pt-2 md:pt-3">
              <div className="grid grid-cols-2 gap-2 md:gap-3">
              <div className="space-y-1.5 md:space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Establecimiento
                    </p>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        ref={establishmentInputRef}
                        defaultValue={selectedEstablishment}
                        onChange={(e) => handleDebouncedTextFilterChange("establishment", e.target.value, establishmentTimeoutRef)}
                        placeholder="Lugar"
                        className="pl-10"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 md:space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Ubicación
                    </p>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        ref={locationInputRef}
                        defaultValue={selectedLocation}
                        onChange={(e) => handleDebouncedTextFilterChange("location", e.target.value, locationTimeoutRef)}
                        placeholder="Zona"
                        className="pl-10"
                      />
                    </div>
                  </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    </div>
  )
}
