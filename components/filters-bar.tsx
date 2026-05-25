"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useCallback } from "react"
import { Search } from "lucide-react"
import type { Category } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { getCategoryIcon } from "@/lib/category-icons"

export type DateFilter = "hoy" | "semana" | "mes" | "tendencias"

const dateFilters: { value: DateFilter; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "semana", label: "Esta semana" },
  { value: "mes", label: "Este mes" },
  { value: "tendencias", label: "Tendencias" },
]

interface FiltersBarProps {
  categories: Category[]
}

export function FiltersBar({ categories }: FiltersBarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  const searchQuery = searchParams.get("search") || ""
  const selectedDate = searchParams.get("date") as DateFilter | null
  const selectedCategory = searchParams.get("category")

  const updateParams = useCallback((key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    
    router.push(`/?${params.toString()}`, { scroll: false })
  }, [router, searchParams])

  const handleSearchChange = useCallback((query: string) => {
    updateParams("search", query || null)
  }, [updateParams])

  const handleDateChange = useCallback((date: DateFilter | null) => {
    updateParams("date", date)
  }, [updateParams])

  const handleCategoryChange = useCallback((category: string | null) => {
    updateParams("category", category)
  }, [updateParams])

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
              onChange={(e) => handleSearchChange(e.target.value)}
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
          </div>

          <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1">
            {categories.map((category) => {
              const Icon = getCategoryIcon(category.slug)
              return (
                <Button
                  key={category.id}
                  variant={selectedCategory === category.slug ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleCategoryChange(selectedCategory === category.slug ? null : category.slug)}
                  className={cn(
                    "shrink-0",
                    selectedCategory === category.slug && "bg-primary text-primary-foreground"
                  )}
                >
                  <Icon className="mr-1.5 size-4" />
                  {category.name}
                </Button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
