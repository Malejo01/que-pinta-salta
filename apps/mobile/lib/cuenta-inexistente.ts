// Q5-16 (decisión nº18 de Mauro sobre la Q4): si la cuenta se eliminó DESDE
// LA WEB, el teléfono se entera la próxima vez que abre la app con la sesión
// vieja. En ese caso se borran las búsquedas recientes del teléfono, igual
// que al eliminar la cuenta desde la app (`limpiarTrasEliminarCuenta`), y se
// cierra la sesión local (QPS-186: la sesión obsoleta).
//
// Cómo se detecta: `auth.getUser()` valida el token contra el servidor. Con
// la cuenta borrada, Supabase Auth responde `user_not_found` (403, «User
// from sub claim in JWT does not exist»). Solo ESE caso cuenta: sin red, un
// 500 o un token vencido no borran nada (más vale dejar una búsqueda que
// borrar las de alguien que sigue teniendo cuenta). Un cierre de sesión
// común tampoco: las búsquedas son del teléfono, no de la cuenta.
//
// Nunca tira ni loguea (ni el token ni el error).
import type { SupabaseClient } from '@supabase/supabase-js'
import { borrarHistorialDeBusquedas } from '@/lib/busquedas-recientes'

/** `true` solo si el error dice que la cuenta del token ya no existe. */
export function esCuentaInexistente(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { code?: unknown; status?: unknown; message?: unknown }
  if (e.code === 'user_not_found') return true
  const mensaje = typeof e.message === 'string' ? e.message : ''
  return (e.status === 403 || e.status === 404) && /sub claim in JWT does not exist|user not found/i.test(mensaje)
}

export interface DependenciasCuentaInexistente {
  supabase: Pick<SupabaseClient, 'auth'> | null
  borrarBusquedas?: () => Promise<unknown>
}

/**
 * Con una sesión guardada, pregunta al servidor si la cuenta sigue
 * existiendo. Devuelve `'no-existe'` (y ya borró las búsquedas y cerró la
 * sesión local), `'existe'` o `'sin-dato'` (sin sesión, sin red, otro error).
 */
export async function revisarCuentaExistente(
  deps: DependenciasCuentaInexistente,
): Promise<'existe' | 'no-existe' | 'sin-dato'> {
  const { supabase } = deps
  if (!supabase) return 'sin-dato'
  try {
    const { data, error } = await supabase.auth.getUser()
    if (data?.user && !error) return 'existe'
    if (!esCuentaInexistente(error)) return 'sin-dato'
  } catch (error) {
    if (!esCuentaInexistente(error)) return 'sin-dato'
  }

  await (deps.borrarBusquedas ?? borrarHistorialDeBusquedas)().catch(() => {})
  try {
    // `local`: la cuenta ya no está; supabase-js ignora el 401/403/404 del
    // servidor y borra la sesión del teléfono (emite SIGNED_OUT, que borra
    // la caché de favoritos en el SessionProvider).
    await supabase.auth.signOut({ scope: 'local' })
  } catch {
    // Nada que deshacer.
  }
  return 'no-existe'
}
