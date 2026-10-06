"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { Resend } from "resend"
import { buildRadarEmail, radarEnvLabel } from "@/lib/radar/email"

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

/**
 * Server Action para probar el envío de correos del radar del usuario actual (Sandbox).
 */
export async function triggerTestRadarEmail(): Promise<{ success: boolean; message?: string; count?: number }> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (!user || authError) {
    return { success: false, message: "Debes iniciar sesión para realizar la prueba." }
  }

  // Solo administradores: verificación en el servidor, antes de leer settings o llamar a Resend.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "ADMIN") {
    return { success: false, message: "Solo administradores." }
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

  const { categoryIds, venueIds, instagramAccountIds } = settings

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

  // 4. Enviar correo (solo al email del usuario autenticado)
  try {
    const label = radarEnvLabel()
    const { message, hasUnsubscribe } = buildRadarEmail({
      userId: user.id,
      to: user.email!, // Forzamos enviar únicamente al email del usuario autenticado (sandbox mode)
      subject: `📡 [Prueba · ${label}] ¡Tu Radar Salteño está activo!`,
      events,
      previewBase: true,
    })

    if (!hasUnsubscribe) {
      console.warn('[triggerTestRadarEmail] RADAR_UNSUBSCRIBE_SECRET no configurada: el correo sale sin link ni cabeceras de baja.')
    }

    const { error: sendError } = await resend.emails.send(message)

    if (sendError) {
      console.error("[triggerTestRadarEmail] Error en el envío de Resend:", sendError.message)
      return { success: false, message: `Error de Resend: ${sendError.message}` }
    }

    const okMessage = hasUnsubscribe
      ? `Correo de prueba enviado a ${user.email} (${label}), con link y cabeceras de baja.`
      : `Correo de prueba enviado a ${user.email} (${label}) SIN link de baja: falta RADAR_UNSUBSCRIBE_SECRET en este entorno.`
    return { success: true, message: okMessage, count: events.length }
  } catch (err: any) {
    console.error("[triggerTestRadarEmail] Excepción en envío:", err?.message)
    return { success: false, message: err?.message || "Ocurrió una excepción inesperada al enviar el correo." }
  }
}
