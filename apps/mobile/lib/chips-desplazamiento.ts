// A2 (nube Q1, ronda de correcciones): a dónde se desplaza la fila horizontal
// de `components/ChipsCategorias.tsx` para traer a la vista el chip elegido.
// Lógica pura (sin React) para probarla con Vitest
// (`tests/portada-gratis.test.ts`).
//
// Antes (N2, QPS-354) la fila siempre iba a `x - 16` del chip elegido, y el
// `onLayout` del chip lo repetía cada vez que el chip cambiaba de lugar. Con
// el chip "Gratis" adelante eso lo sacaba de la vista: al elegir una categoría
// la fila se corría aunque la categoría ya entrara en pantalla, y al prender
// "Gratis" la lista de chips cambiaba, el chip activo se volvía a medir y la
// fila saltaba otra vez (TalkBack quedaba con el foco en un chip invisible).
// Ahora: si el chip entra entero en la ventana visible con la fila al
// principio, la fila va al principio (0), así "Gratis" y "Todas" siguen a la
// vista; si no entra, a `x - 16` como antes.
//
// A3 (nube Q1, ronda de correcciones): "Gratis" y "Para chicos" ya no van en
// esta fila (tienen una fila propia, fija, en la cabecera de la portada), así
// que "Todas" vuelve a arrancar en x = 16 y entra siempre: el criterio es el
// mismo y ya no hace falta un caso aparte para "Todas".

/** Posición y ancho de un chip dentro del contenido de la fila (de su `onLayout`). */
export interface MedidaChip {
  x: number
  width: number
}

/** Aire entre el borde de la ventana y el chip (el `paddingHorizontal` de la fila). */
export const AIRE_CHIP = 16

/**
 * Destino del `scrollTo` horizontal para el chip elegido, o `null` si todavía
 * no se puede saber (falta medir el chip o el ancho visible de la fila): en
 * ese caso no se desplaza y se vuelve a intentar cuando llegue la medida que
 * falta.
 *   - `x + width + 16 <= anchoVisible`: el chip entra con la fila al
 *     principio -> 0.
 *   - si no -> `x - 16` (nunca negativo).
 */
export function destinoScrollChip(medida: MedidaChip | undefined, anchoVisible: number | null): number | null {
  if (medida === undefined || anchoVisible === null) return null
  if (medida.x + medida.width + AIRE_CHIP <= anchoVisible) return 0
  return Math.max(0, medida.x - AIRE_CHIP)
}
