import type { User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"

/**
 * Usuario autenticado de un `Request`, para los route handlers de `/api` que
 * atienden tanto a la web (cookie de sesión) como a la app nativa (header
 * `Authorization: Bearer <access_token>`).
 *
 * Si llegan los dos a la vez, **gana el Bearer**: es explícito (quien lo
 * manda eligió a propósito representar a ese usuario), mientras que la
 * cookie viaja sola en cualquier petición al mismo dominio, incluida una
 * fetch cross-site con `credentials: "include"`. Preferir la señal explícita
 * sobre la implícita es la decisión más segura entre las dos. Ver el test
 * correspondiente, que fija este comportamiento.
 *
 * Nunca usa el cliente admin / service role para esto: `supabase.auth.getUser(token)`
 * con la clave anon alcanza para validar la firma del JWT contra Supabase,
 * tanto para el Bearer como (sin argumento) para la cookie de sesión.
 *
 * Devuelve `null` si no hay usuario (sin token, token inválido/expirado, o
 * sin cookie de sesión): este helper no decide el status HTTP, eso es
 * responsabilidad de quien lo llama.
 */
export async function usuarioDeRequest(request: Request): Promise<User | null> {
  const supabase = await createClient()

  const encabezadoAuth = request.headers.get("authorization")
  const token = encabezadoAuth?.startsWith("Bearer ") ? encabezadoAuth.slice("Bearer ".length).trim() : ""

  if (token) {
    // Nota: nunca se loguea `token` ni `encabezadoAuth`, ni en éxito ni en error.
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) return null
    return data.user
  }

  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  return data.user
}
