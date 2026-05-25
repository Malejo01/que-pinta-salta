import { 
  Guitar, 
  Wine, 
  Theater,
  Store, 
  Palette,
  Film,
  Tag
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

const categoryIcons: Record<string, LucideIcon> = {
  penas: Guitar,
  boliches: Wine,
  teatro: Theater,
  ferias: Store,
  talleres: Palette,
  cine: Film,
  recitales: Guitar,
}

export function getCategoryIcon(categorySlug: string): LucideIcon {
  return categoryIcons[categorySlug] ?? Tag
}
