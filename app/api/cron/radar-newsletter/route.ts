import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { Resend } from 'resend'
import { hasBearerSecret } from '@/lib/api-auth'
import { withJobRun, jobTriggerFrom } from '@/lib/job-runs'
import { buildRadarEmail } from '@/lib/radar/email'

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
        const { message } = buildRadarEmail({
          userId,
          to: emailTarget,
          subject: '📡 ¡Tu Radar Salteño está activo! Agenda del Fin de Semana',
          events: emailEvents,
        })

        const { error: sendError } = await resend.emails.send(message)

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
