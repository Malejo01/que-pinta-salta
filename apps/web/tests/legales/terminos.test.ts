/**
 * `/terminos`, versión 1 (R63): mismo armazón que `/privacidad`
 * (`PaginaLegal`). Se usa `react-dom/server` (`renderToStaticMarkup`) en Node,
 * igual que en `tests/legales/pagina-legal.test.ts`.
 *
 * `Navbar` y `MobileNav` son componentes de cliente con hooks y Supabase: se
 * mockean para que no exploten al renderizar en Node puro.
 */
import { readFileSync } from "node:fs"
import { quitarComentarios as sinComentarios } from '@qps/core/tests/convencion-entorno'
import path from "node:path"
import { fileURLToPath } from "node:url"

import { renderToStaticMarkup } from "react-dom/server"
import { createElement } from "react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/components/navbar", () => ({ Navbar: () => null }))
vi.mock("@/components/mobile-nav", () => ({ MobileNav: () => null }))

import TerminosPage, { metadata } from "@/app/terminos/page"
import { VERSION_LEGAL, VIGENTE_DESDE } from "@/components/legal/vigencia"
import { CONTACTO_EMAIL } from "@qps/core/contacto"

const WEB_ROOT = fileURLToPath(new URL("../../", import.meta.url))

function readSource(relativePath: string): string {
  return readFileSync(path.join(WEB_ROOT, relativePath), "utf8")
}

const fuente = readSource("app/terminos/page.tsx")
const fuenteSinComentarios = sinComentarios(fuente)
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
    expect(html).toContain(CONTACTO_EMAIL)
    expect(html).toContain(`href="mailto:${CONTACTO_EMAIL}`)
  })

  it("el archivo fuente no tiene el mail literal", () => {
    expect(fuente).not.toContain(CONTACTO_EMAIL)
  })

  it("el archivo fuente no tiene una secuencia de 8 dígitos o más (sin CUIT ni teléfono de ejemplo)", () => {
    expect(fuente).not.toMatch(/\d{8,}/)
  })
})

describe("/terminos: ya no es un borrador", () => {
  it('el HTML no dice "borrador" (sin distinguir mayúsculas), "REVISIÓN LEGAL" ni "Última actualización"', () => {
    expect(html).not.toMatch(/borrador/i)
    expect(html).not.toContain("REVISIÓN LEGAL")
    expect(html).not.toContain("Última actualización")
  })

  it('el HTML no tiene el role="note" del aviso viejo', () => {
    expect(html).not.toContain('role="note"')
  })

  it("el archivo fuente (sin comentarios) no usa [REVISIÓN LEGAL]", () => {
    expect(fuenteSinComentarios).not.toContain("REVISIÓN LEGAL")
  })
})

describe("/terminos: versión y vigencia", () => {
  it('muestra "Versión <VERSION_LEGAL>" y "vigente desde el"', () => {
    expect(html).toContain(`Versión ${VERSION_LEGAL}`)
    expect(html).toContain("vigente desde el")
  })
})

describe('/terminos: "Me interesa" ya no se nombra', () => {
  it("ni en el HTML ni en el fuente (sin comentarios), con cualquier mayúscula", () => {
    expect(html).not.toMatch(/me interesa/i)
    expect(fuenteSinComentarios).not.toMatch(/me interesa/i)
  })
})

describe("/terminos: los datos de Mauro (23/10), ya sin [COMPLETAR]", () => {
  // Mauro pasó responsable, edad mínima y vigencia el 23/10 (pregunta 13 de la
  // R63). Si vuelve a aparecer un [COMPLETAR], este test lo dice.
  it("el HTML no tiene ningún [COMPLETAR, tampoco en VIGENTE_DESDE", () => {
    expect(html.match(/\[COMPLETAR[^\]]*\]/g) ?? []).toEqual([])
    expect(VIGENTE_DESDE.startsWith("[COMPLETAR")).toBe(false)
  })

  it("nombra a quien lo ofrece (nombre, CUIT y domicilio) y la edad mínima de 13 años", () => {
    expect(html).toContain("Lizarraga Mauro Alejandro")
    expect(html).toContain("CUIT: 27-36802726-5")
    expect(html).toContain("Domicilio: Diario El Clarín 3932, B° El Tribuno, Salta, Argentina")
    expect(html).toContain("13 años")
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

  it('el total de "Voy" se ve desde 3 y nunca quién', () => {
    expect(html).toContain("desde 3")
    expect(html).toContain("nunca se muestra quién")
  })

  it("avisa que la información puede tener errores y hay que confirmar con el organizador o la ticketera", () => {
    expect(html).toContain("Puede haber errores o cambios de último momento")
    expect(html).toContain("confirmá siempre con el organizador o la ticketera")
  })
})

describe("/terminos v1: publicidad y contenido destacado", () => {
  it('ya no dice "La app no muestra anuncios" y dice que la app puede mostrar anuncios', () => {
    expect(html).not.toContain("La app no muestra anuncios")
    expect(html).toContain("La app puede mostrar anuncios")
  })

  // El literal "★ Destacado" vive solo en components/insignia-destacado.tsx
  // (lo exige tests/components/insignia-destacado.test.ts): la página lo describe.
  it('el contenido destacado lleva el sello "Destacado", con una estrella', () => {
    expect(html).toContain("&quot;Destacado&quot;, con una estrella")
  })

  it("enlaza /anunciantes", () => {
    expect(html).toContain('href="/anunciantes"')
  })

  it("los avisos patrocinados llevan etiqueta y son como mucho uno por semana", () => {
    expect(html).toContain("Patrocinado")
    expect(html).toContain("uno por semana")
  })

  // Los patrocinados no tienen código en main (#88): van en condicional.
  it("los avisos patrocinados van en condicional", () => {
    expect(html).toMatch(/si las notificaciones de la app incluyen avisos patrocinados/i)
  })

  // Con ADS_ENABLED apagado, "Hoy no mostramos publicidad" contradecía la
  // línea siguiente ("La app puede mostrar anuncios"): habla solo del sitio.
  it('no dice "Hoy no mostramos publicidad" al lado de los anuncios de la app', () => {
    expect(html).not.toContain("Hoy no mostramos publicidad")
  })
})
