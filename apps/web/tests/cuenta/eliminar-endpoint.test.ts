// Sin red ni base ni cuenta real. Se mockea '@/lib/supabase/server'
// (createClient / createAdminClient) y '@/lib/cuenta/eliminar' (eliminarCuenta).
// A propósito NO se mockea '@/lib/auth/usuario-de-request': corre de verdad,
// contra el createClient mockeado, así se ejercita también la decisión
// Bearer-vs-cookie desde el endpoint.
import { beforeEach, describe, expect, it, vi } from "vitest"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

const createClient = vi.fn()
const createAdminClient = vi.fn()
vi.mock("@/lib/supabase/server", () => ({
  createClient: (...a: unknown[]) => createClient(...a),
  createAdminClient: (...a: unknown[]) => createAdminClient(...a),
}))

const eliminarCuenta = vi.fn()
vi.mock("@/lib/cuenta/eliminar", () => ({
  eliminarCuenta: (...a: unknown[]) => eliminarCuenta(...a),
}))

import { POST } from "@/app/api/cuenta/eliminar/route"

const URL_ENDPOINT = "http://localhost:3000/api/cuenta/eliminar"
const ORIGEN_DEL_SITIO = "http://localhost:3000"

function crearRequest(
  opciones: {
    body?: unknown
    bodyCrudo?: string
    contentType?: string | null
    origin?: string | null
    authorization?: string
  } = {},
) {
  const headers = new Headers()
  if (opciones.contentType !== null) {
    headers.set("content-type", opciones.contentType ?? "application/json")
  }
  const origin = opciones.origin === undefined ? ORIGEN_DEL_SITIO : opciones.origin
  if (origin !== null) headers.set("origin", origin)
  if (opciones.authorization) headers.set("authorization", opciones.authorization)

  const body = opciones.bodyCrudo ?? JSON.stringify(opciones.body ?? { confirmacion: "ELIMINAR" })
  return new Request(URL_ENDPOINT, { method: "POST", headers, body })
}

/**
 * Doble del cliente de sesión (cookie / Bearer). `auth.getUser(token)` con
 * un argumento simula el camino Bearer; `auth.getUser()` sin argumentos, el
 * camino cookie. Permite configurar usuarios distintos para cada camino,
 * para poder comprobar cuál gana si "llegan los dos".
 */
function crearClienteSesion(
  opts: {
    usuarioCookie?: { id: string } | null
    usuarioBearer?: { id: string } | null
    tokenValidoBearer?: string
  } = {},
) {
  const llamadasGetUser: Array<{ conToken: boolean }> = []
  const llamadasSignOut: Array<{ scope?: string }> = []
  return {
    auth: {
      getUser: async (token?: string) => {
        llamadasGetUser.push({ conToken: token !== undefined })
        if (token !== undefined) {
          if (opts.tokenValidoBearer !== undefined && token === opts.tokenValidoBearer && opts.usuarioBearer) {
            return { data: { user: opts.usuarioBearer }, error: null }
          }
          return { data: { user: null }, error: { message: "token inválido" } }
        }
        if (opts.usuarioCookie) return { data: { user: opts.usuarioCookie }, error: null }
        return { data: { user: null }, error: { message: "sin sesión" } }
      },
      signOut: async (signOutOpts?: { scope?: string }) => {
        llamadasSignOut.push(signOutOpts ?? {})
        return { error: null }
      },
    },
    llamadasGetUser,
    llamadasSignOut,
  }
}

const USUARIO_SESION = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }
const OTRO_USUARIO = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }

beforeEach(() => {
  vi.clearAllMocks()
  createAdminClient.mockReturnValue({ marcador: "admin-falso" })
  eliminarCuenta.mockResolvedValue({ ok: true })
})

describe("content-type: defensa contra CSRF, se evalúa antes que nada", () => {
  it("content-type que no es JSON se rechaza con 415 y el cliente admin no se crea", async () => {
    const res = await POST(crearRequest({ contentType: "text/plain" }))
    expect(res.status).toBe(415)
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(createClient).not.toHaveBeenCalled()
  })

  it("sin content-type también se rechaza", async () => {
    const res = await POST(crearRequest({ contentType: null }))
    expect(res.status).toBe(415)
    expect(createAdminClient).not.toHaveBeenCalled()
  })
})

describe("origen: si viene Origin tiene que coincidir con el del sitio", () => {
  it("Origin de otro sitio: 403, sin llegar a crear el cliente admin", async () => {
    const res = await POST(crearRequest({ origin: "https://evil.test" }))
    expect(res.status).toBe(403)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it("sin header Origin: no bloquea (la app nativa no lo manda)", async () => {
    createClient.mockResolvedValue(crearClienteSesion({ usuarioCookie: USUARIO_SESION }))
    const res = await POST(crearRequest({ origin: null }))
    expect(res.status).toBe(200)
  })

  it("con Origin igual al del sitio: pasa", async () => {
    createClient.mockResolvedValue(crearClienteSesion({ usuarioCookie: USUARIO_SESION }))
    const res = await POST(crearRequest({ origin: ORIGEN_DEL_SITIO }))
    expect(res.status).toBe(200)
  })
})

describe("autenticación: sin usuario es 401, y el cliente admin todavía no existe", () => {
  it("sin sesión y sin Bearer: 401", async () => {
    createClient.mockResolvedValue(crearClienteSesion({ usuarioCookie: null }))
    const res = await POST(crearRequest())
    expect(res.status).toBe(401)
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(eliminarCuenta).not.toHaveBeenCalled()
  })

  it("con cookie de sesión válida: pasa (y llama a eliminarCuenta con ese id)", async () => {
    createClient.mockResolvedValue(crearClienteSesion({ usuarioCookie: USUARIO_SESION }))
    const res = await POST(crearRequest())
    expect(res.status).toBe(200)
    expect(eliminarCuenta).toHaveBeenCalledWith(expect.anything(), USUARIO_SESION.id)
  })

  it("con Bearer válido (sin cookie): anda igual que con cookie", async () => {
    createClient.mockResolvedValue(
      crearClienteSesion({ usuarioCookie: null, usuarioBearer: USUARIO_SESION, tokenValidoBearer: "token-de-prueba" }),
    )
    const res = await POST(crearRequest({ authorization: "Bearer token-de-prueba" }))
    expect(res.status).toBe(200)
    expect(eliminarCuenta).toHaveBeenCalledWith(expect.anything(), USUARIO_SESION.id)
  })

  it("Bearer inválido: 401 aunque exista una cookie de sesión válida (no cae a la cookie)", async () => {
    const cliente = crearClienteSesion({
      usuarioCookie: USUARIO_SESION,
      usuarioBearer: OTRO_USUARIO,
      tokenValidoBearer: "token-correcto",
    })
    createClient.mockResolvedValue(cliente)
    const res = await POST(crearRequest({ authorization: "Bearer token-incorrecto" }))
    expect(res.status).toBe(401)
    expect(eliminarCuenta).not.toHaveBeenCalled()
  })

  it("si llegan Bearer y cookie a la vez, gana el Bearer (decisión de este helper: es explícito)", async () => {
    const cliente = crearClienteSesion({
      usuarioCookie: OTRO_USUARIO,
      usuarioBearer: USUARIO_SESION,
      tokenValidoBearer: "token-de-prueba",
    })
    createClient.mockResolvedValue(cliente)
    const res = await POST(crearRequest({ authorization: "Bearer token-de-prueba" }))
    expect(res.status).toBe(200)
    expect(eliminarCuenta).toHaveBeenCalledWith(expect.anything(), USUARIO_SESION.id)
    expect(cliente.llamadasGetUser.some((l) => l.conToken)).toBe(true)
  })
})

describe("confirmación: literal estricto \"ELIMINAR\"", () => {
  beforeEach(() => {
    createClient.mockResolvedValue(crearClienteSesion({ usuarioCookie: USUARIO_SESION }))
  })

  it("sin confirmacion: 400", async () => {
    const res = await POST(crearRequest({ body: {} }))
    expect(res.status).toBe(400)
    expect(eliminarCuenta).not.toHaveBeenCalled()
  })

  it("confirmacion en minúsculas: 400 (comparación estricta, sin toUpperCase)", async () => {
    const res = await POST(crearRequest({ body: { confirmacion: "eliminar" } }))
    expect(res.status).toBe(400)
    expect(eliminarCuenta).not.toHaveBeenCalled()
  })

  it("confirmacion con espacios de más: 400 (comparación estricta, sin trim)", async () => {
    const res = await POST(crearRequest({ body: { confirmacion: " ELIMINAR " } }))
    expect(res.status).toBe(400)
    expect(eliminarCuenta).not.toHaveBeenCalled()
  })

  it("confirmacion exacta: pasa", async () => {
    const res = await POST(crearRequest({ body: { confirmacion: "ELIMINAR" } }))
    expect(res.status).toBe(200)
  })

  it("body que no es JSON válido: 400, no una excepción sin manejar", async () => {
    const res = await POST(crearRequest({ bodyCrudo: "esto no es json{{{" }))
    expect(res.status).toBe(400)
    expect(eliminarCuenta).not.toHaveBeenCalled()
  })
})

describe("el user_id nunca sale del body: el único origen del id es la sesión", () => {
  beforeEach(() => {
    createClient.mockResolvedValue(crearClienteSesion({ usuarioCookie: USUARIO_SESION }))
  })

  it("un user_id ajeno en el body se ignora: se borra el de la sesión", async () => {
    const res = await POST(
      crearRequest({ body: { confirmacion: "ELIMINAR", user_id: OTRO_USUARIO.id, userId: OTRO_USUARIO.id, id: OTRO_USUARIO.id, email: "ajeno@ejemplo.com" } }),
    )
    expect(res.status).toBe(200)
    expect(eliminarCuenta).toHaveBeenCalledTimes(1)
    expect(eliminarCuenta).toHaveBeenCalledWith(expect.anything(), USUARIO_SESION.id)
    expect(eliminarCuenta).not.toHaveBeenCalledWith(expect.anything(), OTRO_USUARIO.id)
  })
})

describe("candado: un pedido en curso por usuario", () => {
  it("dos pedidos concurrentes del mismo usuario: el segundo da 409; liberado el primero, un pedido nuevo vuelve a pasar", async () => {
    createClient.mockResolvedValue(crearClienteSesion({ usuarioCookie: USUARIO_SESION }))

    let resolverPrimero!: (v: { ok: true }) => void
    eliminarCuenta.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolverPrimero = resolve
        }),
    )

    const promesa1 = POST(crearRequest())
    // Deja que la primera petición llegue hasta el candado (auth + parseo del
    // body son async) antes de lanzar la segunda.
    await new Promise((r) => setTimeout(r, 0))
    const promesa2 = POST(crearRequest())

    const res2 = await promesa2
    expect(res2.status).toBe(409)

    resolverPrimero({ ok: true })
    const res1 = await promesa1
    expect(res1.status).toBe(200)

    // El candado se liberó: un pedido nuevo del mismo usuario vuelve a pasar.
    eliminarCuenta.mockResolvedValueOnce({ ok: true })
    const res3 = await POST(crearRequest())
    expect(res3.status).toBe(200)
  })

  it("dos usuarios distintos a la vez: los dos pasan (el candado es por usuario, no global)", async () => {
    // Bearer para los dos: así createClient() se llama una sola vez por
    // pedido (el paso 8 de signOut se saltea), que es justo lo que hace que
    // esta prueba no dependa de cuántas veces se llame createClient().
    const clienteA = crearClienteSesion({ usuarioBearer: USUARIO_SESION, tokenValidoBearer: "token-a" })
    const clienteB = crearClienteSesion({ usuarioBearer: OTRO_USUARIO, tokenValidoBearer: "token-b" })
    createClient.mockResolvedValueOnce(clienteA).mockResolvedValueOnce(clienteB)

    let resolverA!: (v: { ok: true }) => void
    eliminarCuenta.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolverA = resolve
        }),
    )
    eliminarCuenta.mockResolvedValueOnce({ ok: true })

    const promesaA = POST(crearRequest({ authorization: "Bearer token-a" }))
    await new Promise((r) => setTimeout(r, 0))
    const promesaB = POST(crearRequest({ authorization: "Bearer token-b" }))

    const resB = await promesaB
    expect(resB.status).toBe(200)

    resolverA({ ok: true })
    const resA = await promesaA
    expect(resA.status).toBe(200)
  })
})

describe("el candado se libera siempre, incluso si eliminarCuenta tira una excepción", () => {
  it("después de una excepción, un pedido nuevo del mismo usuario vuelve a pasar", async () => {
    createClient.mockResolvedValue(crearClienteSesion({ usuarioCookie: USUARIO_SESION }))
    eliminarCuenta.mockRejectedValueOnce(new Error("boom"))

    const res1 = await POST(crearRequest())
    expect(res1.status).toBe(500)

    eliminarCuenta.mockResolvedValueOnce({ ok: true })
    const res2 = await POST(crearRequest())
    expect(res2.status).toBe(200)
  })
})

describe("errores: nunca se devuelve el detalle del esquema ni de la excepción", () => {
  beforeEach(() => {
    createClient.mockResolvedValue(crearClienteSesion({ usuarioCookie: USUARIO_SESION }))
  })

  it("si eliminarCuenta falla, el cuerpo de la respuesta no contiene la tabla ni el mensaje de la excepción", async () => {
    eliminarCuenta.mockResolvedValueOnce({
      ok: false,
      paso: "borrar",
      tabla: "favorites",
      detalle: "mensaje secreto de la excepción con detalle del esquema",
    })

    const res = await POST(crearRequest())
    expect(res.status).toBeGreaterThanOrEqual(400)

    const texto = await res.text()
    expect(texto).not.toContain("favorites")
    expect(texto).not.toContain("mensaje secreto")
    expect(texto).not.toContain("esquema")
  })

  it("si eliminarCuenta tira una excepción, el cuerpo tampoco contiene el mensaje de la excepción", async () => {
    eliminarCuenta.mockRejectedValueOnce(new Error("detalle muy sensible de la base"))

    const res = await POST(crearRequest())
    expect(res.status).toBeGreaterThanOrEqual(400)

    const texto = await res.text()
    expect(texto).not.toContain("detalle muy sensible")
  })
})

describe("éxito: cierra la sesión del lado del servidor con scope local", () => {
  it("tras un borrado exitoso, llama a signOut con scope local sobre el cliente de cookies", async () => {
    const cliente = crearClienteSesion({ usuarioCookie: USUARIO_SESION })
    createClient.mockResolvedValue(cliente)

    const res = await POST(crearRequest())
    expect(res.status).toBe(200)
    expect(cliente.llamadasSignOut).toEqual([{ scope: "local" }])
  })

  it("si signOut falla, el borrado exitoso sigue devolviendo 200 (la cuenta ya está borrada)", async () => {
    const cliente = crearClienteSesion({ usuarioCookie: USUARIO_SESION })
    cliente.auth.signOut = async () => {
      throw new Error("no se pudo cerrar sesión")
    }
    createClient.mockResolvedValue(cliente)

    const res = await POST(crearRequest())
    expect(res.status).toBe(200)
    const cuerpo = await res.json()
    expect(cuerpo).toEqual({ ok: true })
  })

  it("con Bearer (la app) no se intenta cerrar ninguna cookie de sesión: no hay cookie que cerrar", async () => {
    const cliente = crearClienteSesion({ usuarioBearer: USUARIO_SESION, tokenValidoBearer: "token-de-prueba" })
    createClient.mockResolvedValue(cliente)

    const res = await POST(crearRequest({ authorization: "Bearer token-de-prueba" }))
    expect(res.status).toBe(200)
    expect(cliente.llamadasSignOut).toEqual([])
  })
})

describe("solo exporta POST", () => {
  it("el módulo de la ruta no exporta GET, PUT ni DELETE", async () => {
    const modulo = (await import("@/app/api/cuenta/eliminar/route")) as unknown as Record<string, unknown>
    expect(modulo.GET).toBeUndefined()
    expect(modulo.PUT).toBeUndefined()
    expect(modulo.DELETE).toBeUndefined()
    expect(typeof modulo.POST).toBe("function")
  })
})

// --- Detector: createAdminClient / SUPABASE_SERVICE_ROLE_KEY nunca llegan a
// las páginas de "eliminar cuenta" (tarea 37-c), ni directo ni por un alias
// de import ni por un módulo intermedio que los reexporte. -----------------

const RAIZ = process.cwd()
const RUTA_SUPABASE_SERVER = resolve(RAIZ, "lib", "supabase", "server.ts")

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

function resolverArchivoLocal(especificador: string, archivoQueImporta: string): string | null {
  let base: string
  if (especificador.startsWith("@/")) {
    base = join(RAIZ, especificador.slice(2))
  } else if (especificador.startsWith(".")) {
    base = resolve(dirname(archivoQueImporta), especificador)
  } else {
    return null // paquete externo (node_modules): no se sigue
  }
  const candidatos = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]
  for (const candidato of candidatos) {
    if (existsSync(candidato) && statSync(candidato).isFile()) return resolve(candidato)
  }
  return null
}

function especificadoresImportados(contenido: string): string[] {
  const especificadores: string[] = []
  const regex = /\bfrom\s+["']([^"']+)["']/g
  let m: RegExpExecArray | null
  while ((m = regex.exec(contenido)) !== null) especificadores.push(m[1])
  return especificadores
}

/**
 * Cierre transitivo de todos los módulos locales (propios de apps/web) que
 * un archivo importa, directa o indirectamente. Así, si uno de los archivos
 * de "eliminar cuenta" importa un módulo intermedio que reexporta
 * `createAdminClient` con otro nombre, ese módulo intermedio también se
 * revisa, no solo el archivo de entrada.
 */
function cierreTransitivo(archivoInicial: string): Map<string, string> {
  const visitados = new Map<string, string>()
  const pendientes = [resolve(archivoInicial)]

  while (pendientes.length > 0) {
    const ruta = pendientes.pop()!
    if (visitados.has(ruta)) continue
    let contenido: string
    try {
      contenido = readFileSync(ruta, "utf8")
    } catch {
      continue
    }
    visitados.set(ruta, contenido)

    for (const especificador of especificadoresImportados(contenido)) {
      const resuelto = resolverArchivoLocal(especificador, ruta)
      if (resuelto && !visitados.has(resuelto)) pendientes.push(resuelto)
    }
  }

  return visitados
}

describe("createAdminClient / service role nunca llegan a las páginas de eliminar cuenta (37-c)", () => {
  const carpetas = [join(RAIZ, "app", "eliminar-cuenta"), join(RAIZ, "app", "perfil", "eliminar-cuenta")]
  const archivosDeEntrada = carpetas.flatMap(listarArchivosRecursivo)

  it("el detector no pasa en vacío: encuentra al menos los archivos de hoy", () => {
    expect(archivosDeEntrada.length).toBeGreaterThanOrEqual(3)
    const nombres = archivosDeEntrada.map((a) => a.replace(RAIZ, "").split("\\").join("/"))
    expect(nombres.some((n) => n.endsWith("/eliminar-cuenta/page.tsx") && !n.includes("/perfil/"))).toBe(true)
    expect(nombres.some((n) => n.endsWith("/perfil/eliminar-cuenta/page.tsx"))).toBe(true)
    expect(nombres.some((n) => n.endsWith("eliminar-cuenta-form.tsx"))).toBe(true)
  })

  it("ninguno de esos archivos, ni lo que importan transitivamente (salvo lib/supabase/server.ts, donde createAdminClient vive legítimamente), menciona createAdminClient ni lee SUPABASE_SERVICE_ROLE_KEY", () => {
    expect(archivosDeEntrada.length).toBeGreaterThan(0)
    for (const archivo of archivosDeEntrada) {
      const cierre = cierreTransitivo(archivo)
      for (const [rutaVisitada, contenido] of cierre) {
        if (resolve(rutaVisitada) === RUTA_SUPABASE_SERVER) continue
        expect(
          contenido.includes("createAdminClient"),
          `${rutaVisitada} (alcanzable desde ${archivo}) menciona "createAdminClient" (import directo, alias o reexport)`,
        ).toBe(false)
        expect(
          contenido.includes("SUPABASE_SERVICE_ROLE_KEY"),
          `${rutaVisitada} (alcanzable desde ${archivo}) lee SUPABASE_SERVICE_ROLE_KEY directamente`,
        ).toBe(false)
      }
    }
  })

  it("ningún componente \"use client\" de esas carpetas usa el cliente admin", () => {
    for (const archivo of archivosDeEntrada) {
      const contenido = readFileSync(archivo, "utf8")
      if (contenido.includes('"use client"') || contenido.includes("'use client'")) {
        expect(contenido.includes("createAdminClient")).toBe(false)
        expect(contenido.includes("SUPABASE_SERVICE_ROLE_KEY")).toBe(false)
      }
    }
  })
})
