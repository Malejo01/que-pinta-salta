import { parseAllEventsFromHtml } from '@/lib/scraper/parsers'
import { saltaWallClockToDate } from '@/lib/date-format'
import { ScrapedEvent } from '../types'

// Misma URL que usa el scraper manual de lib/scraper/norteticket-scraper.ts.
// El dominio es .com (no .com.ar) y el filtro de provincia va por query string.
const NORTE_TICKET_URL = 'https://norteticket.com/?subcategoria=Salta'
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/**
 * Scrapea los eventos de Salta publicados en NorteTicket.
 *
 * El parseo del DOM se delega en parseAllEventsFromHtml (lib/scraper/parsers.ts),
 * que es la única implementación de los selectores de NorteTicket. Acá solo se
 * hace el fetch y la adaptación al shape ScrapedEvent que consume el cron.
 *
 * Lanza si la fuente no responde o si el HTML deja de matchear los selectores,
 * para que el job reporte la falla en vez de registrar 0 eventos en silencio.
 */
export async function scrapeNorteTicket(): Promise<ScrapedEvent[]> {
  const response = await fetch(NORTE_TICKET_URL, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
      'Cache-Control': 'no-cache',
    },
    next: { revalidate: 0 },
  })

  if (!response.ok) {
    throw new Error(`NorteTicket respondió HTTP ${response.status}: ${response.statusText}`)
  }

  const html = await response.text()
  const parsed = parseAllEventsFromHtml(html)

  if (parsed.length === 0) {
    throw new Error(
      'NorteTicket devolvió HTML pero no se parseó ningún evento. ' +
      'Probablemente cambió el DOM (selector div#boxEvent en lib/scraper/parsers.ts).'
    )
  }

  const events: ScrapedEvent[] = []

  for (const event of parsed) {
    if (!event.title || !event.start_date) {
      console.warn(`[cron-norteticket] Descartado sin título o fecha: "${event.title ?? 'sin título'}"`)
      continue
    }

    // El listado publica la hora de pared de Salta, sin zona.
    const dateTime = saltaWallClockToDate(event.start_date)
    if (Number.isNaN(dateTime.getTime())) {
      console.warn(`[cron-norteticket] Fecha inválida en "${event.title}": ${event.start_date}`)
      continue
    }

    // El card trae "Teatro del Huerto, Salta, Salta": nombre + domicilio.
    // resolveVenue() del cron se encarga de separar nombre y dirección.
    const rawVenueName = (event.venue ?? '').trim() || 'Salta'

    events.push({
      title: event.title,
      rawVenueName,
      dateTime,
      priceFrom: event.price_min ?? 0,
      isFree: event.is_free ?? false,
      flyerUrl: event.image_url ?? '',
      ticketLink: event.ticket_url ?? '',
      source: 'norteticket',
    })
  }

  console.log(`[cron-norteticket] ${events.length} evento(s) parseados de ${parsed.length} cards.`)

  return events
}
