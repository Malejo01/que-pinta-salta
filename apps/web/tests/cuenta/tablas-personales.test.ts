import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  COLUMNAS_A_DESVINCULAR,
  ORDEN_BORRADO_DE_CUENTA,
  TABLAS_A_BORRAR,
} from "@/lib/cuenta/tablas-personales"

/**
 * Este test no confía en que las dos listas del módulo estén completas: lee
 * `packages/db/src/database.types.ts` como texto, junta toda columna "de
 * usuario" de cada tabla de `public` y exige que esté en exactamente una de
 * las dos listas. Así, si aparece una tabla nueva con una columna
 * `dismissed_by` (o `user_id`), el test se pone en rojo hasta que se la suma
 * al módulo.
 */

type ParDeColumna = { tabla: string; columna: string }

function leerEsquemaCompleto(): string {
  // process.cwd() es apps/web cuando se corre `npx vitest` desde ahí (ver
  // vitest.config.ts, que usa la misma convención de rutas relativas).
  const ruta = join(process.cwd(), "..", "..", "packages", "db", "src", "database.types.ts")
  const contenido = readFileSync(ruta, "utf8")
  expect(contenido.trim().length).toBeGreaterThan(0)
  return contenido
}

/**
 * Recorta el texto completo al bloque `Tables: { ... }`, sin incluir
 * `Views` (las vistas como `event_duplicate_groups`, `job_last_runs` o
 * `venues_canonical` no cuentan: no son tablas reales). Usa los marcadores
 * literales, no un número de línea fijo, porque el archivo se regenera con
 * `npm run db:types` y las líneas se corren.
 */
function obtenerBloqueDeTablas(contenidoCompleto: string): string {
  const inicio = contenidoCompleto.indexOf("Tables: {")
  const fin = contenidoCompleto.indexOf("Views: {")
  if (inicio === -1 || fin === -1 || fin <= inicio) {
    throw new Error(
      "No se encontraron los marcadores 'Tables: {' / 'Views: {' en database.types.ts: " +
        "¿cambió el formato del generador de tipos de Supabase?",
    )
  }
  return contenidoCompleto.slice(inicio, fin)
}

/**
 * Para cada tabla del bloque, la lista de nombres de columna de su `Row`.
 * Las claves de tabla van entre comillas (`"aliases": {`); las claves
 * `Row`/`Insert`/`Update`/`Relationships` no (`Row: {`), así que no hay
 * ambigüedad entre un nombre de tabla y esas claves fijas. El contenido de
 * `Row` no tiene llaves anidadas en este esquema (son todos tipos escalares,
 * arrays o `Json`), así que cortar en el primer `}` después de `Row: {`
 * alcanza para capturar justo esa sección y no `Insert`/`Update`.
 */
function parsearColumnasPorTabla(bloqueDeTablas: string): Map<string, string[]> {
  const columnasPorTabla = new Map<string, string[]>()
  const regexTabla = /"(\w+)":\s*\{\s*Row:\s*\{([^}]*)\}/g
  let coincidencia: RegExpExecArray | null
  while ((coincidencia = regexTabla.exec(bloqueDeTablas)) !== null) {
    const nombreTabla = coincidencia[1]
    const contenidoRow = coincidencia[2]
    const columnas = [...contenidoRow.matchAll(/"(\w+)"\??:/g)].map((m) => m[1])
    columnasPorTabla.set(nombreTabla, columnas)
  }
  return columnasPorTabla
}

/**
 * Una columna es "de usuario" si se llama `user_id`, si termina en `_by`
 * (cubre `created_by`, `reviewed_by`, `decided_by`, `triggered_by` y
 * cualquier `*_by` que se agregue después), o si es el caso especial
 * `profiles.id` (la fila del perfil es del usuario aunque su PK no se llame
 * `user_id` ni termine en `_by`).
 */
function esColumnaDeUsuario(tabla: string, columna: string): boolean {
  if (columna === "user_id") return true
  if (columna.endsWith("_by")) return true
  if (tabla === "profiles" && columna === "id") return true
  return false
}

function listarParesDeUsuario(columnasPorTabla: Map<string, string[]>): ParDeColumna[] {
  const pares: ParDeColumna[] = []
  for (const [tabla, columnas] of columnasPorTabla) {
    for (const columna of columnas) {
      if (esColumnaDeUsuario(tabla, columna)) {
        pares.push({ tabla, columna })
      }
    }
  }
  return pares
}

function clave(par: ParDeColumna): string {
  return `${par.tabla}.${par.columna}`
}

const contenidoCompleto = leerEsquemaCompleto()
const bloqueDeTablas = obtenerBloqueDeTablas(contenidoCompleto)
const columnasPorTabla = parsearColumnasPorTabla(bloqueDeTablas)
const paresDeUsuarioEncontrados = listarParesDeUsuario(columnasPorTabla)

describe("el parseo del esquema no viene vacío (detector real, no uno que se evade achicando el que lee)", () => {
  it("encuentra más de 20 tablas en el bloque Tables", () => {
    expect(columnasPorTabla.size).toBeGreaterThan(20)
  })

  it("encuentra al menos las 17 tablas de hoy con alguna columna de usuario", () => {
    const tablasConColumnaDeUsuario = new Set(paresDeUsuarioEncontrados.map((p) => p.tabla))
    expect(tablasConColumnaDeUsuario.size).toBeGreaterThanOrEqual(17)
  })

  it("el conjunto encontrado contiene nombres concretos de hoy", () => {
    const tablasConColumnaDeUsuario = new Set(paresDeUsuarioEncontrados.map((p) => p.tabla))
    const tablasQueTienenQueEstar = [
      "duplicate_dismissals",
      "events",
      "aliases",
      "venue_review_queue",
      "notification_preferences",
      "user_followed_venues",
    ]
    for (const tabla of tablasQueTienenQueEstar) {
      expect(tablasConColumnaDeUsuario.has(tabla), `falta "${tabla}" en lo que encontró el parseo`).toBe(true)
    }
  })
})

describe("TABLAS_A_BORRAR + COLUMNAS_A_DESVINCULAR cubren exactamente lo que hay en el esquema", () => {
  const clavesEnBorrar = new Set(TABLAS_A_BORRAR.map(clave))
  const clavesEnDesvincular = new Set(COLUMNAS_A_DESVINCULAR.map(clave))

  it("toda columna de usuario encontrada en el esquema está en exactamente una de las dos listas", () => {
    for (const par of paresDeUsuarioEncontrados) {
      const k = clave(par)
      const estaEnBorrar = clavesEnBorrar.has(k)
      const estaEnDesvincular = clavesEnDesvincular.has(k)
      expect(
        estaEnBorrar !== estaEnDesvincular,
        `"${k}" tiene que estar en exactamente una lista (borrar=${estaEnBorrar}, desvincular=${estaEnDesvincular})`,
      ).toBe(true)
    }
  })

  it("las dos listas no tienen entradas que ya no existan como columna de usuario en el esquema", () => {
    const encontrados = new Set(paresDeUsuarioEncontrados.map(clave))
    for (const entrada of [...TABLAS_A_BORRAR, ...COLUMNAS_A_DESVINCULAR]) {
      expect(encontrados.has(clave(entrada)), `"${clave(entrada)}" no aparece como columna de usuario en el esquema`).toBe(true)
    }
  })

  it("ninguna lista tiene filas repetidas", () => {
    const listaBorrar = TABLAS_A_BORRAR.map(clave)
    const listaDesvincular = COLUMNAS_A_DESVINCULAR.map(clave)
    expect(new Set(listaBorrar).size).toBe(listaBorrar.length)
    expect(new Set(listaDesvincular).size).toBe(listaDesvincular.length)
  })

  it("ninguna entrada está en las dos listas a la vez", () => {
    const intersección = [...clavesEnBorrar].filter((k) => clavesEnDesvincular.has(k))
    expect(intersección).toEqual([])
  })
})

describe("ORDEN_BORRADO_DE_CUENTA", () => {
  it("desvincular contenido público va antes de borrar filas personales, y borrar antes de eliminar el usuario de auth", () => {
    const indiceDesvincular = ORDEN_BORRADO_DE_CUENTA.indexOf("desvincular_contenido_publico")
    const indiceBorrar = ORDEN_BORRADO_DE_CUENTA.indexOf("borrar_filas_personales")
    const indiceEliminarAuth = ORDEN_BORRADO_DE_CUENTA.indexOf("eliminar_usuario_de_auth")

    expect(indiceDesvincular).toBeGreaterThanOrEqual(0)
    expect(indiceBorrar).toBeGreaterThanOrEqual(0)
    expect(indiceEliminarAuth).toBeGreaterThanOrEqual(0)
    expect(indiceDesvincular).toBeLessThan(indiceBorrar)
    expect(indiceBorrar).toBeLessThan(indiceEliminarAuth)
  })
})

describe("el orden DENTRO de TABLAS_A_BORRAR también es carga útil, no decoración", () => {
  const indiceProfiles = TABLAS_A_BORRAR.findIndex((entrada) => entrada.tabla === "profiles")
  const indiceDuplicateDismissals = TABLAS_A_BORRAR.findIndex((entrada) => entrada.tabla === "duplicate_dismissals")

  it("profiles es la última entrada de TABLAS_A_BORRAR", () => {
    expect(
      indiceProfiles,
      "profiles tiene que ser la última entrada del array: cualquier fila que todavía la referencie con " +
        "una FK NO ACTION (hoy duplicate_dismissals.decided_by) tiene que estar borrada antes, o el DELETE " +
        "FROM profiles falla por violación de FK y el borrado de cuenta se cae a mitad de camino.",
    ).toBe(TABLAS_A_BORRAR.length - 1)
  })

  it("duplicate_dismissals aparece antes que profiles (es el caso concreto que rompe si se invierte)", () => {
    expect(indiceDuplicateDismissals, "duplicate_dismissals no está en TABLAS_A_BORRAR").toBeGreaterThanOrEqual(0)
    expect(indiceProfiles, "profiles no está en TABLAS_A_BORRAR").toBeGreaterThanOrEqual(0)
    expect(
      indiceDuplicateDismissals < indiceProfiles,
      "duplicate_dismissals.decided_by referencia profiles(id) con una FK NO ACTION: si profiles se borrara " +
        "antes, esa fila todavía existiría apuntando al perfil borrado y el DELETE FROM profiles fallaría " +
        "por violación de FK. El caso real es una cuenta admin (solo un admin puede insertar en esa tabla).",
    ).toBe(true)
  })
})

describe("events.created_by y aliases.created_by van en COLUMNAS_A_DESVINCULAR, no en TABLAS_A_BORRAR", () => {
  const paresConFkNoActionHaciaProfiles: ParDeColumna[] = [
    { tabla: "events", columna: "created_by" },
    { tabla: "aliases", columna: "created_by" },
  ]

  for (const { tabla, columna } of paresConFkNoActionHaciaProfiles) {
    it(`${tabla}.${columna} está desvinculada, no borrada (su FK hacia profiles(id) es NO ACTION)`, () => {
      const estaEnDesvincular = COLUMNAS_A_DESVINCULAR.some((e) => e.tabla === tabla && e.columna === columna)
      const estaEnBorrar = TABLAS_A_BORRAR.some((e) => e.tabla === tabla && e.columna === columna)

      expect(
        estaEnDesvincular,
        `${tabla}.${columna} tiene que estar en COLUMNAS_A_DESVINCULAR: desvincularla (ponerla en null) ` +
          "antes de borrar profiles es justamente lo que permite que el DELETE FROM profiles no falle por " +
          "violación de FK (su FK hacia profiles(id) es NO ACTION, sin on delete).",
      ).toBe(true)
      expect(
        estaEnBorrar,
        `${tabla}.${columna} no puede estar en TABLAS_A_BORRAR: es contenido público (${tabla}), no una ` +
          "fila personal del usuario; borrar la fila entera borraría el evento/alias, no solo desvincular al autor.",
      ).toBe(false)
    })
  }
})
