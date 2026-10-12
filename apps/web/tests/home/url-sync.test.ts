/**
 * `lib/home/url-sync.ts`: armado de la URL de filtros de la portada
 * (`nextHomeUrl`) y la condición que evita pisar el historial cuando la URL
 * ya es la que corresponde (`shouldReplaceUrl`). Sin red ni base.
 */
import { describe, expect, it, vi } from "vitest"
import { nextHomeUrl, shouldReplaceUrl, type HomeUrlFilters } from "@/lib/home/url-sync"

function makeFilters(overrides: Partial<HomeUrlFilters> = {}): HomeUrlFilters {
  return {
    search: "",
    date: null,
    category: null,
    establishment: "",
    location: "",
    dateExact: null,
    instagram: true,
    ...overrides,
  }
}

describe("nextHomeUrl", () => {
  it("sin filtros devuelve la raíz", () => {
    expect(nextHomeUrl(makeFilters())).toBe("/")
  })

  it("con un filtro de búsqueda agrega el query param", () => {
    expect(nextHomeUrl(makeFilters({ search: "peña" }))).toBe("/?search=pe%C3%B1a")
  })

  it("con varios filtros los agrega todos, en el mismo orden de siempre", () => {
    const url = nextHomeUrl(
      makeFilters({
        search: "rock",
        date: "hoy",
        category: "boliches",
        establishment: "La Casona",
        location: "Centro",
        dateExact: "2030-10-10",
      })
    )
    expect(url).toBe(
      "/?search=rock&date=hoy&category=boliches&establishment=La+Casona&location=Centro&dateExact=2030-10-10"
    )
  })

  it("instagram en true (el valor por defecto) no agrega query param", () => {
    expect(nextHomeUrl(makeFilters({ instagram: true }))).toBe("/")
  })

  it("instagram en false sí agrega el query param", () => {
    expect(nextHomeUrl(makeFilters({ instagram: false }))).toBe("/?instagram=false")
  })
})

describe("shouldReplaceUrl", () => {
  it("devuelve false si la URL actual y la siguiente son iguales", () => {
    expect(shouldReplaceUrl("/", "/")).toBe(false)
    expect(shouldReplaceUrl("/?category=boliches", "/?category=boliches")).toBe(false)
  })

  it("devuelve true si son distintas", () => {
    expect(shouldReplaceUrl("/", "/?category=boliches")).toBe(true)
    expect(shouldReplaceUrl("/?search=a", "/?search=b")).toBe(true)
  })
})

describe("shouldReplaceUrl contra history (simulado)", () => {
  function makeHistoryStub(state: unknown, url: string) {
    const replaceState = vi.fn()
    return {
      replaceState,
      // Simula el efecto de home-content.tsx tal como queda implementado.
      runEffect(nextUrl: string) {
        if (!shouldReplaceUrl(url, nextUrl)) return
        replaceState(state, "", nextUrl)
      },
    }
  }

  it("con state = { __NA: true } y la misma URL, no llama a replaceState", () => {
    const history = makeHistoryStub({ __NA: true }, "/")
    history.runEffect("/")
    expect(history.replaceState).not.toHaveBeenCalled()
  })

  it("con otra URL, llama a replaceState con el estado actual, no con null", () => {
    const state = { __NA: true, tree: ["a"] }
    const history = makeHistoryStub(state, "/")
    history.runEffect("/?category=boliches")
    expect(history.replaceState).toHaveBeenCalledTimes(1)
    expect(history.replaceState).toHaveBeenCalledWith(state, "", "/?category=boliches")
    expect(history.replaceState.mock.calls[0][0]).not.toBeNull()
  })
})
