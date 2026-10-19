/** En qué paso del borrado falló, para que el endpoint lo loguee (nunca al cliente). */
type PasoFallido = "uuid_invalido" | "rpc"

export type ResultadoEliminarCuenta =
  | { ok: true }
  | { ok: false; paso: PasoFallido; detalle?: string; codigo?: string }

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
 * Tipo estructural mínimo: lo único que esta función necesita de un cliente
 * de Supabase es poder llamar al RPC `delete_my_account` y leer el `error`
 * de la respuesta. No se usa el tipo completo de `SupabaseClient` a
 * propósito, para que acepte por igual el cliente de cookies de
 * `@/lib/supabase/server` (la web) y el que el endpoint arma a mano con el
 * Bearer de la app (`@supabase/supabase-js` + anon key + header
 * `Authorization`), y para que el doble que usan los tests no tenga que
 * fingir un cliente entero.
 */
type ClienteDeLaPersona = {
  rpc(nombre: "delete_my_account"): PromiseLike<{ error: { message: string; code?: string } | null }>
}

/**
 * Borra para siempre la cuenta de quien está detrás de `clienteDeLaPersona`,
 * llamando al RPC `public.delete_my_account()`
 * (`supabase/migrations/20261018130300_qps_190_delete_my_account.sql`,
 * QPS-190).
 *
 * Todo el borrado — desvincular el contenido público, borrar las filas
 * personales y borrar la fila de `auth.users` — corre adentro de **una sola
 * transacción** de Postgres, dentro del propio RPC: si el RPC falla, no se
 * borró ni se desvinculó absolutamente nada (por eso el mensaje que ve la
 * persona puede prometerlo). Antes (37-b) esta función hacía los mismos
 * pasos con llamadas sucesivas desde Node con la service key; si una fallaba
 * a mitad de camino, lo anterior ya había quedado aplicado. Ese código ya no
 * existe.
 *
 * El RPC **no recibe ningún id como argumento**: trabaja sobre `auth.uid()`,
 * es decir, sobre la sesión con la que se armó `clienteDeLaPersona` (la
 * cookie en la web, el Bearer en la app — ver el comentario del paso 7 de
 * `app/api/cuenta/eliminar/route.ts` sobre por qué ese cliente tiene que
 * representar exactamente al mismo usuario que ya validó el endpoint).
 * `userId` se sigue validando como UUID antes de llamar a nada: es la señal
 * de que hubo un usuario autenticado, y el endpoint lo usa para el candado
 * en memoria — pero **nunca se lo pasa al RPC**, que no tiene parámetros.
 *
 * `clienteDeLaPersona` **nunca** puede ser el cliente de service role
 * (`createAdminClient()`): con la service key, `auth.uid()` es `null` del
 * lado de Postgres y el RPC falla con `42501` ("No autenticado") — y además
 * está `revoke`ado explícitamente para `service_role` en la migración, así
 * que ni siquiera llegaría a ejecutarse. Por eso ya no hace falta
 * `admin.auth.admin.deleteUser(userId)`: el RPC borra la fila de
 * `auth.users` en la misma transacción que todo lo demás.
 *
 * QPS-187: el reintento de este pedido es trivialmente idempotente y
 * seguro. Como todo el borrado es una sola transacción, después de llamar a
 * esta función solo hay dos estados posibles: o se borró absolutamente todo,
 * o no se borró nada en absoluto. Nunca puede quedar "a medio borrar".
 *
 * Qué pasa exactamente al reintentar después de un borrado exitoso: el JWT
 * que ya emitió Supabase **sigue siendo válido hasta que vence** (lo dice el
 * comentario de la propia migración), y `auth.uid()` lo lee de los claims del
 * token, no de la base. Así que el RPC **no** falla con `42501`: vuelve a
 * correr sobre un uuid que ya no existe, no encuentra ninguna fila para
 * bloquear, desvincular ni borrar, y devuelve `void` sin tocar nada. O sea
 * que el segundo intento responde `{ ok: true }` igual que el primero, que es
 * lo que hace que reintentar sea seguro.
 *
 * En el endpoint real, además, ese reintento casi nunca llega hasta acá:
 * `usuarioDeRequest` llama a `supabase.auth.getUser(token)`, que valida el
 * token contra el servidor de Auth y no solo su firma, así que para una
 * cuenta que ya no existe devuelve `null` y el endpoint corta en el 401 del
 * paso 3. Las dos salidas son aceptables (un 401 o un 200 vacío, nunca un
 * "no se borró nada" sobre una cuenta que sí se borró); cuál de las dos sale
 * lo confirma Mauro en la prueba con las cuentas de prueba.
 */
export async function eliminarCuenta(
  clienteDeLaPersona: ClienteDeLaPersona,
  userId: string,
): Promise<ResultadoEliminarCuenta> {
  if (!esUuidValido(userId)) {
    return { ok: false, paso: "uuid_invalido" }
  }

  const { error } = await clienteDeLaPersona.rpc("delete_my_account")
  if (error) {
    return { ok: false, paso: "rpc", detalle: error.message, codigo: error.code }
  }

  return { ok: true }
}
