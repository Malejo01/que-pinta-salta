/**
 * Cierre de los modales de flyer y evento (QPS-… bug de celular, Ronda 16).
 *
 * `router.back()` a secas saca del sitio en Chrome de Android cuando el
 * modal no tiene una entrada previa del sitio en el historial (por ejemplo,
 * llegaron desde un link externo y el historial del navegador, antes de esa
 * carga, no es nuestro). La Navigation API expone `navigation.canGoBack`, y
 * `navigation.entries()` solo incluye entradas del mismo origen que la carga
 * actual: ese valor es justo "hay una entrada anterior del sitio", sin tener
 * que adivinarlo a partir de `document.referrer` ni de `window.history.length`
 * (que cuenta todo, incluida la pestaña antes de entrar al sitio).
 *
 * Disponible en Chrome y Edge; no en Safari/Firefox ni en los tipos del DOM
 * de TypeScript todavía, así que se tipa un `window` mínimo propio.
 * https://developer.mozilla.org/en-US/docs/Web/API/Navigation/canGoBack
 */

/** Lo único que necesitamos de `window.navigation`. */
interface NavigationLike {
  canGoBack: boolean
}

/** Lo único que necesitamos de `window` para esto: testeable sin navegador. */
export interface WindowWithNavigation {
  navigation?: NavigationLike
}

export type ModalCloseAction = { type: "back" } | { type: "replace"; href: string }

interface ResolveModalCloseParams {
  /**
   * `true`/`false`: lo que dice la Navigation API. `null`: no se sabe (no
   * está disponible en este navegador) — ahí se mantiene el comportamiento
   * de siempre (`back`) en vez de arriesgar un `replace` innecesario.
   */
  canGoBackInSite: boolean | null
  /** Adónde ir si no hay una entrada previa del sitio. */
  fallbackHref: string
}

/** Decide cómo cerrar el modal sin adivinar: `back` si hay dónde volver, `replace` si no. */
export function resolveModalClose({
  canGoBackInSite,
  fallbackHref,
}: ResolveModalCloseParams): ModalCloseAction {
  if (canGoBackInSite === false) {
    return { type: "replace", href: fallbackHref }
  }

  return { type: "back" }
}

/**
 * `true`/`false` si el navegador tiene Navigation API, `null` si no (Safari,
 * Firefox): ahí no hay forma de saber si existe una entrada previa del sitio.
 */
export function detectInSiteBack(win: WindowWithNavigation): boolean | null {
  const navigation = win.navigation
  if (!navigation) return null
  return navigation.canGoBack
}
