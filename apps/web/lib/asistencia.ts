"use server"

// El botón "✓ Voy" de la ficha de un evento (R38, tareas 38-a/38-b;
// reescrito en la R47, tarea 47-b, QPS-197). El modelo cambió de dos marcas
// ("Voy" / "Me interesa") a un solo tipo de asistencia ("Voy", social,
// contador público desde 3) más dos acciones que viven en otros archivos:
// Guardar (♥, privado, en `lib/actions/favorites.ts`) y Seguir (en
// `lib/actions/radar.ts`). "Me interesa" desapareció: ningún camino de este
// archivo lo escribe ni lo lee.
//
// Por qué marcar Voy también escribe acá: en el modelo nuevo, Voy está
// CONTENIDO en Guardados (marcar Voy también guarda; sacar el ♥ de un
// evento con Voy también saca el Voy, pero ESO lo maneja
// `lib/actions/favorites.ts`, no este archivo). `marcarAsistencia` escribe
// las dos cosas cuando hace falta: no hay una transacción que las una (dos
// escrituras separadas contra Postgres), así que el ORDEN importa. La tabla
// de pasos sale de `@qps/core/asistencia` (`pasosDeTocar`/`estadoTrasPasos`):
// no se reescribe acá.
//
//   Marcar Voy:  1) insert en user_favorites (23505 = ya estaba = éxito)
//                2) upsert en event_attendance con kind: "voy"
//   Sacar Voy:   1) delete de la fila propia en event_attendance
//
// Por qué ese orden en "Marcar Voy": si se escribiera primero
// event_attendance y después fallara el insert del favorito, quedaría un
// Voy sin Guardado — el único estado que el modelo prohíbe
// (`EstadoGuardarVoy`: la invariante es `voy ⇒ guardado`). Pedir "guardar"
// primero es seguro aunque ya estuviera guardado (el `23505` de la unique
// `(user_id, event_id)` cuenta como éxito), así que no hay costo en pedirlo
// siempre, sin confiar en lo que la pantalla cree saber del ♥.
//
// Si un paso falla, no se sigue con los que faltan: se devuelve `DB_ERROR`
// con el `guardado` que corresponde al PREFIJO de pasos que sí se
// ejecutaron (`estadoTrasPasos`), para que la pantalla pueda mostrar el
// estado real (por ejemplo, "quedó guardado pero no se pudo marcar Voy").
//
// QPS-195 (R56, tarea 56-a): antes de la PRIMERA escritura que AGREGUE una
// marca (`pasosDeTocar` devolvió `guardar` y/o `marcar-voy`), se chequea con
// `estadoPermiteAgregar` (de `lib/asistencia-lectura.ts`) que el evento siga
// existiendo y publicado — nadie puede terminar "yendo" a un evento que se
// borró o se canceló entre que cargó la ficha y tocó el botón. `quitar-voy`
// NO pasa por ese chequeo: nadie puede quedar con una marca que no puede
// sacar, sea cual sea el estado actual del evento.
//
// Qué lee: `lib/asistencia-lectura.ts` (`leerAsistencia`), compartido con la
// lectura que hacen directo la ficha y el modal interceptado. Este archivo
// solo arma el cliente y el usuario de la sesión antes de llamarla.
//
// Invariante de `marcarAsistencia` (bloqueante 1 de la R38, sigue
// vigente): si el ÚLTIMO paso de escritura salió bien, la función NUNCA
// devuelve `ok: false`. La relectura de cantidades de DESPUÉS de escribir
// tiene su propio `try/catch` y cae a las cantidades leídas ANTES de
// escribir si falla: un número desactualizado por un instante es mucho
// menos grave que decirle a la persona que su acción falló cuando en
// realidad se guardó.
//
// Qué NO vive acá: `debenMostrarseBotonesAsistencia` (solo eventos
// PUBLISHED) está en `lib/asistencia-visibilidad.ts`. Este archivo es un
// módulo `"use server"`: TODOS los exports de valor tienen que ser
// funciones `async` (`export async function`), nunca un `export const` ni
// un `export function` común — Next hace fallar el build aunque el
// typecheck y los tests pasen (le pasó al PR #62). Los tipos sí pueden
// exportarse con `export type` / `export interface` / `export type { ... }`.

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import {
  leerAsistencia,
  estadoPermiteAgregar,
  type CantidadesAsistencia,
  type ResultadoAsistencia,
} from "@/lib/asistencia-lectura"
import {
  esTipoAsistencia,
  estadoTrasPasos,
  pasosDeTocar,
  type EstadoGuardarVoy,
  type PasoEscritura,
  type TipoAsistencia,
} from "@qps/core/asistencia"

export type { CantidadesAsistencia, ResultadoAsistencia }

export type ResultadoMarcarAsistencia =
  | { ok: true; cantidades: CantidadesAsistencia; propia: TipoAsistencia | null; guardado: boolean }
  | { ok: false; error: "AUTH_REQUIRED" | "INVALID" | "DB_ERROR"; guardado?: boolean }

/**
 * Envoltorio de `leerAsistencia` (`lib/asistencia-lectura.ts`) para los
 * componentes cliente, que solo pueden llamar a una server action (nunca a
 * una función común): crea el cliente, resuelve el usuario de la sesión con
 * `auth.getUser()` y delega la lectura. Mismo contrato que siempre, incluido
 * el `try/catch` que devuelve `{ ok: false }` ante una excepción al crear el
 * cliente o al autenticar.
 *
 * La ficha (`app/evento/[id]/page.tsx`) y el modal interceptado
 * (`app/@modal/(.)evento/[id]/page.tsx`) NO pasan por acá: ya tienen su
 * propio cliente y su propio `auth.getUser()` (para el resto de la página),
 * así que llaman a `leerAsistencia` directo para no crear un segundo
 * cliente ni volver a autenticar.
 */
export async function obtenerAsistencia(eventId: string): Promise<ResultadoAsistencia> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return await leerAsistencia(supabase, user?.id ?? null, eventId)
  } catch (excepcion) {
    console.error("[obtenerAsistencia] Excepción inesperada:", excepcion)
    return { ok: false }
  }
}

/**
 * Marca o desmarca "Voy" para `eventId`. `tipo` tiene que ser `'voy'`
 * (único valor válido): cualquier otra cosa da `INVALID` antes de crear el
 * cliente de Supabase y antes de autenticar. Sin usuario, `AUTH_REQUIRED` y
 * no se escribe nada.
 *
 * Con usuario, lee de la base (nunca del cliente) la marca propia, las
 * cantidades de antes de escribir (respaldo si la relectura de después
 * falla) y si el evento ya estaba guardado, y deja que `pasosDeTocar` (de
 * core) decida qué escrituras hacer y en qué orden. Si esos pasos AGREGAN
 * una marca (`guardar` y/o `marcar-voy`), antes del primer paso se chequea
 * con `estadoPermiteAgregar` que el evento siga existiendo y publicado
 * (QPS-195): `'no'` da `INVALID`, `'error'` da `DB_ERROR`, y en los dos
 * casos no se escribe nada. `quitar-voy` no pasa por ese chequeo. Cada paso
 * de escritura se ejecuta uno a uno: si alguno falla, no se sigue con los
 * que faltan.
 *
 * El `guardado` que se lee ANTES de escribir hace falta para el caso en que
 * el PRIMER paso falle (el prefijo de pasos ya hechos queda vacío):
 * `estadoTrasPasos` devuelve ahí el estado sin tocar, y ese estado tiene
 * que salir de un dato real, no de un supuesto — es el caso de "falla el
 * insert del favorito" (al marcar Voy) y el de "falla el delete de
 * event_attendance" (al sacar el Voy, donde el favorito ni se toca). Un
 * error en esta lectura no es crítico: se registra y se asume `false` (el
 * peor caso es ofrecer guardar de nuevo algo que ya estaba guardado, y eso
 * es idempotente).
 *
 * El `user_id` que se escribe siempre sale de `auth.getUser()`, nunca de un
 * argumento de la función.
 */
export async function marcarAsistencia(eventId: string, tipo: unknown): Promise<ResultadoMarcarAsistencia> {
  if (!esTipoAsistencia(tipo)) {
    return { ok: false, error: "INVALID" }
  }

  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (!user || authError) {
      return { ok: false, error: "AUTH_REQUIRED" }
    }

    // Las tres lecturas de ANTES de escribir, en paralelo: todavía no se
    // escribió nada, así que acá sigue siendo seguro devolver un error si
    // la lectura crítica (la marca propia) falla.
    const [respuestaPropia, respuestaCantidadesAntes, respuestaGuardado] = await Promise.all([
      supabase.from("event_attendance").select("kind").eq("event_id", eventId).maybeSingle(),
      supabase.from("event_attendance_counts").select("voy").eq("event_id", eventId).maybeSingle(),
      supabase.from("user_favorites").select("id").eq("event_id", eventId).eq("user_id", user.id).maybeSingle(),
    ])

    const { data: filaPropia, error: errorPropia } = respuestaPropia
    if (errorPropia) {
      console.error("[marcarAsistencia] Error al leer la marca actual:", errorPropia)
      return { ok: false, error: "DB_ERROR" }
    }

    if (respuestaCantidadesAntes.error) {
      // No es crítico para decidir qué escribir: si esto falla, simplemente
      // no hay respaldo si la relectura de después también falla (ver el
      // catch interno más abajo).
      console.error("[marcarAsistencia] Error al leer cantidades antes de escribir:", respuestaCantidadesAntes.error)
    }
    const cantidadesAntes: CantidadesAsistencia = { voy: respuestaCantidadesAntes.data?.voy ?? 0 }

    let guardadoAntes = false
    if (respuestaGuardado.error) {
      console.error("[marcarAsistencia] Error al leer si ya estaba guardado (se asume false):", respuestaGuardado.error)
    } else {
      guardadoAntes = respuestaGuardado.data !== null
    }

    const propiaAntes: TipoAsistencia | null = esTipoAsistencia(filaPropia?.kind) ? filaPropia.kind : null
    const estadoAntes: EstadoGuardarVoy = { guardado: guardadoAntes, voy: propiaAntes === "voy" }
    const pasos = pasosDeTocar("voy", estadoAntes)

    // QPS-195: solo los pasos que AGREGAN pasan por el chequeo. Antes del
    // primer paso de escritura, no después: si se escribiera primero y se
    // chequeara después, un evento que se cancela a mitad de camino podría
    // quedar con una marca agregada igual.
    if (pasos.includes("guardar") || pasos.includes("marcar-voy")) {
      const estadoEvento = await estadoPermiteAgregar(supabase, eventId)
      if (estadoEvento === "no") {
        return { ok: false, error: "INVALID" }
      }
      if (estadoEvento === "error") {
        return { ok: false, error: "DB_ERROR" }
      }
    }

    const pasosHechos: PasoEscritura[] = []

    for (const paso of pasos) {
      if (paso === "guardar") {
        const { error } = await supabase.from("user_favorites").insert({ user_id: user.id, event_id: eventId })
        // Un 23505 (clave duplicada de la unique `(user_id, event_id)`)
        // significa que ya estaba guardado: éxito, no error.
        if (error && error.code !== "23505") {
          console.error("[marcarAsistencia] Error al guardar el favorito:", error)
          return { ok: false, error: "DB_ERROR", guardado: estadoTrasPasos(estadoAntes, pasosHechos).guardado }
        }
      } else if (paso === "marcar-voy") {
        const { error } = await supabase
          .from("event_attendance")
          .upsert({ user_id: user.id, event_id: eventId, kind: "voy" }, { onConflict: "user_id,event_id" })
        if (error) {
          console.error("[marcarAsistencia] Error al marcar voy:", error)
          return { ok: false, error: "DB_ERROR", guardado: estadoTrasPasos(estadoAntes, pasosHechos).guardado }
        }
      } else if (paso === "quitar-voy") {
        // La RLS ("eliminación del dueño") ya acota esto a la fila propia.
        const { error } = await supabase.from("event_attendance").delete().eq("event_id", eventId)
        if (error) {
          console.error("[marcarAsistencia] Error al sacar voy:", error)
          return { ok: false, error: "DB_ERROR", guardado: estadoTrasPasos(estadoAntes, pasosHechos).guardado }
        }
      }
      pasosHechos.push(paso)
    }

    const estadoFinal = estadoTrasPasos(estadoAntes, pasosHechos)
    const propiaFinal: TipoAsistencia | null = estadoFinal.voy ? "voy" : null

    // Cualquiera de los tres pasos cambia lo que muestra "Mis eventos"
    // (47-d convierte /favoritos en esa página, con dos secciones: Voy y
    // Guardados). "quitar-voy" no toca el favorito, pero muda el evento de
    // la sección Voy a la de Guardados: el contenido de la página cambia
    // igual. Por eso se revalida apenas se ejecutó algún paso, no solo
    // cuando se ejecutó "guardar".
    if (pasosHechos.length) {
      revalidatePath("/favoritos")
    }

    // A partir de aquí TODOS los pasos planeados salieron bien: esta
    // función no puede devolver `ok: false` por ningún motivo (bloqueante
    // 1, R38). El `try/catch` es propio de este bloque (no del de la
    // función entera) para que ni siquiera una excepción inesperada en la
    // relectura escape como un error: si falla, se cae a las cantidades
    // leídas antes de escribir.
    try {
      const { data: filaCantidades, error: errorCantidades } = await supabase
        .from("event_attendance_counts")
        .select("voy")
        .eq("event_id", eventId)
        .maybeSingle()

      if (errorCantidades) {
        console.error(
          "[marcarAsistencia] Error al releer cantidades después de escribir (se usan las de antes de escribir):",
          errorCantidades,
        )
        return { ok: true, cantidades: cantidadesAntes, propia: propiaFinal, guardado: estadoFinal.guardado }
      }

      const cantidades: CantidadesAsistencia = { voy: filaCantidades?.voy ?? 0 }
      return { ok: true, cantidades, propia: propiaFinal, guardado: estadoFinal.guardado }
    } catch (excepcionRelectura) {
      console.error(
        "[marcarAsistencia] Excepción al releer cantidades después de escribir (se usan las de antes de escribir):",
        excepcionRelectura,
      )
      return { ok: true, cantidades: cantidadesAntes, propia: propiaFinal, guardado: estadoFinal.guardado }
    }
  } catch (excepcion) {
    console.error("[marcarAsistencia] Excepción inesperada:", excepcion)
    return { ok: false, error: "DB_ERROR" }
  }
}
