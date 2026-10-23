// tests/cuenta/play-pendientes.test.ts (R44, tarea 44-q): verificación de
// lo que dejaron 44-a, 44-b y 44-c:
//  1. El literal del mail de contacto (`contacto@quepintasalta.com.ar`)
//     aparece en una sola fuente de todo el repo: `packages/core/src/contacto.ts`.
//  2. Ningún archivo deja un `[COMPLETAR: mail` sin resolver.
//  3. Las tres listas de "Qué se borra" (las dos páginas web y la pantalla
//     de la app) son exactamente iguales, con 7 ítems.
//
// Primero los dos detectores (mail suelto, extractor de listas), probados
// con fixtures en memoria (mismo estilo que `findForbiddenImports` en
// `tests/core/frontera.test.ts` y `encontrarAperturasInseguras` en
// `apps/mobile/tests/aperturas-url.test.ts`); después el barrido/comparación
// real sobre los archivos del repo.
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// apps/web/tests/cuenta -> apps/web/tests -> apps/web -> apps -> raíz del worktree
const ROOT = fileURLToPath(new URL("../../../../", import.meta.url))

const CONTACTO_TS_RELATIVO = "packages/core/src/contacto.ts"

const CARPETAS_A_BARRER = [
  "apps/web/app",
  "apps/web/components",
  "apps/web/lib",
  "apps/mobile/app",
  "apps/mobile/components",
  "apps/mobile/lib",
  "packages/core/src",
]

interface Violation {
  line: number
  message: string
}

function lineAt(content: string, index: number): number {
  return content.slice(0, index).split("\n").length
}

// ---------------------------------------------------------------------------
// Detector 1: el literal del mail, en cualquier contexto (código, comentario,
// template literal). No es un parser: es una búsqueda de texto a propósito
// ciega al contexto, porque un mail "escondido" en un comentario también
// cuenta como fuente duplicada.
// ---------------------------------------------------------------------------
const EMAIL_LITERAL_RE = /contacto@quepintasalta\.com\.ar/g

export function encontrarLiteralesDeMail(content: string): Violation[] {
  const violaciones: Violation[] = []
  EMAIL_LITERAL_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = EMAIL_LITERAL_RE.exec(content))) {
    violaciones.push({ line: lineAt(content, m.index), message: `literal "${m[0]}" encontrado` })
  }
  return violaciones
}

// ---------------------------------------------------------------------------
// Detector 2 y 3: extractores de la lista "Qué se borra".
//  - Web: la sección está marcada por el texto "Qué se borra" (como título
//    de <Section> en la página pública, o como <p> en la de perfil), seguida
//    del primer <ul>...</ul> que viene después. Ese orden importa: la
//    página pública tiene antes otra <ul> ("Cómo pedirlo", con <li> largos
//    que tienen <strong> y links adentro) que no tiene que entrar.
//  - App: no hay <ul>/<li> (es React Native), la lista son las líneas
//    `<Texto>• ...</Texto>`.
// Los dos tiran si no encuentran nada, con el nombre del archivo en el
// mensaje: una lista vacía nunca es un resultado válido, es un fallo del
// extractor (o de que la sección desapareció del archivo real).
// ---------------------------------------------------------------------------
function normalizar(texto: string): string {
  return texto.replace(/&quot;/g, '"').replace(/\s+/g, " ").trim()
}

export function extraerQueSeBorraWeb(content: string, archivo: string): string[] {
  const marca = content.indexOf("Qué se borra")
  if (marca === -1) {
    throw new Error(`No se encontró la marca "Qué se borra" en ${archivo}`)
  }
  const desdeMarca = content.slice(marca)
  const ulMatch = desdeMarca.match(/<ul[^>]*>([\s\S]*?)<\/ul>/)
  if (!ulMatch) {
    throw new Error(`No se encontró ningún <ul> después de "Qué se borra" en ${archivo}`)
  }
  const liRe = /<li>([\s\S]*?)<\/li>/g
  const items: string[] = []
  let m: RegExpExecArray | null
  while ((m = liRe.exec(ulMatch[1]))) {
    items.push(normalizar(m[1]))
  }
  if (items.length === 0) {
    throw new Error(`El <ul> después de "Qué se borra" en ${archivo} no tiene ningún <li>`)
  }
  return items
}

export function extraerQueSeBorraApp(content: string, archivo: string): string[] {
  const re = /<Texto>•\s*([\s\S]*?)<\/Texto>/g
  const items: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(content))) {
    items.push(normalizar(m[1]))
  }
  if (items.length === 0) {
    throw new Error(`No se encontró ninguna línea "<Texto>• ...</Texto>" en ${archivo}`)
  }
  return items
}

function listarTsYTsx(root: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(root)) {
    const full = join(root, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      out.push(...listarTsYTsx(full))
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      out.push(full)
    }
  }
  return out
}

function leer(rutaAbsoluta: string): string {
  return readFileSync(rutaAbsoluta, "utf8")
}

// ===========================================================================
// 1. Detector de mail suelto, con fixtures en memoria.
// ===========================================================================
describe("encontrarLiteralesDeMail (fixtures en memoria)", () => {
  it("detecta el mail suelto en código", () => {
    const v = encontrarLiteralesDeMail(`const mail = "contacto@quepintasalta.com.ar"\n`)
    expect(v).toHaveLength(1)
    expect(v[0].line).toBe(1)
  })

  it("detecta el mail dentro de un comentario", () => {
    const v = encontrarLiteralesDeMail(
      `// escribinos a contacto@quepintasalta.com.ar\nexport function Foo() {}\n`,
    )
    expect(v).toHaveLength(1)
    expect(v[0].line).toBe(1)
  })

  it("detecta el mail dentro de un template literal", () => {
    const v = encontrarLiteralesDeMail(
      "function Foo() {\n  return `Escribinos a contacto@quepintasalta.com.ar.`\n}\n",
    )
    expect(v).toHaveLength(1)
    expect(v[0].line).toBe(2)
  })

  it("un archivo sin ningún mail: sin violaciones", () => {
    expect(encontrarLiteralesDeMail("export function Foo() { return null }\n")).toEqual([])
  })

  it("detecta varias apariciones en el mismo archivo, cada una con su línea", () => {
    const v = encontrarLiteralesDeMail(
      "export const A = 'contacto@quepintasalta.com.ar'\nexport const B = 'contacto@quepintasalta.com.ar'\n",
    )
    expect(v.map((x) => x.line)).toEqual([1, 2])
  })
})

// ===========================================================================
// 2. Extractores de "Qué se borra", con fixtures en memoria.
// ===========================================================================
describe("extraerQueSeBorraWeb (fixtures en memoria)", () => {
  it("ignora la lista anterior (Cómo pedirlo, con <strong> y links) y toma solo la de Qué se borra", () => {
    const fixture = `
      <ul>
        <li><strong>Desde la app:</strong> entrá a <a href="/x">Mi perfil</a>. Un texto largo.</li>
        <li><strong>Sin sesión:</strong> escribinos por <a href="/y">WhatsApp</a>.</li>
      </ul>
      <p>Qué se borra</p>
      <ul>
        <li>Item de prueba A.</li>
        <li>Item de prueba B.</li>
      </ul>
    `
    expect(extraerQueSeBorraWeb(fixture, "fixture.tsx")).toEqual(["Item de prueba A.", "Item de prueba B."])
  })

  it("normaliza &quot; a comillas normales y colapsa espacios de más", () => {
    const fixture = `
      <p>Qué se borra</p>
      <ul>
        <li>Tus marcas de &quot;Voy&quot;   y
          &quot;Me interesa&quot;.</li>
      </ul>
    `
    expect(extraerQueSeBorraWeb(fixture, "fixture.tsx")).toEqual(['Tus marcas de "Voy" y "Me interesa".'])
  })

  it('tira si no encuentra la marca "Qué se borra", con el nombre del archivo en el mensaje', () => {
    const fixture = `<ul><li>Lo que sea.</li></ul>`
    expect(() => extraerQueSeBorraWeb(fixture, "fixture-sin-marca.tsx")).toThrow(/fixture-sin-marca\.tsx/)
  })

  it("tira si después de la marca no hay ningún <ul>, con el nombre del archivo en el mensaje", () => {
    const fixture = `<p>Qué se borra</p><p>Sin lista acá.</p>`
    expect(() => extraerQueSeBorraWeb(fixture, "fixture-sin-ul.tsx")).toThrow(/fixture-sin-ul\.tsx/)
  })

  it("tira si el <ul> después de la marca está vacío (sin <li>), en vez de devolver []", () => {
    const fixture = `<p>Qué se borra</p><ul></ul>`
    expect(() => extraerQueSeBorraWeb(fixture, "fixture-ul-vacio.tsx")).toThrow(/fixture-ul-vacio\.tsx/)
  })
})

describe("extraerQueSeBorraApp (fixtures en memoria)", () => {
  it("extrae las líneas <Texto>• ...</Texto>, ignorando el resto del archivo", () => {
    const fixture = `
      <Texto peso="semibold">Qué se borra:</Texto>
      <Texto>• Item de prueba A.</Texto>
      <Texto>• Item de prueba B.</Texto>
      <Texto tono="secundario">Esto no tiene viñeta y no debe entrar.</Texto>
    `
    expect(extraerQueSeBorraApp(fixture, "fixture.tsx")).toEqual(["Item de prueba A.", "Item de prueba B."])
  })

  it("normaliza &quot; a comillas normales y colapsa espacios de más", () => {
    const fixture = `<Texto>• Tus marcas de &quot;Voy&quot;   y &quot;Me interesa&quot;.</Texto>`
    expect(extraerQueSeBorraApp(fixture, "fixture.tsx")).toEqual(['Tus marcas de "Voy" y "Me interesa".'])
  })

  it('tira si no encuentra ninguna línea "<Texto>• ...</Texto>", con el nombre del archivo en el mensaje', () => {
    const fixture = `<Texto>Nada con viñeta acá.</Texto>`
    expect(() => extraerQueSeBorraApp(fixture, "fixture-sin-bullets.tsx")).toThrow(/fixture-sin-bullets\.tsx/)
  })
})

// ===========================================================================
// 3. Barrido real: el literal del mail aparece solo en contacto.ts.
// ===========================================================================
describe("una sola fuente del mail: packages/core/src/contacto.ts", () => {
  const archivos = CARPETAS_A_BARRER.flatMap((carpeta) => listarTsYTsx(join(ROOT, carpeta)))
  const archivosRelativos = archivos.map((f) => relative(ROOT, f).split("\\").join("/"))

  it("encuentra al menos un archivo .ts/.tsx en cada carpeta barrida", () => {
    expect(archivos.length).toBeGreaterThan(0)
    expect(archivosRelativos).toContain(CONTACTO_TS_RELATIVO)
  })

  it("packages/core/src/contacto.ts contiene el literal (es la fuente)", () => {
    const contenido = leer(join(ROOT, CONTACTO_TS_RELATIVO))
    expect(encontrarLiteralesDeMail(contenido).length).toBeGreaterThan(0)
  })

  it.each(archivos.map((file) => [relative(ROOT, file).split("\\").join("/"), file] as const))(
    "%s no repite el literal del mail (salvo contacto.ts, probado aparte)",
    (label, file) => {
      if (label === CONTACTO_TS_RELATIVO) return // es la fuente única, a propósito
      const contenido = leer(file)
      const violaciones = encontrarLiteralesDeMail(contenido)
      if (violaciones.length > 0) {
        const detalle = violaciones.map((v) => `  ${label}:${v.line} — ${v.message}`).join("\n")
        throw new Error(`Literal del mail repetido fuera de contacto.ts:\n${detalle}`)
      }
      expect(violaciones).toEqual([])
    },
  )
})

// ===========================================================================
// 4. Barrido real: ningún [COMPLETAR: mail suelto.
// ===========================================================================
describe('ningún archivo deja "[COMPLETAR: mail" sin resolver', () => {
  const archivos = CARPETAS_A_BARRER.flatMap((carpeta) => listarTsYTsx(join(ROOT, carpeta)))

  it("encuentra al menos un archivo para analizar", () => {
    expect(archivos.length).toBeGreaterThan(0)
  })

  it.each(archivos.map((file) => [relative(ROOT, file).split("\\").join("/"), file] as const))(
    "%s no contiene \"[COMPLETAR: mail\"",
    (label, file) => {
      const contenido = leer(file)
      expect(contenido, `${label} contiene "[COMPLETAR: mail"`).not.toContain("[COMPLETAR: mail")
    },
  )
})

// ===========================================================================
// 5. Las tres listas de "Qué se borra" son exactamente iguales.
// ===========================================================================
describe('las tres listas de "Qué se borra" son iguales (QPS-191)', () => {
  const RUTA_PUBLICA = "apps/web/app/eliminar-cuenta/page.tsx"
  const RUTA_PERFIL = "apps/web/app/perfil/eliminar-cuenta/page.tsx"
  const RUTA_APP = "apps/mobile/app/eliminar-cuenta.tsx"

  const listaPublica = extraerQueSeBorraWeb(leer(join(ROOT, RUTA_PUBLICA)), RUTA_PUBLICA)
  const listaPerfil = extraerQueSeBorraWeb(leer(join(ROOT, RUTA_PERFIL)), RUTA_PERFIL)
  const listaApp = extraerQueSeBorraApp(leer(join(ROOT, RUTA_APP)), RUTA_APP)

  // Afirmación explícita, ANTES de comparar entre sí: si las tres salieran
  // vacías, el toEqual de abajo pasaría igual y este test no diría nada.
  // Por eso cada lista se verifica por separado primero.
  it(`${RUTA_PUBLICA}: tiene al menos 6 ítems`, () => {
    expect(listaPublica.length).toBeGreaterThanOrEqual(6)
  })

  it(`${RUTA_PERFIL}: tiene al menos 6 ítems`, () => {
    expect(listaPerfil.length).toBeGreaterThanOrEqual(6)
  })

  it(`${RUTA_APP}: tiene al menos 6 ítems`, () => {
    expect(listaApp.length).toBeGreaterThanOrEqual(6)
  })

  it("las tres tienen exactamente 7 ítems", () => {
    expect(listaPublica).toHaveLength(7)
    expect(listaPerfil).toHaveLength(7)
    expect(listaApp).toHaveLength(7)
  })

  it("las tres incluyen el ítem del historial de avisos (QPS-191)", () => {
    expect(listaPublica).toContain("El historial de los avisos que te mandamos.")
    expect(listaPerfil).toContain("El historial de los avisos que te mandamos.")
    expect(listaApp).toContain("El historial de los avisos que te mandamos.")
  })

  it('las tres dicen "Voy" y ya no "Me interesa" (R47)', () => {
    for (const lista of [listaPublica, listaPerfil, listaApp]) {
      expect(lista).toContain('Tus marcas de "Voy".')
      expect(lista.join(" ")).not.toMatch(/me interesa/i)
    }
  })

  it("la pública y la de perfil son exactamente iguales", () => {
    expect(listaPublica).toEqual(listaPerfil)
  })

  it("la de la app es exactamente igual a la de la web (mismo orden, mismo texto)", () => {
    expect(listaApp).toEqual(listaPublica)
  })
})
