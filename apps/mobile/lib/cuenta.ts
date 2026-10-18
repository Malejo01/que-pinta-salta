// "Eliminar mi cuenta" (R37, tarea 37-d). El endpoint ya existe (37-b,
// `apps/web/app/api/cuenta/eliminar/route.ts`): acá solo se llama desde la
// app. El servidor saca el id de la cuenta a borrar del propio token — por
// eso esta función nunca manda un identificador de cuenta ni el email en el
// body, solo el token (por parámetro, no de un singleton) y la confirmación.
//
// `SITIO` es la misma constante de `@qps/core/metricas/links` que usan
// `urlGo`/`urlComoLlegar` (core) y `urlSitio` (`lib/links.ts`, que no sirve
// acá: tiene una lista cerrada de rutas para `Linking.openURL`, no para un
// `fetch`) — una sola fuente de verdad para el dominio.
import * as SecureStore from 'expo-secure-store'
import { GoogleSignin } from '@react-native-google-signin/google-signin'
import { SITIO } from '@qps/core/metricas/links'
import { CLAVE_BIENVENIDA_VISTA } from '@/lib/bienvenida'
import { supabase } from '@/lib/supabase'
import { borrarTodaLaCache } from '@/lib/sin-conexion/cache'

const RUTA_ELIMINAR = `${SITIO}/api/cuenta/eliminar`

// Literal exacto que exige el servidor (comparación estricta, sin trim ni
// mayúsculas): siempre se manda este valor fijo, nunca lo que tipeó la
// persona.
const CONFIRMACION_ESPERADA = 'ELIMINAR'

const MENSAJE_SIN_RED = 'No pudimos eliminar la cuenta. Revisá tu conexión.'
const MENSAJE_GENERICO = 'No pudimos eliminar la cuenta. Probá de nuevo en unos minutos.'

/**
 * Compara lo que escribió la persona contra "ELIMINAR". Mismo criterio que
 * `confirmacionValida` de la web
 * (`apps/web/app/perfil/eliminar-cuenta/eliminar-cuenta-form.tsx`): acepta
 * espacios de más al principio o al final y no distingue mayúsculas de
 * minúsculas. Duplicada acá a propósito: la app no puede importar un
 * componente de `apps/web` y esta función no vive en ningún paquete
 * compartido.
 */
export function confirmacionValida(texto: string): boolean {
  return texto.trim().toUpperCase() === CONFIRMACION_ESPERADA
}

export type ResultadoEliminarCuenta = { ok: true } | { ok: false; mensaje: string }

/**
 * `POST /api/cuenta/eliminar` con el Bearer de la sesión. Nunca manda un
 * identificador de cuenta ni el email: el servidor los saca del token (ver
 * el comentario de cabecera). El mensaje de "sin red" es exactamente el que
 * pide la tarea 37-d; para cualquier otro fallo (respuesta no-ok, lo que
 * sea) el mensaje es genérico — nunca se muestra en pantalla el texto del
 * error del servidor ni el de la excepción de `fetch`, y nada de esto se
 * loguea (ni el token, ni un pedazo).
 */
export async function eliminarMiCuenta(accessToken: string): Promise<ResultadoEliminarCuenta> {
  let respuesta: Response
  try {
    respuesta = await fetch(RUTA_ELIMINAR, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ confirmacion: CONFIRMACION_ESPERADA }),
    })
  } catch {
    // Sin red: el fetch rechaza antes de llegar a ningún status.
    return { ok: false, mensaje: MENSAJE_SIN_RED }
  }

  if (!respuesta.ok) {
    return { ok: false, mensaje: MENSAJE_GENERICO }
  }

  return { ok: true }
}

/**
 * Limpieza del lado del teléfono después de un borrado exitoso: borrar toda
 * la caché sin conexión (R43, 43-d, plan §8 — además del borrado que
 * dispara el propio `signOut()` de ahí abajo al emitir `SIGNED_OUT`, por si
 * ese cambio de sesión nunca llega a correr), cerrar la sesión de Supabase,
 * cerrar también la sesión nativa de Google si la persona entró con ese
 * proveedor (si no se hace esto, el próximo toque en "Continuar con Google"
 * vuelve a entrar sin preguntar nada y crea una cuenta nueva en silencio —
 * mismo criterio que `salir()` en `app/(tabs)/cuenta.tsx`) y borrar la
 * bandera de "ya se vio la Bienvenida" para que, si alguna vez se vuelve a
 * crear una cuenta en este teléfono, se vuelva a mostrar.
 *
 * Ninguno de los cuatro pasos tira: la cuenta ya está borrada para siempre
 * en el servidor en el momento en que se llama a esta función, así que no
 * hay nada que reintentar ni ningún error que mostrar si algo de esto
 * falla. `borrarTodaLaCache` (`lib/sin-conexion/cache.ts`) ya nunca tira por
 * su cuenta, pero igual se envuelve en su propio `try/catch`, como los
 * otros tres pasos.
 *
 * NOTA: el borrado de la bandera de la Bienvenida debería vivir en
 * `lib/bienvenida.ts`, junto a `marcarBienvenidaVista`, pero esa función no
 * borra la bandera (solo la pone) y `lib/bienvenida.ts` no está entre los
 * archivos permitidos de la tarea 37-d — por eso se hace acá, con
 * `SecureStore` directo y la clave importada de ese módulo.
 */
export async function limpiarTrasEliminarCuenta(entroConGoogle: boolean): Promise<void> {
  try {
    await borrarTodaLaCache()
  } catch {
    // Best-effort (ver el comentario de cabecera): la cuenta ya está
    // borrada en el servidor, no hay nada que reintentar.
  }

  if (supabase) {
    try {
      await supabase.auth.signOut()
    } catch {
      // La cuenta ya no existe en el servidor: no hay nada que deshacer.
    }
  }

  if (entroConGoogle) {
    try {
      await GoogleSignin.signOut()
    } catch {
      // No estaba firmado con Google del lado nativo: no pasa nada.
    }
  }

  try {
    await SecureStore.deleteItemAsync(CLAVE_BIENVENIDA_VISTA)
  } catch {
    // Lo peor que pasa es que se vuelva a mostrar la Bienvenida.
  }
}

/** Lo que necesita `completarEliminacionDeCuenta` para no depender de
 * `expo-router` acá (y así poder probarse sin React Native): la pantalla le
 * pasa `() => router.replace('/bienvenida')`. */
export interface DependenciasEliminarCuenta {
  navegarABienvenida: () => void
}

/**
 * Orquesta el flujo completo: pide el borrado, y solo si salió bien hace la
 * limpieza del teléfono y navega a la Bienvenida (con `replace`, no `push`:
 * no se puede volver atrás a una cuenta que ya no existe). Si falla, no
 * toca la sesión ni navega — la pantalla solo tiene que mostrar
 * `resultado.mensaje`.
 *
 * Esta función (y no la pantalla) es la que decide el orden de los tres
 * pasos de después del borrado, para que se pueda probar sin montar nada de
 * React Native (`tests/eliminar-cuenta.test.ts`).
 */
export async function completarEliminacionDeCuenta(
  accessToken: string,
  entroConGoogle: boolean,
  { navegarABienvenida }: DependenciasEliminarCuenta,
): Promise<ResultadoEliminarCuenta> {
  const resultado = await eliminarMiCuenta(accessToken)
  if (!resultado.ok) return resultado

  await limpiarTrasEliminarCuenta(entroConGoogle)
  navegarABienvenida()
  return resultado
}
