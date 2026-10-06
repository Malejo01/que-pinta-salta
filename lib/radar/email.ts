/* eslint-disable @typescript-eslint/no-explicit-any -- eventos: filas de Supabase y flyers mapeados, sin tipo común */
import { formatEventDate, formatSaltaClock } from '@/lib/date-format'
import { eventHref } from '@/lib/metricas/links'
import { unsubscribeUrl, unsubscribeHeaders } from '@/lib/radar/baja'

export function buildRadarEmailHtml(events: any[], unsubscribeLink: string | null): string {
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

/** Etiqueta del entorno que armó el correo: 'production', 'preview <sha7>' o 'local'. */
export function radarEnvLabel(): string {
  const env = process.env.VERCEL_ENV
  if (env === 'production') return 'production'
  if (env === 'preview') {
    const sha = process.env.VERCEL_GIT_COMMIT_SHA
    return sha ? `preview ${sha.slice(0, 7)}` : 'preview'
  }
  return 'local'
}

export type RadarEmailMessage = {
  from: string
  to: string
  subject: string
  html: string
  headers?: Record<string, string>
}

/**
 * Único armado del correo del Radar (prueba y cron). `previewBase` solo lo pasa el correo de
 * prueba, para que los links de baja apunten a la preview; el cron nunca lo pasa y sus links
 * van siempre a producción.
 */
export function buildRadarEmail(opts: { userId: string; to: string; subject: string; events: any[]; previewBase?: boolean }): {
  message: RadarEmailMessage
  hasUnsubscribe: boolean
} {
  const urlOpts = { previewBase: opts.previewBase }
  const link = unsubscribeUrl(opts.userId, urlOpts)
  const headers = unsubscribeHeaders(opts.userId, urlOpts)
  const message: RadarEmailMessage = {
    from: `Qué Pinta Salta <${process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'}>`,
    to: opts.to,
    subject: opts.subject,
    html: buildRadarEmailHtml(opts.events, link),
  }
  if (headers) message.headers = headers
  return { message, hasUnsubscribe: Boolean(link && headers) }
}
