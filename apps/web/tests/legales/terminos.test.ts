/**
 * `/terminos` (R45, 45-c): página nueva de términos y condiciones, con el
 * mismo armazón que `/privacidad` (`PaginaLegal`, 45-a). `apps/web` no tiene
 * jsdom ni @testing-library/react (vitest corre con `environment: 'node'`),
 * así que se usa `react-dom/server` (`renderToStaticMarkup`), igual que en
 * `tests/legales/pagina-legal.test.ts`.
 *
 * `Navbar` y `MobileNav` son componentes de cliente con hooks y Supabase: se
 * mockean para que no exploten al renderizar en Node puro.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { renderToStaticMarkup } from "react-dom/server"
import { createElement } from "react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/components/navbar", () => ({ Navbar: () => null }))
vi.mock("@/components/mobile-nav", () => ({ MobileNav: () => null }))

import TerminosPage, { metadata } from "@/app/terminos/page"

const WEB_ROOT = fileURLToPath(new URL("../../", import.meta.url))

function readSource(relativePath: string): string {
  return readFileSync(path.join(WEB_ROOT, relativePath), "utf8")
}

const fuente = readSource("app/terminos/page.tsx")
const html = renderToStaticMarkup(createElement(TerminosPage))

describe("/terminos: h1 y metadata", () => {
  it('el h1 es exactamente "Términos y condiciones"', () => {
    expect(html).toMatch(/<h1[^>]*>Términos y condiciones<\/h1>/)
  })

  it("metadata.alternates.canonical es /terminos", () => {
    expect(metadata.alternates?.canonical).toBe("/terminos")
  })

  it("metadata tiene title y description, y el title termina en el sufijo de la marca", () => {
    expect(typeof metadata.title).toBe("string")
    expect(typeof metadata.description).toBe("string")
    expect((metadata.description as string).length).toBeGreaterThan(0)
    expect(metadata.title as string).toMatch(/\| Qué Pinta Salta$/)
  })
})

describe("/terminos: Server Component", () => {
  it("no contiene 'use client'", () => {
    expect(fuente).not.toContain("'use client'")
    expect(fuente).not.toContain('"use client"')
  })
})

describe("/terminos: el mail sale de la constante, no literal", () => {
  it("el HTML tiene el mail y un mailto: con ese mail", () => {
    expect(html).toContain("contacto@quepintasalta.com.ar")
    expect(html).toContain('href="mailto:contacto@quepintasalta.com.ar')
  })

  it("el archivo fuente no tiene el mail literal", () => {
    expect(fuente).not.toContain("contacto@quepintasalta.com.ar")
  })

  it("el archivo fuente no tiene una secuencia de 8 dígitos o más (sin CUIT ni teléfono de ejemplo)", () => {
    expect(fuente).not.toMatch(/\d{8,}/)
  })
})

describe("/terminos: aviso de borrador y marcas pendientes", () => {
  it('tiene el aviso "Borrador pendiente de revisión legal"', () => {
    expect(html).toContain("Borrador pendiente de revisión legal")
  })

  it('tiene "Última actualización: [COMPLETAR"', () => {
    expect(html).toContain("Última actualización: [COMPLETAR")
  })

  it("tiene al menos 8 marcas [REVISIÓN LEGAL]", () => {
    const apariciones = html.split("[REVISIÓN LEGAL]").length - 1
    expect(apariciones).toBeGreaterThanOrEqual(8)
  })

  // 45-c2: la sección 8 (contenido de terceros) suma su propia marca
  // [REVISIÓN LEGAL] en el primer párrafo, que antes no tenía ninguna; por
  // eso el total pasa de 9 a 10.
  it("tiene al menos 10 marcas [REVISIÓN LEGAL]", () => {
    const apariciones = html.split("[REVISIÓN LEGAL]").length - 1
    expect(apariciones).toBeGreaterThanOrEqual(10)
  })
})

describe("/terminos: horario de silencio como default editable (45-c2)", () => {
  it("no presenta el tope de avisos como fijo con la frase vieja", () => {
    expect(html).not.toContain("un tope de 4 avisos por día")
  })

  it('dice "por defecto" y que se puede cambiar desde la app', () => {
    expect(html).toContain("por defecto")
    expect(html).toContain("lo podés cambiar desde la app")
  })

  it("dice que el tope de avisos no se edita", () => {
    expect(html).toContain("no se edita")
  })
})

describe("/terminos: enlaza las páginas relacionadas", () => {
  it("enlaza /privacidad, /eliminar-cuenta y /perfil/eliminar-cuenta", () => {
    expect(html).toContain('href="/privacidad"')
    expect(html).toContain('href="/eliminar-cuenta"')
    expect(html).toContain('href="/perfil/eliminar-cuenta"')
  })
})

describe("/terminos: lo que dice el producto", () => {
  it("dice que no vende entradas", () => {
    expect(html).toContain("No vendemos entradas")
  })

  it('el total de "Voy"/"Me interesa" se ve desde 3 y nunca quién', () => {
    expect(html).toContain("desde 3")
    expect(html).toContain("nunca se muestra quién")
  })

  it("avisa que la información puede tener errores y hay que confirmar con el organizador o la ticketera", () => {
    expect(html).toContain("Puede haber errores o cambios de último momento")
    expect(html).toContain("confirmá siempre con el organizador o la ticketera")
  })
})
