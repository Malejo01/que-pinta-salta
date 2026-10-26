// QPS-126: hook de los tokens de color de la web. La parte pura
// (`coloresSegunEsquema`) vive en `lib/theme.ts`, que no importa
// `react-native`. Lo usan 28-f, 28-h, 28-c y, desde 29-g, casi todos los
// componentes nuevos de la ronda (`Texto`, `Encabezado`, las pestañas).
import { COLORES_OSCURO, coloresSegunEsquema, type ColoresQPS } from '@/lib/theme'

export type { ColoresQPS }

// R69, 69-b (QPS-338): borde de los controles inactivos (chips de categoría)
// con contraste >= 3:1 contra el fondo de la portada (WCAG 1.4.11, componentes
// no textuales). El token global `border` (oklch 0.25 / 0.9, pensado como
// divisor) da ~1,3:1 y ~1,2:1; no se toca porque lo usa toda la app. Razón =
// (L1 + 0,05) / (L2 + 0,05), con L la luminancia relativa sRGB:
// - Oscuro: fondo `COLORES_OSCURO.background` (oklch 0.1, ~#030303, L ~0,001)
//   y borde #666666 (L = 0,133): (0,133 + 0,05) / (0,001 + 0,05) = ~3,6:1.
// - Claro: fondo `COLORES_CLARO.background` (oklch 0.98, ~#f9f9f9, L ~0,947)
//   y borde #8a8a8a (L = 0,254): (0,947 + 0,05) / (0,254 + 0,05) = ~3,3:1.
const BORDE_CONTROL_OSCURO = '#666666'
const BORDE_CONTROL_CLARO = '#8a8a8a'

/** Borde (>= 3:1 contra el fondo) de los chips inactivos, según el esquema de `colores`. */
export function bordeChipInactivo(colores: ColoresQPS): string {
  return colores.background === COLORES_OSCURO.background ? BORDE_CONTROL_OSCURO : BORDE_CONTROL_CLARO
}

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
