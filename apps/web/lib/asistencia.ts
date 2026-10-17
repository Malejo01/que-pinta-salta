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
//
// Invariante de `marcarAsistencia` (bloqueante 1, vuelta 1): si la
// escritura (el upsert o el delete) salió bien, la función NUNCA devuelve
// `ok: false`. Antes, un error en la relectura de cantidades DESPUÉS de
// escribir hacía que la función devolviera `DB_ERROR` con la marca ya
// guardada: la pantalla mostraba "sin marca" sobre una escritura que sí
// había quedado, y el siguiente toque la borraba sin que nadie se entere.
// Por eso las cantidades también se leen ANTES de escribir (de respaldo) y
// la relectura de después nunca puede convertir una escritura exitosa en
// un error.
//
// `debenMostrarseBotonesAsistencia` (bloqueante 2, vuelta 1): los botones
// solo se muestran para eventos PUBLISHED. La vista `event_attendance_counts`
// (supabase/migrations/20261013120100_voy_me_interesa.sql) agrega únicamente
// eventos PUBLISHED, así que mostrar los botones en un evento CANCELLED o
// PAST deja un contador clavado en 0 aunque se pueda tocar el botón. El día
// que se quiera contar también ahí, hace falta una migración que cambie esa
// vista — no alcanza con tocar este archivo.

import { createClient } from "@/lib/supabase/server"
import { siguienteMarca, type TipoAsistencia } from "@qps/core/asistencia"

function esTipoValido(tipo: unknown): tipo is TipoAsistencia {
  return tipo === "voy" || tipo === "me_interesa"
}

/**
 * `true` solo para eventos `PUBLISHED`: es el único estado en el que
 * `event_attendance_counts` suma votos, así que es el único en el que
 * mostrar los botones tiene un contador que se mueve. Única fuente de
 * verdad: tanto `app/evento/[id]/page.tsx` (no pasar las cantidades) como
 * `components/event-detail-page.tsx` (no dibujar los botones) llaman a
 * esta misma función.
 */
export function debenMostrarseBotonesAsistencia(status: string): boolean {
  return status === "PUBLISHED"
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
    // estar desactualizado. Se lee en la misma tanda (en paralelo) que las
    // cantidades de ANTES de escribir: todavía no se escribió nada, así
    // que acá sigue siendo seguro devolver un error si algo falla. Las
    // cantidades de antes son el respaldo si la relectura de DESPUÉS de
    // escribir falla (ver más abajo): un número desactualizado por un
    // instante es mucho menos grave que decirle a la persona que su acción
    // falló cuando en realidad se guardó.
    const [respuestaPropia, respuestaCantidadesAntes] = await Promise.all([
      supabase.from("event_attendance").select("kind").eq("event_id", eventId).maybeSingle(),
      supabase.from("event_attendance_counts").select("voy, me_interesa").eq("event_id", eventId).maybeSingle(),
    ])

    const { data: filaPropia, error: errorPropia } = respuestaPropia
    if (errorPropia) {
      console.error("[marcarAsistencia] Error al leer la marca actual:", errorPropia)
      return { ok: false, error: "DB_ERROR" }
    }

    if (respuestaCantidadesAntes.error) {
      // No es crítico para decidir qué escribir (solo usa `filaPropia`): si
      // esto falla, simplemente no hay respaldo si la relectura de después
      // también falla (ver el `catch` interno más abajo).
      console.error("[marcarAsistencia] Error al leer cantidades antes de escribir:", respuestaCantidadesAntes.error)
    }
    const cantidadesAntes: CantidadesAsistencia = {
      voy: respuestaCantidadesAntes.data?.voy ?? 0,
      meInteresa: respuestaCantidadesAntes.data?.me_interesa ?? 0,
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

    // A partir de aquí la escritura YA quedó hecha: esta función no puede
    // devolver `ok: false` por ningún motivo (bloqueante 1, vuelta 1). El
    // `try/catch` es propio de este bloque (no del de la función entera)
    // para que ni siquiera una excepción inesperada en la relectura escape
    // como un error: si falla, se cae a las cantidades leídas antes de
    // escribir.
    try {
      const { data: filaCantidades, error: errorCantidades } = await supabase
        .from("event_attendance_counts")
        .select("voy, me_interesa")
        .eq("event_id", eventId)
        .maybeSingle()

      if (errorCantidades) {
        console.error(
          "[marcarAsistencia] Error al releer cantidades después de escribir (se usan las de antes de escribir):",
          errorCantidades,
        )
        return { ok: true, cantidades: cantidadesAntes, propia: nueva }
      }

      const cantidades: CantidadesAsistencia = {
        voy: filaCantidades?.voy ?? 0,
        meInteresa: filaCantidades?.me_interesa ?? 0,
      }

      return { ok: true, cantidades, propia: nueva }
    } catch (excepcionRelectura) {
      console.error(
        "[marcarAsistencia] Excepción al releer cantidades después de escribir (se usan las de antes de escribir):",
        excepcionRelectura,
      )
      return { ok: true, cantidades: cantidadesAntes, propia: nueva }
    }
  } catch (excepcion) {
    console.error("[marcarAsistencia] Excepción inesperada:", excepcion)
    return { ok: false, error: "DB_ERROR" }
  }
}
