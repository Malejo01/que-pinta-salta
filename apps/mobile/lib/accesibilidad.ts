/**
 * Base pura de accesibilidad: distancia táctil mínima (`hitSlopPara`),
 * contraste WCAG 2.x sobre colores hex (`luminanciaRelativa`, `contraste`,
 * `cumpleContraste`) y el tope de escala de fuente para cajas de tamaño fijo
 * (`ESCALA_MAXIMA_COMPACTA`, `tamanioConEscala`).
 *
 * Puro: no importa `react-native` ni `expo-*`, igual que `lib/theme.ts` y
 * `lib/color.ts` — así se puede probar con Vitest en entorno `node`, sin
 * montar nada. Los componentes van a consumir estas funciones (hitSlop,
 * maxFontSizeMultiplier), no al revés.
 */

/** Tamaño mínimo recomendado para un elemento táctil (dp), guía de Android
 * ("Accessibility: touch target size", 48dp). */
export const AREA_TACTIL_MINIMA = 48

/** Los cuatro insets que acepta `hitSlop` de React Native. */
export interface HitSlop {
  top: number
  bottom: number
  left: number
  right: number
}

/**
 * El `hitSlop` simétrico (mismo valor en los dos lados de cada eje) que le
 * falta a un elemento de `ancho` x `alto` (dp, los dos en el mismo sentido
 * que `AREA_TACTIL_MINIMA`) para llegar a `AREA_TACTIL_MINIMA` en cada eje.
 * `alto` es opcional: por defecto es igual a `ancho` (elemento cuadrado).
 *
 * Redondea hacia arriba (`Math.ceil`) y nunca da negativo: un eje que ya
 * llega a `AREA_TACTIL_MINIMA` (o lo pasa) da 0 en sus dos lados.
 *
 * Ejemplos (el contrato de esta función):
 * - `hitSlopPara(40)` → `{ top: 4, bottom: 4, left: 4, right: 4 }`.
 * - `hitSlopPara(48)` y `hitSlopPara(50)` → los cuatro en 0.
 * - `hitSlopPara(20, 6)` → `left`/`right` 14, `top`/`bottom` 21.
 */
export function hitSlopPara(ancho: number, alto: number = ancho): HitSlop {
  const faltanteHorizontal = Math.max(0, AREA_TACTIL_MINIMA - ancho)
  const faltanteVertical = Math.max(0, AREA_TACTIL_MINIMA - alto)
  const lateral = Math.ceil(faltanteHorizontal / 2)
  const vertical = Math.ceil(faltanteVertical / 2)
  return { top: vertical, bottom: vertical, left: lateral, right: lateral }
}

// R72, 72-c (QPS-362): medidas de los botones de arriba a la derecha de la
// tarjeta de evento (corazón y Compartir). Viven acá (módulo puro) y no en
// `TarjetaEvento.tsx` para que los tests las importen sin montar
// `react-native`; la tarjeta las usa en el JSX y en los estilos, y los tests
// verifican que el fuente las use (no que repita el literal).
/** Diámetro de los botones de la tarjeta (dp). */
export const TARJETA_TAMANIO_ACCION = 32
/** Separación entre Compartir y el corazón (dp). */
export const TARJETA_GAP_ACCIONES = 6
/** Margen de los botones (y del badge) al borde de la tarjeta (dp). */
export const TARJETA_MARGEN = 8

const HEX_RE = /^#[0-9a-fA-F]{6}$/

/**
 * Descompone un `#rrggbb` en sus tres canales (0-1). Tira si `hex` no tiene
 * exactamente ese formato: ni abreviado a 3 dígitos (`#fff`), ni `rgb(...)`,
 * ni `oklch(...)`, ni vacío, ni con dígitos fuera de rango hexadecimal
 * (`#GGGGGG`). `lib/color.ts` (`oklchToHex`) es quien produce ese formato a
 * partir de los tokens de `lib/theme.ts`; esta función solo acepta su
 * salida, no la convierte.
 */
function componentesHex(hex: string): [number, number, number] {
  if (!HEX_RE.test(hex)) {
    throw new Error(`luminanciaRelativa/contraste: color inválido, se espera "#rrggbb": "${hex}"`)
  }
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return [r, g, b]
}

/** sRGB -> sRGB lineal (WCAG 2.x, umbral 0,04045). */
function canalLineal(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/**
 * Luminancia relativa WCAG 2.x de un color `#rrggbb` (sRGB linealizado).
 * Tira si `hex` no tiene ese formato exacto (ver `componentesHex`).
 */
export function luminanciaRelativa(hex: string): number {
  const [r, g, b] = componentesHex(hex)
  const R = canalLineal(r)
  const G = canalLineal(g)
  const B = canalLineal(b)
  return 0.2126 * R + 0.7152 * G + 0.0722 * B
}

/**
 * Ratio de contraste WCAG 2.x entre dos colores `#rrggbb`: entre 1 y 21, sin
 * importar el orden de `hexA`/`hexB` (se usa `max`/`min` de las dos
 * luminancias, no el orden de los argumentos). Tira si alguno de los dos no
 * tiene el formato esperado (ver `luminanciaRelativa`).
 */
export function contraste(hexA: string, hexB: string): number {
  const la = luminanciaRelativa(hexA)
  const lb = luminanciaRelativa(hexB)
  const claro = Math.max(la, lb)
  const oscuro = Math.min(la, lb)
  return (claro + 0.05) / (oscuro + 0.05)
}

/**
 * Los tres usos de WCAG 2.x que le interesan a esta app: `'texto'` (texto
 * normal, mínimo 4,5), `'texto-grande'` (texto grande, mínimo 3) y
 * `'componente'` (contorno o relleno de un control interactivo, mínimo 3).
 */
export type UsoContraste = 'texto' | 'texto-grande' | 'componente'

const MINIMOS_CONTRASTE: Record<UsoContraste, number> = {
  texto: 4.5,
  'texto-grande': 3,
  componente: 3,
}

/** `true` si `ratio` llega al mínimo de WCAG 2.x que pide `uso`. */
export function cumpleContraste(ratio: number, uso: UsoContraste): boolean {
  return ratio >= MINIMOS_CONTRASTE[uso]
}

/**
 * Tope de `maxFontSizeMultiplier` para textos dentro de cajas de tamaño
 * fijo, donde un texto muy agrandado se corta o desborda. Aplicado hoy en:
 * - la tarjeta de evento (`TarjetaEvento`): todos sus textos, incluido el
 *   badge de categoría.
 * - la insignia de destacado (`InsigniaDestacado`), que desde la R50 es un
 *   componente propio y es la única copia de ese badge: la dibujan la
 *   tarjeta, el Hero y la ficha.
 * - el Hero de portada (`Hero`): todos sus textos, incluido el badge de
 *   categoría.
 * - el badge de categoría de la ficha de evento (`app/evento/[id].tsx`).
 * - el rótulo "Publicidad" del banner de AdMob (`BannerAnuncio`, R60). Es la
 *   única entrada de esta lista donde el motivo NO es "se corta": el
 *   contenedor del banner no tiene alto fijo, así que un rótulo más grande no
 *   desborda nada. El tope está para que el rótulo quede proporcionado al
 *   banner, que SÍ es de alto fijo pero no es nuestro (lo dibuja el SDK y no
 *   escala con la fuente del sistema): sin tope, con la letra del sistema al
 *   máximo el rótulo puede llegar a competir en altura con el aviso que
 *   rotula.
 *
 * A propósito, SIN tope:
 * - las pills de atajos (`PillsAtajos`): la fila es un scroll horizontal
 *   donde el ancho de cada pill se adapta al texto, y el resaltado animado
 *   mide el layout real de cada pill con `onLayout`, así que acompaña un
 *   texto más grande sin romperse. Un tope ahí sería una barrera sin
 *   beneficio.
 *
 * Resuelto en `components/EtiquetaPestana.tsx` (QPS-243, 49-c): las
 * pestañas de abajo (`app/(tabs)/_layout.tsx`) ya no usan
 * `tabBarLabelStyle` (un objeto de estilo, que no acepta
 * `maxFontSizeMultiplier`), sino un `tabBarLabel` propio que dibuja la
 * etiqueta con ese componente.
 *
 * En el resto de la app (párrafos, títulos de pantalla, formularios) no hay
 * tope a propósito: el texto escala libre con la fuente del sistema.
 */
export const ESCALA_MAXIMA_COMPACTA = 1.4

/**
 * El tamaño de fuente efectivo que aplica React Native: `fontSize` por el
 * multiplicador de escala del sistema (`fontScale`), recortado a
 * `maxMultiplier` si se pasa uno (equivalente a `maxFontSizeMultiplier`).
 * Sin `maxMultiplier`, `fontScale` se usa tal cual, sin tope.
 */
export function tamanioConEscala(fontSize: number, fontScale: number, maxMultiplier?: number): number {
  const multiplicador = maxMultiplier === undefined ? fontScale : Math.min(fontScale, maxMultiplier)
  return fontSize * multiplicador
}
