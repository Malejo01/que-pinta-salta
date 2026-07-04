import {
  Guitar,
  Wine,
  Theater,
  Store,
  Palette,
  Film,
  Calendar,
  Star,
  Smile,
  Baby,
  Trophy,
  Zap,
  type LucideIcon,
} from "lucide-react"

const categoryIcons: Record<string, LucideIcon> = {
  penas:        Guitar,
  boliches:     Wine,
  teatro:       Theater,
  ferias:       Store,
  talleres:     Palette,
  cine:         Film,
  recitales:    Guitar,
  ballet:       Star,
  humor:        Smile,
  infantil:     Baby,
  deportes:     Trophy,
  espectaculos: Zap,
}

export function getCategoryIcon(category: string): LucideIcon {
  return categoryIcons[category] || Calendar
}
