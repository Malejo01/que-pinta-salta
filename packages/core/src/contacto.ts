// Decisión de Mauro del 17/10: esta es la casilla de contacto única del
// sitio y la app. La casilla la crea Mauro. Este es el único lugar del
// repo con el literal: la web y la app importan `CONTACTO_EMAIL` y
// `mailtoContacto` de `@qps/core/contacto` en vez de repetirlo.
export const CONTACTO_EMAIL = 'contacto@quepintasalta.com.ar'

/**
 * Arma un link `mailto:` hacia {@link CONTACTO_EMAIL}. Si `asunto` tiene
 * contenido (no es `undefined`, vacío ni solo espacios), lo agrega como
 * `?subject=` codificado; si no, devuelve el `mailto:` pelado, sin `?`.
 */
export function mailtoContacto(asunto?: string): string {
  const base = `mailto:${CONTACTO_EMAIL}`
  if (!asunto || asunto.trim().length === 0) return base
  return `${base}?subject=${encodeURIComponent(asunto)}`
}
