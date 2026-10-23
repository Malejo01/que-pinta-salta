// Lectura de "Voy"/Guardados y el chequeo de "¿se puede agregar?" (R56,
// tarea 56-a, QPS-196/QPS-195). `leerAsistencia` se partió de
// `lib/asistencia.ts` (que sigue siendo `"use server"`) para que la ficha
// (`app/evento/[id]/page.tsx`) y el modal interceptado
// (`app/@modal/(.)evento/[id]/page.tsx`) la puedan llamar con el MISMO
// cliente y la MISMA llamada a `auth.getUser()` que ya hacían para el resto
// de la página, sin crear un segundo cliente ni volver a autenticar.
//
// Por eso este archivo:
//  - NO tiene `"use server"` (no es una server action: es una función de
//    lectura que cualquier Server Component puede llamar directo, sin pasar
//    por el límite de red de las acciones).
//  - NO crea un cliente de Supabase ni llama a `auth.getUser()`: los recibe
//    como parámetros. Quien lo llama (la página, o el envoltorio
//    `obtenerAsistencia` de `lib/asistencia.ts` para los componentes
//    cliente) es quien decide cuándo crear el cliente y cuándo resolver el
//    usuario.
//  - NO importa nada de `next/*`: el tipo del cliente sale de `createClient`
//    de `@/lib/supabase/server` importado SOLO como tipo (`import type`), así
//    el import de `next/headers` que tiene ese módulo nunca llega al bundle
//    de este archivo.

import type { createClient } from "@/lib/supabase/server"
import { esTipoAsistencia, type CantidadesAsistencia, type TipoAsistencia } from "@qps/core/asistencia"

export type { CantidadesAsistencia }

/**
 * El cliente de Supabase del lado del servidor, tal como lo devuelve
 * `createClient()` de `@/lib/supabase/server`. Se define a partir de
 * `typeof createClient` (importado como tipo) en vez de `SupabaseClient`
 * suelto para no perder el tipado del cliente real si alguna vez se le pasa
 * un `Database` genérico.
 */
export type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export type ResultadoAsistencia =
  | { ok: true; cantidades: CantidadesAsistencia; propia: TipoAsistencia | null; guardado: boolean }
  | { ok: false }

/**
 * Cantidades públicas de `eventId` y, solo si hay sesión (`userId` no
 * nulo), la marca propia y si está guardado. Sin sesión, `propia` es
 * siempre `null`, `guardado` siempre `false`, y nunca se consulta
 * `event_attendance` ni `user_favorites` (ni siquiera para comprobar que no
 * hay fila).
 *
 * Una fila vieja con `kind = 'me_interesa'` (de antes de la R47) se lee
 * como `propia: null`: `esTipoAsistencia` solo acepta `'voy'`.
 */
export async function leerAsistencia(
  supabase: SupabaseServerClient,
  userId: string | null,
  eventId: string,
): Promise<ResultadoAsistencia> {
  try {
    const { data: fila, error: errorCantidades } = await supabase
      .from("event_attendance_counts")
      .select("voy")
      .eq("event_id", eventId)
      .maybeSingle()

    if (errorCantidades) {
      console.error("[leerAsistencia] Error al leer cantidades:", errorCantidades)
      return { ok: false }
    }

    const cantidades: CantidadesAsistencia = { voy: fila?.voy ?? 0 }

    if (!userId) {
      return { ok: true, cantidades, propia: null, guardado: false }
    }

    const [respuestaPropia, respuestaGuardado] = await Promise.all([
      // Solo `kind`, nunca `user_id`: la RLS ya acota esta consulta a la
      // fila propia con solo filtrar por `event_id`.
      supabase.from("event_attendance").select("kind").eq("event_id", eventId).maybeSingle(),
      supabase.from("user_favorites").select("id").eq("event_id", eventId).eq("user_id", userId).maybeSingle(),
    ])

    const { data: filaPropia, error: errorPropia } = respuestaPropia
    if (errorPropia) {
      console.error("[leerAsistencia] Error al leer la marca propia:", errorPropia)
      return { ok: false }
    }

    const propia: TipoAsistencia | null = esTipoAsistencia(filaPropia?.kind) ? filaPropia.kind : null

    // Decisión de la tarea 47-b, no cubierta por el encargo original: si
    // falla SOLO la lectura de `user_favorites`, no se devuelve `ok: false`.
    // Con `ok: false` la fila entera de asistencia desaparece de la
    // pantalla (incluida la cantidad pública, que sí se pudo leer bien); un
    // ♥ que se ve vacío cuando en realidad está guardado, en cambio, solo
    // hace que el siguiente toque reintente guardar — y guardar es
    // idempotente (el `insert` de `marcarAsistencia` trata un `23505` como
    // éxito). Es el lado más seguro para errar.
    let guardado = false
    if (respuestaGuardado.error) {
      console.error("[leerAsistencia] Error al leer si está guardado (se asume false):", respuestaGuardado.error)
    } else {
      guardado = respuestaGuardado.data !== null
    }

    return { ok: true, cantidades, propia, guardado }
  } catch (excepcion) {
    // La ficha tiene que seguir funcionando aunque esto falle (tabla
    // todavía no disponible, cliente mal configurado, red caída): se
    // registra y no se muestran los botones.
    console.error("[leerAsistencia] Excepción inesperada:", excepcion)
    return { ok: false }
  }
}

/**
 * ¿Se puede AGREGAR una marca (Guardar o Voy) sobre `eventId`? (QPS-195.)
 * `'si'` solo si el evento está `PUBLISHED`; `'no'` si no hay fila o si está
 * en cualquier otro estado; `'error'` si falló la consulta a la base.
 *
 * Sin fila (`maybeSingle()` sin match) y "otro estado que no sea
 * PUBLISHED" dan la MISMA respuesta (`'no'`) a propósito: la RLS de
 * `events` ya oculta los borradores al público, así que un id que no existe
 * y un borrador le devuelven a esta consulta exactamente la misma forma
 * (cero filas). El mensaje que arma el llamador ("ya no está disponible")
 * tiene que ser igual de ambiguo: nunca "es un borrador".
 *
 * Por qué el cliente tiene que ser el del USUARIO de la sesión, nunca el de
 * service role: la RLS ya hace la mitad del trabajo acá. Con el cliente del
 * usuario, un borrador responde "no existe" (0 filas), que es justo lo que
 * se quiere mostrar. Con el cliente admin esta misma consulta SÍ vería el
 * borrador (status `DRAFT` en la fila), y un error de programación en el
 * llamador podría terminar exponiendo ese estado real — exactamente lo que
 * esta función existe para evitar.
 */
export async function estadoPermiteAgregar(
  supabase: SupabaseServerClient,
  eventId: string,
): Promise<"si" | "no" | "error"> {
  const { data, error } = await supabase.from("events").select("status").eq("id", eventId).maybeSingle()

  if (error) {
    console.error("[estadoPermiteAgregar] Error al leer el estado del evento:", error)
    return "error"
  }

  return data?.status === "PUBLISHED" ? "si" : "no"
}
