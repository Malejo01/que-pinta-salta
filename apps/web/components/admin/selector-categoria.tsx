"use client"

/**
 * Q6-5 · El selector de categoría del bloque de admin de la ficha de un
 * evento. Radix Select (con floating-ui) viajaba en el JavaScript inicial de
 * TODAS las fichas, aunque solo lo usa un admin después de tocar «Editar»;
 * `event-detail-page.tsx` lo carga con `next/dynamic` recién entonces. Mismo
 * marcado que antes, movido sin cambios.
 */
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Category } from "@/lib/types"

export function SelectorCategoria({
  value,
  onValueChange,
  categories,
}: {
  value: string
  onValueChange: (id: string) => void
  categories: Category[]
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger>
        <SelectValue placeholder="Seleccionar categoría" />
      </SelectTrigger>
      <SelectContent>
        {categories.map((category) => (
          <SelectItem key={category.id} value={category.id}>
            {category.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
