// Único componente de ícono de la app (QPS-125; D2 de ops/paridad-web-app.md
// §1, 29-g). Antes envolvía `SymbolView` de `expo-symbols` (Material Symbols
// en Android, distintos a los de la web); ahora que `lucide-react-native` +
// `react-native-svg` están instaladas, pasa a usar los MISMOS íconos que la
// web (`apps/web`, que usa `lucide-react`): mismo set, mismos nombres.
// Sigue siendo el único wrapper aprobado — tests/iconos.test.ts falla si
// algún otro archivo de `app/` o `components/` importa `lucide-react-native`
// directo.
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
} from 'lucide-react-native'

/** Los mismos 20 íconos que usa la web (apps/web, lucide-react), con el mismo nombre. */
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
} satisfies Record<string, LucideIcon>

export type NombreIcono = keyof typeof ICONOS_LUCIDE

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
