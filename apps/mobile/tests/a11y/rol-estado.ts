// 46-q2 (Ronda 46, calidad de la app): funciones puras para la regla
// rol↔estado de accesibilidad.
//
// El agujero real (ver el encargo de 46-q2): `components/PantallaRadar.tsx`
// tenía `accessibilityRole="radio"` con `accessibilityState={{ selected: … }}`.
// La clave que corresponde a `radio` (y a `checkbox`) es `checked`, no
// `selected`: es la que mapea a `AccessibilityNodeInfo.isChecked` en Android
// y la que hace que TalkBack diga "marcado"/"no marcado". Con `selected`, la
// persona no se entera de qué opción eligió. Ya está arreglado (commit
// `1d12a71`) — este módulo (+ `tests/accesibilidad-rol-estado.test.ts`) es el
// detector que faltaba para que el bug no pueda volver sin que algo lo note.
//
// Al revés: un `accessibilityRole="button"` que participa de una selección
// (los chips de `PillsAtajos.tsx`, los filtros de
// `SeccionNotificaciones.tsx` y de `app/(tabs)/buscar.tsx`, el botón de
// `BotonesAsistencia.tsx`) usa `selected`, nunca `checked` — es la
// CONVENCIÓN DE ESTA APP, no una regla general de ARIA/React Native (otros
// roles, como `tab`, podrían tomar `selected` oficialmente, pero esta app no
// tiene ninguno hoy, así que no están en el mapa de abajo).
//
// Vive en un módulo SIN `.test.ts` (no lo recoge `vitest.config.ts`, que solo
// incluye `tests/**/*.test.ts`) por el mismo motivo que
// `tests/a11y/hitslop-medidas.ts` (ver su comentario de cabecera): estas
// funciones son puras, no dependen de `tocablesDe`/`valorAccessibilityRole`/
// `extraerAtributoBalanceado` del detector de 46-b, así que
// `tests/accesibilidad-rol-estado.test.ts` las puede importar de ACÁ (sin
// duplicar nada) y, por separado, las piezas que sí necesita del detector
// directamente de `./accesibilidad-detector.test` — el único `*.test.ts` que
// importa, sin encadenar.

export type ClaveEstado = 'checked' | 'selected'

/** El rol → la clave de `accessibilityState` que le corresponde en esta app.
 * Un rol que no está en este mapa (`header`, `link`, `button` usado sin
 * estado de selección, etc.) no es asunto de esta regla: no participa de
 * selección/marcado, y esta regla no tiene nada que decir de él. */
export const CLAVE_ESPERADA_POR_ROL: Readonly<Record<string, ClaveEstado>> = {
  radio: 'checked',
  checkbox: 'checked',
  button: 'selected',
}

const CLAVES_RELEVANTES: readonly ClaveEstado[] = ['checked', 'selected']

/**
 * `true` si `textoAccessibilityState` (lo que da
 * `extraerAtributoBalanceado(apertura, 'accessibilityState')` del detector
 * de 46-b) es un objeto literal (`{ ... }`, con sus propias llaves — ver el
 * aviso del encargo: ese extractor devuelve el objeto INTERNO con sus
 * llaves, por ejemplo `"{ checked: seleccionada }"`).
 *
 * `false` para cualquier otra cosa: `null` (el tocable no tiene el
 * atributo), o un texto que no empieza y termina con `{`/`}` — el caso de
 * `accessibilityState={estadoDelBoton}` (una variable: el extractor da
 * `"estadoDelBoton"`, sin llaves propias) o de un spread SOLO (no hay ningún
 * caso así en JS: un spread siempre vive dentro de un `{}`, pero se cubre
 * igual por si acaso).
 *
 * LÍMITE CONOCIDO: si no es un objeto literal, esta función (y
 * `hallazgoRolEstadoDe`, que la usa) no adivina su contenido — no es un
 * hallazgo. Ver el test de límite en `tests/accesibilidad-rol-estado.test.ts`
 * que prueba esto tal cual es.
 */
export function esObjetoLiteralDeEstado(textoAccessibilityState: string | null): boolean {
  if (textoAccessibilityState === null) return false
  const t = textoAccessibilityState.trim()
  return t.startsWith('{') && t.endsWith('}')
}

/**
 * Las claves de `CLAVES_RELEVANTES` (`checked`, `selected`) que aparecen,
 * literalmente, como `nombre:` dentro de `textoObjeto` — con límite de
 * palabra (`\b`), así que no confunde ninguna otra clave que solo contenga
 * "checked" o "selected" como substring. `busy`, `disabled` y `expanded`
 * (válidos con cualquier rol) nunca se buscan, así que nunca se confunden
 * con las dos que importan, aunque vengan en el mismo objeto
 * (`{ selected: x, disabled: y }`, `{ checked: x, busy: y }`).
 *
 * No baja a objetos anidados: no hay, hoy, ningún `accessibilityState` cuyo
 * valor sea a su vez un objeto (sus valores son siempre booleanos o
 * variables/expresiones que resuelven a boolean).
 */
export function clavesDeEstadoPresentes(textoObjeto: string): Set<ClaveEstado> {
  const resultado = new Set<ClaveEstado>()
  for (const clave of CLAVES_RELEVANTES) {
    if (new RegExp(`\\b${clave}\\s*:`).test(textoObjeto)) resultado.add(clave)
  }
  return resultado
}

export interface HallazgoRolEstado {
  rol: string
  claveEncontrada: ClaveEstado
  claveEsperada: ClaveEstado
}

/**
 * El hallazgo de la regla rol↔estado para UN tocable, o `null` si no hay
 * ninguno:
 *
 * - `rol` ES uno de `CLAVE_ESPERADA_POR_ROL` (si no, la regla no aplica —
 *   cubre, entre otros, el caso `rol === null`, que ya es asunto de la regla
 *   `sin-rol` de 46-b, no de esta);
 * - Y `textoAccessibilityState` ES un objeto literal (si no, límite
 *   conocido — ver `esObjetoLiteralDeEstado`);
 * - Y ese objeto literal trae, literalmente, la clave PROHIBIDA para ese rol
 *   (la que no es `CLAVE_ESPERADA_POR_ROL[rol]`): `selected` en vez de
 *   `checked` para `radio`/`checkbox`, o `checked` en vez de `selected` para
 *   `button`.
 *
 * `rol` y `textoAccessibilityState` se reciben YA leídos (de
 * `valorAccessibilityRole`/`extraerAtributoBalanceado` del detector de
 * 46-b): esta función no sabe nada de JSX, solo de las dos reglas de más
 * arriba.
 */
export function hallazgoRolEstadoDe(rol: string | null, textoAccessibilityState: string | null): HallazgoRolEstado | null {
  if (rol === null) return null
  const claveEsperada = CLAVE_ESPERADA_POR_ROL[rol]
  if (claveEsperada === undefined) return null
  if (!esObjetoLiteralDeEstado(textoAccessibilityState)) return null

  const claves = clavesDeEstadoPresentes(textoAccessibilityState as string)
  const claveProhibida: ClaveEstado = claveEsperada === 'checked' ? 'selected' : 'checked'
  if (!claves.has(claveProhibida)) return null

  return { rol, claveEncontrada: claveProhibida, claveEsperada }
}
