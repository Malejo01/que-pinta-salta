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

  // El mail NO va en esta página: vive en `eliminar-cuenta-form.tsx`, que es
  // quien sabe si la cuenta ya se eliminó y puede sacarlo de la pantalla en
  // ese caso (si quedara acá, el "¿Algo no anda?" seguiría debajo del cartel
  // "Tu cuenta fue eliminada"). Por eso acá solo se afirma lo negativo: sin
  // literal y sin [COMPLETAR. El caso positivo está en el describe del
  // formulario, más abajo.
  it("no escribe el mail a mano ni deja un [COMPLETAR (el contacto lo pone el formulario)", () => {
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

  it("muestra el contacto al pie, con asunto en el mailto", () => {
    expect(archivo).toContain("¿Algo no anda? Escribinos a")
    expect(archivo).toContain("mailtoContacto(")
    // Un mailto: sin asunto le llega a la casilla sin contexto.
    expect(archivo).not.toContain("mailtoContacto()")
  })

  // La razón de que el contacto viva en este archivo y no en `page.tsx`: la
  // rama `if (eliminada)` devuelve antes, así que lo que está en el return
  // del formulario desaparece de la pantalla cuando la cuenta ya se eliminó.
  // Si alguien lo sube arriba de ese `if`, vuelve el "¿Algo no anda?" debajo
  // de "Tu cuenta fue eliminada".
  //
  // El ancla NO es "Tu cuenta fue eliminada" (quedar después de esa cadena
  // también se cumple poniendo el contacto ADENTRO de la rama de éxito, que
  // es justo lo que no queremos): el ancla es el `<form>`, que solo existe en
  // el return del formulario. Si el contacto está después de él, está en el
  // mismo return y comparte su suerte.
  it("el contacto vive en el return del formulario, no en la rama de éxito", () => {
    const form = archivo.indexOf("<form onSubmit={handleSubmit}")
    const contacto = archivo.indexOf("¿Algo no anda? Escribinos a")
    expect(form).toBeGreaterThan(-1)
    expect(contacto).toBeGreaterThan(-1)
    expect(contacto).toBeGreaterThan(form)
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
