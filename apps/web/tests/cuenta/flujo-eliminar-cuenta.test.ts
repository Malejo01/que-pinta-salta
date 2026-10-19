// tests/cuenta/flujo-eliminar-cuenta.test.ts (tarea 48-e, QPS-190/185/187):
// tests que cruzan tareas, sin red ni base, con dobles.
//
// Desde el 48-e, `eliminarCuenta` ya no hace llamadas sucesivas con la
// service key: llama a un único RPC transaccional
// (`public.delete_my_account()`, sin ningún argumento). Este archivo
// reemplaza el doble "FK simulada" de 37-q (que modelaba violaciones de FK
// tabla por tabla, porque `eliminarCuenta` llamaba a update/delete por
// tabla) por un doble que modela el RPC como UNA SOLA unidad atómica:
// o aplica TODO lo que hace la migración (desvincular + borrar + borrar
// auth.users) de una vez, o no toca absolutamente nada. Esa es justo la
// garantía nueva (antes, si una llamada fallaba a mitad de camino, lo
// anterior ya había quedado aplicado).
//
// Lo que este archivo SIGUE haciendo igual que 37-q:
// 2. Deriva la ruta del endpoint y el literal de confirmación de las DOS
//    fuentes reales (el cliente de la app, `apps/mobile/lib/cuenta.ts`, y lo
//    que usa la web) y las cruza entre sí y contra lo que exige el propio
//    endpoint — nunca hardcodeando "ELIMINAR" ni "/api/cuenta/eliminar" como
//    único juez. Ver la sección final del archivo.
import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { eliminarCuenta } from "@/lib/cuenta/eliminar"
import { COLUMNAS_A_DESVINCULAR, TABLAS_A_BORRAR } from "@/lib/cuenta/tablas-personales"

// Cuentas inventadas, nunca reales. USUARIO_ID es la cuenta que se borra;
// OTRA_CUENTA_ID es una cuenta ajena que tiene que quedar completamente
// intacta (si algo tocara sus filas, el borrado no estaría filtrando por
// usuario, estaría borrando/desvinculando a ciegas).
const USUARIO_ID = "11111111-1111-4111-8111-111111111111"
const OTRA_CUENTA_ID = "22222222-2222-4222-8222-222222222222"

// Estos mínimos son los de hoy (R37): si alguna de las dos listas se achica
// de golpe por debajo de esto, algo se perdió sin que el test lo note "en
// vacío" (una lista vacía también "cubriría" cualquier aserción sobre un
// `for` que no itera nada).
const MINIMO_TABLAS_A_BORRAR_DE_HOY = 12
const MINIMO_COLUMNAS_A_DESVINCULAR_DE_HOY = 5

type Fila = Record<string, unknown>

/**
 * Doble del cliente de la sesión de la persona, con estado real en memoria
 * (una tabla por array de filas, igual que el doble de 37-q). La diferencia
 * con 37-q es que acá `rpc('delete_my_account')` es la ÚNICA operación que
 * expone el doble (como en la producción real: `eliminarCuenta` ya no toca
 * tablas una por una) y la aplica TODA DE UNA, simulando una transacción:
 *
 * - Si `opciones.sinSesion` está presente (equivalente a que `auth.uid()` sea
 *   `null` del lado de la migración real, código `42501`) o si lo está
 *   `opciones.forzarError`, NO se toca absolutamente nada: el "borrador" del
 *   estado se descarta entero, nunca se pisa el estado real con cambios
 *   parciales.
 *
 *   **Ojo con un error fácil, que este doble tuvo mientras se escribía:
 *   "no hay sesión" NO es lo mismo que "la fila de `auth.users` ya no
 *   existe".** `auth.uid()` se define como el claim `sub` del JWT
 *   (`request.jwt.claims`), así que lo lee del token, no de la base: borrar
 *   la fila de `auth.users` no hace que `auth.uid()` pase a ser `null`
 *   mientras el token siga sin vencer. Por eso `authUsers` **no** condiciona
 *   el `42501`: un reintento con el mismo token sobre una cuenta ya borrada
 *   vuelve a correr la función, no encuentra ninguna fila para bloquear,
 *   desvincular ni borrar, y sale bien sin tocar nada (ver el describe de
 *   QPS-187). `opciones.sinSesion` modela el caso de verdad: la service key
 *   (donde no hay claim `sub`) o un pedido sin token.
 * - Si no, aplica de una sola vez, sobre un clon del estado, exactamente lo
 *   que hace la migración
 *   (`supabase/migrations/20261018130300_qps_190_delete_my_account.sql`):
 *   pone en `null` las columnas de `COLUMNAS_A_DESVINCULAR` (importadas de
 *   producción, nunca copiadas a mano) donde coincidan con `usuarioId`,
 *   borra las filas de `TABLAS_A_BORRAR` que sean de `usuarioId`, y borra a
 *   `usuarioId` de `authUsers`. Recién ahí reemplaza el estado real por el
 *   clon modificado, todo junto.
 *
 * `opciones.eventoConcurrenteDeLaMismaPersona` modela el escenario de
 * QPS-185 (ver el describe de ese nombre, más abajo): se trata como una
 * variante más de "el RPC falla sin tocar nada", con su propio mensaje para
 * que el test pueda documentar de qué se trata.
 *
 * IMPORTANTE, para no sobre-prometer: esto es un MODELO del comportamiento
 * documentado de la migración (comentario de cabecera de
 * `20261018130300_qps_190_delete_my_account.sql` y el propio cuerpo de la
 * función), no una prueba contra Postgres real — no hay ninguna base en
 * este archivo. En particular, no reproduce el locking de verdad de
 * `FOR UPDATE` (eso lo prueba, si existiera, un test de pgTAP contra la
 * base local; no es lo que mide este archivo).
 */
function crearRpcTransaccional(
  usuarioId: string,
  opciones: {
    sinSesion?: boolean
    forzarError?: { message: string; code?: string }
    eventoConcurrenteDeLaMismaPersona?: boolean
  } = {},
) {
  const dbState: Record<string, Fila[]> = {}
  const authUsers = new Set<string>()
  let llamadasRpc = 0

  function filas(tabla: string): Fila[] {
    if (!dbState[tabla]) dbState[tabla] = []
    return dbState[tabla]
  }

  const cliente = {
    rpc: async () => {
      llamadasRpc++

      if (opciones.sinSesion) {
        // Mismo código (42501) que tira la migración real cuando
        // auth.uid() es null: no hay claim `sub` en el token (o no hay
        // token). No se deriva de `authUsers`: ver el comentario de arriba.
        return { error: { message: "No autenticado", code: "42501" } }
      }

      if (opciones.forzarError) {
        return { error: opciones.forzarError }
      }

      if (opciones.eventoConcurrenteDeLaMismaPersona) {
        // Ver el comentario de la opción, arriba: se modela como que el
        // borrado "pierde la carrera" contra el createEvent concurrente y
        // se aborta entero, sin tocar nada.
        return {
          error: { message: "fk simulada: createEvent concurrente de la misma persona en vuelo", code: "23503" },
        }
      }

      // "Transacción": se calcula TODO sobre un clon del estado, y solo al
      // final se reemplaza el estado real de una sola vez. Nunca queda, ni
      // siquiera transitoriamente dentro de este test, un estado a medio
      // camino.
      const borrador: Record<string, Fila[]> = {}
      for (const tabla of Object.keys(dbState)) borrador[tabla] = dbState[tabla].map((f) => ({ ...f }))

      for (const { tabla, columna } of COLUMNAS_A_DESVINCULAR) {
        for (const fila of borrador[tabla] ?? []) {
          if (fila[columna] === usuarioId) fila[columna] = null
        }
      }
      for (const { tabla, columna } of TABLAS_A_BORRAR) {
        borrador[tabla] = (borrador[tabla] ?? []).filter((f) => f[columna] !== usuarioId)
      }

      for (const tabla of Object.keys(borrador)) dbState[tabla] = borrador[tabla]
      authUsers.delete(usuarioId)

      return { error: null }
    },
  }

  return {
    cliente: cliente as unknown as Parameters<typeof eliminarCuenta>[0],
    filas,
    dbState,
    authUsers,
    get llamadasRpc() {
      return llamadasRpc
    },
  }
}

/**
 * Siembra, para `TABLAS_A_BORRAR` y `COLUMNAS_A_DESVINCULAR`, una fila de
 * `usuarioId` y otra de `otraCuentaId` en cada tabla — la segunda es la que
 * prueba selectividad: si el borrado no filtrara por usuario, también la
 * tocaría. (Idéntica a la de 37-q: no depende de cómo `eliminarCuenta`
 * llame al RPC, solo de las listas de producción.)
 */
function sembrarFixtureDeCuenta(filas: (tabla: string) => Fila[], usuarioId: string, otraCuentaId: string): void {
  for (const entrada of [...TABLAS_A_BORRAR, ...COLUMNAS_A_DESVINCULAR]) {
    filas(entrada.tabla).push({ [entrada.columna]: usuarioId, _fixture: `${entrada.tabla}.${entrada.columna}-de-la-cuenta` })
    filas(entrada.tabla).push({ [entrada.columna]: otraCuentaId, _fixture: `${entrada.tabla}.${entrada.columna}-de-otra-cuenta` })
  }
}

describe("eliminarCuenta: de punta a punta, con un doble que modela el RPC como transacción (todo o nada)", () => {
  it("TABLAS_A_BORRAR y COLUMNAS_A_DESVINCULAR no vinieron vacías ni se achicaron por debajo de lo de hoy (si no, el resto de este archivo recorrería listas vacías y pasaría sin probar nada)", () => {
    expect(TABLAS_A_BORRAR.length).toBeGreaterThanOrEqual(MINIMO_TABLAS_A_BORRAR_DE_HOY)
    expect(COLUMNAS_A_DESVINCULAR.length).toBeGreaterThanOrEqual(MINIMO_COLUMNAS_A_DESVINCULAR_DE_HOY)
  })

  it("camino feliz: la cuenta queda sin ninguna fila en TABLAS_A_BORRAR, sus eventos/alias quedan con autor en null, el usuario de auth se borra, y la cuenta ajena no se toca", async () => {
    const { cliente, filas, authUsers } = crearRpcTransaccional(USUARIO_ID)
    sembrarFixtureDeCuenta(filas, USUARIO_ID, OTRA_CUENTA_ID)
    authUsers.add(USUARIO_ID)
    authUsers.add(OTRA_CUENTA_ID)

    const resultado = await eliminarCuenta(cliente, USUARIO_ID)
    expect(resultado).toEqual({ ok: true })

    for (const entrada of TABLAS_A_BORRAR) {
      const filasDeLaTabla = filas(entrada.tabla)
      expect(
        filasDeLaTabla.some((f) => f[entrada.columna] === USUARIO_ID),
        `${entrada.tabla}.${entrada.columna} todavía tiene una fila de la cuenta borrada`,
      ).toBe(false)
      expect(
        filasDeLaTabla.some((f) => f[entrada.columna] === OTRA_CUENTA_ID),
        `${entrada.tabla}.${entrada.columna} perdió la fila de la OTRA cuenta: el borrado no filtró por usuario`,
      ).toBe(true)
    }

    for (const entrada of COLUMNAS_A_DESVINCULAR) {
      const filasDeLaTabla = filas(entrada.tabla)
      const filaDeLaCuenta = filasDeLaTabla.find((f) => f._fixture === `${entrada.tabla}.${entrada.columna}-de-la-cuenta`)
      expect(filaDeLaCuenta, `no se encontró la fila fixture de ${entrada.tabla}.${entrada.columna}`).toBeTruthy()
      expect(filaDeLaCuenta?.[entrada.columna], `${entrada.tabla}.${entrada.columna} no quedó en null`).toBeNull()

      const filaDeOtraCuenta = filasDeLaTabla.find(
        (f) => f._fixture === `${entrada.tabla}.${entrada.columna}-de-otra-cuenta`,
      )
      expect(
        filaDeOtraCuenta?.[entrada.columna],
        `se desvinculó por error la columna de la OTRA cuenta en ${entrada.tabla}.${entrada.columna}`,
      ).toBe(OTRA_CUENTA_ID)
    }

    expect(authUsers.has(USUARIO_ID), "el usuario de auth tendría que estar borrado").toBe(false)
    expect(authUsers.has(OTRA_CUENTA_ID), "se borró por error el usuario de auth de la OTRA cuenta").toBe(true)
  })

  it("si el RPC falla por cualquier motivo (ej. una violación de FK), NO se toca absolutamente nada: todo o nada", async () => {
    const { cliente, filas, authUsers } = crearRpcTransaccional(USUARIO_ID, {
      forzarError: { message: "violación de FK simulada (estado ya corrupto)", code: "23503" },
    })
    sembrarFixtureDeCuenta(filas, USUARIO_ID, OTRA_CUENTA_ID)
    authUsers.add(USUARIO_ID)

    const resultado = await eliminarCuenta(cliente, USUARIO_ID)

    expect(resultado.ok).toBe(false)
    if (!resultado.ok) {
      expect(resultado.paso).toBe("rpc")
      expect(resultado.codigo).toBe("23503")
    }

    // Todo exactamente como antes del pedido: ni una columna desvinculada,
    // ni una fila borrada.
    for (const entrada of [...TABLAS_A_BORRAR, ...COLUMNAS_A_DESVINCULAR]) {
      expect(
        filas(entrada.tabla).some((f) => f[entrada.columna] === USUARIO_ID),
        `${entrada.tabla}.${entrada.columna} se tocó a pesar de que el RPC falló`,
      ).toBe(true)
    }
    expect(authUsers.has(USUARIO_ID)).toBe(true)
  })
})

describe("eliminarCuenta: QPS-185, un createEvent concurrente de la MISMA persona", () => {
  it(
    "el resultado es la cuenta SIN borrar y SIN datos perdidos — nunca 'a medio borrar' como antes de la migración. " +
      "La garantía real sale del FOR UPDATE sobre profiles de " +
      "supabase/migrations/20261018130300_qps_190_delete_my_account.sql más la transacción (ver el comentario de " +
      "cabecera de esa migración): el createEvent concurrente queda esperando el lock de la fila de profiles, así " +
      "que nunca puede intercalarse a mitad de camino del borrado. Este doble NO reproduce ese locking (no hay " +
      "base real en este archivo): directamente MODELA la consecuencia observable como el RPC perdiendo la carrera " +
      "y abortando sin tocar nada.",
    async () => {
      const { cliente, filas, authUsers } = crearRpcTransaccional(USUARIO_ID, {
        eventoConcurrenteDeLaMismaPersona: true,
      })
      sembrarFixtureDeCuenta(filas, USUARIO_ID, OTRA_CUENTA_ID)
      authUsers.add(USUARIO_ID)
      // La fila de events.created_by sembrada por sembrarFixtureDeCuenta
      // hace de "testigo" del createEvent concurrente: si el borrado
      // tocara algo, esta fila cambiaría o desaparecería.
      const filaEventoConcurrenteAntes = filas("events").find((f) => f.created_by === USUARIO_ID)
      expect(filaEventoConcurrenteAntes).toBeTruthy()

      const resultado = await eliminarCuenta(cliente, USUARIO_ID)

      expect(resultado.ok).toBe(false)
      if (!resultado.ok) expect(resultado.paso).toBe("rpc")

      // La cuenta sigue viva...
      expect(authUsers.has(USUARIO_ID), "la cuenta no se tendría que haber borrado").toBe(true)
      // ...y nada se perdió: ni el evento concurrente ni ninguna otra fila
      // de la cuenta (nada quedó a medio camino).
      expect(filas("events").find((f) => f.created_by === USUARIO_ID)).toEqual(filaEventoConcurrenteAntes)
      for (const entrada of [...TABLAS_A_BORRAR, ...COLUMNAS_A_DESVINCULAR]) {
        expect(
          filas(entrada.tabla).some((f) => f[entrada.columna] === USUARIO_ID),
          `${entrada.tabla}.${entrada.columna} se perdió a pesar de que el borrado se abortó`,
        ).toBe(true)
      }
    },
  )
})

describe("eliminarCuenta: QPS-187, el reintento es trivialmente idempotente (justo porque todo es una transacción)", () => {
  it("si un intento anterior ya completó el borrado entero, un reintento con el mismo token sale BIEN sin tocar nada (no falla con 42501: auth.uid() sale del JWT, no de auth.users)", async () => {
    const { cliente, filas, authUsers, dbState } = crearRpcTransaccional(USUARIO_ID)
    // Solo la otra cuenta queda sembrada y en authUsers: como si un intento
    // anterior ya hubiera corrido la transacción completa, incluido el
    // DELETE FROM auth.users de USUARIO_ID. Como el borrado es una sola
    // transacción, no hay ningún estado intermedio real en el que el
    // usuario exista "a medias": o esto, o el caso de abajo.
    for (const entrada of [...TABLAS_A_BORRAR, ...COLUMNAS_A_DESVINCULAR]) {
      filas(entrada.tabla).push({ [entrada.columna]: OTRA_CUENTA_ID, _fixture: "de-otra-cuenta" })
    }
    authUsers.add(OTRA_CUENTA_ID)
    const antes = JSON.stringify(dbState)

    const resultado = await eliminarCuenta(cliente, USUARIO_ID)

    // Esto es QPS-187 de verdad: el segundo intento responde lo mismo que el
    // primero, así que quien reintenta (por un timeout del lado del cliente,
    // por ejemplo) ve "listo", no un error que diga que no se borró nada
    // cuando en realidad se borró todo.
    expect(resultado).toEqual({ ok: true })
    expect(JSON.stringify(dbState)).toBe(antes)
    expect(authUsers.has(OTRA_CUENTA_ID)).toBe(true)
  })

  it("el 42501 de verdad es el pedido SIN sesión (service key o sin token), y ahí tampoco se toca nada", async () => {
    const { cliente, filas, authUsers, dbState } = crearRpcTransaccional(USUARIO_ID, { sinSesion: true })
    sembrarFixtureDeCuenta(filas, USUARIO_ID, OTRA_CUENTA_ID)
    authUsers.add(USUARIO_ID)
    const antes = JSON.stringify(dbState)

    const resultado = await eliminarCuenta(cliente, USUARIO_ID)

    expect(resultado.ok).toBe(false)
    if (!resultado.ok) {
      expect(resultado.paso).toBe("rpc")
      expect(resultado.codigo).toBe("42501")
    }
    expect(JSON.stringify(dbState)).toBe(antes)
    expect(authUsers.has(USUARIO_ID)).toBe(true)
  })

  it("si un intento anterior falló entero (todo-o-nada, sin cambios de por medio), un reintento corre igual que la primera vez y sale bien", async () => {
    const { cliente, filas, authUsers } = crearRpcTransaccional(USUARIO_ID)
    sembrarFixtureDeCuenta(filas, USUARIO_ID, OTRA_CUENTA_ID)
    authUsers.add(USUARIO_ID)

    const resultado = await eliminarCuenta(cliente, USUARIO_ID)
    expect(resultado).toEqual({ ok: true })
  })
})

// ---------------------------------------------------------------------------
// La web y la app llaman al mismo endpoint, con la misma confirmación.
// (Sin cambios respecto de 37-q: nada de esto depende de cómo eliminarCuenta
// llame internamente al RPC, solo de los literales de route.ts, de
// apps/mobile/lib/cuenta.ts y del formulario web.)
//
// Nada de esto hardcodea "ELIMINAR" ni "/api/cuenta/eliminar" como juez
// único: los tres valores (web, app, endpoint) se extraen de los archivos de
// producción reales con regex, y se cruzan entre sí. Si alguien cambia el
// literal en un solo lado, o mueve el endpoint a otra carpeta, alguna de las
// comparaciones de abajo queda desigual y el test se pone en rojo.
// ---------------------------------------------------------------------------

const RAIZ_WEB = process.cwd() // apps/web cuando se corre `npx vitest` desde ahí
const RAIZ_MOBILE = join(RAIZ_WEB, "..", "mobile")
const CARPETA_APP = join(RAIZ_WEB, "app")

function listarArchivosRecursivo(carpeta: string): string[] {
  let entradas: string[]
  try {
    entradas = readdirSync(carpeta)
  } catch {
    return []
  }
  const resultado: string[] = []
  for (const entrada of entradas) {
    const rutaCompleta = join(carpeta, entrada)
    const info = statSync(rutaCompleta)
    if (info.isDirectory()) {
      resultado.push(...listarArchivosRecursivo(rutaCompleta))
    } else if (/\.(ts|tsx)$/.test(entrada)) {
      resultado.push(rutaCompleta)
    }
  }
  return resultado
}

/**
 * Encuentra el/los `route.ts` de App Router que importan `eliminarCuenta`
 * de `@/lib/cuenta/eliminar` — sin asumir de entrada que está en
 * `app/api/cuenta/eliminar/`. Si alguien mueve el endpoint a otra carpeta,
 * esta búsqueda lo sigue encontrando (recorre TODO `app/`), y la URL
 * esperada se deriva de dónde esté de verdad, no de una ruta fija escrita
 * acá.
 */
function encontrarArchivosDelEndpointDeEliminarCuenta(): string[] {
  return listarArchivosRecursivo(CARPETA_APP)
    .filter((archivo) => /route\.tsx?$/.test(archivo))
    .filter((archivo) => {
      const contenido = readFileSync(archivo, "utf8")
      return contenido.includes("@/lib/cuenta/eliminar") && contenido.includes("eliminarCuenta")
    })
}

/**
 * Convierte la ruta de archivo de un `route.ts` de App Router en la URL que
 * de verdad atiende (p. ej. `app/api/cuenta/eliminar/route.ts` →
 * `/api/cuenta/eliminar`). Los grupos de rutas (carpetas `(nombre)`) no
 * forman parte de la URL; no hay ninguno en este caso, pero se filtran por
 * si se agrega uno más adelante.
 *
 * LÍMITE: asume rutas estáticas (sin `[segmento]` dinámico). El endpoint de
 * esta tarea no lo necesita; si algún día lo tuviera, esta función seguiría
 * devolviendo el literal `[segmento]` tal cual, no lo resolvería.
 */
function convertirRutaDeArchivoAUrl(rutaAbsolutaDelArchivo: string): string {
  const relativa = relative(CARPETA_APP, rutaAbsolutaDelArchivo)
  const segmentos = relativa.split(/[\\/]/).slice(0, -1) // sin el "route.ts" final
  const segmentosUrl = segmentos.filter((s) => !(s.startsWith("(") && s.endsWith(")")))
  return "/" + segmentosUrl.join("/")
}

/**
 * Extrae la ruta y el literal de confirmación del lado de la web. Busca el
 * primer `fetch("...")` y el primer `confirmacion: "..."` del archivo.
 *
 * LÍMITE DOCUMENTADO: si el literal de la URL o de la confirmación se
 * moviera a una variable intermedia (p. ej. `const ruta = "..."` y después
 * `fetch(ruta, ...)`), este regex no lo encuentra — y como `match` da `null`,
 * la función tira una excepción explícita más abajo (no pasa en silencio ni
 * compara contra `undefined`).
 */
function extraerRutaYConfirmacionDelFormularioWeb(contenido: string): { ruta: string; confirmacion: string } {
  const matchRuta = contenido.match(/fetch\(\s*["'`]([^"'`]+)["'`]/)
  const matchConfirmacion = contenido.match(/confirmacion:\s*["'`]([^"'`]+)["'`]/)
  if (!matchRuta || !matchConfirmacion) {
    throw new Error(
      "No se pudo extraer la ruta o la confirmación del formulario web con el regex esperado: ¿cambió el código " +
        "a una forma que el regex no cubre (p. ej. un literal armado en una variable intermedia)?",
    )
  }
  return { ruta: matchRuta[1], confirmacion: matchConfirmacion[1] }
}

/**
 * Extrae la ruta relativa (sin el dominio `${SITIO}`) y el literal de
 * confirmación del cliente de la app (`apps/mobile/lib/cuenta.ts`). Mismo
 * límite que la versión web: si `RUTA_ELIMINAR` o `CONFIRMACION_ESPERADA` se
 * armaran de otra forma, el regex no matchea y la función tira.
 */
function extraerRutaYConfirmacionDeLaApp(contenido: string): { rutaRelativa: string; confirmacion: string } {
  const matchRuta = contenido.match(/RUTA_ELIMINAR\s*=\s*`\$\{SITIO\}([^`]+)`/)
  const matchConfirmacion = contenido.match(/CONFIRMACION_ESPERADA\s*=\s*['"]([^'"]+)['"]/)
  if (!matchRuta || !matchConfirmacion) {
    throw new Error(
      "No se pudo extraer RUTA_ELIMINAR o CONFIRMACION_ESPERADA de apps/mobile/lib/cuenta.ts con el regex " +
        "esperado: ¿cambió el código a una forma que el regex no cubre?",
    )
  }
  return { rutaRelativa: matchRuta[1], confirmacion: matchConfirmacion[1] }
}

/** Extrae el literal `CONFIRMACION_ESPERADA` del endpoint mismo. */
function extraerConfirmacionDelEndpoint(contenido: string): string {
  const match = contenido.match(/CONFIRMACION_ESPERADA\s*=\s*['"]([^'"]+)['"]/)
  if (!match) {
    throw new Error("No se pudo extraer CONFIRMACION_ESPERADA del endpoint con el regex esperado: ¿cambió el código?")
  }
  return match[1]
}

describe("la web y la app llaman al mismo endpoint, con la misma confirmación (derivado de las fuentes reales, no hardcodeado)", () => {
  const archivosDelEndpoint = encontrarArchivosDelEndpointDeEliminarCuenta()

  it('encuentra exactamente un "route.ts" que importe eliminarCuenta (si hay cero, el endpoint no existe donde se lo busca; si hay más de uno, algo está duplicado)', () => {
    expect(archivosDelEndpoint.length).toBe(1)
  })

  it("la ruta derivada del archivo del endpoint empieza con /api/ (sanity check de que la búsqueda encontró lo que se esperaba)", () => {
    const rutaDelEndpoint = convertirRutaDeArchivoAUrl(archivosDelEndpoint[0])
    expect(rutaDelEndpoint.startsWith("/api/")).toBe(true)
    expect(rutaDelEndpoint.length).toBeGreaterThan("/api/".length)
  })

  it("el cliente de la app (apps/mobile/lib/cuenta.ts) apunta exactamente a la URL real del endpoint", () => {
    const contenidoApp = readFileSync(join(RAIZ_MOBILE, "lib", "cuenta.ts"), "utf8")
    const { rutaRelativa } = extraerRutaYConfirmacionDeLaApp(contenidoApp)
    const rutaDelEndpoint = convertirRutaDeArchivoAUrl(archivosDelEndpoint[0])
    expect(rutaRelativa).toBe(rutaDelEndpoint)
  })

  it("el formulario web (perfil/eliminar-cuenta) apunta exactamente a la misma URL real del endpoint", () => {
    const contenidoWeb = readFileSync(join(RAIZ_WEB, "app", "perfil", "eliminar-cuenta", "eliminar-cuenta-form.tsx"), "utf8")
    const { ruta } = extraerRutaYConfirmacionDelFormularioWeb(contenidoWeb)
    const rutaDelEndpoint = convertirRutaDeArchivoAUrl(archivosDelEndpoint[0])
    expect(ruta).toBe(rutaDelEndpoint)
  })

  it("el literal de confirmación de la app, de la web y del endpoint son EXACTAMENTE el mismo, y no están vacíos", () => {
    const contenidoApp = readFileSync(join(RAIZ_MOBILE, "lib", "cuenta.ts"), "utf8")
    const contenidoWeb = readFileSync(join(RAIZ_WEB, "app", "perfil", "eliminar-cuenta", "eliminar-cuenta-form.tsx"), "utf8")
    const contenidoEndpoint = readFileSync(archivosDelEndpoint[0], "utf8")

    const { confirmacion: confirmacionApp } = extraerRutaYConfirmacionDeLaApp(contenidoApp)
    const { confirmacion: confirmacionWeb } = extraerRutaYConfirmacionDelFormularioWeb(contenidoWeb)
    const confirmacionEndpoint = extraerConfirmacionDelEndpoint(contenidoEndpoint)

    expect(confirmacionApp.length).toBeGreaterThan(0)
    expect(confirmacionApp).toBe(confirmacionWeb)
    expect(confirmacionApp).toBe(confirmacionEndpoint)
  })
})
