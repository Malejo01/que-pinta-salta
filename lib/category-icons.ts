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
import { EventCategory } from "./types"

const categoryIcons: Record<EventCategory, LucideIcon> = {
  penas: Guitar,
  boliches: Wine,
  teatro: Theater,
  ferias: Store,
  talleres: Palette,
  cine: Film,
}

export function getCategoryIcon(category: EventCategory | string): LucideIcon {
  return categoryIcons[category as EventCategory] || Calendar
}
