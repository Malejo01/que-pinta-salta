"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { Resend } from "resend"
import type { SupabaseClient, User } from "@supabase/supabase-js"
import { buildRadarEmail, radarEnvLabel } from "@/lib/radar/email"
import { getRadarEvents } from "@/lib/radar/events"
import { normalizarPreferenciasRadar, type EmailFrequency } from "@qps/core/radar/preferencias"

export type { EmailFrequency }

export interface RadarSettingsData {
  email_frequency: EmailFrequency
  email_target: string
  categoryIds: string[]
  venueIds: string[]
  instagramAccountIds: string[]
}

/**
 * Cuerpo de `getRadarSettings`, con el cliente y el usuario ya resueltos:
 * lo reutiliza `sendTestRadarEmail` (endpoint con Bearer y server action)
 * para no autenticar dos veces.
 */
async function getRadarSettingsData(
  supabase: SupabaseClient,
  user: Pick<User, "id" | "email">
): Promise<RadarSettingsData | null> {
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
 * Obtiene la configuración actual del radar del usuario autenticado,
 * junto con sus intereses en categorías, locales e Instagram.
 */
export async function getRadarSettings(): Promise<RadarSettingsData | null> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (!user || authError) {
    return null
  }

  return getRadarSettingsData(supabase, user)
}

/**
 * Sincroniza de forma segura la configuración general y los intereses de
 * categorías, locales e Instagram del usuario.
 */
export async function updateRadarSettings(data: {
  email_frequency: EmailFrequency
  categoryIds: string[]
  venueIds: string[]
  instagramAccountIds: string[]
}): Promise<{ success: boolean; error?: string; message?: string }> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (!user || authError) {
    return { success: false, error: "AUTH_REQUIRED", message: "Tenés que iniciar sesión para configurar tu radar." }
  }

  // El Radar solo manda al email de la cuenta (verificado al registrarse): nunca se
  // acepta un destinatario del cliente. La base también lo fuerza con un trigger,
  // pero no guardamos si acá ya falta.
  if (!user.email) {
    console.error("[updateRadarSettings] El usuario no tiene email en la sesión:", user.id)
    return { success: false, error: "NO_EMAIL", message: "Tu cuenta no tiene un email asociado. No podemos activar el radar." }
  }

  const normalizado = normalizarPreferenciasRadar(data)
  if (!normalizado.ok) {
    return { success: false, error: "INVALID", message: normalizado.error }
  }
  const { email_frequency, categoryIds, venueIds, instagramAccountIds } = normalizado.datos

  // 1. Guardar configuraciones generales
  const { error: settingsError } = await supabase
    .from("user_radar_settings")
    .upsert({
      user_id: user.id,
      email_frequency: email_frequency,
      email_target: user.email,
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

  if (categoryIds.length > 0) {
    const insertCats = categoryIds.map(id => ({
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

  if (venueIds.length > 0) {
    const insertVens = venueIds.map(id => ({
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

  if (instagramAccountIds.length > 0) {
    const insertIgs = instagramAccountIds.map(id => ({
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

export type TestRadarEmailResult = { success: boolean; message?: string; count?: number }

/**
 * Cuerpo compartido de la prueba de envío del Radar (Sandbox): lee la
 * configuración del usuario, busca sus eventos y, si hay, manda el correo
 * con Resend al email del propio usuario (nunca a otro destinatario).
 *
 * Recibe el cliente de Supabase y el usuario **ya autenticados y
 * autorizados**: ni esta función ni `getRadarSettingsData` vuelven a
 * verificar sesión o rol — eso lo hace quien la llama (la server action
 * `triggerTestRadarEmail`, con la sesión por cookies, o el endpoint
 * `POST /api/radar/prueba`, con el Bearer del usuario).
 */
export async function sendTestRadarEmail(
  supabase: SupabaseClient,
  user: Pick<User, "id" | "email">
): Promise<TestRadarEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error("[sendTestRadarEmail] RESEND_API_KEY no configurada.")
    return { success: false, message: "La variable de entorno RESEND_API_KEY no está configurada en el servidor." }
  }

  const resend = new Resend(apiKey)

  // 1. Obtener la configuración de radar del usuario
  const settings = await getRadarSettingsData(supabase, user)
  if (!settings) {
    return { success: false, message: "No se encontraron configuraciones de radar para tu usuario." }
  }

  const { categoryIds, venueIds, instagramAccountIds } = settings

  if (categoryIds.length === 0 && venueIds.length === 0 && instagramAccountIds.length === 0) {
    return { success: false, message: "Tenés que seguir al menos una categoría, un local o una cuenta de Instagram para recibir novedades." }
  }

  const events = await getRadarEvents(supabase, { categoryIds, venueIds, instagramAccountIds })

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
      console.warn('[sendTestRadarEmail] RADAR_UNSUBSCRIBE_SECRET no configurada: el correo sale sin link ni cabeceras de baja.')
    }

    const { error: sendError } = await resend.emails.send(message)

    // El mensaje que ve el usuario nunca lleva el detalle de Resend (ni de
    // ninguna excepción más abajo): esto corre tanto desde la server action
    // como desde el endpoint con Bearer, y el segundo no puede filtrar
    // detalles internos en el cuerpo de la respuesta.
    if (sendError) {
      console.error("[sendTestRadarEmail] Error en el envío de Resend:", sendError.message)
      return { success: false, message: "No pudimos enviar el correo de prueba. Intentá de nuevo." }
    }

    const okMessage = hasUnsubscribe
      ? `Correo de prueba enviado a ${user.email} (${label}), con link y cabeceras de baja.`
      : `Correo de prueba enviado a ${user.email} (${label}) SIN link de baja: falta RADAR_UNSUBSCRIBE_SECRET en este entorno.`
    return { success: true, message: okMessage, count: events.length }
  } catch (err: any) {
    console.error("[sendTestRadarEmail] Excepción en envío:", err?.message)
    return { success: false, message: "Ocurrió una excepción inesperada al enviar el correo." }
  }
}

/**
 * Server Action para probar el envío de correos del radar del usuario actual (Sandbox).
 * Sesión por cookies; valida acá mismo que el usuario sea ADMIN antes de
 * delegar en `sendTestRadarEmail`. Lo que ve la web no cambia.
 */
export async function triggerTestRadarEmail(): Promise<TestRadarEmailResult> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (!user || authError) {
    return { success: false, message: "Tenés que iniciar sesión para realizar la prueba." }
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

  return sendTestRadarEmail(supabase, user)
}
