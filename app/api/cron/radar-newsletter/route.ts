import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { Resend } from 'resend'
import { formatEventDate, formatSaltaClock } from '@/lib/date-format'
import { hasBearerSecret } from '@/lib/api-auth'
import { withJobRun, jobTriggerFrom } from '@/lib/job-runs'
import { eventHref } from '@/lib/metricas/links'
import { unsubscribeUrl, unsubscribeHeaders } from '@/lib/radar/baja'

function buildRadarEmailHtml(events: any[], unsubscribeLink: string | null): string {
  const eventRows = events.map(event => {
    const dateObj = new Date(event.start_date)
    const formattedDate = formatEventDate(dateObj)
    const formattedTime = formatSaltaClock(dateObj)

    const priceText = event.is_free ? "Gratis" : (event.price_min > 0 ? `$${event.price_min}` : "A confirmar")
    const detailUrl = `https://quepintasalta.com.ar${eventHref(event.id, 'radar')}`
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
            ${unsubscribeLink ? `<span style="font-size: 11px; color: #71717a;"> &middot; </span><a href="${unsubscribeLink}" target="_blank" style="font-size: 11px; color: #AA1B1B; text-decoration: underline; font-weight: 600; font-family: Arial, sans-serif;">Darme de baja</a>` : ''}
          </div>
        </div>
      </body>
    </html>
  `
}

export async function GET(request: Request) {
  // Verificar autorización
  if (!hasBearerSecret(request, 'CRON_SECRET')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // La corrida queda registrada en job_runs (radar_newsletter).
  const { httpStatus, body } = await withJobRun('radar_newsletter', jobTriggerFrom(request), sendNewsletter, (r) => {
    if (r.httpStatus >= 500) return { status: 'FAILED', errors: [String(r.body.error ?? 'error')] }
    const stats = r.body.stats as { sent: number; skipped: number; errors: number } | undefined
    if (!stats) return { status: 'SKIPPED', details: { message: r.body.message } }
    return {
      status: stats.errors ? 'PARTIAL' : 'SUCCESS',
      itemsProcessed: stats.sent,
      itemsFailed: stats.errors,
      details: { skipped: stats.skipped },
    }
  })
  return NextResponse.json(body, { status: httpStatus })
}

type NewsletterReply = { httpStatus: number; body: Record<string, unknown> }

const reply = (httpStatus: number, body: Record<string, unknown>): NewsletterReply => ({ httpStatus, body })

async function sendNewsletter(): Promise<NewsletterReply> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error("[RadarNewsletterCron] No RESEND_API_KEY configured")
    return reply(500, { error: 'Resend API key missing' })
  }

  console.log('[RadarNewsletterCron] Iniciando envío semanal de Radar...')
  
  const supabase = createAdminClient()
  const resend = new Resend(apiKey)

  try {
    // 1. Obtener configuraciones activas (weekly)
    const { data: usersSettings, error: settingsError } = await supabase
      .from("user_radar_settings")
      .select("user_id, email_target")
      .eq("email_frequency", "weekly")

    if (settingsError) {
      console.error("[RadarNewsletterCron] Error al consultar configuraciones de radar:", settingsError)
      return reply(500, { error: 'Database settings error' })
    }

    if (!usersSettings || usersSettings.length === 0) {
      return reply(200, { success: true, message: 'No hay usuarios suscritos a alertas semanales.' })
    }

    const nowIso = new Date().toISOString()
    const results = { sent: 0, skipped: 0, errors: 0 }

    if (!process.env.RADAR_UNSUBSCRIBE_SECRET?.trim()) {
      console.warn('[RadarNewsletterCron] RADAR_UNSUBSCRIBE_SECRET no configurada: los mails salen sin link ni cabeceras de baja.')
    }

    for (const settings of usersSettings) {
      const userId = settings.user_id
      const emailTarget = settings.email_target

      // Obtener categorías seguidas
      const { data: catRows } = await supabase
        .from("user_followed_categories")
        .select("category_id")
        .eq("user_id", userId)

      // Obtener locales seguidos
      const { data: venRows } = await supabase
        .from("user_followed_venues")
        .select("venue_id")
        .eq("user_id", userId)

      // Obtener cuentas de Instagram seguidas
      const { data: igRows } = await supabase
        .from("user_followed_instagram_accounts")
        .select("instagram_account_id")
        .eq("user_id", userId)

      const categoryIds = catRows?.map(r => r.category_id) || []
      const venueIds = venRows?.map(r => r.venue_id) || []
      const instagramAccountIds = igRows?.map(r => r.instagram_account_id) || []

      // Si no tiene configurado ningún interés, omitimos
      if (categoryIds.length === 0 && venueIds.length === 0 && instagramAccountIds.length === 0) {
        results.skipped++
        continue
      }

      let emailEvents: any[] = []

      // Buscar eventos coincidentes
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

        const { data: events, error: eventsError } = await query.limit(8)

        if (eventsError) {
          console.error(`[RadarNewsletterCron] Error consultando eventos para usuario ${userId}:`, eventsError)
        } else if (events) {
          emailEvents = [...events]
        }
      }

      // Buscar flyers coincidentes de Instagram
      if (instagramAccountIds.length > 0) {
        const { data: flyers, error: flyersError } = await supabase
          .from("instagram_flyers")
          .select("*, account:instagram_accounts(*)")
          .eq("status", "ACTIVE")
          .in("account_id", instagramAccountIds)
          .order("published_at", { ascending: false })
          .limit(5)

        if (flyersError) {
          console.error(`[RadarNewsletterCron] Error consultando flyers para usuario ${userId}:`, flyersError)
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
          emailEvents = [...emailEvents, ...mappedFlyers]
        }
      }

      // Si no hay novedades, evitamos enviar spam
      if (emailEvents.length === 0) {
        results.skipped++
        continue
      }

      // Generar HTML y enviar (en sandbox Resend requiere enviar desde onboarding@resend.dev)
      try {
        const htmlContent = buildRadarEmailHtml(emailEvents, unsubscribeUrl(userId))
        const senderEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev"

        const { error: sendError } = await resend.emails.send({
          from: `Qué Pinta Salta <${senderEmail}>`,
          to: emailTarget,
          subject: '📡 ¡Tu Radar Salteño está activo! Agenda del Fin de Semana',
          html: htmlContent,
          headers: unsubscribeHeaders(userId),
        })

        if (sendError) {
          console.error(`[RadarNewsletterCron] Error de Resend para usuario ${userId}:`, sendError.message)
          results.errors++
        } else {
          results.sent++
        }
      } catch (sendEx) {
        console.error(`[RadarNewsletterCron] Excepción en envío a usuario ${userId}:`, sendEx instanceof Error ? sendEx.message : 'error')
        results.errors++
      }
    }

    return reply(200, {
      success: true,
      stats: results,
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('[RadarNewsletterCron] Falló la ejecución del cron del newsletter:', error)
    return reply(500, {
      success: false,
      error: error?.message || 'Error desconocido'
    })
  }
}
