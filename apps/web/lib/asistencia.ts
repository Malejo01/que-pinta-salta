"use server"

// "Voy" / "Me interesa" de la ficha de un evento (R38, tarea 38-b). La
// lógica de dominio (unión de tipos, el umbral del contador, los textos y
// la regla de marcar/desmarcar/cambiar) vive en `@qps/core/asistencia`: este
// módulo solo habla con Supabase.
//
// Qué lee: `obtenerAsistencia` lee las cantidades públicas de la vista
// `event_attendance_counts` (solo `voy, me_interesa`, nunca `user_id`: la
// vista ni la tiene) y, solo si hay sesión, la marca propia del usuario en
// `event_attendance` (solo `kind`). Nunca se pide `user_id` en un `select`
// ni se filtra por `user_id` a mano: la RLS de `event_attendance` ("lectura
// del dueño") ya acota cualquier consulta sin filtro explícito a la fila
// del usuario de la sesión, así que alcanza con filtrar por `event_id`.
//
// Qué escribe: `marcarAsistencia` borra o hace upsert de la fila propia en
// `event_attendance`, según lo que decida `siguienteMarca` (de core) a
// partir de la marca leída de la base (nunca la que mande el cliente: el
// cliente puede mentir o estar desactualizado). El `user_id` que se escribe
// siempre sale de `auth.getUser()`, nunca de un argumento de la función.
//
// Regla de datos: acá solo se trabaja con cantidades y con la marca propia
// del usuario de la sesión. Nunca con quién marcó cada tipo: eso no sale de
// la base (la vista pública no tiene `user_id`, y `event_attendance` solo
// se lee/escribe acotado al usuario de la sesión).

import { createClient } from "@/lib/supabase/server"
import { siguienteMarca, type TipoAsistencia } from "@qps/core/asistencia"

function esTipoValido(tipo: unknown): tipo is TipoAsistencia {
  return tipo === "voy" || tipo === "me_interesa"
}

export interface CantidadesAsistencia {
  voy: number
  meInteresa: number
}

export type ResultadoAsistencia =
  | { ok: true; cantidades: CantidadesAsistencia; propia: TipoAsistencia | null }
  | { ok: false }

export type ResultadoMarcarAsistencia =
  | { ok: true; cantidades: CantidadesAsistencia; propia: TipoAsistencia | null }
  | { ok: false; error: "AUTH_REQUIRED" | "INVALID" | "DB_ERROR" }

/**
 * Cantidades públicas de `eventId` y, solo si hay sesión, la marca propia.
 * Sin sesión, `propia` es siempre `null` y nunca se consulta
 * `event_attendance` (ni siquiera para comprobar que no hay fila).
 */
export async function obtenerAsistencia(eventId: string): Promise<ResultadoAsistencia> {
  try {
    const supabase = await createClient()

    const { data: fila, error: errorCantidades } = await supabase
      .from("event_attendance_counts")
      .select("voy, me_interesa")
      .eq("event_id", eventId)
      .maybeSingle()

    if (errorCantidades) {
      console.error("[obtenerAsistencia] Error al leer cantidades:", errorCantidades)
      return { ok: false }
    }

    const cantidades: CantidadesAsistencia = { voy: fila?.voy ?? 0, meInteresa: fila?.me_interesa ?? 0 }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { ok: true, cantidades, propia: null }
    }

    // Solo `kind`, nunca `user_id`: la RLS ya acota esta consulta a la fila
    // propia con solo filtrar por `event_id`.
    const { data: filaPropia, error: errorPropia } = await supabase
      .from("event_attendance")
      .select("kind")
      .eq("event_id", eventId)
      .maybeSingle()

    if (errorPropia) {
      console.error("[obtenerAsistencia] Error al leer la marca propia:", errorPropia)
      return { ok: false }
    }

    const propia: TipoAsistencia | null = esTipoValido(filaPropia?.kind) ? filaPropia.kind : null

    return { ok: true, cantidades, propia }
  } catch (excepcion) {
    // La ficha tiene que seguir funcionando aunque esto falle (tabla
    // todavía no disponible, cliente mal configurado, red caída): se
    // registra y no se muestran los botones.
    console.error("[obtenerAsistencia] Excepción inesperada:", excepcion)
    return { ok: false }
  }
}

/**
 * Marca o desmarca `tipo` para `eventId`. Sin usuario, `AUTH_REQUIRED` y no
 * se escribe nada. Con usuario, lee la marca actual de la base (nunca la
 * recibe del cliente) y deja que `siguienteMarca` (de core) decida: si da
 * `null`, borra la fila propia; si no, hace upsert con el nuevo `kind`. El
 * `user_id` del upsert/delete siempre sale de `auth.getUser()`.
 */
export async function marcarAsistencia(eventId: string, tipo: TipoAsistencia): Promise<ResultadoMarcarAsistencia> {
  if (!esTipoValido(tipo)) {
    return { ok: false, error: "INVALID" }
  }

  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (!user || authError) {
      return { ok: false, error: "AUTH_REQUIRED" }
    }

    // La marca actual se lee de la base, no del cliente: puede mentir o
    // estar desactualizado.
    const { data: filaPropia, error: errorPropia } = await supabase
      .from("event_attendance")
      .select("kind")
      .eq("event_id", eventId)
      .maybeSingle()

    if (errorPropia) {
      console.error("[marcarAsistencia] Error al leer la marca actual:", errorPropia)
      return { ok: false, error: "DB_ERROR" }
    }

    const actual: TipoAsistencia | null = esTipoValido(filaPropia?.kind) ? filaPropia.kind : null
    const nueva = siguienteMarca(actual, tipo)

    if (nueva === null) {
      // La RLS ("eliminación del dueño") ya acota esto a la fila propia.
      const { error } = await supabase.from("event_attendance").delete().eq("event_id", eventId)
      if (error) {
        console.error("[marcarAsistencia] Error al borrar la marca:", error)
        return { ok: false, error: "DB_ERROR" }
      }
    } else {
      const { error } = await supabase
        .from("event_attendance")
        .upsert({ user_id: user.id, event_id: eventId, kind: nueva }, { onConflict: "user_id,event_id" })
      if (error) {
        console.error("[marcarAsistencia] Error al marcar:", error)
        return { ok: false, error: "DB_ERROR" }
      }
    }

    const { data: filaCantidades, error: errorCantidades } = await supabase
      .from("event_attendance_counts")
      .select("voy, me_interesa")
      .eq("event_id", eventId)
      .maybeSingle()

    if (errorCantidades) {
      console.error("[marcarAsistencia] Error al releer cantidades:", errorCantidades)
      return { ok: false, error: "DB_ERROR" }
    }

    const cantidades: CantidadesAsistencia = {
      voy: filaCantidades?.voy ?? 0,
      meInteresa: filaCantidades?.me_interesa ?? 0,
    }

    return { ok: true, cantidades, propia: nueva }
  } catch (excepcion) {
    console.error("[marcarAsistencia] Excepción inesperada:", excepcion)
    return { ok: false, error: "DB_ERROR" }
  }
}
