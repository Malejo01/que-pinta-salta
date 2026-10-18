import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { confirmacionValida } from "@/app/perfil/eliminar-cuenta/eliminar-cuenta-form"

function leer(rutaRelativa: string): string {
  const contenido = readFileSync(join(process.cwd(), rutaRelativa), "utf8")
  expect(contenido.trim().length).toBeGreaterThan(0)
  return contenido
}

describe("confirmacionValida", () => {
  it("acepta el literal exacto", () => {
    expect(confirmacionValida("ELIMINAR")).toBe(true)
  })

  it("acepta espacios de más al principio o al final", () => {
    expect(confirmacionValida(" ELIMINAR ")).toBe(true)
  })

  it("acepta minúsculas (decisión: no distingue mayúsculas de minúsculas)", () => {
    expect(confirmacionValida("eliminar")).toBe(true)
  })

  it("rechaza vacío", () => {
    expect(confirmacionValida("")).toBe(false)
  })

  it("rechaza texto incompleto", () => {
    expect(confirmacionValida("ELIMINA")).toBe(false)
  })

  it("rechaza texto con letras de más", () => {
    expect(confirmacionValida("ELIMINARR")).toBe(false)
  })
})

describe("/eliminar-cuenta (pública)", () => {
  const archivo = leer("app/eliminar-cuenta/page.tsx")

  it("no exige sesión: no importa el cliente de servidor de Supabase", () => {
    expect(archivo).not.toContain("@/lib/supabase/server")
  })

  it("no llama a getUser( ni a redirect(", () => {
    expect(archivo).not.toContain("getUser(")
    expect(archivo).not.toContain("redirect(")
  })

  it("usa la casilla de contacto de @qps/core/contacto, no un literal a completar", () => {
    expect(archivo).toContain("@qps/core/contacto")
    expect(archivo).toContain("CONTACTO_EMAIL")
    expect(archivo).toContain("mailtoContacto(")
    expect(archivo).not.toContain("[COMPLETAR")
    expect(archivo).not.toContain("@quepintasalta.com.ar")
  })

  it("nombra el historial de avisos entre lo que se borra", () => {
    expect(archivo).toContain("El historial de los avisos que te mandamos.")
  })

  it("usa el helper whatsappUrl y no el número literal", () => {
    expect(archivo).toContain("whatsappUrl(")
    // El único lugar del repo con el número literal es lib/contacto.ts: acá
    // no debería aparecer ninguna secuencia larga de dígitos.
    expect(archivo).not.toMatch(/\d{8,}/)
  })
})

describe("/perfil/eliminar-cuenta (con sesión)", () => {
  const archivo = leer("app/perfil/eliminar-cuenta/page.tsx")

  it("redirige sin sesión a login con next=/perfil/eliminar-cuenta", () => {
    expect(archivo).toContain("redirect(")
    expect(archivo).toContain("/auth/login?next=/perfil/eliminar-cuenta")
  })

  it("usa la casilla de contacto de @qps/core/contacto, no un literal a completar", () => {
    expect(archivo).toContain("@qps/core/contacto")
    expect(archivo).toContain("CONTACTO_EMAIL")
    expect(archivo).not.toContain("[COMPLETAR")
    expect(archivo).not.toContain("@quepintasalta.com.ar")
  })

  it("nombra el historial de avisos entre lo que se borra", () => {
    expect(archivo).toContain("El historial de los avisos que te mandamos.")
  })
})

describe("eliminar-cuenta-form.tsx (cliente)", () => {
  const archivo = leer("app/perfil/eliminar-cuenta/eliminar-cuenta-form.tsx")

  it("manda confirmacion: \"ELIMINAR\" literal al endpoint", () => {
    expect(archivo).toContain("/api/cuenta/eliminar")
    expect(archivo).toContain('confirmacion: "ELIMINAR"')
  })

  it("no manda user_id ni userId: el servidor lo saca de la sesión", () => {
    expect(archivo).not.toContain("user_id")
    expect(archivo).not.toContain("userId")
  })

  it("cierra la sesión del cliente con scope local tras el borrado", () => {
    expect(archivo).toContain("signOut(")
    expect(archivo).toContain('scope: "local"')
  })

  it("el camino de éxito muestra una confirmación en la pantalla, no solo navega", () => {
    expect(archivo).toContain("eliminada")
    expect(archivo).toContain("Tu cuenta fue eliminada")
  })

  it("no navega a la portada con el parámetro viejo ?cuenta=eliminada", () => {
    expect(archivo).not.toContain("?cuenta=eliminada")
  })

  it("usa la casilla de contacto de @qps/core/contacto en el mensaje de error, no un literal", () => {
    expect(archivo).toContain("@qps/core/contacto")
    expect(archivo).toContain("CONTACTO_EMAIL")
    expect(archivo).not.toContain("[COMPLETAR")
    expect(archivo).not.toContain("@quepintasalta.com.ar")
  })
})

describe("/perfil/page.tsx", () => {
  it("linkea a /perfil/eliminar-cuenta", () => {
    const archivo = leer("app/perfil/page.tsx")
    expect(archivo).toContain("/perfil/eliminar-cuenta")
  })
})

describe("sitemap.ts", () => {
  it("tiene /eliminar-cuenta en las dos ramas (respaldo y normal)", () => {
    const archivo = leer("app/sitemap.ts")
    const apariciones = archivo.split('"/eliminar-cuenta"').length - 1
    expect(apariciones).toBe(2)
  })
})

describe("sin loading.tsx en las rutas nuevas", () => {
  it("no existe app/eliminar-cuenta/loading.tsx ni app/perfil/eliminar-cuenta/loading.tsx", () => {
    const cwd = process.cwd()
    expect(() => readFileSync(join(cwd, "app/eliminar-cuenta/loading.tsx"), "utf8")).toThrow()
    expect(() => readFileSync(join(cwd, "app/perfil/eliminar-cuenta/loading.tsx"), "utf8")).toThrow()
  })
})
