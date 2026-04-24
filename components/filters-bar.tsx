"use client"

import { Search } from "lucide-react"
import { EventCategory, categoryLabels } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { getCategoryIcon } from "@/lib/category-icons"

export type DateFilter = "hoy" | "semana" | "mes" | "tendencias"

interface FiltersBarProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  selectedDate: DateFilter | null
  onDateChange: (date: DateFilter | null) => void
  selectedCategory: EventCategory | null
  onCategoryChange: (category: EventCategory | null) => void
}

const dateFilters: { value: DateFilter; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "semana", label: "Esta semana" },
  { value: "mes", label: "Este mes" },
  { value: "tendencias", label: "Tendencias" },
]

const categories = Object.entries(categoryLabels) as [EventCategory, string][]

export function FiltersBar({
  searchQuery,
  onSearchChange,
  selectedDate,
  onDateChange,
  selectedCategory,
  onCategoryChange,
}: FiltersBarProps) {
  return (
    <div className="sticky top-16 z-40 border-b border-border bg-background/95 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex flex-col gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Buscar por evento o lugar..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1">
            {dateFilters.map((filter) => (
              <Button
                key={filter.value}
                variant={selectedDate === filter.value ? "default" : "outline"}
                size="sm"
                onClick={() => onDateChange(selectedDate === filter.value ? null : filter.value)}
                className={cn(
                  "shrink-0",
                  selectedDate === filter.value && "bg-primary text-primary-foreground"
                )}
              >
                {filter.label}
              </Button>
            ))}
          </div>

          <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1">
            {categories.map(([value, label]) => {
              const Icon = getCategoryIcon(value)
              return (
                <Button
                  key={value}
                  variant={selectedCategory === value ? "default" : "outline"}
                  size="sm"
                  onClick={() => onCategoryChange(selectedCategory === value ? null : value)}
                  className={cn(
                    "shrink-0",
                    selectedCategory === value && "bg-primary text-primary-foreground"
                  )}
                >
                  <Icon className="mr-1.5 size-4" />
                  {label}
                </Button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
