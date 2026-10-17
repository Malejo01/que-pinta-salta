// Sin red ni base: un doble en memoria del cliente admin que registra cada
// llamada (update / delete / deleteUser) en el orden en que ocurre. Las
// tablas y columnas se derivan de COLUMNAS_A_DESVINCULAR / TABLAS_A_BORRAR
// (37-a), nunca de una lista copiada a mano, para que una tabla nueva quede
// cubierta sola.
import { describe, expect, it } from "vitest"
import { eliminarCuenta } from "@/lib/cuenta/eliminar"
import { COLUMNAS_A_DESVINCULAR, TABLAS_A_BORRAR } from "@/lib/cuenta/tablas-personales"

type Llamada =
  | { tipo: "update"; tabla: string; columna: string; valor: unknown }
  | { tipo: "delete"; tabla: string; columna: string }
  | { tipo: "deleteUser" }

const USUARIO_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

/**
 * Doble del cliente admin. `admin.from(tabla).update({...}).eq(columna, id)`
 * y `admin.from(tabla).delete().eq(columna, id)` registran la llamada antes
 * de devolver el resultado; `opts.errorEnUpdateTabla` / `opts.errorEnDeleteTabla`
 * permiten simular que una tabla puntual falla.
 */
function crearAdminFalso(
  opts: {
    errorEnUpdateTabla?: string
    errorEnDeleteTabla?: string
    errorEnDeleteUser?: boolean
  } = {},
) {
  const llamadas: Llamada[] = []

  const admin = {
    from(tabla: string) {
      return {
        update(valores: Record<string, unknown>) {
          return {
            eq: async (columna: string) => {
              llamadas.push({ tipo: "update", tabla, columna, valor: valores[columna] })
              if (opts.errorEnUpdateTabla === tabla) {
                return { error: { message: `error de prueba al desvincular ${tabla}` } }
              }
              return { error: null }
            },
          }
        },
        delete() {
          return {
            eq: async (columna: string) => {
              llamadas.push({ tipo: "delete", tabla, columna })
              if (opts.errorEnDeleteTabla === tabla) {
                return { error: { message: `error de prueba al borrar ${tabla}` } }
              }
              return { error: null }
            },
          }
        },
      }
    },
    auth: {
      admin: {
        deleteUser: async () => {
          llamadas.push({ tipo: "deleteUser" })
          if (opts.errorEnDeleteUser) {
            return { error: { message: "error de prueba en deleteUser" } }
          }
          return { error: null }
        },
      },
    },
  }

  return { admin: admin as unknown as Parameters<typeof eliminarCuenta>[0], llamadas }
}

describe("eliminarCuenta: camino feliz", () => {
  it("desvincula, después borra (en el orden de TABLAS_A_BORRAR) y por último elimina el usuario de auth", async () => {
    const { admin, llamadas } = crearAdminFalso()

    const resultado = await eliminarCuenta(admin, USUARIO_ID)

    expect(resultado).toEqual({ ok: true })

    const esperado: Llamada[] = [
      ...COLUMNAS_A_DESVINCULAR.map((e) => ({ tipo: "update" as const, tabla: e.tabla, columna: e.columna, valor: null })),
      ...TABLAS_A_BORRAR.map((e) => ({ tipo: "delete" as const, tabla: e.tabla, columna: e.columna })),
      { tipo: "deleteUser" as const },
    ]
    expect(llamadas).toEqual(esperado)
  })

  it("desvincula exactamente las columnas de COLUMNAS_A_DESVINCULAR, ni una más ni una menos", async () => {
    const { admin, llamadas } = crearAdminFalso()
    await eliminarCuenta(admin, USUARIO_ID)

    const updatesRegistrados = llamadas.filter((l) => l.tipo === "update") as Array<{ tabla: string; columna: string }>
    expect(updatesRegistrados.map((u) => `${u.tabla}.${u.columna}`).sort()).toEqual(
      COLUMNAS_A_DESVINCULAR.map((e) => `${e.tabla}.${e.columna}`).sort(),
    )
  })

  it("borra exactamente las tablas de TABLAS_A_BORRAR, ni una más ni una menos", async () => {
    const { admin, llamadas } = crearAdminFalso()
    await eliminarCuenta(admin, USUARIO_ID)

    const deletesRegistrados = llamadas.filter((l) => l.tipo === "delete") as Array<{ tabla: string; columna: string }>
    expect(deletesRegistrados.map((d) => `${d.tabla}.${d.columna}`).sort()).toEqual(
      TABLAS_A_BORRAR.map((e) => `${e.tabla}.${e.columna}`).sort(),
    )
  })

  it("duplicate_dismissals se borra antes que profiles", async () => {
    const { admin, llamadas } = crearAdminFalso()
    await eliminarCuenta(admin, USUARIO_ID)

    const deletes = llamadas.filter((l) => l.tipo === "delete") as Array<{ tabla: string }>
    const indiceDuplicateDismissals = deletes.findIndex((d) => d.tabla === "duplicate_dismissals")
    const indiceProfiles = deletes.findIndex((d) => d.tabla === "profiles")

    expect(indiceDuplicateDismissals).toBeGreaterThanOrEqual(0)
    expect(indiceProfiles).toBeGreaterThanOrEqual(0)
    expect(indiceDuplicateDismissals).toBeLessThan(indiceProfiles)
  })

  it("todos los update son anteriores a todos los delete, y todos los delete son anteriores a deleteUser", async () => {
    const { admin, llamadas } = crearAdminFalso()
    await eliminarCuenta(admin, USUARIO_ID)

    const indiceUltimoUpdate = llamadas.reduce((acc, l, i) => (l.tipo === "update" ? i : acc), -1)
    const indicePrimerDelete = llamadas.findIndex((l) => l.tipo === "delete")
    const indiceDeleteUser = llamadas.findIndex((l) => l.tipo === "deleteUser")

    expect(indiceUltimoUpdate).toBeLessThan(indicePrimerDelete)
    const indiceUltimoDelete = llamadas.reduce((acc, l, i) => (l.tipo === "delete" ? i : acc), -1)
    expect(indiceUltimoDelete).toBeLessThan(indiceDeleteUser)
  })
})

describe("eliminarCuenta: se corta apenas falla un paso", () => {
  it("si falla un update, no se hace ningún delete y deleteUser no se llama", async () => {
    const tablaQueFalla = COLUMNAS_A_DESVINCULAR[0].tabla
    const { admin, llamadas } = crearAdminFalso({ errorEnUpdateTabla: tablaQueFalla })

    const resultado = await eliminarCuenta(admin, USUARIO_ID)

    expect(resultado.ok).toBe(false)
    if (!resultado.ok) {
      expect(resultado.paso).toBe("desvincular")
      expect(resultado.tabla).toBe(tablaQueFalla)
    }
    expect(llamadas.some((l) => l.tipo === "delete")).toBe(false)
    expect(llamadas.some((l) => l.tipo === "deleteUser")).toBe(false)
  })

  it("si falla un update que no es el primero, los anteriores a él ya se hicieron, pero ninguno posterior ni los delete", async () => {
    const tablaQueFalla = COLUMNAS_A_DESVINCULAR[COLUMNAS_A_DESVINCULAR.length - 1].tabla
    const { admin, llamadas } = crearAdminFalso({ errorEnUpdateTabla: tablaQueFalla })

    const resultado = await eliminarCuenta(admin, USUARIO_ID)

    expect(resultado.ok).toBe(false)
    const updates = llamadas.filter((l) => l.tipo === "update") as Array<{ tabla: string }>
    expect(updates.length).toBe(COLUMNAS_A_DESVINCULAR.length)
    expect(llamadas.some((l) => l.tipo === "delete")).toBe(false)
    expect(llamadas.some((l) => l.tipo === "deleteUser")).toBe(false)
  })

  it("si falla un delete, deleteUser no se llama (y los delete posteriores a él tampoco se hacen)", async () => {
    const tablaQueFalla = TABLAS_A_BORRAR[0].tabla
    const { admin, llamadas } = crearAdminFalso({ errorEnDeleteTabla: tablaQueFalla })

    const resultado = await eliminarCuenta(admin, USUARIO_ID)

    expect(resultado.ok).toBe(false)
    if (!resultado.ok) {
      expect(resultado.paso).toBe("borrar")
      expect(resultado.tabla).toBe(tablaQueFalla)
    }
    const deletes = llamadas.filter((l) => l.tipo === "delete") as Array<{ tabla: string }>
    expect(deletes.length).toBe(1)
    expect(llamadas.some((l) => l.tipo === "deleteUser")).toBe(false)
  })

  it("si falla deleteUser, el resultado es ok: false (todo lo anterior ya se había hecho)", async () => {
    const { admin, llamadas } = crearAdminFalso({ errorEnDeleteUser: true })

    const resultado = await eliminarCuenta(admin, USUARIO_ID)

    expect(resultado.ok).toBe(false)
    if (!resultado.ok) {
      expect(resultado.paso).toBe("eliminar_usuario")
    }
    expect(llamadas.filter((l) => l.tipo === "deleteUser").length).toBe(1)
  })
})

describe("eliminarCuenta: el userId se valida antes de tocar la base", () => {
  it.each([[""], ["*"], ["no-es-un-uuid"], [null], [undefined], [123], [{}], ["  "]])(
    "rechaza %j sin llamar a la base",
    async (valorInvalido) => {
      const { admin, llamadas } = crearAdminFalso()

      const resultado = await eliminarCuenta(admin, valorInvalido as unknown as string)

      expect(resultado).toEqual({ ok: false, paso: "uuid_invalido" })
      expect(llamadas).toEqual([])
    },
  )

  it("acepta un uuid válido en mayúsculas", async () => {
    const { admin } = crearAdminFalso()
    const resultado = await eliminarCuenta(admin, USUARIO_ID.toUpperCase())
    expect(resultado).toEqual({ ok: true })
  })
})
