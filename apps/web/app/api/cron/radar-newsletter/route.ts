import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { Resend } from 'resend'
import { hasBearerSecret } from '@/lib/api-auth'
import { withJobRun, jobTriggerFrom } from '@/lib/job-runs'
import { buildRadarEmail } from '@/lib/radar/email'
import { getRadarEvents } from '@/lib/radar/events'
import { isDue } from '@/lib/radar/cadence'

export async function GET(request: Request) {
  // Verificar autorización
  if (!hasBearerSecret(request, 'CRON_SECRET')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // La corrida queda registrada en job_runs (radar_newsletter).
  const { httpStatus, body } = await withJobRun('radar_newsletter', jobTriggerFrom(request), sendNewsletter, (r) => {
    if (r.httpStatus >= 500) return { status: 'FAILED', errors: [String(r.body.error ?? 'error')] }
    const stats = r.body.stats as { sent: number; skipped: number; notDue: number; errors: number; markFailed?: number; markFailedUsers?: string[] } | undefined
    if (!stats) return { status: 'SKIPPED', details: { message: r.body.message } }
    const markFailed = stats.markFailed ?? 0
    return {
      status: stats.errors || markFailed ? 'PARTIAL' : 'SUCCESS',
      itemsProcessed: stats.sent,
      itemsFailed: stats.errors + markFailed,
      errors: (stats.markFailedUsers ?? []).map((id) => `radar: no se pudo guardar last_sent_at de ${id}`),
      details: { skipped: stats.skipped, notDue: stats.notDue, markFailed },
    }
  })
  // Los user_id de markFailedUsers van solo a job_runs (admins); la respuesta
  // puede terminar en logs de GitHub Actions, así que sale solo el conteo.
  const publicStats = { ...((body.stats ?? {}) as Record<string, unknown>) }
  delete publicStats.markFailedUsers
  const publicBody = body.stats ? { ...body, stats: publicStats } : body
  return NextResponse.json(publicBody, { status: httpStatus })
}

type NewsletterReply = { httpStatus: number; body: Record<string, unknown> }

const reply = (httpStatus: number, body: Record<string, unknown>): NewsletterReply => ({ httpStatus, body })

async function sendNewsletter(): Promise<NewsletterReply> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error("[RadarNewsletterCron] No RESEND_API_KEY configured")
    return reply(500, { error: 'Resend API key missing' })
  }

  console.log('[RadarNewsletterCron] Iniciando envío del Radar...')
  
  const supabase = createAdminClient()
  const resend = new Resend(apiKey)

  try {
    // 1. Obtener configuraciones activas (weekly, biweekly, monthly); isDue decide a quién le toca hoy
    const { data: usersSettings, error: settingsError } = await supabase
      .from("user_radar_settings")
      .select("user_id, email_target, email_frequency, last_sent_at")
      .in("email_frequency", ["weekly", "biweekly", "monthly"])

    if (settingsError) {
      console.error("[RadarNewsletterCron] Error al consultar configuraciones de radar:", settingsError)
      return reply(500, { error: 'Database settings error' })
    }

    if (!usersSettings || usersSettings.length === 0) {
      return reply(200, { success: true, message: 'No hay usuarios suscritos al Radar.' })
    }

    const results = { sent: 0, skipped: 0, notDue: 0, errors: 0, markFailed: 0, markFailedUsers: [] as string[] }

    if (!process.env.RADAR_UNSUBSCRIBE_SECRET?.trim()) {
      console.warn('[RadarNewsletterCron] RADAR_UNSUBSCRIBE_SECRET no configurada: los mails salen sin link ni cabeceras de baja.')
    }

    const now = new Date()

    for (const settings of usersSettings) {
      if (!isDue(settings.email_frequency, settings.last_sent_at, now)) {
        results.notDue++
        continue
      }
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

      const emailEvents = await getRadarEvents(supabase, { categoryIds, venueIds, instagramAccountIds })

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
          subject: '📡 Tu Radar Salteño: lo que se viene',
          events: emailEvents,
        })

        const { error: sendError } = await resend.emails.send(message)

        if (sendError) {
          console.error(`[RadarNewsletterCron] Error de Resend para usuario ${userId}:`, sendError.message)
          results.errors++
        } else {
          results.sent++
          // Solo con envío aceptado: skipped y errores no cuentan como envío.
          const { error: markError } = await supabase
            .from("user_radar_settings")
            .update({ last_sent_at: new Date().toISOString() })
            .eq("user_id", userId)
          if (markError) {
            results.markFailed++
            results.markFailedUsers.push(userId)
            console.error(`[RadarNewsletterCron] No se pudo registrar last_sent_at de ${userId}:`, markError.message)
          }
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

  } catch (error: unknown) {
    console.error('[RadarNewsletterCron] Falló la ejecución del cron del newsletter:', error)
    return reply(500, {
      success: false,
      error: (error instanceof Error && error.message) || 'Error desconocido'
    })
  }
}
