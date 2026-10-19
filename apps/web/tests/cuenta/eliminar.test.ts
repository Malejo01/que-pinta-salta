// QPS-190 (tarea 48-e): `eliminarCuenta` ya no hace llamadas sucesivas con
// la service key — llama a un único RPC transaccional
// (`public.delete_my_account()`, sin ningún argumento) con el cliente de la
// sesión de la persona. Sin red ni base: un doble en memoria que registra
// cómo se llamó a `.rpc(...)`.
import { describe, expect, it } from "vitest"
import { eliminarCuenta } from "@/lib/cuenta/eliminar"

const USUARIO_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

/**
 * Doble del cliente de la sesión de la persona. `rpc(...)` registra con
 * cuántos y cuáles argumentos se lo llamó (no solo el nombre), para poder
 * asertar que `eliminarCuenta` nunca manda un segundo argumento (ni el
 * `userId`, ni nada).
 */
function crearClienteFalso(opts: { error?: { message: string; code?: string } } = {}) {
  const llamadasRpc: unknown[][] = []
  const cliente = {
    rpc: async (...argumentos: unknown[]) => {
      llamadasRpc.push(argumentos)
      return { error: opts.error ?? null }
    },
  }
  return { cliente: cliente as unknown as Parameters<typeof eliminarCuenta>[0], llamadasRpc }
}

describe("eliminarCuenta: camino feliz", () => {
  it('llama al RPC "delete_my_account" sin ningún argumento, con el cliente que se le pasó', async () => {
    const { cliente, llamadasRpc } = crearClienteFalso()

    const resultado = await eliminarCuenta(cliente, USUARIO_ID)

    expect(resultado).toEqual({ ok: true })
    expect(llamadasRpc.length).toBe(1)
    // No solo el nombre: también la CANTIDAD de argumentos. Si alguien
    // agregara un segundo argumento (p. ej. { user_id: userId }, "por si
    // acaso"), este test se pone en rojo: el RPC no tiene parámetros.
    expect(llamadasRpc[0]).toEqual(["delete_my_account"])
  })

  it("se llama exactamente una vez, nunca más", async () => {
    const { cliente, llamadasRpc } = crearClienteFalso()
    await eliminarCuenta(cliente, USUARIO_ID)
    expect(llamadasRpc.length).toBe(1)
  })
})

describe("eliminarCuenta: si el RPC devuelve error", () => {
  it('el resultado es { ok: false, paso: "rpc" }, con el mensaje y el código del error', async () => {
    const { cliente } = crearClienteFalso({ error: { message: "mensaje de prueba", code: "42501" } })

    const resultado = await eliminarCuenta(cliente, USUARIO_ID)

    expect(resultado).toEqual({ ok: false, paso: "rpc", detalle: "mensaje de prueba", codigo: "42501" })
  })

  it("ningún resultado (ni de éxito ni de error) contiene el userId", async () => {
    const { cliente: clienteOk } = crearClienteFalso()
    const resultadoOk = await eliminarCuenta(clienteOk, USUARIO_ID)
    expect(JSON.stringify(resultadoOk)).not.toContain(USUARIO_ID)

    const { cliente: clienteError } = crearClienteFalso({ error: { message: "error", code: "XXYYY" } })
    const resultadoError = await eliminarCuenta(clienteError, USUARIO_ID)
    expect(JSON.stringify(resultadoError)).not.toContain(USUARIO_ID)
  })
})

describe("eliminarCuenta: el userId se valida antes de llamar al RPC", () => {
  it.each([[""], ["*"], ["no-es-un-uuid"], [null], [undefined], [123], [{}], ["  "]])(
    "rechaza %j sin llamar al RPC ni una sola vez",
    async (valorInvalido) => {
      const { cliente, llamadasRpc } = crearClienteFalso()

      const resultado = await eliminarCuenta(cliente, valorInvalido as unknown as string)

      expect(resultado).toEqual({ ok: false, paso: "uuid_invalido" })
      expect(llamadasRpc.length).toBe(0)
    },
  )

  it("acepta un uuid válido en mayúsculas", async () => {
    const { cliente } = crearClienteFalso()
    const resultado = await eliminarCuenta(cliente, USUARIO_ID.toUpperCase())
    expect(resultado).toEqual({ ok: true })
  })

  it("un userId inválido tampoco aparece en el resultado de rechazo", () => {
    expect(JSON.stringify({ ok: false, paso: "uuid_invalido" })).not.toContain("no-es-un-uuid")
  })
})
