/**
 * A1 (nube Q1): la parte pura de los esqueletos de carga
 * (`components/Esqueleto.tsx`). Inicio, Buscar, Cines y la ficha de un evento
 * dejan de mostrar el indicador centrado (`Cargando`, de
 * `components/EstadoCarga.tsx`) en la carga inicial y pasan a dibujar bloques
 * grises con la forma de lo que viene, con un pulso de opacidad.
 *
 * Puro: no importa `react-native` ni `expo-*`, igual que `lib/accesibilidad.ts`
 * y `lib/hero-accesible.ts` — así se prueba con Vitest en entorno `node`
 * (`tests/esqueletos.test.ts`). El componente consume estas funciones, no al
 * revés.
 */

/** Opacidad de los bloques en el punto alto del pulso, y la fija cuando no se anima. */
export const OPACIDAD_MAXIMA = 1

/** Opacidad en el punto bajo del pulso. No baja a 0: con el token `muted`
 * sobre `background` los bloques desaparecerían del todo en cada vuelta, y el
 * pulso pasaría a leerse como un parpadeo. */
export const OPACIDAD_MINIMA = 0.45

/** Duración de cada medio pulso (bajar o subir), en ms: una vuelta completa
 * dura el doble (1,6 s). Más lento que el estándar de 1 s a propósito: con
 * cuatro pantallas que lo usan, un pulso rápido cansa la vista. */
export const DURACION_MEDIO_PULSO_MS = 800

export interface AnimacionEsqueleto {
  /** `true`: se arma el `Animated.loop`. `false`: opacidad fija. */
  anima: boolean
  /** La opacidad que queda puesta cuando `anima` es `false`. */
  opacidadFija: number
}

/**
 * Si el esqueleto pulsa o queda quieto, según "Reducir movimiento" /
 * "Quitar animaciones" del sistema (`AccessibilityInfo.isReduceMotionEnabled`
 * y el evento `reduceMotionChanged`, que lee el componente).
 *
 * `reducirMovimiento` es `null` mientras la consulta no resolvió (la promesa
 * llega después del primer render): en ese rato tampoco se anima. Así quien
 * tiene el ajuste prendido nunca ve ni el primer cuadro del pulso; para el
 * resto, la demora es imperceptible (milisegundos) y el esqueleto ya está a
 * la vista, quieto, desde el primer render.
 */
export function animacionEsqueleto(reducirMovimiento: boolean | null): AnimacionEsqueleto {
  return { anima: reducirMovimiento === false, opacidadFija: OPACIDAD_MAXIMA }
}

/**
 * Cuántos bloques de una fila horizontal "asoman" en `anchoDisponible` (dp):
 * los que arrancan antes del borde derecho, aunque el último quede cortado
 * — igual que las filas reales (`FilaCategoria`, `ChipsCategorias`,
 * `PillsAtajos`), que son listas horizontales donde la tarjeta o el chip
 * siguiente se ve a medias. El componente corta lo que sobra con
 * `overflow: 'hidden'`, así que la pantalla nunca se ensancha: a 360 dp
 * (16 + 180 + 20 = 216 < 360) asoman 2 tarjetas de 180, la segunda cortada.
 *
 * `anchos` son los anchos de cada bloque en orden; `margenInicial`, el padding
 * izquierdo de la fila; `separacion`, el `gap`. Siempre devuelve al menos 1
 * si hay bloques (una fila de esqueleto vacía no tiene sentido), y nunca más
 * que `anchos.length`. Con un ancho no válido (0, negativo, `NaN` — por
 * ejemplo antes de que la ventana tenga medida) devuelve 1.
 */
export function cantidadQueAsoma(
  anchoDisponible: number,
  anchos: readonly number[],
  margenInicial: number,
  separacion: number,
): number {
  if (anchos.length === 0) return 0
  if (!Number.isFinite(anchoDisponible) || anchoDisponible <= 0) return 1

  let x = margenInicial
  let cantidad = 0
  for (const ancho of anchos) {
    if (x >= anchoDisponible) break
    cantidad += 1
    x += ancho + separacion
  }
  return Math.max(1, cantidad)
}

/**
 * Reparte `cantidad` celdas en filas de `columnas` (los índices, para usarlos
 * de `key`): `filasDeGrilla(5, 2)` → `[[0, 1], [2, 3], [4]]`. Es la grilla de
 * 2 columnas de Buscar (tiles de categoría o tarjetas). Con `columnas` < 1 se
 * toma 1; con `cantidad` <= 0, ninguna fila.
 */
export function filasDeGrilla(cantidad: number, columnas: number): number[][] {
  const porFila = Math.max(1, Math.floor(columnas))
  const filas: number[][] = []
  for (let inicio = 0; inicio < cantidad; inicio += porFila) {
    const fila: number[] = []
    for (let i = inicio; i < Math.min(cantidad, inicio + porFila); i += 1) fila.push(i)
    filas.push(fila)
  }
  return filas
}
