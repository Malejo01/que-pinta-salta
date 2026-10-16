// QPS-126: hook de los tokens de color de la web. La parte pura
// (`coloresSegunEsquema`) vive en `lib/theme.ts`, que no importa
// `react-native`. Lo usan 28-f, 28-h, 28-c y, desde 29-g, casi todos los
// componentes nuevos de la ronda (`Texto`, `Encabezado`, las pestañas).
import { coloresSegunEsquema, type ColoresQPS } from '@/lib/theme'

export type { ColoresQPS }

/**
 * Los tokens de color (`background`, `foreground`, `card`, `primary`,
 * `primaryForeground`, `muted`, `mutedForeground`, `border`, `input`).
 *
 * D1 (29-g, decisión de Mauro): la app arranca en oscuro, como la web; el
 * selector de tema va después. Por eso acá no se lee `useColorScheme()`: se
 * llama directo a `coloresSegunEsquema('dark')`, que queda intacta y sigue
 * aceptando cualquier esquema (la usa el selector del futuro).
 */
export function useColoresQPS(): ColoresQPS {
  return coloresSegunEsquema('dark')
}
