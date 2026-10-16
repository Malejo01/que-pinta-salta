// Único componente de ícono de la app (QPS-125; D2 de ops/paridad-web-app.md
// §1, 29-g). Antes envolvía `SymbolView` de `expo-symbols` (Material Symbols
// en Android, distintos a los de la web); ahora que `lucide-react-native` +
// `react-native-svg` están instaladas, pasa a usar los MISMOS íconos que la
// web (`apps/web`, que usa `lucide-react`): mismo set, mismos nombres.
// Sigue siendo el único wrapper aprobado — tests/iconos.test.ts falla si
// algún otro archivo de `app/` o `components/` importa `lucide-react-native`
// directo.
//
// R29-q (integración de la tanda 3, punto D): se suman los 12 íconos por
// categoría de `apps/web/lib/category-icons.ts` (`getCategoryIcon`) que
// faltaban — `Film` y `Calendar` ya estaban (cine y el fallback, respectivamente).
// `iconoPorCategoria`/`ICONO_POR_CATEGORIA`, más abajo, son el único mapeo
// categoría → ícono de la app (lo usan `FilaCategoria.tsx` y
// `app/(tabs)/buscar.tsx`, en vez de cada uno tener su propia copia
// — antes solo tenían `cine: Film` y todo el resto caía en `Calendar`).
import type { ColorValue } from 'react-native'
import type { LucideIcon } from 'lucide-react-native'
import {
  Home,
  Search,
  Radio,
  Heart,
  Share2,
  MapPin,
  Calendar,
  Clock,
  Users,
  Navigation,
  ExternalLink,
  LogIn,
  User,
  X,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Film,
  Ticket,
  Guitar,
  Wine,
  Theater,
  Store,
  Palette,
  Star,
  Smile,
  Baby,
  Trophy,
  Zap,
  Landmark,
  Flame,
} from 'lucide-react-native'

/** Los mismos íconos que usa la web (apps/web, lucide-react), con el mismo nombre. */
const ICONOS_LUCIDE = {
  Home,
  Search,
  Radio,
  Heart,
  Share2,
  MapPin,
  Calendar,
  Clock,
  Users,
  Navigation,
  ExternalLink,
  LogIn,
  User,
  X,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Film,
  Ticket,
  Guitar,
  Wine,
  Theater,
  Store,
  Palette,
  Star,
  Smile,
  Baby,
  Trophy,
  Zap,
  Landmark,
  Flame,
} satisfies Record<string, LucideIcon>

export type NombreIcono = keyof typeof ICONOS_LUCIDE

/**
 * Mapeo categoría → ícono, igual que `getCategoryIcon` de la web
 * (`apps/web/lib/category-icons.ts`): mismo slug, mismo ícono. Único lugar
 * de la app con este mapeo — `FilaCategoria.tsx` y `app/(tabs)/buscar.tsx`
 * lo usan a través de `iconoPorCategoria`, en vez de tener cada uno su
 * propia copia (que antes solo tenía `cine: Film`).
 */
const ICONO_POR_CATEGORIA: Partial<Record<string, NombreIcono>> = {
  penas: 'Guitar',
  boliches: 'Wine',
  teatro: 'Theater',
  ferias: 'Store',
  talleres: 'Palette',
  cine: 'Film',
  recitales: 'Guitar',
  ballet: 'Star',
  humor: 'Smile',
  infantil: 'Baby',
  deportes: 'Trophy',
  espectaculos: 'Zap',
  museos: 'Landmark',
  alternativo: 'Flame',
}

/**
 * Ícono para una categoría por su `slug`, con el mismo fallback que
 * `getCategoryIcon` de la web para una categoría sin ícono propio:
 * `Calendar` (también cubre `'hoy'`, que no es una categoría real).
 */
export function iconoPorCategoria(slug: string): NombreIcono {
  return ICONO_POR_CATEGORIA[slug] ?? 'Calendar'
}

export interface IconoProps {
  nombre: NombreIcono
  /** Lado del ícono, en px (lucide usa `size`; acá se mantiene `tamanio`,
   * el nombre que ya tenía este componente, para no romper más llamadas de
   * las necesarias). */
  tamanio?: number
  color?: ColorValue
  /** Relleno del ícono (p. ej. la pestaña activa, con `${primary}33` para un
   * 20% de opacidad, como el `fill-primary/20` de la web). `'none'` por
   * defecto: no todos los íconos tienen una forma rellenable. */
  fill?: ColorValue
  strokeWidth?: number
}

export function Icono({ nombre, tamanio = 24, color, fill = 'none', strokeWidth }: IconoProps) {
  const Componente = ICONOS_LUCIDE[nombre]
  return <Componente size={tamanio} color={color} fill={fill} strokeWidth={strokeWidth} />
}
