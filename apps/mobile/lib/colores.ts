// QPS-126: hook de los 8 tokens de color de la web, según el esquema de
// color del sistema. La parte pura (`coloresSegunEsquema`) vive en
// `lib/theme.ts`, que no importa `react-native`; este módulo sí, porque
// `useColorScheme` es de `react-native`. Lo usan 28-f, 28-h y 28-c.
import { useColorScheme } from 'react-native'
import { coloresSegunEsquema, type ColoresQPS } from '@/lib/theme'

export type { ColoresQPS }

/** Los 8 tokens de color (`background`, `foreground`, `card`, `primary`,
 * `primaryForeground`, `muted`, `mutedForeground`, `border`) según el
 * esquema de color del sistema (claro u oscuro). */
export function useColoresQPS(): ColoresQPS {
  const esquema = useColorScheme()
  // `useColorScheme()` puede devolver `'unspecified'` (Android, sin
  // preferencia del sistema) además de `'light'`/`'dark'`/`null`;
  // `coloresSegunEsquema` solo distingue `'dark'` de "cualquier otra cosa".
  return coloresSegunEsquema(esquema === 'dark' ? 'dark' : 'light')
}
