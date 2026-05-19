"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim()
}

export async function createEvent(formData: FormData) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Debes iniciar sesión para crear un evento" }
  }

  const title = formData.get("title") as string
  const description = formData.get("description") as string
  const shortDescription = formData.get("shortDescription") as string
  const categoryId = formData.get("categoryId") as string
  const venueId = formData.get("venueId") as string
  const startDate = formData.get("startDate") as string
  const endDate = formData.get("endDate") as string
  const priceMin = parseFloat(formData.get("priceMin") as string) || 0
  const priceMax = parseFloat(formData.get("priceMax") as string) || null
  const isFree = formData.get("isFree") === "true"
  const ticketUrl = formData.get("ticketUrl") as string
  const noiseLevel = parseInt(formData.get("noiseLevel") as string) || 3
  const ageRestriction = parseInt(formData.get("ageRestriction") as string) || 0
  const imageUrl = formData.get("imageUrl") as string

  const slug = generateSlug(title) + "-" + Date.now().toString(36)

  const { data, error } = await supabase
    .from("events")
    .insert({
      title,
      slug,
      description,
      short_description: shortDescription,
      category_id: categoryId,
      venue_id: venueId || null,
      start_date: startDate,
      end_date: endDate || null,
      price_min: isFree ? 0 : priceMin,
      price_max: isFree ? null : priceMax,
      is_free: isFree,
      ticket_url: ticketUrl || null,
      noise_level: noiseLevel,
      age_restriction: ageRestriction,
      image_url: imageUrl || null,
      status: "PUBLISHED",
      created_by: user.id,
    })
    .select()
    .single()

  if (error) {
    console.error("Error creating event:", error)
    return { error: "Error al crear el evento: " + error.message }
  }

  revalidatePath("/")
  redirect(`/evento/${data.id}`)
}

export async function uploadFlyer(formData: FormData) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Debes iniciar sesión para subir imágenes" }
  }

  const file = formData.get("file") as File
  if (!file || file.size === 0) {
    return { error: "No se proporcionó ningún archivo" }
  }

  const fileExt = file.name.split(".").pop()
  const fileName = `${user.id}/${Date.now()}.${fileExt}`

  const { data, error } = await supabase.storage
    .from("flyers")
    .upload(fileName, file, {
      cacheControl: "3600",
      upsert: false,
    })

  if (error) {
    console.error("Error uploading file:", error)
    return { error: "Error al subir la imagen: " + error.message }
  }

  const { data: urlData } = supabase.storage
    .from("flyers")
    .getPublicUrl(data.path)

  return { url: urlData.publicUrl }
}

export async function toggleFavorite(eventId: string) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Debes iniciar sesión para guardar favoritos" }
  }

  // Check if already favorited
  const { data: existing } = await supabase
    .from("favorites")
    .select("id")
    .eq("user_id", user.id)
    .eq("event_id", eventId)
    .single()

  if (existing) {
    // Remove favorite
    const { error } = await supabase
      .from("favorites")
      .delete()
      .eq("id", existing.id)

    if (error) {
      return { error: "Error al quitar de favoritos" }
    }
    return { favorited: false }
  } else {
    // Add favorite
    const { error } = await supabase
      .from("favorites")
      .insert({
        user_id: user.id,
        event_id: eventId,
      })

    if (error) {
      return { error: "Error al agregar a favoritos" }
    }
    return { favorited: true }
  }
}

export async function getUserFavorites() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return []
  }

  const { data } = await supabase
    .from("favorites")
    .select("event_id")
    .eq("user_id", user.id)

  return data?.map(f => f.event_id) || []
}
