// tests/cuenta/eliminar-rpc.test.ts (tarea 48-e, QPS-190): el contrato entre
// `apps/web/lib/cuenta/tablas-personales.ts` (de dónde `eliminarCuenta`
// obtiene qué hay que borrar/desvincular — aunque, desde esta tarea, ya no
// las use directamente: ver el comentario de `lib/cuenta/eliminar.ts`) y
// `public.delete_my_account()` (el RPC que de verdad hace el trabajo,
// `supabase/migrations/20261018130300_qps_190_delete_my_account.sql`).
//
// Sin red ni base: se lee el TEXTO de la migración (no se ejecuta SQL) y se
// comprueba, con regex sobre el cuerpo de la función, que cubre cada tabla y
// columna de las dos listas de producción — importadas, nunca copiadas a
// mano, para que si mañana alguien suma una tabla personal nueva y no la
// suma al RPC, este test se ponga en rojo solo.
//
// El archivo de la migración se busca por PATRÓN en supabase/migrations/,
// nunca por el nombre literal del archivo de hoy: si alguien lo renombra (o
// agrega una migración posterior que vuelva a `create or replace function`
// sobre la misma función), esta búsqueda lo sigue encontrando.
import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { COLUMNAS_A_DESVINCULAR, TABLAS_A_BORRAR } from "@/lib/cuenta/tablas-personales"

const CARPETA_MIGRACIONES = join(process.cwd(), "..", "..", "supabase", "migrations")

const PATRON_DEFINICION = /create\s+(or\s+replace\s+)?function\s+public\.delete_my_account\s*\(/i

/**
 * Busca, entre TODOS los archivos `.sql` de `supabase/migrations/`, el que
 * define `public.delete_my_account()`. Si no encuentra exactamente uno,
 * tira con un mensaje explícito (no un `expect` que falla más abajo con un
 * mensaje genérico): esta búsqueda es la base de todo lo demás en este
 * archivo, así que si falla, tiene que fallar fuerte y claro.
 */
function encontrarArchivoDeLaMigracion(): { ruta: string; contenido: string } {
  let nombresDeArchivo: string[]
  try {
    nombresDeArchivo = readdirSync(CARPETA_MIGRACIONES)
  } catch (error) {
    throw new Error(
      `No se pudo leer ${CARPETA_MIGRACIONES} (¿cambió la ubicación de supabase/migrations/ respecto de apps/web?): ${error}`,
    )
  }

  const candidatos = nombresDeArchivo
    .filter((nombre) => nombre.endsWith(".sql"))
    .map((nombre) => join(CARPETA_MIGRACIONES, nombre))
    .filter((ruta) => PATRON_DEFINICION.test(readFileSync(ruta, "utf8")))

  if (candidatos.length === 0) {
    throw new Error(
      "No se encontró, en ninguna migración de supabase/migrations/, una definición de " +
        "\"create [or replace] function public.delete_my_account(\". ¿Se borró o se renombró la función?",
    )
  }
  if (candidatos.length > 1) {
    throw new Error(
      `Se encontró la definición de public.delete_my_account() en MÁS DE UN archivo de migración: ` +
        `${candidatos.join(", ")}. Este test asume que hay exactamente uno.`,
    )
  }

  return { ruta: candidatos[0], contenido: readFileSync(candidatos[0], "utf8") }
}

const { contenido: SQL } = encontrarArchivoDeLaMigracion()

describe("public.delete_my_account(): la migración existe y define la función", () => {
  it("se encontró exactamente un archivo de migración con la definición", () => {
    expect(SQL.length).toBeGreaterThan(0)
    expect(PATRON_DEFINICION.test(SQL)).toBe(true)
  })
})

describe("public.delete_my_account(): cubre cada tabla de TABLAS_A_BORRAR, con su columna, en un DELETE", () => {
  it("TABLAS_A_BORRAR no vino vacía (si no, el resto de este describe recorrería una lista vacía y pasaría sin probar nada)", () => {
    expect(TABLAS_A_BORRAR.length).toBeGreaterThan(0)
  })

  // El patrón exige el `= v_uid` del otro lado, no solo que haya un `where`:
  // sin eso, un `delete from public.favorites where user_id = user_id` (que
  // es siempre verdadero y borra la tabla entera) pasaría este test en verde.
  // Lo encontró el revisor de la ronda, y es la diferencia entre un detector
  // que mira la forma y uno que mira QUÉ compara.
  for (const { tabla, columna } of TABLAS_A_BORRAR) {
    it(`"delete from public.${tabla} where ${columna} = v_uid" aparece en el cuerpo de la función`, () => {
      const patron = new RegExp(`delete\\s+from\\s+public\\.${tabla}\\s+where\\s+${columna}\\s*=\\s*v_uid\\b`, "i")
      expect(patron.test(SQL), `No se encontró un DELETE de public.${tabla} filtrando por ${columna} = v_uid en la migración`).toBe(
        true,
      )
    })
  }
})

describe("public.delete_my_account(): cubre cada tabla.columna de COLUMNAS_A_DESVINCULAR en un UPDATE ... SET columna = null", () => {
  it("COLUMNAS_A_DESVINCULAR no vino vacía", () => {
    expect(COLUMNAS_A_DESVINCULAR.length).toBeGreaterThan(0)
  })

  // Igual que el describe de arriba, y acá es más grave todavía: el patrón
  // exige el `where <columna> = v_uid`. Sin esa parte, un
  // `update public.events set created_by = null;` SIN `where` —que pisa el
  // autor de TODOS los eventos del sitio, no solo los de quien se borra—
  // pasaría este test en verde.
  for (const { tabla, columna } of COLUMNAS_A_DESVINCULAR) {
    it(`"update public.${tabla} set ${columna} = null where ${columna} = v_uid" aparece en el cuerpo de la función`, () => {
      const patron = new RegExp(
        `update\\s+public\\.${tabla}\\s+set\\s+${columna}\\s*=\\s*null\\s+where\\s+${columna}\\s*=\\s*v_uid\\b`,
        "i",
      )
      expect(
        patron.test(SQL),
        `No se encontró un UPDATE de public.${tabla} poniendo ${columna} en null SOLO donde ${columna} = v_uid en la migración`,
      ).toBe(true)
    })
  }
})

describe("public.delete_my_account(): propiedades de seguridad y de la firma", () => {
  it("es SECURITY DEFINER", () => {
    expect(/security\s+definer/i.test(SQL)).toBe(true)
  })

  it("fija search_path (SET search_path = ...)", () => {
    expect(/set\s+search_path\s*=/i.test(SQL)).toBe(true)
  })

  it("usa auth.uid() (opera sobre la sesión de quien llama, nunca sobre un id recibido por parámetro)", () => {
    expect(/auth\.uid\s*\(\s*\)/i.test(SQL)).toBe(true)
  })

  it("usa FOR UPDATE (QPS-185: bloquea la fila de profiles antes de desvincular/borrar)", () => {
    expect(/for\s+update/i.test(SQL)).toBe(true)
  })

  it("la firma no tiene parámetros: delete_my_account()", () => {
    const ocurrencias = [...SQL.matchAll(/delete_my_account\s*\(([^)]*)\)/gi)]
    expect(ocurrencias.length).toBeGreaterThan(0)
    for (const ocurrencia of ocurrencias) {
      expect(ocurrencia[1].trim(), `se encontró un argumento dentro de los paréntesis: "${ocurrencia[0]}"`).toBe("")
    }
  })

  it("hay un REVOKE que alcanza tanto a public como a anon", () => {
    const match = SQL.match(/revoke\s+all\s+on\s+function\s+public\.delete_my_account\s*\(\s*\)\s+from\s+([^;]+);/i)
    expect(match, "no se encontró la línea de REVOKE sobre delete_my_account()").toBeTruthy()
    const roles = match![1]
    expect(/\bpublic\b/i.test(roles), `el REVOKE no alcanza a "public": "${roles}"`).toBe(true)
    expect(/\banon\b/i.test(roles), `el REVOKE no alcanza a "anon": "${roles}"`).toBe(true)
  })
})
