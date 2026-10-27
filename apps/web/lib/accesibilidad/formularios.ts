/**
 * B4: cómo se asocia el error de un formulario con sus campos.
 *
 * Los formularios de ingreso, alta, recuperar y cambiar contraseña muestran
 * un solo mensaje de error arriba del botón. Antes ese mensaje no estaba
 * atado a nada: un lector de pantalla no lo anunciaba al aparecer ni lo leía
 * al volver al campo. El patrón ahora es:
 *
 * - el mensaje lleva un `id` y `role="alert"` (se anuncia apenas aparece);
 * - cada campo relacionado lleva `aria-describedby` con ese `id` mientras el
 *   error está a la vista (al volver al campo, el lector lee también el
 *   error);
 * - `aria-invalid` solo cuando el error es sobre lo que se escribió en ese
 *   campo (contraseñas que no coinciden, email o contraseña incorrectos). Un
 *   error que no es del campo (Google, red, límite de envíos) se anuncia
 *   igual pero no marca el campo como inválido.
 */
export interface AriaDelCampo {
  "aria-describedby"?: string
  "aria-invalid"?: true
}

export function ariaDelCampo(idError: string, hayError: boolean, campoInvalido: boolean): AriaDelCampo {
  if (!hayError) return {}
  return campoInvalido
    ? { "aria-describedby": idError, "aria-invalid": true }
    : { "aria-describedby": idError }
}

/**
 * Clases del texto de error. `text-destructive` sobre `bg-destructive/10`
 * daba 4,0:1 en claro y 1,9:1 en oscuro (el `--destructive` del tema oscuro
 * es un rojo muy oscuro, pensado para fondos); red-700 / red-400 dan más de
 * 5:1 en los dos temas. Ver tests/accesibilidad/b4-contraste.test.ts.
 */
export const CLASES_TEXTO_ERROR = "text-red-700 dark:text-red-400"
