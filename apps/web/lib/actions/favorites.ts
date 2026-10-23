"use server"

// `toggleFavorite` (R47, tarea 47-b, QPS-197): además de event/cinema/flyer
// de siempre, ahora tiene que respetar que "✓ Voy" está CONTENIDO en
// "♥ Guardar" (ver `lib/asistencia.ts`): sacar el ♥ de un evento que tenía
// Voy marcado también tiene que sacar el Voy, porque un Voy sin Guardado es
// el único estado que el modelo prohíbe (`EstadoGuardarVoy` en
// `@qps/core/asistencia`).
//
// Por eso, al quitar un favorito de tipo 'event', el orden es:
//   1) delete de la fila propia en event_attendance (con `.select("kind")`
//      para saber si había Voy)
//   2) delete del favorito
//
// Por qué ESE orden y no al revés: si se borrara el favorito primero y
// después fallara el delete de la asistencia, quedaría un Voy sin Guardado
// — exactamente el estado prohibido. Borrando primero event_attendance, si
// ese paso falla no se toca el favorito (sigue Guardado y sigue el Voy); si
// el paso falla DESPUÉS de haber borrado la asistencia, en el peor caso
// queda "Guardado sin Voy", que es el único estado intermedio permitido.
//
// QPS-195 (R56, tarea 56-a): al AGREGAR un favorito de tipo 'event' (nunca
// al quitarlo), se chequea con `estadoPermiteAgregar`
// (`lib/asistencia-lectura.ts`) que el evento siga existiendo y publicado
// antes del insert — mismo chequeo que usa `marcarAsistencia` en
// `lib/asistencia.ts`. 'cinema' y 'flyer' no pasan por este chequeo: no
// tienen un estado de publicación que mirar.
import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type { TablesInsert } from "@qps/db"
import { estadoPermiteAgregar } from "@/lib/asistencia-lectura"

export type FavoriteType = 'event' | 'cinema' | 'flyer'

const TIPOS_FAVORITO: readonly FavoriteType[] = ['event', 'cinema', 'flyer']

function esFavoriteType(valor: unknown): valor is FavoriteType {
  return typeof valor === 'string' && (TIPOS_FAVORITO as readonly string[]).includes(valor)
}

/**
 * Agrega o quita un favorito según su estado actual (Toggle).
 * Maneja de forma segura las referencias a eventos, películas y flyers,
 * limpiando posibles prefijos agregados por la UI.
 *
 * Al quitar un favorito de tipo 'event' que tenía "✓ Voy" marcado, también
 * saca el Voy (ver el porqué del orden en el comentario de cabecera del
 * archivo). El resultado trae `voyQuitado: true` solo si efectivamente
 * había una fila con `kind === 'voy'`: una fila vieja `me_interesa` se
 * borra igual, pero no cuenta (el aviso habla de "ya no figurás como que
 * vas", que no aplica a "me interesa").
 *
 * Al AGREGAR un favorito de tipo 'event' (la rama que no existía antes),
 * se chequea primero que el evento siga PUBLISHED (QPS-195): si no, devuelve
 * `INVALID` sin insertar nada, con un mensaje que no distingue un borrador
 * de un id inexistente.
 */
export async function toggleFavorite(
  itemId: string,
  type: FavoriteType
): Promise<{ success: boolean; favorited?: boolean; voyQuitado?: boolean; error?: string; message?: string }> {
  if (!esFavoriteType(type)) {
    return { success: false, error: "INVALID", message: "Tipo de favorito no válido" }
  }

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (!user || authError) {
    return { success: false, error: "AUTH_REQUIRED", message: "Debes iniciar sesión para guardar favoritos" }
  }

  // Sanitizar prefijos comunes del frontend
  let cleanId = itemId
  if (itemId.startsWith("ig-")) cleanId = itemId.substring(3)
  if (itemId.startsWith("movie-")) cleanId = itemId.substring(6)

  // Consultar si ya existe el favorito
  let query = supabase.from("user_favorites").select("id").eq("user_id", user.id)

  if (type === 'event') {
    query = query.eq("event_id", cleanId)
  } else if (type === 'flyer') {
    query = query.eq("instagram_flyer_id", cleanId)
  } else {
    query = query.eq("cinema_movie_id", cleanId)
  }

  const { data: existing, error: selectError } = await query.maybeSingle()

  if (selectError) {
    console.error("[toggleFavorite] Error al consultar favorito:", selectError)
    return { success: false, error: "DB_ERROR", message: "Error al verificar el estado del favorito" }
  }

  if (existing) {
    let voyQuitado = false

    if (type === 'event') {
      // Primero la asistencia (ver el porqué del orden en la cabecera del
      // archivo). La RLS del dueño ya acota esta consulta a la fila propia;
      // el `user_id` va igual, como defensa en profundidad (revisor del #76).
      const { data: filaBorrada, error: deleteAsistenciaError } = await supabase
        .from("event_attendance")
        .delete()
        .eq("event_id", cleanId)
        .eq("user_id", user.id)
        .select("kind")

      if (deleteAsistenciaError) {
        console.error("[toggleFavorite] Error al sacar la asistencia antes de quitar el favorito:", deleteAsistenciaError)
        return { success: false, error: "DB_ERROR", message: "Error al quitar de favoritos" }
      }

      voyQuitado = (filaBorrada ?? []).some((fila) => fila.kind === "voy")
    }

    // Eliminar favorito
    const { error: deleteError } = await supabase
      .from("user_favorites")
      .delete()
      .eq("id", existing.id)

    if (deleteError) {
      console.error("[toggleFavorite] Error al eliminar favorito:", deleteError)
      return { success: false, error: "DB_ERROR", voyQuitado, message: "Error al quitar de favoritos" }
    }

    revalidatePath("/favoritos")
    return { success: true, favorited: false, voyQuitado }
  } else {
    // QPS-195 (R56, tarea 56-a): solo al AGREGAR un evento (nunca al
    // quitarlo, ni para 'cinema'/'flyer', que no tienen un estado que
    // mirar), se chequea que el evento siga existiendo y publicado antes
    // del insert. Con `cleanId` (ya saneado de prefijos como "ig-"/"movie-"
    // más arriba), nunca con `itemId`.
    if (type === 'event') {
      const estado = await estadoPermiteAgregar(supabase, cleanId)
      if (estado === 'no') {
        return { success: false, error: "INVALID", message: "Ese evento ya no está disponible" }
      }
      if (estado === 'error') {
        console.error("[toggleFavorite] Error al chequear el estado del evento antes de guardar")
        return { success: false, error: "DB_ERROR", message: "Error al guardar en favoritos" }
      }
    }

    // Insertar favorito
    const insertData: TablesInsert<'user_favorites'> = {
      user_id: user.id
    }

    if (type === 'event') {
      insertData.event_id = cleanId
    } else if (type === 'flyer') {
      insertData.instagram_flyer_id = cleanId
    } else {
      insertData.cinema_movie_id = cleanId
    }

    const { error: insertError } = await supabase
      .from("user_favorites")
      .insert(insertData)

    if (insertError) {
      console.error("[toggleFavorite] Error al insertar favorito:", insertError)
      return { success: false, error: "DB_ERROR", message: "Error al guardar en favoritos" }
    }

    revalidatePath("/favoritos")
    return { success: true, favorited: true }
  }
}

/**
 * Obtiene la lista de favoritos del usuario autenticado en formato plano.
 * Los IDs de películas y flyers de Instagram vienen con los prefijos
 * correspondientes ('movie-' y 'ig-') para facilitar el chequeo
 * directo en el frontend mediante `favoritesList.includes(itemId)`.
 */
export async function getUserFavorites(): Promise<string[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from("user_favorites")
    .select("event_id, instagram_flyer_id, cinema_movie_id")
    .eq("user_id", user.id)

  if (error) {
    console.error("[getUserFavorites] Error obteniendo favoritos:", error)
    return []
  }

  const favoritesList: string[] = []
  data.forEach((fav) => {
    if (fav.event_id) {
      favoritesList.push(fav.event_id)
    } else if (fav.instagram_flyer_id) {
      favoritesList.push(`ig-${fav.instagram_flyer_id}`)
    } else if (fav.cinema_movie_id) {
      favoritesList.push(`movie-${fav.cinema_movie_id}`)
    }
  })

  return favoritesList
}
