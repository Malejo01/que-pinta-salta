/**
 * B4: el link "Saltar al contenido" que va primero en la `Navbar`.
 *
 * El destino normal es `#contenido`, el id que llevan los `<main>` de las
 * páginas auditadas (portada, ficha, cines, radar, favoritos, flyer). Hay
 * páginas que montan la `Navbar` y cuyo `<main>` no lleva ese id (mapa,
 * buscar, las legales: otras zonas del repo), y ahí el ancla no tendría a
 * dónde ir. Por eso el `onClick` del link llama a `saltarAlContenido`:
 *
 * - si existe `#contenido`, no hace nada y devuelve `false`: el navegador
 *   sigue el ancla como siempre (desplaza y, como ese `<main>` tiene
 *   `tabIndex={-1}`, le pasa el foco);
 * - si no existe, busca el primer `<main>`, le pone `tabindex="-1"` si no
 *   tenía (sin eso un `<main>` no puede recibir foco), lo lleva a la vista,
 *   le pasa el foco y devuelve `true` para que el link cancele la
 *   navegación (`preventDefault`), así no queda un `#contenido` colgado en
 *   la URL;
 * - si tampoco hay `<main>`, devuelve `false` y el ancla queda como está.
 *
 * Además, `asegurarDestino` (la llama un efecto de la Navbar al montarse)
 * le pone `id="contenido"` al primer `<main>` cuando la página no tiene
 * ningún `#contenido`. Sin eso, axe (regla `skip-link`, que también usa
 * Lighthouse) marca el link como roto en esas páginas aunque el `onClick`
 * funcione. El `onClick` queda igual como red: si el `<main>` todavía no
 * estaba al montar (un `Suspense`) o se reemplazó después, sigue andando.
 *
 * Las dos reciben el `document` como parámetro (y solo usan lo que declara
 * `DocumentoMinimo`) para poder probarlas con un documento falso, sin DOM.
 */
export const ID_CONTENIDO = "contenido"

export interface ElementoEnfocable {
  id: string
  hasAttribute(nombre: string): boolean
  setAttribute(nombre: string, valor: string): void
  focus(opciones?: { preventScroll?: boolean }): void
  scrollIntoView?(opciones?: { block?: "start" }): void
}

export interface DocumentoMinimo {
  getElementById(id: string): unknown
  querySelector(selector: "main"): ElementoEnfocable | null
}

export function saltarAlContenido(doc: DocumentoMinimo): boolean {
  if (doc.getElementById(ID_CONTENIDO)) return false

  const main = doc.querySelector("main")
  if (!main) return false

  if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1")
  main.scrollIntoView?.({ block: "start" })
  // `preventScroll`: el desplazamiento ya lo hizo `scrollIntoView`, que
  // respeta el `scroll-margin`; `focus()` solo no siempre lo hace.
  main.focus({ preventScroll: true })
  return true
}

/**
 * Si la página no tiene `#contenido` y su primer `<main>` no tiene id, se lo
 * pone (con `tabindex="-1"` si no tenía, para que pueda recibir el foco al
 * seguir el ancla). Devuelve `true` si cambió algo. No pisa un id que el
 * `<main>` ya tenga.
 */
export function asegurarDestino(doc: DocumentoMinimo): boolean {
  if (doc.getElementById(ID_CONTENIDO)) return false
  const main = doc.querySelector("main")
  if (!main || main.id) return false
  main.id = ID_CONTENIDO
  if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1")
  return true
}
