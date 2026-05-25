import { 
  Guitar, 
  Wine, 
  Theater,
  Store, 
  Palette,
  Film,
  Sparkles,
  LucideIcon
} from "lucide-react"

const categoryIcons: Record<string, LucideIcon> = {
  penas: Guitar,
  boliches: Wine,
  teatro: Theater,
  ferias: Store,
  talleres: Palette,
  cine: Film,
}

export function getCategoryIcon(categorySlug: string): LucideIcon {
  return categoryIcons[categorySlug] ?? Sparkles
}
