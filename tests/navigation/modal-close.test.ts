import { describe, expect, it } from "vitest"
import {
  detectInSiteBack,
  resolveModalClose,
  type WindowWithNavigation,
} from "@/lib/navigation/modal-close"

describe("resolveModalClose", () => {
  it("con entrada previa del sitio (true) vuelve con back", () => {
    expect(resolveModalClose({ canGoBackInSite: true, fallbackHref: "/" })).toEqual({
      type: "back",
    })
  })

  it("sin entrada previa del sitio (false) reemplaza al fallback", () => {
    expect(resolveModalClose({ canGoBackInSite: false, fallbackHref: "/" })).toEqual({
      type: "replace",
      href: "/",
    })
  })

  it("si no se sabe (null) mantiene el comportamiento de siempre: back", () => {
    expect(resolveModalClose({ canGoBackInSite: null, fallbackHref: "/" })).toEqual({
      type: "back",
    })
  })
})

describe("detectInSiteBack", () => {
  it("con Navigation API y canGoBack=true devuelve true", () => {
    const win: WindowWithNavigation = { navigation: { canGoBack: true } }
    expect(detectInSiteBack(win)).toBe(true)
  })

  it("con Navigation API y canGoBack=false devuelve false", () => {
    const win: WindowWithNavigation = { navigation: { canGoBack: false } }
    expect(detectInSiteBack(win)).toBe(false)
  })

  it("sin Navigation API (Safari/Firefox) devuelve null", () => {
    const win: WindowWithNavigation = {}
    expect(detectInSiteBack(win)).toBeNull()
  })
})
