// Sin red ni base ni cuenta real. Se mockea '@/lib/supabase/server'
// (createClient / createAdminClient) y '@/lib/cuenta/eliminar' (eliminarCuenta).
// A propósito NO se mockea '@/lib/auth/usuario-de-request': corre de verdad,
// contra el createClient mockeado, así se ejercita también la decisión
// Bearer-vs-cookie desde el endpoint.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { tmpdir } from "node:os"

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

// El cliente que arma el endpoint para el camino Bearer (paso 7 de
// route.ts): `createClient` de `@supabase/supabase-js`, nunca la service
// role. Se renombra el doble para no chocar con el `createClient` de
// `@/lib/supabase/server` (el de cookies), mockeado arriba.
const createClienteBearer = vi.fn()
vi.mock("@supabase/supabase-js", () => ({
  createClient: (...a: unknown[]) => createClienteBearer(...a),
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

// Variables de entorno que el camino Bearer (paso 7) necesita para armar el
// cliente del RPC con `@supabase/supabase-js` + la anon key. Se guardan los
// valores originales para restaurarlos en `afterEach` y no filtrar hacia
// otros archivos de test.
const URL_ORIGINAL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY_ORIGINAL = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const URL_DE_PRUEBA = "https://proyecto-de-prueba.supabase.co"
const ANON_KEY_DE_PRUEBA = "anon-key-de-prueba"

beforeEach(() => {
  vi.clearAllMocks()
  createAdminClient.mockReturnValue({ marcador: "admin-falso" })
  eliminarCuenta.mockResolvedValue({ ok: true })
  createClienteBearer.mockReturnValue({ marcador: "bearer-cliente-falso" })
  process.env.NEXT_PUBLIC_SUPABASE_URL = URL_DE_PRUEBA
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ANON_KEY_DE_PRUEBA
})

afterEach(() => {
  if (URL_ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
  else process.env.NEXT_PUBLIC_SUPABASE_URL = URL_ORIGINAL
  if (ANON_KEY_ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ANON_KEY_ORIGINAL
})

describe("content-type: capa adicional (no la defensa principal contra CSRF), se evalúa antes que nada", () => {
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

  it('"text/plain;charset=application/json" se rechaza: contiene la cadena "application/json" pero su essence es text/plain (uno de los tres CORS-safelisted, no dispara preflight). Este es justo el caso que motivó pasar de includes() a comparación exacta', async () => {
    const res = await POST(crearRequest({ contentType: "text/plain;charset=application/json" }))
    expect(res.status).toBe(415)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('"application/json; charset=utf-8" (lo que manda un cliente normal, incluida la app) sigue pasando: el recorte es solo hasta el ";"', async () => {
    createClient.mockResolvedValue(crearClienteSesion({ usuarioCookie: USUARIO_SESION }))
    const res = await POST(crearRequest({ contentType: "application/json; charset=utf-8" }))
    expect(res.status).toBe(200)
  })

  it('"APPLICATION/JSON" (mayúsculas) sigue pasando: la comparación es case-insensitive', async () => {
    createClient.mockResolvedValue(crearClienteSesion({ usuarioCookie: USUARIO_SESION }))
    const res = await POST(crearRequest({ contentType: "APPLICATION/JSON" }))
    expect(res.status).toBe(200)
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

  it("si eliminarCuenta falla (paso rpc), el cuerpo de la respuesta no contiene el detalle ni el código del error del RPC", async () => {
    eliminarCuenta.mockResolvedValueOnce({
      ok: false,
      paso: "rpc",
      // Simula justo el caso que motiva no logear/devolver "details" de un
      // PostgrestError: una violación de FK mete el uuid de la persona ahí.
      detalle: `mensaje secreto de la excepción con detalle del esquema (uuid ${USUARIO_SESION.id})`,
      codigo: "23503",
    })

    const res = await POST(crearRequest())
    expect(res.status).toBeGreaterThanOrEqual(400)

    const texto = await res.text()
    expect(texto).not.toContain("mensaje secreto")
    expect(texto).not.toContain("esquema")
    expect(texto).not.toContain(USUARIO_SESION.id)
    expect(texto).not.toContain("23503")
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

describe("el cliente del RPC: Bearer vs. cookie, y el caso cruzado (QPS-190, tarea 48-e)", () => {
  it("con Bearer, el cliente del RPC se arma con @supabase/supabase-js, la URL y la anon key de las env vars, y el token del header en Authorization — nunca con la service role", async () => {
    createClient.mockResolvedValue(
      crearClienteSesion({ usuarioCookie: null, usuarioBearer: USUARIO_SESION, tokenValidoBearer: "token-de-prueba" }),
    )
    const res = await POST(crearRequest({ authorization: "Bearer token-de-prueba" }))
    expect(res.status).toBe(200)

    expect(createClienteBearer).toHaveBeenCalledTimes(1)
    const [url, key, opciones] = createClienteBearer.mock.calls[0] as [
      string,
      string,
      { global?: { headers?: Record<string, string> } },
    ]
    expect(url).toBe(URL_DE_PRUEBA)
    expect(key).toBe(ANON_KEY_DE_PRUEBA)
    // La clave nunca es la service role: ni siquiera se leyó
    // SUPABASE_SERVICE_ROLE_KEY en este camino (si se hubiera leído, "key"
    // seguiría siendo la anon key de todos modos, porque el código no la
    // usa; esta aserción fija justo eso).
    expect(key).not.toBe(process.env.SUPABASE_SERVICE_ROLE_KEY)
    expect(opciones?.global?.headers?.Authorization).toBe("Bearer token-de-prueba")

    expect(eliminarCuenta).toHaveBeenCalledWith({ marcador: "bearer-cliente-falso" }, USUARIO_SESION.id)
  })

  it("con cookie y sin Bearer, se usa createClient() de @/lib/supabase/server y NO se arma ningún cliente con header (createClienteBearer no se llama)", async () => {
    const cliente = crearClienteSesion({ usuarioCookie: USUARIO_SESION })
    createClient.mockResolvedValue(cliente)

    const res = await POST(crearRequest())
    expect(res.status).toBe(200)
    expect(createClienteBearer).not.toHaveBeenCalled()
    expect(eliminarCuenta).toHaveBeenCalledWith(cliente, USUARIO_SESION.id)
  })

  it(
    "el caso cruzado que protege este archivo: con un Bearer de la persona A Y una cookie de sesión de la persona B " +
      "a la vez, el RPC se llama con el cliente del BEARER (mismo criterio que usuarioDeRequest en el paso 3) — " +
      "nunca con el cliente de cookies de B. Si esto fallara, un Bearer de A con una cookie de B borraría la cuenta " +
      "de B en vez de la de A.",
    async () => {
      const clienteBearerDeA = { marcador: "bearer-de-A" }
      createClienteBearer.mockReturnValue(clienteBearerDeA)
      createClient.mockResolvedValue(
        crearClienteSesion({ usuarioCookie: OTRO_USUARIO, usuarioBearer: USUARIO_SESION, tokenValidoBearer: "token-de-a" }),
      )

      const res = await POST(crearRequest({ authorization: "Bearer token-de-a" }))
      expect(res.status).toBe(200)
      expect(eliminarCuenta).toHaveBeenCalledTimes(1)
      expect(eliminarCuenta).toHaveBeenCalledWith(clienteBearerDeA, USUARIO_SESION.id)
      expect(eliminarCuenta).not.toHaveBeenCalledWith(expect.anything(), OTRO_USUARIO.id)
    },
  )

  it("si faltan las env vars de la anon key en el camino Bearer: 500 genérico, sin armar el cliente del RPC ni llamar a eliminarCuenta", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    createClient.mockResolvedValue(
      crearClienteSesion({ usuarioCookie: null, usuarioBearer: USUARIO_SESION, tokenValidoBearer: "token-de-prueba" }),
    )

    const res = await POST(crearRequest({ authorization: "Bearer token-de-prueba" }))
    expect(res.status).toBe(500)
    expect(createClienteBearer).not.toHaveBeenCalled()
    expect(eliminarCuenta).not.toHaveBeenCalled()
  })
})

describe("si el RPC falla, el mensaje es específico (\"No se borró nada\"); el resto de los caminos de error siguen con el genérico", () => {
  it('eliminarCuenta con paso "rpc": 500 "No se borró nada"', async () => {
    createClient.mockResolvedValue(crearClienteSesion({ usuarioCookie: USUARIO_SESION }))
    eliminarCuenta.mockResolvedValueOnce({ ok: false, paso: "rpc", detalle: "detalle interno", codigo: "42501" })

    const res = await POST(crearRequest())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "No se borró nada" })
  })

  it("una excepción (no un resultado ok:false) sigue respondiendo el genérico, no \"No se borró nada\"", async () => {
    createClient.mockResolvedValue(crearClienteSesion({ usuarioCookie: USUARIO_SESION }))
    eliminarCuenta.mockRejectedValueOnce(new Error("boom"))

    const res = await POST(crearRequest())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "No se pudo eliminar la cuenta" })
  })
})

describe("el endpoint (route.ts) nunca menciona createAdminClient ni la service role", () => {
  const RUTA_ENDPOINT = resolve(process.cwd(), "app", "api", "cuenta", "eliminar", "route.ts")
  const contenido = readFileSync(RUTA_ENDPOINT, "utf8")

  it("el archivo existe y no está vacío", () => {
    expect(contenido.trim().length).toBeGreaterThan(0)
  })

  it("no importa ni menciona createAdminClient", () => {
    expect(contenido).not.toMatch(/createAdminClient/)
  })

  it("no menciona SUPABASE_SERVICE_ROLE_KEY", () => {
    expect(contenido).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/)
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
 * Saca comentarios de bloque y de línea antes de aplicar los patrones de
 * `contienePatronProhibido`. Cierra la evasión de poner un comentario en
 * medio de una palabra clave para que la regex no la vea contigua (ej.
 * `await import/* no es un espacio *\/(especificador)`). NO es un parser de
 * JS: no distingue si un `//` o un `/*` cae dentro de un string o de un
 * template literal (ej. una URL `https://...`).
 *
 * El costo de esto NO es el mismo para los dos reemplazos:
 * - El de línea (`\/\/.*$`) como mucho pierde el resto de ESA línea.
 * - El de bloque (`\/\*[\s\S]*?\*\/`) es perezoso pero multilínea: si
 *   aparece un `/*` que no es un comentario real (ej. un literal de regex
 *   con una clase de caracteres como `/[/*]/`, válido en JS sin escapar la
 *   barra), el reemplazo se come todo hasta el PRÓXIMO `*\/` real, que puede
 *   estar muchas líneas más abajo. Si en el medio hay un `require(...)`,
 *   `import(...)` o `process[...]` genuino, desaparece del análisis sin que
 *   nada lo marque.
 *
 * Hoy ningún archivo alcanzable desde las páginas de "eliminar cuenta"
 * dispara ese caso (se revisó el cierre transitivo completo), así que no se
 * reescribió el saneador para acotarlo. Si algún día hace falta acotarlo de
 * verdad, una opción barata es no sanear el bloque cuando el conteo de
 * `/*` y `*\/` en el archivo no cierra parejo, y dejar el contenido
 * original en ese caso (prohibido por defecto, nunca permitido por
 * defecto).
 */
function sanearComentarios(contenido: string): string {
  return contenido.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, "")
}

/**
 * Patrones prohibidos en los archivos de "eliminar cuenta": no hay ningún
 * caso legítimo de `import()` dinámico, de `require`/`createRequire` (como
 * palabras, no solo como llamada) ni de leer `process` por corchete —
 * incluido "process" como string entre corchetes— en estas páginas. Es la
 * respuesta directa a la evasión que encontró el revisor (armar el
 * especificador del módulo y el nombre de la función en memoria, para
 * esquivar el `from "..."` literal que sigue el recorrido de imports y el
 * substring "createAdminClient"):
 *
 *   const especificador = ["@/lib/supabase", "server"].join("/")
 *   const nombreFuncion = "create" + "AdminClient"
 *   const modulo = await import(especificador)
 *   const admin = modulo[nombreFuncion]()
 *
 * Ese código no tiene ningún `from` literal (el recorrido de imports
 * estáticos no lo sigue) ni "createAdminClient" contiguo (el substring no
 * matchea en ningún archivo): por eso hace falta esta regla aparte, no una
 * vuelta de tuerca a la anterior. Se prueba más abajo con el fixture que
 * reproduce exactamente este código.
 *
 * Esta función fue creciendo en vueltas de revisión sucesivas, cada vez
 * para cerrar una evasión concreta que encontró el revisor. Lo que CUBRE
 * hoy:
 *
 *   1. `import()` dinámico, aunque haya un comentario de bloque en medio de
 *      la palabra clave (`import/* comentario *\/(`): el comentario lo saca
 *      `sanearComentarios`, arriba, antes de evaluar.
 *   2. La palabra `require`, sin exigir el paréntesis al lado: cubre tanto
 *      `require("...")` como asignarla a otro identificador y llamarla
 *      aparte (`const r = require; r(especificador)`).
 *   3. `createRequire` (de `node:module`), la forma estándar de Node de
 *      obtener un `require` dinámico: `\brequire\b` no la agarra porque
 *      "Require" ahí va con mayúscula y pegada a "create", sin límite de
 *      palabra en el medio.
 *   4. `process.env[...]` y `process[...]` por corchete, con el nombre
 *      `process` o `process.env` escrito tal cual (identificador, no
 *      string).
 *   5. `["process"]`: poner la palabra `process` como STRING entre
 *      corchetes (ej. `globalThis["process"]["env"][...]`) evade los dos
 *      patrones de `process` del punto 4, porque en el texto crudo
 *      `process` queda seguido de una comilla de cierre, no de `[`.
 *
 * LÍMITE CONOCIDO que SIGUE abierto — no es que no quede ninguno más, es que
 * este es el único que CONOCEMOS y no cerramos a propósito (para no acabar
 * escribiendo un parser de JS a mano con regex): un import estático con
 * namespace (`import * as m from "@/lib/supabase/server"`) seguido de un
 * acceso por corchete con el nombre armado en memoria
 * (`m["create" + "AdminClient"]`) no es un `import(`, no contiene la
 * palabra `require` ni `createRequire`, y no es `process[...]` ni
 * `["process"]`: esta regla no lo agarra. Hay un test que fija justamente
 * este borde (ver más abajo, "LÍMITE CONOCIDO"): si algún día se cierra, ese
 * test se rompe a propósito y hay que actualizarlo. Si hace falta cerrar
 * este hueco, la línea a tocar es `especificadoresImportados` (más abajo):
 * habría que detectar imports de namespace (`import \* as (\w+) from`) y,
 * para cada uno, prohibir `nombreDelNamespace\s*\[` en el mismo archivo.
 */
function contienePatronProhibido(contenido: string): { prohibido: boolean; cual?: string } {
  const saneado = sanearComentarios(contenido)
  if (/\bimport\s*\(/.test(saneado)) return { prohibido: true, cual: "import() dinámico" }
  if (/\brequire\b/.test(saneado)) return { prohibido: true, cual: "require" }
  if (/\bcreateRequire\b/.test(saneado)) return { prohibido: true, cual: "createRequire (node:module)" }
  if (/process\.env\s*\[/.test(saneado)) return { prohibido: true, cual: "process.env[...] por corchete" }
  if (/process\s*\[/.test(saneado)) return { prohibido: true, cual: "process[...] por corchete" }
  if (/\[\s*["']process["']\s*\]/.test(saneado)) return { prohibido: true, cual: '["process"] por corchete' }
  return { prohibido: false }
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

  it("ninguno de esos archivos, ni lo que importan transitivamente, usa import() dinámico, require, ni lee process[...] o process.env[...] por corchete (cierra la vía que encontró el revisor, siguiendo el mismo cierre transitivo que el test vecino de arriba)", () => {
    expect(archivosDeEntrada.length).toBeGreaterThan(0)
    for (const archivo of archivosDeEntrada) {
      const cierre = cierreTransitivo(archivo)
      for (const [rutaVisitada, contenido] of cierre) {
        const resultado = contienePatronProhibido(contenido)
        expect(
          resultado.prohibido,
          `${rutaVisitada} (alcanzable desde ${archivo}) usa un patrón prohibido: ${resultado.cual}`,
        ).toBe(false)
      }
    }
  })
})

// Fixture compartido por las dos describes de abajo: el código exacto que el
// revisor mostró como evasión (arma el especificador del módulo y el nombre
// de la función en memoria, así que ni el recorrido de imports estáticos ni
// el substring "createAdminClient" lo agarran). No es un archivo nuevo en el
// repo (no hay ninguno de esos acá): es una constante en memoria.
const FIXTURE_EVASION = [
  'const especificador = ["@/lib/supabase", "server"].join("/")',
  'const nombreFuncion = "create" + "AdminClient"',
  "const modulo = await import(especificador)",
  "const admin = modulo[nombreFuncion]()",
].join("\n")

describe("el chequeo de patrones prohibidos sigue el cierre transitivo, no solo el archivo de entrada", () => {
  // Fija el hueco que encontró el revisor: la primera versión de esta regla
  // revisaba `archivosDeEntrada` con `readFileSync` directo, sin pasar por
  // `cierreTransitivo` como su vecino de arriba. Si una página de eliminar
  // cuenta importa normalmente un módulo local nuevo, y ESE módulo (no la
  // página) tiene la evasión, el chequeo viejo no la veía: el substring
  // "createAdminClient" sí llega al módulo intermedio, pero busca el nombre
  // literal, que la evasión evita a propósito.
  //
  // No hay ningún archivo con esta evasión en el repo: se crea un directorio
  // temporal fuera de `apps/web` (con `node:fs`/`node:os`) solo para esta
  // prueba, y se borra al final en `afterEach`.
  let carpetaTemporal: string
  let rutaEntrada: string

  beforeEach(() => {
    carpetaTemporal = mkdtempSync(join(tmpdir(), "qps-cierre-transitivo-"))
    rutaEntrada = join(carpetaTemporal, "entrada.ts")
    const rutaIntermedio = join(carpetaTemporal, "intermedio.ts")
    // La "página": solo importa el módulo intermedio de forma normal. Su
    // propio contenido no tiene nada prohibido.
    writeFileSync(rutaEntrada, ['import { algo } from "./intermedio"', "export default algo"].join("\n"))
    // El módulo intermedio (NO el archivo de entrada) es el que tiene la
    // evasión.
    writeFileSync(rutaIntermedio, FIXTURE_EVASION)
  })

  afterEach(() => {
    rmSync(carpetaTemporal, { recursive: true, force: true })
  })

  it("el archivo de entrada, revisado solo a sí mismo (sin cierre transitivo), no muestra nada prohibido: así es como fallaba el chequeo viejo", () => {
    const contenidoEntrada = readFileSync(rutaEntrada, "utf8")
    expect(contienePatronProhibido(contenidoEntrada).prohibido).toBe(false)
  })

  it("el cierre transitivo sí llega al módulo intermedio, y ahí el chequeo nuevo detecta la evasión", () => {
    const cierre = cierreTransitivo(rutaEntrada)
    // Confirma que la transitividad ocurrió de verdad: dos archivos
    // visitados (entrada.ts + intermedio.ts), no solo el de entrada.
    expect(cierre.size).toBe(2)

    let detectado = false
    let cual: string | undefined
    for (const [, contenido] of cierre) {
      const resultado = contienePatronProhibido(contenido)
      if (resultado.prohibido) {
        detectado = true
        cual = resultado.cual
      }
    }
    expect(detectado).toBe(true)
    expect(cual).toBe("import() dinámico")
  })
})

describe("la evasión con import() dinámico que encontró el revisor queda cubierta", () => {
  it('el fixture reproduce la evasión real: no deja ni un "from" literal que seguir ni el substring "createAdminClient" contiguo', () => {
    expect(especificadoresImportados(FIXTURE_EVASION)).toEqual([])
    expect(FIXTURE_EVASION.includes("createAdminClient")).toBe(false)
  })

  it("la regla nueva (prohibir import() dinámico) sí la detecta", () => {
    const resultado = contienePatronProhibido(FIXTURE_EVASION)
    expect(resultado.prohibido).toBe(true)
    expect(resultado.cual).toBe("import() dinámico")
  })

  it("también detecta require() dinámico (mismo riesgo, otra sintaxis)", () => {
    const resultado = contienePatronProhibido('const modulo = require("@/lib/supabase/server")')
    expect(resultado.prohibido).toBe(true)
    expect(resultado.cual).toBe("require")
  })

  it("también detecta process.env[...] por corchete (la otra vía hacia la service role)", () => {
    const resultado = contienePatronProhibido('const clave = process.env["SUPABASE_SERVICE_ROLE_KEY"]')
    expect(resultado.prohibido).toBe(true)
    expect(resultado.cual).toBe("process.env[...] por corchete")
  })

  it("no da falso positivo con código legítimo (sin import(), sin require(), sin process.env[...])", () => {
    const codigoLegitimo = [
      'import { createClient } from "@/lib/supabase/server"',
      "export default async function Pagina() {",
      "  const supabase = await createClient()",
      "  return supabase",
      "}",
    ].join("\n")
    expect(contienePatronProhibido(codigoLegitimo).prohibido).toBe(false)
  })
})

describe("las evasiones de regex que encontró el revisor en la regla nueva, ya cerradas", () => {
  it('un comentario de bloque en medio de "import" y "(" ya no esconde el import() dinámico (sanearComentarios lo expone antes de evaluar)', () => {
    const codigo = "const admin = await import/* no es un espacio */(especificador)"
    const resultado = contienePatronProhibido(codigo)
    expect(resultado.prohibido).toBe(true)
    expect(resultado.cual).toBe("import() dinámico")
  })

  it('un comentario que solo MENCIONA "import(" como texto, sin usarlo de verdad, no da falso positivo (se saca antes de evaluar)', () => {
    const codigo = [
      "// esta función no usa import() dinámico ni require",
      'import { createClient } from "@/lib/supabase/server"',
      "export default async function Pagina() {",
      "  const supabase = await createClient()",
      "  return supabase",
      "}",
    ].join("\n")
    expect(contienePatronProhibido(codigo).prohibido).toBe(false)
  })

  it("require asignado a otro identificador y llamado aparte también se detecta (ya no hace falta el substring \"require(\" contiguo)", () => {
    const codigo = ["const r = require", 'const modulo = r("@/lib/supabase/server")'].join("\n")
    const resultado = contienePatronProhibido(codigo)
    expect(resultado.prohibido).toBe(true)
    expect(resultado.cual).toBe("require")
  })

  it('la palabra "required" (atributo de formulario, no "require") no da falso positivo: \\brequire\\b no matchea dentro de otra palabra', () => {
    const codigo = "const props = { required: true, autoComplete: 'off' }"
    expect(contienePatronProhibido(codigo).prohibido).toBe(false)
  })

  it('process["env"]["SUPABASE_SERVICE_ROLE_KEY"] (corchete también en "env", no solo en el nombre de la variable) también se detecta', () => {
    const codigo = 'const clave = globalThis.process["env"]["SUPABASE_SERVICE_ROLE_KEY"]'
    const resultado = contienePatronProhibido(codigo)
    expect(resultado.prohibido).toBe(true)
    expect(resultado.cual).toBe("process[...] por corchete")
  })

  it("process.env con notación de punto (lo que usa legítimamente este repo, ej. lib/contacto.ts) no da falso positivo", () => {
    const codigo = 'const url = process.env.NEXT_PUBLIC_SUPABASE_URL'
    expect(contienePatronProhibido(codigo).prohibido).toBe(false)
  })

  it("createRequire de node:module (la forma estándar de obtener un require dinámico) también se detecta: \\brequire\\b no la agarra porque la mayúscula y la falta de límite de palabra entre \"create\" y \"Require\" la esconden", () => {
    const codigo = [
      'import { createRequire } from "node:module"',
      "const req = createRequire(import.meta.url)",
      'const modulo = req("@/lib/supabase/server")',
    ].join("\n")
    const resultado = contienePatronProhibido(codigo)
    expect(resultado.prohibido).toBe(true)
    expect(resultado.cual).toBe("createRequire (node:module)")
  })

  it('un identificador que solo EMPIEZA como "createRequire" (ej. "createRequirementsList") no da falso positivo: \\bcreateRequire\\b exige que la palabra termine ahí', () => {
    const codigo = "const createRequirementsList = () => []"
    expect(contienePatronProhibido(codigo).prohibido).toBe(false)
  })

  it('poner "process" como STRING entre corchetes (ej. globalThis["process"]["env"][...]) también se detecta: evade los patrones de process.env[...] y process[...] porque "process" ahí queda seguido de una comilla de cierre, no de "["', () => {
    const codigo = 'const clave = globalThis["process"]["env"]["SUPABASE_SERVICE_ROLE_KEY"]'
    const resultado = contienePatronProhibido(codigo)
    expect(resultado.prohibido).toBe(true)
    expect(resultado.cual).toBe('["process"] por corchete')
  })

  it('acceder a una propiedad distinta de "process" por corchete (ej. fila["processId"]) no da falso positivo: el patrón exige la comilla de cierre pegada a "process"', () => {
    const codigo = 'const id = fila["processId"]'
    expect(contienePatronProhibido(codigo).prohibido).toBe(false)
  })
})

describe('LÍMITE CONOCIDO de contienePatronProhibido: el import de namespace con acceso por corchete con el nombre armado en memoria NO se detecta hoy', () => {
  // Fija el borde documentado en el comentario de la función: no es una
  // aspiración ("ojalá lo agarre"), es el estado real de hoy. Si algún día
  // se cierra este hueco (ver la línea a tocar en el comentario de
  // `contienePatronProhibido`), este test se tiene que romper a propósito,
  // y ahí se actualiza junto con el cierre.
  it("import * as namespace + acceso por corchete con el nombre de la función armado en memoria: hoy pasa sin que nada lo marque", () => {
    const codigo = [
      'import * as modulo from "@/lib/supabase/server"',
      'const nombreFuncion = "create" + "AdminClient"',
      "const admin = modulo[nombreFuncion]()",
    ].join("\n")
    expect(contienePatronProhibido(codigo).prohibido).toBe(false)
  })
})
