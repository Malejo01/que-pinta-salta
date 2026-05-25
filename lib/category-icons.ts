import { 
  Guitar, 
  Wine, 
  Theater,
  Store, 
  Palette,
  Film,
  Calendar,
  LucideIcon
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

export function getCategoryIcon(category: EventCategory | string): LucideIcon {
  return categoryIcons[category as EventCategory] || Calendar
}
