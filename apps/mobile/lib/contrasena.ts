// Guardar una contraseña nueva (R48, tarea 48-d): la usa tanto quien entró
// con Google (crea su primera contraseña, para poder entrar también con
// email) como quien entró con email (la cambia). `validarContrasenaNueva` y
// `mensajeErrorContrasena` vienen de `@qps/core/auth/cuenta` y
// `@qps/core/auth/mensajes` (tarea 48-a): esta función solo orquesta.
//
// Siempre contra la SESIÓN VIGENTE del cliente de Supabase (`@/lib/supabase`,
// el mismo singleton de toda la app): `supabase.auth.updateUser({ password })`
// no recibe ni necesita un `user_id` ni un token armado a mano — es el
// propio cliente autenticado el que decide a qué cuenta le cambia la
// contraseña. Este archivo nunca construye un identificador de cuenta.
//
// GARANTÍA DE PRIVACIDAD (no negociable): la contraseña (los parámetros
// `nueva`/`repetida`, y el valor que se le pasa a `updateUser`) no se escribe
// en ningún `console.*`, no se manda a Sentry y no aparece en ningún mensaje
// devuelto por esta función — ni completa ni en parte. Si Supabase devuelve
// un error, el mensaje que ve la persona sale siempre de
// `mensajeErrorContrasena`, nunca de `error.message` (ese texto crudo podría
// llegar a incluir, según el caso, parte de lo que se mandó). La contraseña
// tampoco se guarda en ningún lado (ni `SecureStore`, ni caché, ni estado de
// módulo): vive solo en el argumento de `updateUser` y después se pierde.
import { validarContrasenaNueva } from '@qps/core/auth/cuenta'
import { mensajeErrorContrasena } from '@qps/core/auth/mensajes'
import { supabase } from '@/lib/supabase'

// Mismo texto que `MENSAJE_SIN_CONFIG` de `app/(tabs)/cuenta.tsx`: duplicado
// a propósito porque esta pantalla no está entre los archivos permitidos de
// esa tarea. En la práctica no debería pasar nunca (no hay sesión sin un
// cliente de Supabase configurado), pero se cubre igual: nunca se llama a
// `supabase.auth.updateUser` sin cliente.
const MENSAJE_SIN_CONFIG = 'La app no tiene la configuración de cuentas: avisá al equipo.'

export type ResultadoContrasena = { ok: true } | { ok: false; mensaje: string }

/**
 * Valida (`validarContrasenaNueva`, largo mínimo + coincidencia) antes de
 * tocar la red: con una contraseña corta, o con `nueva` y `repetida`
 * distintas, devuelve el mensaje de la validación sin llamar a
 * `supabase.auth.updateUser`. Si la validación pasa, guarda la contraseña
 * con la sesión vigente; cualquier error de Supabase se traduce con
 * `mensajeErrorContrasena`, nunca con el `message` crudo del error.
 */
export async function guardarContrasena(nueva: string, repetida: string): Promise<ResultadoContrasena> {
  const validacion = validarContrasenaNueva(nueva, repetida)
  if (!validacion.ok) return validacion

  if (!supabase) return { ok: false, mensaje: MENSAJE_SIN_CONFIG }

  const { error } = await supabase.auth.updateUser({ password: nueva })
  if (error) return { ok: false, mensaje: mensajeErrorContrasena(error) }

  return { ok: true }
}
