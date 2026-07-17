"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { Resend } from "resend"

export type EmailFrequency = 'weekly' | 'biweekly' | 'monthly' | 'disabled'

export interface RadarSettingsData {
  email_frequency: EmailFrequency
  email_target: string
  categoryIds: string[]
  venueIds: string[]
  instagramAccountIds: string[]
}

/**
 * Obtiene la configuración actual del radar del usuario autenticado,
 * junto con sus intereses en categorías, locales e Instagram.
 */
export async function getRadarSettings(): Promise<RadarSettingsData | null> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (!user || authError) {
    return null
  }

  // 1. Obtener configuraciones básicas
  const { data: settings, error: settingsError } = await supabase
    .from("user_radar_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle()

  if (settingsError) {
    console.error("[getRadarSettings] Error obteniendo configuraciones básicas:", settingsError)
  }

  // 2. Obtener categorías seguidas
  const { data: categories, error: categoriesError } = await supabase
    .from("user_followed_categories")
    .select("category_id")
    .eq("user_id", user.id)

  if (categoriesError) {
    console.error("[getRadarSettings] Error obteniendo categorías seguidas:", categoriesError)
  }

  // 3. Obtener locales seguidos
  const { data: venues, error: venuesError } = await supabase
    .from("user_followed_venues")
    .select("venue_id")
    .eq("user_id", user.id)

  if (venuesError) {
    console.error("[getRadarSettings] Error obteniendo locales seguidos:", venuesError)
  }

  // 4. Obtener cuentas de Instagram seguidas
  const { data: instagramAccounts, error: igAccountsError } = await supabase
    .from("user_followed_instagram_accounts")
    .select("instagram_account_id")
    .eq("user_id", user.id)

  if (igAccountsError) {
    console.error("[getRadarSettings] Error obteniendo cuentas de Instagram seguidas:", igAccountsError)
  }

  return {
    email_frequency: (settings?.email_frequency || "weekly") as EmailFrequency,
    email_target: settings?.email_target || user.email || "",
    categoryIds: categories?.map(c => c.category_id) || [],
    venueIds: venues?.map(v => v.venue_id) || [],
    instagramAccountIds: instagramAccounts?.map(ig => ig.instagram_account_id) || []
  }
}

/**
 * Sincroniza de forma segura la configuración general y los intereses de
 * categorías, locales e Instagram del usuario.
 */
export async function updateRadarSettings(data: {
  email_frequency: EmailFrequency
  email_target: string
  categoryIds: string[]
  venueIds: string[]
  instagramAccountIds: string[]
}): Promise<{ success: boolean; error?: string; message?: string }> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (!user || authError) {
    return { success: false, error: "AUTH_REQUIRED", message: "Debes iniciar sesión para configurar tu radar." }
  }

  // 1. Guardar configuraciones generales
  const { error: settingsError } = await supabase
    .from("user_radar_settings")
    .upsert({
      user_id: user.id,
      email_frequency: data.email_frequency,
      email_target: data.email_target,
      updated_at: new Date().toISOString()
    })

  if (settingsError) {
    console.error("[updateRadarSettings] Error guardando configuraciones básicas:", settingsError)
    return { success: false, error: "DB_ERROR", message: "Error al guardar la configuración básica del radar." }
  }

  // 2. Sincronizar categorías (Junction)
  const { error: delCatError } = await supabase
    .from("user_followed_categories")
    .delete()
    .eq("user_id", user.id)

  if (delCatError) {
    console.error("[updateRadarSettings] Error eliminando categorías anteriores:", delCatError)
    return { success: false, error: "DB_ERROR", message: "Error al limpiar categorías anteriores." }
  }

  if (data.categoryIds.length > 0) {
    const insertCats = data.categoryIds.map(id => ({
      user_id: user.id,
      category_id: id
    }))
    const { error: insCatError } = await supabase
      .from("user_followed_categories")
      .insert(insertCats)

    if (insCatError) {
      console.error("[updateRadarSettings] Error insertando nuevas categorías:", insCatError)
      return { success: false, error: "DB_ERROR", message: "Error al guardar las categorías seleccionadas." }
    }
  }

  // 3. Sincronizar locales (Junction)
  const { error: delVenError } = await supabase
    .from("user_followed_venues")
    .delete()
    .eq("user_id", user.id)

  if (delVenError) {
    console.error("[updateRadarSettings] Error eliminando locales anteriores:", delVenError)
    return { success: false, error: "DB_ERROR", message: "Error al limpiar locales anteriores." }
  }

  if (data.venueIds.length > 0) {
    const insertVens = data.venueIds.map(id => ({
      user_id: user.id,
      venue_id: id
    }))
    const { error: insVenError } = await supabase
      .from("user_followed_venues")
      .insert(insertVens)

    if (insVenError) {
      console.error("[updateRadarSettings] Error insertando nuevos locales:", insVenError)
      return { success: false, error: "DB_ERROR", message: "Error al guardar los locales seleccionados." }
    }
  }

  // 4. Sincronizar cuentas de Instagram (Junction)
  const { error: delIgError } = await supabase
    .from("user_followed_instagram_accounts")
    .delete()
    .eq("user_id", user.id)

  if (delIgError) {
    console.error("[updateRadarSettings] Error eliminando cuentas de Instagram anteriores:", delIgError)
    return { success: false, error: "DB_ERROR", message: "Error al limpiar cuentas de Instagram anteriores." }
  }

  if (data.instagramAccountIds.length > 0) {
    const insertIgs = data.instagramAccountIds.map(id => ({
      user_id: user.id,
      instagram_account_id: id
    }))
    const { error: insIgError } = await supabase
      .from("user_followed_instagram_accounts")
      .insert(insertIgs)

    if (insIgError) {
      console.error("[updateRadarSettings] Error insertando nuevas cuentas de Instagram:", insIgError)
      return { success: false, error: "DB_ERROR", message: "Error al guardar los organizadores seleccionados." }
    }
  }

  revalidatePath("/radar")
  return { success: true }
}

function buildRadarEmailHtml(events: any[], emailTarget: string): string {
  const eventRows = events.map(event => {
    const dateObj = new Date(event.start_date)
    const formattedDate = dateObj.toLocaleDateString("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "long"
    })
    const formattedTime = dateObj.toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit"
    })

    const priceText = event.is_free ? "Gratis" : (event.price_min > 0 ? `$${event.price_min}` : "A confirmar")
    const detailUrl = `https://quepintasalta.com.ar/evento/${event.id}`

    return `
      <div style="margin-bottom: 20px; padding: 18px; border-radius: 12px; background-color: #121214; border: 1px solid #27272a; text-align: left;">
        ${event.image_url ? `
          <div style="margin-bottom: 12px; overflow: hidden; border-radius: 8px;">
            <img src="${event.image_url}" alt="${event.title}" style="width: 100%; max-height: 200px; object-fit: cover; display: block;" />
          </div>
        ` : ''}
        <h3 style="margin: 0 0 8px 0; color: #ffffff; font-size: 18px; font-weight: bold; font-family: Arial, sans-serif; line-height: 1.3;">${event.title}</h3>
        <p style="margin: 0 0 6px 0; color: #a1a1aa; font-size: 14px; font-family: Arial, sans-serif; line-height: 1.4;">📍 Lugar: <strong style="color: #e4e4e7;">${event.venue?.name || 'Por confirmar'}</strong></p>
        <p style="margin: 0 0 6px 0; color: #a1a1aa; font-size: 14px; font-family: Arial, sans-serif; line-height: 1.4;">📅 Fecha: <strong style="color: #e4e4e7;">${formattedDate} a las ${formattedTime}hs</strong></p>
        <p style="margin: 0 0 16px 0; color: #a1a1aa; font-size: 14px; font-family: Arial, sans-serif; line-height: 1.4;">💵 Entrada: <strong style="color: #22c55e;">${priceText}</strong></p>
        <div style="margin-top: 14px;">
          <a href="${detailUrl}" target="_blank" style="display: inline-block; background-color: #AA1B1B; color: #ffffff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 13px; font-family: Arial, sans-serif; text-align: center;">Ver detalles</a>
        </div>
      </div>
    `
  }).join('')

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Mi Radar Salteño</title>
      </head>
      <body style="font-family: Arial, sans-serif; background-color: #09090b; color: #e4e4e7; margin: 0; padding: 20px;">
        <div style="max-width: 550px; margin: 0 auto; background-color: #09090b; border: 1px solid #1f1f23; border-radius: 16px; padding: 24px; text-align: center;">
          <div style="margin-bottom: 24px; border-bottom: 1px solid #27272a; padding-bottom: 16px;">
            <h1 style="color: #AA1B1B; margin: 0 0 6px 0; font-size: 28px; font-weight: 800; font-family: Arial, sans-serif; letter-spacing: -0.5px;">Qué Pinta Salta</h1>
            <p style="color: #a1a1aa; margin: 0; font-size: 14px; font-weight: 500; font-family: Arial, sans-serif;">📡 Mi Radar Salteño: Tu agenda personalizada</p>
          </div>
          
          <div style="text-align: left; margin-bottom: 24px;">
            <p style="font-size: 16px; line-height: 1.5; color: #e4e4e7; font-family: Arial, sans-serif; margin-top: 0;">¡Hola!</p>
            <p style="font-size: 14px; line-height: 1.5; color: #a1a1aa; font-family: Arial, sans-serif;">
              Encontramos eventos en Salta Capital que coinciden con los locales o categorías que sigues en tu radar. ¡Aquí tienes tu agenda personalizada para este fin de semana!
            </p>
          </div>
          
          <div>
            ${eventRows}
          </div>
          
          <div style="margin-top: 32px; border-top: 1px solid #27272a; padding-top: 24px;">
            <p style="font-size: 11px; color: #71717a; margin: 0 0 8px 0; font-family: Arial, sans-serif; line-height: 1.4;">Recibiste este correo porque configuraste tu radar en quepintasalta.com.ar.</p>
            <a href="https://quepintasalta.com.ar/radar" target="_blank" style="font-size: 11px; color: #AA1B1B; text-decoration: underline; font-weight: 600; font-family: Arial, sans-serif;">Modificar preferencias</a>
          </div>
        </div>
      </body>
    </html>
  `
}

/**
 * Server Action para probar el envío de correos del radar del usuario actual (Sandbox).
 */
export async function triggerTestRadarEmail(): Promise<{ success: boolean; message?: string; count?: number }> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (!user || authError) {
    return { success: false, message: "Debes iniciar sesión para realizar la prueba." }
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error("[triggerTestRadarEmail] RESEND_API_KEY no configurada.")
    return { success: false, message: "La variable de entorno RESEND_API_KEY no está configurada en el servidor." }
  }

  const resend = new Resend(apiKey)

  // 1. Obtener la configuración de radar del usuario
  const settings = await getRadarSettings()
  if (!settings) {
    return { success: false, message: "No se encontraron configuraciones de radar para tu usuario." }
  }

  const { categoryIds, venueIds, instagramAccountIds, email_target } = settings

  if (categoryIds.length === 0 && venueIds.length === 0 && instagramAccountIds.length === 0) {
    return { success: false, message: "Debes seguir al menos una categoría, un local o una cuenta de Instagram para recibir novedades." }
  }

  const nowIso = new Date().toISOString()
  let events: any[] = []

  // 2. Buscar eventos que coincidan (Categorías o Locales)
  if (categoryIds.length > 0 || venueIds.length > 0) {
    let query = supabase
      .from("events")
      .select("*, venue:venues(*), category:categories(*)")
      .eq("status", "PUBLISHED")
      .gte("start_date", nowIso)
      .order("start_date", { ascending: true })

    if (categoryIds.length > 0 && venueIds.length > 0) {
      query = query.or(`category_id.in.(${categoryIds.join(',')}),venue_id.in.(${venueIds.join(',')})`)
    } else if (categoryIds.length > 0) {
      query = query.in("category_id", categoryIds)
    } else {
      query = query.in("venue_id", venueIds)
    }

    const { data: matchedEvents, error: eventsError } = await query.limit(8)
    if (eventsError) {
      console.error("[triggerTestRadarEmail] Error obteniendo eventos:", eventsError)
    } else if (matchedEvents) {
      events = [...matchedEvents]
    }
  }

  // 3. Buscar flyers de cuentas de Instagram seguidas
  if (instagramAccountIds.length > 0) {
    const { data: flyers, error: flyersError } = await supabase
      .from("instagram_flyers")
      .select("*, account:instagram_accounts(*)")
      .eq("status", "ACTIVE")
      .in("account_id", instagramAccountIds)
      .order("published_at", { ascending: false })
      .limit(5)

    if (flyersError) {
      console.error("[triggerTestRadarEmail] Error obteniendo flyers:", flyersError)
    } else if (flyers) {
      const mappedFlyers = flyers.map(f => ({
        id: f.ig_post_id,
        title: f.caption ? (f.caption.length > 55 ? f.caption.substring(0, 55) + "..." : f.caption) : `Flyer de @${f.account?.username}`,
        start_date: f.published_at,
        is_free: false,
        price_min: 0,
        isInstagramFlyer: true,
        flyerId: f.id,
        image_url: f.storage_image_url || f.original_image_url,
        venue: { name: f.account?.display_name || `@${f.account?.username}` }
      }))
      events = [...events, ...mappedFlyers]
    }
  }

  if (events.length === 0) {
    return { success: false, message: "No hay eventos ni flyers próximos publicados que coincidan con tu Radar." }
  }

  // 4. Enviar correo (Enviando a email_target, que es el del usuario autenticado)
  try {
    const htmlContent = buildRadarEmailHtml(events, email_target)

    const senderEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev"
    
    const { error: sendError } = await resend.emails.send({
      from: `Qué Pinta Salta <${senderEmail}>`,
      to: user.email!, // Forzamos enviar únicamente al email del usuario autenticado (sandbox mode)
      subject: '📡 [Prueba] ¡Tu Radar Salteño está activo!',
      html: htmlContent,
    })

    if (sendError) {
      console.error("[triggerTestRadarEmail] Error en el envío de Resend:", sendError)
      return { success: false, message: `Error de Resend: ${sendError.message}` }
    }

    return { success: true, message: `Correo de prueba enviado correctamente a ${user.email}`, count: events.length }
  } catch (err: any) {
    console.error("[triggerTestRadarEmail] Excepción en envío:", err)
    return { success: false, message: err?.message || "Ocurrió una excepción inesperada al enviar el correo." }
  }
}
