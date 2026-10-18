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
// Un import por ícono, cada uno a su propio archivo bajo `lucide-react-native/icons/*`
// (46-f, QPS: tree-shaking). El paquete no tiene `sideEffects: false` efectivo si se
// importa del barrel: Metro no hace tree-shaking, así que `import { X } from
// 'lucide-react-native'` mete el paquete entero al bundle. El nombre del archivo NO
// siempre es el kebab-case del nombre del ícono (son alias del paquete, verificados
// contra `node_modules/lucide-react-native/dist/esm/lucide-react-native.mjs`):
// `Home` sale de `house`, y `Smile` de `face-slightly-smiling`. El resto es kebab-case
// mecánico del nombre (p. ej. `Share2` -> `share-2`, `ExternalLink` -> `external-link`).
import Home from 'lucide-react-native/icons/house'
import Search from 'lucide-react-native/icons/search'
import Radio from 'lucide-react-native/icons/radio'
import Heart from 'lucide-react-native/icons/heart'
import Share2 from 'lucide-react-native/icons/share-2'
import MapPin from 'lucide-react-native/icons/map-pin'
import Calendar from 'lucide-react-native/icons/calendar'
import Clock from 'lucide-react-native/icons/clock'
import Users from 'lucide-react-native/icons/users'
import Navigation from 'lucide-react-native/icons/navigation'
import ExternalLink from 'lucide-react-native/icons/external-link'
import LogIn from 'lucide-react-native/icons/log-in'
import User from 'lucide-react-native/icons/user'
import X from 'lucide-react-native/icons/x'
import Check from 'lucide-react-native/icons/check'
import ChevronDown from 'lucide-react-native/icons/chevron-down'
import Eye from 'lucide-react-native/icons/eye'
import EyeOff from 'lucide-react-native/icons/eye-off'
import Film from 'lucide-react-native/icons/film'
import Ticket from 'lucide-react-native/icons/ticket'
import Guitar from 'lucide-react-native/icons/guitar'
import Wine from 'lucide-react-native/icons/wine'
import Theater from 'lucide-react-native/icons/theater'
import Store from 'lucide-react-native/icons/store'
import Palette from 'lucide-react-native/icons/palette'
import Star from 'lucide-react-native/icons/star'
import Smile from 'lucide-react-native/icons/face-slightly-smiling'
import Baby from 'lucide-react-native/icons/baby'
import Trophy from 'lucide-react-native/icons/trophy'
import Zap from 'lucide-react-native/icons/zap'
import Landmark from 'lucide-react-native/icons/landmark'
import Flame from 'lucide-react-native/icons/flame'

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
  /** Los íconos son decorativos por defecto (sin esta prop, TalkBack los
   * ignora: casi todos están dentro de un `Pressable` con su propia
   * etiqueta, o al lado de un texto que ya dice lo mismo). Si el ícono es el
   * único indicio de significado (sin texto ni `Pressable` con etiqueta al
   * lado), pasar `etiqueta` para que se anuncie como imagen con esa
   * descripción. Ningún llamador la usa todavía (46-f: se agrega la prop,
   * no se tocan los llamadores). */
  etiqueta?: string
}

export function Icono({ nombre, tamanio = 24, color, fill = 'none', strokeWidth, etiqueta }: IconoProps) {
  const Componente = ICONOS_LUCIDE[nombre]
  // `IconoProps` es una interfaz cerrada (no reenvía props arbitrarias de
  // quien llama), así que no hay riesgo de que un llamador pise estos cuatro
  // atributos por accidente. Igual van en un objeto separado, spreadeado
  // ANTES de `size`/`color`/`fill`/`strokeWidth`, para que quede explícito
  // que estos cuatro los decide ESTE componente a partir de `etiqueta` — el
  // default decorativo es a propósito, y si algún día `IconoProps` suma un
  // passthrough de props sueltas, ese spread tiene que ir ANTES de este
  // objeto (nunca después), para que no pueda pisar la decisión de
  // accesibilidad.
  const atributosAccesibilidad = etiqueta
    ? { accessibilityRole: 'image' as const, accessibilityLabel: etiqueta }
    : { accessible: false, importantForAccessibility: 'no' as const }
  return <Componente {...atributosAccesibilidad} size={tamanio} color={color} fill={fill} strokeWidth={strokeWidth} />
}
