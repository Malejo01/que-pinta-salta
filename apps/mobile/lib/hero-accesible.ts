/**
 * Lógica pura del Hero para TalkBack/VoiceOver (49-f, QPS-246):
 * - las acciones accesibles ("siguiente"/"anterior") que reemplazan al
 *   deslizar cuando el gesto no es viable para quien usa el lector de
 *   pantalla;
 * - a qué diapositiva cae cada acción (`indiceTrasAccion`);
 * - la etiqueta que lee el lector de cada diapositiva (`etiquetaDiapositiva`).
 *
 * Puro: no importa `react-native` ni `expo-*` (igual que `lib/accesibilidad.ts`
 * y `lib/theme.ts`), así se puede probar con Vitest en entorno `node`, sin
 * montar nada. `components/Hero.tsx` es quien consume estas funciones.
 */

/**
 * Forma mínima que necesita `accessibilityActions` de React Native
 * (`AccessibilityActionInfo`, en `ViewAccessibility.d.ts`: `{ name: string;
 * label?: string }`). Se declara a mano, sin importar `react-native`, para
 * que este módulo siga siendo puro. `label` queda obligatorio acá porque las
 * dos acciones de `ACCIONES_HERO` siempre lo llevan.
 */
export interface AccionAccesibilidadHero {
  name: string
  label: string
}

/**
 * Las dos acciones accesibles del Hero: avanzan/retroceden una diapositiva
 * sin depender del deslizamiento (que con TalkBack/VoiceOver prendido no es
 * el gesto principal). Se le pasan a `accessibilityActions` solo cuando hay
 * más de una diapositiva (`components/Hero.tsx`: `total > 1`).
 */
export const ACCIONES_HERO: AccionAccesibilidadHero[] = [
  { name: 'siguiente', label: 'Siguiente evento' },
  { name: 'anterior', label: 'Evento anterior' },
]

/**
 * Resto siempre no negativo (a diferencia de `%` de JS, que puede dar
 * negativo si `n` es negativo): así un `indice` fuera de rango —negativo o
 * mayor o igual a `total`— siempre cae dentro de `[0, total)` antes de
 * sumarle o restarle un paso.
 */
function moduloPositivo(n: number, total: number): number {
  return ((n % total) + total) % total
}

/**
 * A qué diapositiva cae la acción accesible `accion` ("siguiente" o
 * "anterior" de `ACCIONES_HERO`, aunque acepta cualquier string porque así
 * llega `evento.nativeEvent.actionName` desde React Native), partiendo de
 * `indice` sobre `total` diapositivas. Da la vuelta en los dos sentidos: de
 * la última a la primera (`siguiente`) y de la primera a la última
 * (`anterior`).
 *
 * - Con `total <= 1` no hay a dónde moverse: devuelve `indice` tal cual, sin
 *   tocarlo (ni siquiera lo normaliza si viniera fuera de rango).
 * - Con una acción desconocida (ni "siguiente" ni "anterior") devuelve
 *   `indice` sin cambios: no sabemos para qué lado mover, así que la decisión
 *   más segura es no moverse. Nota: si ese `indice` ya venía fuera de rango,
 *   con una acción desconocida queda fuera de rango todavía — esta función no
 *   lo corrige porque no está tomando ninguna decisión de movimiento.
 * - Con un `indice` fuera de rango (negativo o >= `total`) y una acción
 *   conocida, SÍ lo corrige: lo normaliza a `[0, total)` antes de sumar o
 *   restar un paso (ver `moduloPositivo`), así el resultado siempre es un
 *   índice válido.
 */
export function indiceTrasAccion(accion: string, indice: number, total: number): number {
  if (total <= 1) return indice
  if (accion === 'siguiente') return moduloPositivo(indice + 1, total)
  if (accion === 'anterior') return moduloPositivo(indice - 1, total)
  return indice
}

/**
 * La etiqueta que lee el lector de pantalla al enfocar la diapositiva
 * `indice` (base 0) de `total`: `"<título>, ver detalles, 2 de 5"` (el
 * número que se lee es `indice + 1`, en base 1, como espera quien escucha).
 * Con `total === 1` no hay "de cuántas" que anunciar (no tiene sentido decir
 * "1 de 1"): queda `"<título>, ver detalles"`.
 */
export function etiquetaDiapositiva(titulo: string, indice: number, total: number): string {
  if (total === 1) return `${titulo}, ver detalles`
  return `${titulo}, ver detalles, ${indice + 1} de ${total}`
}
