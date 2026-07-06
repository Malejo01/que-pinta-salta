"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export type FavoriteType = 'event' | 'cinema' | 'flyer'

/**
 * Agrega o quita un favorito según su estado actual (Toggle).
 * Maneja de forma segura las referencias a eventos, películas y flyers,
 * limpiando posibles prefijos agregados por la UI.
 */
export async function toggleFavorite(
  itemId: string,
  type: FavoriteType
): Promise<{ success: boolean; favorited?: boolean; error?: string; message?: string }> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (!user || authError) {
    return { error: "AUTH_REQUIRED", message: "Debes iniciar sesión para guardar favoritos" }
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
    return { error: "DB_ERROR", message: "Error al verificar el estado del favorito" }
  }

  if (existing) {
    // Eliminar favorito
    const { error: deleteError } = await supabase
      .from("user_favorites")
      .delete()
      .eq("id", existing.id)

    if (deleteError) {
      console.error("[toggleFavorite] Error al eliminar favorito:", deleteError)
      return { error: "DB_ERROR", message: "Error al quitar de favoritos" }
    }

    revalidatePath("/favoritos")
    return { success: true, favorited: false }
  } else {
    // Insertar favorito
    const insertData: any = {
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
      return { error: "DB_ERROR", message: "Error al guardar en favoritos" }
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
