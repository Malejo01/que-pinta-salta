/**
 * Tests que cruzan las páginas legales (el armazón, `/privacidad`,
 * `/terminos` y los links), más dos cosas que ningún test de página puede ver
 * por separado: que el sitemap, **ejecutado**, devuelva las dos rutas, y que
 * las dos páginas no se desincronicen del umbral real de "Voy"
 * (`UMBRAL_CONTADOR_ASISTENCIA`).
 *
 * Versión 1 (R63): las páginas ya no son un borrador; acá se fija, para las
 * dos juntas, que no quedan el aviso, las marcas de revisión legal ni "Última
 * actualización", y que muestran la versión y la vigencia.
 *
 * No repite lo que ya cubren:
 * - `tests/legales/pagina-legal.test.ts` (el armazón, componente por
 *   componente);
 * - `tests/legales/privacidad.test.ts` y `tests/legales/terminos.test.ts`
 *   (cada página por separado: contenido, `[COMPLETAR` que quedan, etc.);
 * - `tests/legales/enlaces.test.ts` (los links, sobre el texto de los
 *   archivos). Lo que ese archivo no puede ver — el sitemap **ejecutado**
 *   — es justamente lo que prueba acá.
 *
 * Todo el render usa `createElement` + `renderToStaticMarkup` en Node, igual
 * que en `tests/legales/pagina-legal.test.ts`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/components/navbar", () => ({ Navbar: () => null }))
vi.mock("@/components/mobile-nav", () => ({ MobileNav: () => null }))

import PrivacidadPage, { metadata as metadataPrivacidad } from "@/app/privacidad/page"
import TerminosPage, { metadata as metadataTerminos } from "@/app/terminos/page"
import { metadata as metadataEliminarCuenta } from "@/app/eliminar-cuenta/page"
import { UMBRAL_CONTADOR_ASISTENCIA } from "@qps/core/asistencia"
import { VERSION_LEGAL } from "@/components/legal/vigencia"

const WEB_ROOT = fileURLToPath(new URL("../../", import.meta.url))

function leer(rutaRelativa: string): string {
  return readFileSync(path.join(WEB_ROOT, rutaRelativa), "utf8")
}

// ---------------------------------------------------------------------------
// 1. Las dos páginas renderizan y son Server Components.
// ---------------------------------------------------------------------------

describe("las dos páginas renderizan sin jsdom", () => {
  it("/privacidad renderiza con createElement + renderToStaticMarkup", () => {
    const html = renderToStaticMarkup(createElement(PrivacidadPage))
    expect(html.length).toBeGreaterThan(0)
  })

  it("/terminos renderiza con createElement + renderToStaticMarkup", () => {
    const html = renderToStaticMarkup(createElement(TerminosPage))
    expect(html.length).toBeGreaterThan(0)
  })

  it("ninguna de las dos, ni el armazón, tiene 'use client'", () => {
    for (const archivo of ["app/privacidad/page.tsx", "app/terminos/page.tsx", "components/legal/pagina-legal.tsx"]) {
      const fuente = leer(archivo)
      expect(fuente, archivo).not.toContain("'use client'")
      expect(fuente, archivo).not.toContain('"use client"')
    }
  })
})

const htmlPrivacidad = renderToStaticMarkup(createElement(PrivacidadPage))
const htmlTerminos = renderToStaticMarkup(createElement(TerminosPage))

// ---------------------------------------------------------------------------
// 2. Metadata de las dos, con el mismo sufijo de marca que el resto del
//    sitio. Se compara contra `/eliminar-cuenta` (R44, no tocada por esta
//    ronda) para que "igual que el resto del sitio" sea una comprobación,
//    no una suposición.
// ---------------------------------------------------------------------------

describe("metadata: title, description y alternates.canonical", () => {
  /** Todo lo que sigue al último "|" del title, con el "|" incluido. */
  function sufijoDeMarca(title: unknown): string {
    const texto = String(title)
    const posicion = texto.lastIndexOf("|")
    expect(posicion, `"${texto}" no tiene "|"`).toBeGreaterThan(-1)
    return texto.slice(posicion)
  }

  it('el sufijo de marca de /privacidad y /terminos es exactamente el mismo que el de /eliminar-cuenta (R44)', () => {
    const sufijoReferencia = sufijoDeMarca(metadataEliminarCuenta.title)
    expect(sufijoReferencia).toBe("| Qué Pinta Salta")
    expect(sufijoDeMarca(metadataPrivacidad.title)).toBe(sufijoReferencia)
    expect(sufijoDeMarca(metadataTerminos.title)).toBe(sufijoReferencia)
  })

  it("las dos tienen description no vacía", () => {
    expect(typeof metadataPrivacidad.description).toBe("string")
    expect((metadataPrivacidad.description as string).length).toBeGreaterThan(0)
    expect(typeof metadataTerminos.description).toBe("string")
    expect((metadataTerminos.description as string).length).toBeGreaterThan(0)
  })

  it('alternates.canonical es "/privacidad" y "/terminos"', () => {
    expect(metadataPrivacidad.alternates?.canonical).toBe("/privacidad")
    expect(metadataTerminos.alternates?.canonical).toBe("/terminos")
  })
})

// ---------------------------------------------------------------------------
// 3. El mail, de una sola fuente: barrido recursivo de solo lectura.
// ---------------------------------------------------------------------------

const EMAIL_LITERAL = "contacto@quepintasalta.com.ar"

/**
 * Única excepción permitida al literal fuera de `packages/core/src/`:
 * `app/eliminar-cuenta/page.tsx` es de la R44 (no la toca esta ronda) y hoy
 * dice `[COMPLETAR: mail de contacto]`, sin el literal. Se declara como
 * lista explícita (no como un `if` silencioso) y el chequeo de abajo exige
 * que, si el literal apareciera en cualquier OTRO archivo, el test falle
 * igual: la excepción cubre un solo nombre de archivo, no "cualquier
 * archivo que no sea de esta ronda".
 */
const EXCEPCIONES_MAIL_LITERAL: readonly string[] = ["app/eliminar-cuenta/page.tsx"]

/** Recorre un directorio y junta los `.ts`/`.tsx`, salvo `node_modules` y ocultos. */
function listarArchivosFuente(dir: string, acumulado: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (nombre === "node_modules" || nombre.startsWith(".")) continue
    const ruta = path.join(dir, nombre)
    const info = statSync(ruta)
    if (info.isDirectory()) {
      listarArchivosFuente(ruta, acumulado)
    } else if (/\.(ts|tsx)$/.test(nombre)) {
      acumulado.push(ruta)
    }
  }
  return acumulado
}

describe("el mail, de una sola fuente (barrido recursivo, solo lectura)", () => {
  const directorios = ["app", "components", "lib"].map((d) => path.join(WEB_ROOT, d))
  const archivos = directorios.flatMap((dir) => listarArchivosFuente(dir))

  it("el barrido encontró más de 50 archivos (si no, el test no prueba nada)", () => {
    expect(archivos.length).toBeGreaterThan(50)
  })

  it("ningún archivo de app/components/lib escribe el mail literal, salvo la excepción declarada", () => {
    const violaciones: string[] = []
    for (const ruta of archivos) {
      const relativa = path.relative(WEB_ROOT, ruta).split(path.sep).join("/")
      if (EXCEPCIONES_MAIL_LITERAL.includes(relativa)) continue
      const contenido = readFileSync(ruta, "utf8")
      if (contenido.includes(EMAIL_LITERAL)) violaciones.push(relativa)
    }
    expect(violaciones, `archivos con el mail literal fuera de la excepción: ${violaciones.join(", ")}`).toEqual([])
  })

  it("la excepción declarada (si existiera hoy) sería el único archivo permitido con el literal", () => {
    // Hoy, en esta rama, `app/eliminar-cuenta/page.tsx` NO tiene el literal
    // (dice "[COMPLETAR: mail de contacto]": es de la R44, que esta ronda no
    // toca). Esta prueba no exige que lo tenga, solo que, SI lo tuviera,
    // sea el único archivo de la lista de excepciones con ese contenido.
    for (const relativa of EXCEPCIONES_MAIL_LITERAL) {
      const ruta = path.join(WEB_ROOT, relativa)
      const contenido = readFileSync(ruta, "utf8")
      if (contenido.includes(EMAIL_LITERAL)) {
        expect(EXCEPCIONES_MAIL_LITERAL).toContain(relativa)
      }
    }
    // La lista de excepciones tiene un solo nombre: no es un comodín.
    expect(EXCEPCIONES_MAIL_LITERAL).toEqual(["app/eliminar-cuenta/page.tsx"])
  })

  it("el literal aparece exactamente una vez en packages/core/src/", () => {
    const coreDir = path.join(WEB_ROOT, "../../packages/core/src")
    const archivosCore = listarArchivosFuente(coreDir)
    let apariciones = 0
    for (const ruta of archivosCore) {
      const contenido = readFileSync(ruta, "utf8")
      apariciones += contenido.split(EMAIL_LITERAL).length - 1
    }
    expect(apariciones).toBe(1)
  })

  it("las dos páginas legales muestran el mail (desde la constante) en el HTML", () => {
    expect(htmlPrivacidad).toContain(EMAIL_LITERAL)
    expect(htmlTerminos).toContain(EMAIL_LITERAL)
  })
})

// ---------------------------------------------------------------------------
// 4. Versión 1, visible en el HTML renderizado (no en el archivo: así nada
//    puede estar escondido dentro de un comentario JSX).
// ---------------------------------------------------------------------------

describe("versión 1 en el HTML renderizado de las dos páginas", () => {
  it("las dos muestran la versión y la vigencia", () => {
    for (const html of [htmlPrivacidad, htmlTerminos]) {
      expect(html).toContain(`Versión ${VERSION_LEGAL}`)
      expect(html).toContain("vigente desde el")
    }
  })

  it('ninguna dice "borrador", "REVISIÓN LEGAL" ni "Última actualización", ni tiene role="note"', () => {
    for (const html of [htmlPrivacidad, htmlTerminos]) {
      expect(html).not.toMatch(/borrador/i)
      expect(html).not.toContain("REVISIÓN LEGAL")
      expect(html).not.toContain("Última actualización")
      expect(html).not.toContain('role="note"')
    }
  })

  it('ninguna nombra "Me interesa"', () => {
    for (const html of [htmlPrivacidad, htmlTerminos]) {
      expect(html).not.toMatch(/me interesa/i)
    }
  })

  // Vitest no chequea tipos: una prop `borrador` vuelta a poner en la página
  // no cambia el HTML (PaginaLegal la ignora) y solo la frenaría el typecheck.
  // Se mira la etiqueta de apertura en el fuente de cada página.
  it("ninguna página le pasa borrador ni ultimaActualizacion a PaginaLegal", () => {
    for (const archivo of ["app/privacidad/page.tsx", "app/terminos/page.tsx"]) {
      const apertura = leer(archivo).match(/<PaginaLegal\b[^>]*>/)
      expect(apertura, `${archivo} no usa <PaginaLegal>`).not.toBeNull()
      expect(apertura![0], archivo).not.toMatch(/\bborrador\b/)
      expect(apertura![0], archivo).not.toMatch(/\bultimaActualizacion\b/)
    }
  })
})

// ---------------------------------------------------------------------------
// 5. El sitemap, ejecutado (rama de respaldo, sin red): las dos URLs.
// ---------------------------------------------------------------------------

describe("app/sitemap.ts ejecutado: rama de respaldo sin variables de Supabase", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("sin NEXT_PUBLIC_SUPABASE_URL ni NEXT_PUBLIC_SUPABASE_ANON_KEY, devuelve /privacidad y /terminos sin tocar la red", async () => {
    // `vi.stubEnv(clave, '')` deja `process.env[clave]` en una cadena vacía,
    // que es lo que `sitemap.ts` chequea con `!supabaseUrl` /
    // `!supabaseKey`: para esa rama, "" y "no está definida" son
    // equivalentes. Es el mismo patrón que ya usa
    // `tests/radar/email.test.ts` para limpiar variables de entorno.
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
    const avisoWarn = vi.spyOn(console, "warn").mockImplementation(() => {})

    const { default: sitemap } = await import("@/app/sitemap")
    const urls = await sitemap()

    expect(avisoWarn).toHaveBeenCalled()
    const rutas = urls.map((u) => u.url)
    expect(rutas).toContain("https://www.quepintasalta.com.ar/privacidad")
    expect(rutas).toContain("https://www.quepintasalta.com.ar/terminos")
  })
})

// ---------------------------------------------------------------------------
// 6. Voseo: detector de palabras enteras con letras Unicode.
// ---------------------------------------------------------------------------

/**
 * El `\b` de las regex de JS se define sobre `\w` (solo ASCII: letras sin
 * tilde, dígitos y `_`), así que una vocal con tilde o una "ñ" no cuenta
 * como parte de la palabra para ese límite. Por eso se usa un lookaround
 * con `\p{L}` (cualquier letra Unicode, con la bandera `u`): un carácter
 * acentuado nunca se trata como si fuera un espacio o un signo de
 * puntuación. Si alguien lo "simplifica" a `\bpalabra\b`, vuelve el riesgo
 * de que el límite de palabra quede mal puesto justo al lado de una tilde.
 * La `i` es solo para no depender de mayúscula/minúscula (p. ej. un
 * "Puedes" a principio de oración); no hace falta `\p{L}` para eso.
 */
function detectorPalabraEntera(palabra: string): RegExp {
  return new RegExp(`(?<!\\p{L})${palabra}(?!\\p{L})`, "iu")
}

const FORMAS_DE_TUTEO = [
  "puedes",
  "tienes",
  "debes",
  "quieres",
  "aceptas",
  "escríbenos",
  "contáctanos",
  "regístrate",
  "ingresa",
  "selecciona",
]

describe("detectorPalabraEntera: el detector probado contra sí mismo", () => {
  it("no da positivo en las formas de voseo con tilde (podés, tenés, aceptás, debés)", () => {
    expect(detectorPalabraEntera("puedes").test("¿Vos podés venir el sábado?")).toBe(false)
    expect(detectorPalabraEntera("tienes").test("¿Tenés ganas de ir?")).toBe(false)
    expect(detectorPalabraEntera("aceptas").test("Al registrarte aceptás los términos")).toBe(false)
    expect(detectorPalabraEntera("debes").test("No debés faltar a la cita")).toBe(false)
  })

  it("sí da positivo en la forma de tuteo (puedes)", () => {
    expect(detectorPalabraEntera("puedes").test("¿Puedes venir el sábado?")).toBe(true)
  })
})

describe("voseo en las dos páginas y en el armazón compartido", () => {
  const archivos = ["app/privacidad/page.tsx", "app/terminos/page.tsx", "components/legal/pagina-legal.tsx"]

  it.each(archivos)("%s no tiene ninguna forma de tuteo de la lista", (archivo) => {
    const fuente = leer(archivo)
    const encontradas = FORMAS_DE_TUTEO.filter((palabra) => detectorPalabraEntera(palabra).test(fuente))
    expect(encontradas, `formas de tuteo encontradas en ${archivo}: ${encontradas.join(", ")}`).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 7. El umbral de "Voy" no puede desincronizarse del código.
// ---------------------------------------------------------------------------

describe('el umbral de "Voy" en el texto sale de la constante, no de un número suelto', () => {
  // No se escribe el "3" literal en este test: si Mauro cambia
  // `UMBRAL_CONTADOR_ASISTENCIA`, las dos páginas legales van a decir un
  // número falso y, sin este test construido con la constante (no con un
  // "3" a mano), nada lo iba a notar — justamente el escenario que hay que
  // cubrir.
  const fraseEsperada = `desde ${UMBRAL_CONTADOR_ASISTENCIA} personas`

  it("/privacidad dice el umbral real en prosa", () => {
    expect(htmlPrivacidad).toContain(fraseEsperada)
  })

  it("/terminos dice el umbral real en prosa", () => {
    expect(htmlTerminos).toContain(fraseEsperada)
  })
})

// ---------------------------------------------------------------------------
// 8. El sitemap, ejecutado (rama CON Supabase configurado): `staticRoutes`
//    (app/sitemap.ts, línea ~126), que es la lista que de verdad sirve
//    producción.
//
//    Por qué este test, además de los dos que ya existen sobre el sitemap:
//    - El bloque 5 (arriba) solo cubre la rama de RESPALDO (sin variables de
//      Supabase).
//    - `tests/legales/enlaces.test.ts` cuenta `staticRoute("/privacidad"` en
//      el TEXTO del archivo y exige exactamente 2 apariciones: eso agarra el
//      caso de borrarla (2 → 1), pero no distingue EN QUÉ lista está cada
//      aparición.
//    Entre los tres, ninguno de los otros dos corre la rama que de verdad
//    sirve producción con Supabase configurado: si alguien saca
//    "/privacidad" de `staticRoutes` y la duplica en la lista de respaldo,
//    el conteo de enlaces.test.ts sigue en 2, el bloque 5 sigue en verde (no
//    toca esa rama), y el sitemap de producción vuelve a no anunciar
//    /privacidad sin que nada lo note. Este test corre justo esa rama.
// ---------------------------------------------------------------------------

/** Lo único que `sitemap.ts` lee del resultado de una consulta: `data` y `error`. */
type ConsultaFalsaResultado = { data: unknown[]; error: null }

/**
 * Doble mínimo de un query builder de `@supabase/supabase-js`. `sitemap.ts`
 * encadena, con cadenas distintas por tabla:
 *   - events: .from().select().eq().gte().order()
 *   - instagram_flyers: .from().select().eq().order()
 *   - cinema_movies: .from().select().eq()
 * Por eso el objeto que devuelve cada método encadenable (`select`, `eq`,
 * `gte`, `order`) es el mismo objeto, sin importar cuántos de esos métodos
 * se llamen ni en qué orden. El objeto es además "then-able" (tiene
 * `.then`), así que un `await` sobre él resuelve a `{ data: [], error: null
 * }`, igual que al final de una consulta real sin filas: con `data: []` el
 * sitemap no agrega ninguna ruta dinámica y `latest()` cae en su
 * `fallback`, que es justo lo que aísla la lista estática.
 *
 * No se usa `any`: se tipa como `Record<string, unknown>`. Reproducir el
 * tipo exacto de `PostgrestFilterBuilder` de supabase-js no aporta nada a
 * este test (que no es sobre los tipos de esa librería), así que acá no
 * hace falta ni siquiera un `as unknown as`: el mock de `vi.mock` no se
 * valida contra el tipo real del módulo (ver el mismo patrón, sin tipar,
 * en `tests/seo/gone.test.ts` y `tests/scraper/save-events-venue-errors.test.ts`).
 */
function crearConsultaFalsa(): Record<string, unknown> {
  const resultado: ConsultaFalsaResultado = { data: [], error: null }
  const consulta: Record<string, unknown> = {}
  const encadenar = () => consulta
  consulta.select = encadenar
  consulta.eq = encadenar
  consulta.gte = encadenar
  consulta.order = encadenar
  consulta.then = (
    onFulfilled?: ((value: ConsultaFalsaResultado) => unknown) | null,
    onRejected?: ((reason: unknown) => unknown) | null,
  ) => Promise.resolve(resultado).then(onFulfilled ?? undefined, onRejected ?? undefined)
  return consulta
}

/**
 * `vi.mock` es de módulo: vale para todo el archivo, así que este doble de
 * `@supabase/supabase-js` también está presente en el test del bloque 5 (la
 * rama de respaldo). No lo rompe, porque esa rama devuelve ANTES de llamar a
 * `createClient` — y el test de abajo lo comprueba de nuevo, puesto en verde
 * junto con el del bloque 5 en la misma corrida (ver la verificación en el
 * informe de la tarea).
 */
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: () => crearConsultaFalsa(),
  })),
}))

describe("app/sitemap.ts ejecutado: rama CON Supabase configurado (staticRoutes, la que sirve producción)", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("con las dos variables puestas no cae en la rama de respaldo, y devuelve /privacidad y /terminos", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proyecto-de-prueba.supabase.co")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "clave-anonima-de-prueba")
    const avisoWarn = vi.spyOn(console, "warn").mockImplementation(() => {})

    const { default: sitemap } = await import("@/app/sitemap")
    const urls = await sitemap()

    // Primero, la prueba de que no se coló por la rama de respaldo: si esto
    // fallara, las aserciones de abajo podrían estar pasando por la rama
    // equivocada (la del bloque 5) y no por `staticRoutes`.
    expect(avisoWarn).not.toHaveBeenCalledWith("[Sitemap] Faltan variables de entorno de Supabase")

    const rutas = urls.map((u) => u.url)
    expect(rutas).toContain("https://www.quepintasalta.com.ar/privacidad")
    expect(rutas).toContain("https://www.quepintasalta.com.ar/terminos")
  })
})
