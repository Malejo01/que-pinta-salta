// tests/cuenta/flujo-eliminar-cuenta.test.ts (R37, tarea 37-q): tests que
// cruzan tareas, sin red ni base, con dobles.
//
// Dos cosas que este archivo hace y que ningún otro test de la ronda hace:
//
// 1. El doble del cliente admin no solo REGISTRA llamadas (como el de
//    tests/cuenta/eliminar.test.ts, de 37-b): mantiene un estado real en
//    memoria (una fila por tabla) y lo MUTA de verdad con cada update/delete,
//    y además simula la violación de FK que Postgres tiraría si se borrara
//    `profiles` mientras todavía queda algo sin resolver (duplicate_dismissals
//    sin borrar, o events/aliases.created_by sin desvincular) — ver
//    `detectarBloqueoDeFkAlBorrarProfiles` más abajo, que chequea TODAS las
//    entradas relevantes, no solo las que estén antes de "profiles" en el
//    array en este momento, así que detecta la violación sin importar en qué
//    posición relativa quedaran duplicate_dismissals y profiles.
//    IMPORTANTE, para no sobre-prometer: esto cubre la relación FK real entre
//    duplicate_dismissals/events/aliases y profiles, y que profiles vaya
//    antes que `deleteUser()` (ver el test de ese nombre). NO cubre el orden
//    arbitrario de las demás entradas de TABLAS_A_BORRAR entre sí (p. ej.
//    push_tokens vs. notification_preferences): no hay ninguna FK real entre
//    ellas, así que invertirlas no causaría ningún error ni en Postgres ni
//    acá. El invariante "duplicate_dismissals/el resto va antes que profiles,
//    y profiles es la última entrada del array" como propiedad ESTÁTICA del
//    array ya lo prueba `tests/cuenta/tablas-personales.test.ts` (37-a), con
//    aserciones de índice sobre el array mismo — esa cobertura no es
//    redundante con esta: esa prueba la forma del array, esta prueba la
//    CONSECUENCIA en tiempo de ejecución de violarla.
// 2. Deriva la ruta del endpoint y el literal de confirmación de las DOS
//    fuentes reales (el cliente de la app, `apps/mobile/lib/cuenta.ts`, y lo
//    que usa la web) y las cruza entre sí y contra lo que exige el propio
//    endpoint — nunca hardcodeando "ELIMINAR" ni "/api/cuenta/eliminar" como
//    único juez.
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
type Llamada =
  | { tipo: "update"; tabla: string; columna: string }
  | { tipo: "delete"; tabla: string; columna: string }
  | { tipo: "deleteUser" }

/**
 * Doble del cliente admin con estado real: cada tabla es un array de filas
 * en memoria, y `update`/`delete` las mutan de verdad (no solo registran que
 * se llamó). Además de los dos campos de fixture (`id`/`columna`), cada fila
 * lleva una marca `_fixture` para poder encontrarla de nuevo después de que
 * `eliminarCuenta` haya corrido, incluso si la columna que le interesa a la
 * aserción terminó en `null`.
 *
 * `delete()` sobre la tabla `profiles` simula la violación de FK que tiraría
 * Postgres de verdad si todavía queda algo sin resolver (ver
 * `detectarBloqueoDeFk` más abajo): así, si `eliminarCuenta` invirtiera el
 * orden de los pasos, este doble lo delata solo, sin que haga falta una
 * aserción de índices escrita a mano.
 */
function crearAdminConEstadoReal(
  opciones: {
    tablaQueFallaAlDesvincular?: string
    tablaQueFallaAlBorrar?: string
    /** Ver el comentario junto a `deleteUser` más abajo: supuesto no verificado contra la red real. */
    usuarioYaNoExisteEnAuth?: boolean
  } = {},
) {
  const dbState: Record<string, Fila[]> = {}
  const authUsers = new Set<string>()
  const llamadas: Llamada[] = []

  function filas(tabla: string): Fila[] {
    if (!dbState[tabla]) dbState[tabla] = []
    return dbState[tabla]
  }

  // NO depende de la posición de cada entrada dentro de TABLAS_A_BORRAR: se
  // revisan TODAS (salvo profiles misma), sin "break" al cruzar "profiles" en
  // el array. Si dependiera de la posición (como la versión anterior de esta
  // función, que cortaba al llegar a "profiles"), invertir duplicate_dismissals
  // y profiles dentro del array haría que el chequeo nunca llegara a mirar
  // duplicate_dismissals (porque ahora queda "después" del break) y el bug
  // real que eso representa —violar la FK NOT NULL/NO ACTION de
  // duplicate_dismissals.decided_by— quedaría sin detectar. Por eso se
  // recorre el array entero siempre.
  //
  // Entradas de TABLAS_A_BORRAR que bloquean el borrado de profiles: se
  // identifican por el propio COMENTARIO de producción, buscando que
  // mencione a la vez "profiles" y "NO ACTION" (hoy, exactamente
  // duplicate_dismissals: "su FK a profiles es NO ACTION"). Las demás
  // entradas (favorites, user_favorites, etc.) tienen "ON DELETE CASCADE" en
  // su comentario, no "NO ACTION", así que no bloquean. No es una lista de
  // tablas copiada a mano: si se agrega una tabla nueva con esa misma FK y
  // se documenta igual, este doble la cubre sola.
  //
  // Entradas de COLUMNAS_A_DESVINCULAR cuyo COMENTARIO documenta una FK NO
  // ACTION hacia profiles(id) (hoy events.created_by y aliases.created_by):
  // se detectan buscando el texto "profiles(id)" en el propio comentario del
  // módulo de producción, mismo criterio.
  function detectarBloqueoDeFkAlBorrarProfiles(userId: unknown): string | null {
    for (const entrada of TABLAS_A_BORRAR) {
      if (entrada.tabla === "profiles") continue
      const bloqueaBorradoDeProfiles = entrada.comentario.includes("NO ACTION") && entrada.comentario.includes("profiles")
      if (!bloqueaBorradoDeProfiles) continue
      if (filas(entrada.tabla).some((f) => f[entrada.columna] === userId)) {
        return `fk simulada: ${entrada.tabla}.${entrada.columna} todavía referencia a profiles(${String(userId)})`
      }
    }
    for (const entrada of COLUMNAS_A_DESVINCULAR) {
      if (!entrada.comentario.includes("profiles(id)")) continue
      if (filas(entrada.tabla).some((f) => f[entrada.columna] === userId)) {
        return `fk simulada: ${entrada.tabla}.${entrada.columna} todavía referencia a profiles(${String(userId)})`
      }
    }
    return null
  }

  const admin = {
    from(tabla: string) {
      return {
        update(valores: Record<string, unknown>) {
          return {
            eq: async (columna: string, valor: unknown) => {
              llamadas.push({ tipo: "update", tabla, columna })
              if (opciones.tablaQueFallaAlDesvincular === tabla) {
                return { error: { message: `error de prueba al desvincular ${tabla}` } }
              }
              for (const fila of filas(tabla)) {
                if (fila[columna] === valor) Object.assign(fila, valores)
              }
              return { error: null }
            },
          }
        },
        delete() {
          return {
            eq: async (columna: string, valor: unknown) => {
              llamadas.push({ tipo: "delete", tabla, columna })
              if (opciones.tablaQueFallaAlBorrar === tabla) {
                return { error: { message: `error de prueba al borrar ${tabla}` } }
              }
              if (tabla === "profiles") {
                const bloqueo = detectarBloqueoDeFkAlBorrarProfiles(valor)
                if (bloqueo) return { error: { message: bloqueo } }
              }
              dbState[tabla] = filas(tabla).filter((fila) => fila[columna] !== valor)
              return { error: null }
            },
          }
        },
      }
    },
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          llamadas.push({ tipo: "deleteUser" })
          // SUPUESTO sobre la API real de Supabase, NO verificado contra la
          // red (no se puede, en este repo): se asume que
          // `admin.auth.admin.deleteUser(id)` devuelve un error si `id` ya
          // no existe en `auth.users` (p. ej. "User not found"). Con ese
          // supuesto, `opciones.usuarioYaNoExisteEnAuth` simula justo ese
          // caso, para dejar documentado qué hace `eliminarCuenta` si
          // alguien reintenta DESPUÉS de un borrado ya 100% exitoso (no el
          // corte a mitad de camino de la idempotencia de más abajo, que no
          // depende de este supuesto).
          if (opciones.usuarioYaNoExisteEnAuth || !authUsers.has(id)) {
            return { error: { message: "User not found" } }
          }
          authUsers.delete(id)
          return { error: null }
        },
      },
    },
  }

  return {
    admin: admin as unknown as Parameters<typeof eliminarCuenta>[0],
    filas,
    dbState,
    authUsers,
    llamadas,
  }
}

/**
 * Siembra, para `TABLAS_A_BORRAR` y `COLUMNAS_A_DESVINCULAR`, una fila de
 * `usuarioId` y otra de `otraCuentaId` en cada tabla — la segunda es la que
 * prueba selectividad: si el borrado no filtrara por usuario, también la
 * tocaría.
 */
function sembrarFixtureDeCuenta(filas: (tabla: string) => Fila[], usuarioId: string, otraCuentaId: string): void {
  for (const entrada of [...TABLAS_A_BORRAR, ...COLUMNAS_A_DESVINCULAR]) {
    filas(entrada.tabla).push({ [entrada.columna]: usuarioId, _fixture: `${entrada.tabla}.${entrada.columna}-de-la-cuenta` })
    filas(entrada.tabla).push({ [entrada.columna]: otraCuentaId, _fixture: `${entrada.tabla}.${entrada.columna}-de-otra-cuenta` })
  }
}

describe("eliminarCuenta: de punta a punta, con un doble que mantiene estado real (no solo registra llamadas)", () => {
  it("TABLAS_A_BORRAR y COLUMNAS_A_DESVINCULAR no vinieron vacías ni se achicaron por debajo de lo de hoy (si no, el resto de este archivo recorrería listas vacías y pasaría sin probar nada)", () => {
    expect(TABLAS_A_BORRAR.length).toBeGreaterThanOrEqual(MINIMO_TABLAS_A_BORRAR_DE_HOY)
    expect(COLUMNAS_A_DESVINCULAR.length).toBeGreaterThanOrEqual(MINIMO_COLUMNAS_A_DESVINCULAR_DE_HOY)
  })

  it("la cuenta queda sin ninguna fila en TABLAS_A_BORRAR, sus eventos/alias quedan con autor en null, el usuario de auth se borra, y la cuenta ajena no se toca", async () => {
    const { admin, filas, authUsers } = crearAdminConEstadoReal()
    sembrarFixtureDeCuenta(filas, USUARIO_ID, OTRA_CUENTA_ID)
    authUsers.add(USUARIO_ID)
    authUsers.add(OTRA_CUENTA_ID)

    const resultado = await eliminarCuenta(admin, USUARIO_ID)
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

  it("el conjunto de tablas tocadas por update es EXACTAMENTE el de COLUMNAS_A_DESVINCULAR (ni una más, ni una menos)", async () => {
    const { admin, filas, authUsers, llamadas } = crearAdminConEstadoReal()
    sembrarFixtureDeCuenta(filas, USUARIO_ID, OTRA_CUENTA_ID)
    authUsers.add(USUARIO_ID)

    await eliminarCuenta(admin, USUARIO_ID)

    const tablasTocadas = new Set(llamadas.filter((l): l is Extract<Llamada, { tipo: "update" }> => l.tipo === "update").map((l) => l.tabla))
    const tablasEsperadas = new Set(COLUMNAS_A_DESVINCULAR.map((e) => e.tabla))
    expect(tablasTocadas.size).toBeGreaterThan(0)
    expect(tablasTocadas).toEqual(tablasEsperadas)
  })

  it("el conjunto de tablas tocadas por delete (sin contar deleteUser) es EXACTAMENTE el de TABLAS_A_BORRAR (ni una más, ni una menos)", async () => {
    const { admin, filas, authUsers, llamadas } = crearAdminConEstadoReal()
    sembrarFixtureDeCuenta(filas, USUARIO_ID, OTRA_CUENTA_ID)
    authUsers.add(USUARIO_ID)

    await eliminarCuenta(admin, USUARIO_ID)

    const tablasTocadas = new Set(llamadas.filter((l): l is Extract<Llamada, { tipo: "delete" }> => l.tipo === "delete").map((l) => l.tabla))
    const tablasEsperadas = new Set(TABLAS_A_BORRAR.map((e) => e.tabla))
    expect(tablasTocadas.size).toBeGreaterThan(0)
    expect(tablasTocadas).toEqual(tablasEsperadas)
  })

  it('"profiles" (no "la que haya quedado última", sea cual sea) se borra ANTES de deleteUser, no después', async () => {
    const { admin, filas, authUsers, llamadas } = crearAdminConEstadoReal()
    sembrarFixtureDeCuenta(filas, USUARIO_ID, OTRA_CUENTA_ID)
    authUsers.add(USUARIO_ID)

    await eliminarCuenta(admin, USUARIO_ID)

    const ultimaTabla = TABLAS_A_BORRAR[TABLAS_A_BORRAR.length - 1].tabla
    // Sin esto, el test de abajo es tautológico: `ultimaTabla` sería "la que
    // haya quedado última" en el array, y como `eliminarCuenta` siempre
    // procesa TABLAS_A_BORRAR en orden, esa entrada SIEMPRE se borra antes
    // que deleteUser (que corre después de todo el bucle), sin importar qué
    // tabla sea. Esta línea exige además que esa última entrada sea
    // "profiles" específicamente — si alguien la desplaza de la última
    // posición, este test (no solo tablas-personales.test.ts) se pone en
    // rojo.
    expect(ultimaTabla).toBe("profiles")

    const indiceUltimoBorrado = llamadas.findIndex((l) => l.tipo === "delete" && l.tabla === ultimaTabla)
    const indiceDeleteUser = llamadas.findIndex((l) => l.tipo === "deleteUser")

    expect(indiceUltimoBorrado).toBeGreaterThanOrEqual(0)
    expect(indiceDeleteUser).toBeGreaterThan(indiceUltimoBorrado)
  })
})

describe("el detector de FK simulada del doble funciona de verdad (no es un chequeo vacío que siempre da \"sin bloqueo\")", () => {
  it('encuentra, por comentario de producción, al menos una entrada de TABLAS_A_BORRAR con una FK "NO ACTION" hacia "profiles" (hoy duplicate_dismissals) — si esto no encuentra nada, los dos tests de abajo no estarían probando nada', () => {
    const entradaBloqueante = TABLAS_A_BORRAR.find(
      (e) => e.tabla !== "profiles" && e.comentario.includes("NO ACTION") && e.comentario.includes("profiles"),
    )
    expect(entradaBloqueante).toBeTruthy()
  })

  it("si esa entrada todavía tiene una fila del usuario, borrar profiles (llamado DIRECTAMENTE sobre el doble, sin pasar por eliminarCuenta) falla — sin importar la posición de esa entrada en el array", async () => {
    const entradaBloqueante = TABLAS_A_BORRAR.find(
      (e) => e.tabla !== "profiles" && e.comentario.includes("NO ACTION") && e.comentario.includes("profiles"),
    )!
    const { admin, filas } = crearAdminConEstadoReal()
    // Se siembra SOLO la fila bloqueante, sin pasar por
    // sembrarFixtureDeCuenta ni por eliminarCuenta: esta prueba no depende
    // en absoluto del orden real de TABLAS_A_BORRAR, solo de que la fila
    // exista en el momento de intentar borrar profiles — que es exactamente
    // lo que pasaría si el array quedara mal ordenado (p. ej. profiles antes
    // que duplicate_dismissals).
    filas(entradaBloqueante.tabla).push({ [entradaBloqueante.columna]: USUARIO_ID })

    const { error } = await admin.from("profiles").delete().eq("id", USUARIO_ID)

    expect(error, "el doble tendría que haber devuelto un error: la fila bloqueante todavía existe").toBeTruthy()
  })

  it("si esa misma fila ya no existe, borrar profiles (llamado directamente) no da error", async () => {
    const { admin } = crearAdminConEstadoReal()

    const { error } = await admin.from("profiles").delete().eq("id", USUARIO_ID)

    expect(error).toBeNull()
  })
})

describe("eliminarCuenta: idempotencia tras un corte a mitad de camino", () => {
  it('si un intento anterior ya había desvinculado y borrado todo (incluida "profiles") pero se cortó antes de deleteUser, un segundo intento no falla', async () => {
    const { admin, authUsers } = crearAdminConEstadoReal()
    // A propósito no se siembra ninguna fila: todas las tablas ya están
    // vacías para este usuario, como si el intento anterior ya hubiera
    // completado los pasos de desvincular y borrar. El usuario de auth
    // SÍ sigue existiendo: el corte fue justo antes de deleteUser (p. ej.
    // un error de red momentáneo en esa llamada puntual).
    authUsers.add(USUARIO_ID)

    const resultado = await eliminarCuenta(admin, USUARIO_ID)

    expect(resultado).toEqual({ ok: true })
    expect(authUsers.has(USUARIO_ID)).toBe(false)
  })

  it(
    "SUPUESTO sobre la API real de Supabase, NO verificado contra la red: si el reintento es DESPUÉS de un borrado " +
      "100% exitoso (el usuario ya no existe en auth.users), eliminarCuenta NO es idempotente en el tramo de " +
      'deleteUser — hoy devuelve ok:false con paso "eliminar_usuario". Este test documenta ese comportamiento tal ' +
      "como está escrito en lib/cuenta/eliminar.ts; no afirma que sea lo deseable, deja el contrato escrito para " +
      "que alguien con acceso a la API real lo confirme o lo cambie.",
    async () => {
      const { admin, authUsers } = crearAdminConEstadoReal({ usuarioYaNoExisteEnAuth: true })
      // Ni siquiera se agrega USUARIO_ID a authUsers: ya no existe, como si
      // un intento anterior hubiera completado los tres pasos.

      const resultado = await eliminarCuenta(admin, USUARIO_ID)

      expect(resultado.ok).toBe(false)
      if (!resultado.ok) {
        expect(resultado.paso).toBe("eliminar_usuario")
      }
      expect(authUsers.has(USUARIO_ID)).toBe(false)
    },
  )
})

describe('eliminarCuenta: si una tabla del medio falla al "borrar", se corta ahí y no sigue', () => {
  it("devuelve ok:false con el paso y la tabla, no llega a deleteUser, lo anterior a la tabla que falló ya se había borrado y lo posterior queda intacto", async () => {
    // Elegida del medio (ni la primera ni la última) para además poder
    // comprobar qué pasó antes y qué pasó después del corte.
    const indiceTablaQueFalla = Math.floor(TABLAS_A_BORRAR.length / 2)
    expect(indiceTablaQueFalla).toBeGreaterThan(0)
    expect(indiceTablaQueFalla).toBeLessThan(TABLAS_A_BORRAR.length - 1)
    const tablaQueFalla = TABLAS_A_BORRAR[indiceTablaQueFalla].tabla

    const { admin, filas, authUsers, llamadas } = crearAdminConEstadoReal({ tablaQueFallaAlBorrar: tablaQueFalla })
    sembrarFixtureDeCuenta(filas, USUARIO_ID, OTRA_CUENTA_ID)
    authUsers.add(USUARIO_ID)

    const resultado = await eliminarCuenta(admin, USUARIO_ID)

    expect(resultado.ok).toBe(false)
    if (!resultado.ok) {
      // Comportamiento real leído en lib/cuenta/eliminar.ts antes de escribir
      // esta aserción: el paso que falla es "borrar" y se devuelve la tabla.
      expect(resultado.paso).toBe("borrar")
      expect(resultado.tabla).toBe(tablaQueFalla)
    }

    expect(llamadas.some((l) => l.tipo === "deleteUser"), "no tiene que llegar a deleteUser").toBe(false)
    expect(authUsers.has(USUARIO_ID), "el usuario de auth no se tiene que haber borrado").toBe(true)

    for (let i = 0; i < indiceTablaQueFalla; i++) {
      const entrada = TABLAS_A_BORRAR[i]
      expect(
        filas(entrada.tabla).some((f) => f[entrada.columna] === USUARIO_ID),
        `${entrada.tabla}.${entrada.columna} (anterior a la que falló) tendría que haberse borrado`,
      ).toBe(false)
    }
    for (let i = indiceTablaQueFalla + 1; i < TABLAS_A_BORRAR.length; i++) {
      const entrada = TABLAS_A_BORRAR[i]
      expect(
        filas(entrada.tabla).some((f) => f[entrada.columna] === USUARIO_ID),
        `${entrada.tabla}.${entrada.columna} (posterior a la que falló) no se tendría que haber tocado`,
      ).toBe(true)
    }
  })

  it('si falla un paso de "desvincular", no se borra absolutamente nada y no se llega a deleteUser', async () => {
    const tablaQueFalla = COLUMNAS_A_DESVINCULAR[0].tabla
    const { admin, filas, authUsers, llamadas } = crearAdminConEstadoReal({ tablaQueFallaAlDesvincular: tablaQueFalla })
    sembrarFixtureDeCuenta(filas, USUARIO_ID, OTRA_CUENTA_ID)
    authUsers.add(USUARIO_ID)

    const resultado = await eliminarCuenta(admin, USUARIO_ID)

    expect(resultado.ok).toBe(false)
    if (!resultado.ok) {
      expect(resultado.paso).toBe("desvincular")
      expect(resultado.tabla).toBe(tablaQueFalla)
    }
    expect(llamadas.some((l) => l.tipo === "delete")).toBe(false)
    expect(llamadas.some((l) => l.tipo === "deleteUser")).toBe(false)
    expect(authUsers.has(USUARIO_ID)).toBe(true)
    for (const entrada of TABLAS_A_BORRAR) {
      expect(filas(entrada.tabla).some((f) => f[entrada.columna] === USUARIO_ID)).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// La web y la app llaman al mismo endpoint, con la misma confirmación.
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
