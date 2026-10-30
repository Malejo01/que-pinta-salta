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

// A1 (nube Q1, ronda de correcciones): colores propios de los esqueletos de
// carga (`components/Esqueleto.tsx`). El token `muted` (oklch 0.2, #161616 en
// oscuro) da ~1,14:1 contra el fondo y ~1,05:1 en el valle del pulso: el
// esqueleto no se veía. No se toca `muted` (lo usa toda la app: placeholders,
// pills del contador, la caja de precio). Mismo patrón que el borde de arriba:
// un hex por esquema, elegido a mano y documentado (el repo no deriva estos
// tonos de los tokens: `bordeChipInactivo` tampoco). Objetivo: que el bloque
// se distinga del fondo y de `card` sin competir con el contenido real (entre
// ~1,2:1 y ~1,8:1, también en el valle del pulso, con `OPACIDAD_MINIMA` = 0,7
// de `lib/esqueleto.ts`; lo verifica `tests/esqueletos-contraste.test.ts`).
// Razones (WCAG 2.x, `contraste` de `lib/accesibilidad.ts`):
// - Oscuro, bloque #2c2c2c: 1,48 sobre `background` (#030303) y 1,41 sobre
//   `card` (#0b0b0b); en el valle, 1,27 y 1,22. Lo que va encima de un bloque
//   (badge, líneas del Hero, del precio) #3c3c3c: 1,27 sobre el bloque.
// - Claro, bloque #d8d8d8: 1,34 sobre `background` (#f8f8f8) y 1,43 sobre
//   `card` (#ffffff); en el valle, 1,22 y 1,27. Encima, #c4c4c4: 1,22.
const BLOQUE_ESQUELETO_OSCURO = '#2c2c2c'
const BLOQUE_ESQUELETO_CLARO = '#d8d8d8'
const BLOQUE_ENCIMA_OSCURO = '#3c3c3c'
const BLOQUE_ENCIMA_CLARO = '#c4c4c4'

/** Relleno de los bloques del esqueleto (y de sus fondos llenos: Hero, afiches, caja de precio). */
export function colorBloqueEsqueleto(colores: ColoresQPS): string {
  return colores.background === COLORES_OSCURO.background ? BLOQUE_ESQUELETO_OSCURO : BLOQUE_ESQUELETO_CLARO
}

/** Relleno de lo que va encima de un bloque del esqueleto (un poco más marcado). */
export function colorBloqueEncima(colores: ColoresQPS): string {
  return colores.background === COLORES_OSCURO.background ? BLOQUE_ENCIMA_OSCURO : BLOQUE_ENCIMA_CLARO
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
