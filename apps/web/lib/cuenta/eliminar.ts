import type { createAdminClient } from "@/lib/supabase/server"
import { COLUMNAS_A_DESVINCULAR, TABLAS_A_BORRAR } from "@/lib/cuenta/tablas-personales"

/**
 * Cliente admin tal como lo devuelve `createAdminClient()` (service role).
 * Esta función nunca lo crea: lo recibe de quien la llama (el route handler),
 * para que esa creación quede después de todas las guardas de autenticación.
 */
type AdminClient = ReturnType<typeof createAdminClient>

/** En qué paso del borrado falló, para que el endpoint lo loguee (nunca al cliente). */
type PasoFallido = "uuid_invalido" | "desvincular" | "borrar" | "eliminar_usuario"

export type ResultadoEliminarCuenta =
  | { ok: true }
  | { ok: false; paso: PasoFallido; tabla?: string; detalle?: string }

/**
 * Acepta cualquier UUID con el formato estándar (8-4-4-4-12 en hexadecimal).
 * No se exige un dígito de versión puntual porque no hace falta: alcanza con
 * que tenga la forma de un UUID para que no pueda terminar siendo, por
 * ejemplo, `"*"`, `""`, `null` o `undefined` en una cláusula `WHERE`.
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function esUuidValido(valor: unknown): valor is string {
  return typeof valor === "string" && UUID_REGEX.test(valor)
}

/**
 * Borra para siempre todos los datos personales de una cuenta, en el orden
 * de `ORDEN_BORRADO_DE_CUENTA` (ver el comentario completo en
 * `lib/cuenta/tablas-personales.ts`, que explica por qué el orden importa):
 *
 * 1. **Desvincular**: cada entrada de `COLUMNAS_A_DESVINCULAR` se pone en
 *    `null` donde la columna sea `userId`.
 * 2. **Borrar**: cada entrada de `TABLAS_A_BORRAR`, **en el orden del
 *    array** (no se reordena acá: ese orden es carga útil, lo decide
 *    `lib/cuenta/tablas-personales.ts`).
 * 3. **`admin.auth.admin.deleteUser(userId)`**: lo irreversible, siempre al
 *    final.
 *
 * Si cualquier paso falla, se corta ahí mismo: en particular, si falla un
 * `update` o un `delete`, `deleteUser` directamente no se llama.
 *
 * `userId` se valida como UUID antes de armar ninguna consulta: un valor que
 * no lo sea (vacío, `null`, `undefined`, `"*"`, lo que sea) se rechaza sin
 * tocar la base, porque un `DELETE`/`UPDATE` sin un filtro válido borraría o
 * desvincularía la tabla entera.
 */
export async function eliminarCuenta(admin: AdminClient, userId: string): Promise<ResultadoEliminarCuenta> {
  if (!esUuidValido(userId)) {
    return { ok: false, paso: "uuid_invalido" }
  }

  // 1. Desvincular contenido público (eventos, alias, etc.) antes de borrar nada.
  for (const { tabla, columna } of COLUMNAS_A_DESVINCULAR) {
    const { error } = await admin
      .from(tabla)
      .update({ [columna]: null })
      .eq(columna, userId)

    if (error) {
      return { ok: false, paso: "desvincular", tabla, detalle: error.message }
    }
  }

  // 2. Borrar las filas personales, en el orden exacto de TABLAS_A_BORRAR.
  for (const { tabla, columna } of TABLAS_A_BORRAR) {
    const { error } = await admin
      .from(tabla)
      .delete()
      .eq(columna, userId)

    if (error) {
      return { ok: false, paso: "borrar", tabla, detalle: error.message }
    }
  }

  // 3. Lo irreversible: recién si todo lo anterior salió bien.
  const { error: errorDeleteUser } = await admin.auth.admin.deleteUser(userId)
  if (errorDeleteUser) {
    return { ok: false, paso: "eliminar_usuario", detalle: errorDeleteUser.message }
  }

  return { ok: true }
}
