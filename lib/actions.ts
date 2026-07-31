"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

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
  const ageRestriction = parseInt(formData.get("ageRestriction") as string) || 0
  const imageUrl = formData.get("imageUrl") as string

  const slug = generateSlug(title) + "-" + Date.now().toString(36)

  // Obtener rol del usuario
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  
  const isAdmin = profile?.role === "ADMIN"
  const isCollaborator = profile?.role === "COLLABORATOR"
  const status = isAdmin ? "PUBLISHED" : isCollaborator ? "PENDING" : "DRAFT"

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
      age_restriction: ageRestriction,
      image_url: imageUrl || null,
      status,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) {
    console.error("Error creating event:", error)
    return { error: "Error al crear el evento: " + error.message }
  }

  // Notificar por email al administrador si es un evento pendiente de revisión
  if (status === "PENDING" || status === "DRAFT") {
    try {
      const adminEmail = process.env.ADMIN_EMAIL || "tu-email-de-notificacion@gmail.com"
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
      
      await resend.emails.send({
        from: "Que Pinta Salta <noreply@resend.dev>",
        to: adminEmail,
        subject: `Nuevo evento pendiente de moderación: ${title}`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 10px;">
            <h2 style="color: #ea580c; border-bottom: 2px solid #ea580c; padding-bottom: 10px; margin-top: 0;">¡Nuevo evento para moderar!</h2>
            <p>Se ha subido un nuevo evento en estado de revisión por el usuario: <strong>${user.email}</strong></p>
            <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ea580c;">
              <p style="margin: 0 0 10px 0;"><strong>Título:</strong> ${title}</p>
              <p style="margin: 0 0 10px 0;"><strong>Descripción corta:</strong> ${shortDescription || "Sin descripción corta"}</p>
              <p style="margin: 0;"><strong>Fecha de inicio:</strong> ${startDate}</p>
            </div>
            <p style="margin-bottom: 20px;">Por favor, ingresá al Panel de Administración para verificar y publicar el evento.</p>
            <div style="text-align: center;">
              <a href="${siteUrl}/admin" style="background-color: #ea580c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Ir al Panel Admin</a>
            </div>
          </div>
        `
      })
    } catch (emailError) {
      console.error("Error al enviar notificación de email con Resend:", emailError)
    }
  }

  if (isAdmin) {
    revalidatePath("/")
    redirect(`/evento/${data.id}`)
  } else {
    revalidatePath("/perfil")
    revalidatePath("/")
    redirect("/perfil")
  }
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
