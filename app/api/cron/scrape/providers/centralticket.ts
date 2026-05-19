import * as cheerio from 'cheerio'
import { ScrapedEvent } from '../types'

const CENTRAL_TICKET_URL = 'https://centralticket.com.ar/eventos/salta'

const MONTHS: Record<string, number> = {
  'ene': 0, 'feb': 1, 'mar': 2, 'abr': 3, 'may': 4, 'jun': 5,
  'jul': 6, 'ago': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dic': 11,
  'enero': 0, 'febrero': 1, 'marzo': 2, 'abril': 3, 'mayo': 4, 'junio': 5,
  'julio': 6, 'agosto': 7, 'septiembre': 8, 'octubre': 9, 'noviembre': 10, 'diciembre': 11
}

/**
 * Parses Argentine date strings like "Sáb 23 May, 21:00" or "23 de Mayo 2026"
 * into a proper JavaScript Date object
 */
function parseArgentineDate(rawDateStr: string): Date {
  const currentYear = new Date().getFullYear()
  const cleaned = rawDateStr.toLowerCase().trim()
  
  // Try pattern: "Sáb 23 May, 21:00" or "23 May 21:00"
  const shortPattern = /(\d{1,2})\s+(\w+)[\s,]+(\d{1,2}):(\d{2})/i
  const shortMatch = cleaned.match(shortPattern)
  
  if (shortMatch) {
    const day = parseInt(shortMatch[1], 10)
    const monthStr = shortMatch[2].substring(0, 3)
    const hour = parseInt(shortMatch[3], 10)
    const minute = parseInt(shortMatch[4], 10)
    const month = MONTHS[monthStr] ?? 0
    
    return new Date(currentYear, month, day, hour, minute)
  }
  
  // Try pattern: "23 de Mayo de 2026" or "23 de Mayo"
  const longPattern = /(\d{1,2})\s+de\s+(\w+)(?:\s+de\s+(\d{4}))?/i
  const longMatch = cleaned.match(longPattern)
  
  if (longMatch) {
    const day = parseInt(longMatch[1], 10)
    const monthStr = longMatch[2].substring(0, 3)
    const year = longMatch[3] ? parseInt(longMatch[3], 10) : currentYear
    const month = MONTHS[monthStr] ?? 0
    
    return new Date(year, month, day, 21, 0) // Default to 21:00 if no time
  }
  
  // Try pattern with just day and month: "23/05" or "23-05"
  const numericPattern = /(\d{1,2})[\/\-](\d{1,2})/
  const numericMatch = cleaned.match(numericPattern)
  
  if (numericMatch) {
    const day = parseInt(numericMatch[1], 10)
    const month = parseInt(numericMatch[2], 10) - 1
    
    return new Date(currentYear, month, day, 21, 0)
  }
  
  // Fallback: return current date
  console.warn(`[v0] Could not parse date: "${rawDateStr}", using current date`)
  return new Date()
}

/**
 * Extracts numeric price from strings like "Desde $4.500" or "$4500"
 */
function parsePrice(priceStr: string): number {
  const cleaned = priceStr.replace(/[^\d]/g, '')
  return parseInt(cleaned, 10) || 0
}

/**
 * Ensures URL is absolute
 */
function absoluteUrl(url: string, base: string): string {
  if (!url) return ''
  if (url.startsWith('http')) return url
  if (url.startsWith('//')) return `https:${url}`
  if (url.startsWith('/')) return new URL(url, base).href
  return new URL(url, base).href
}

/**
 * Scrapes events from CentralTicket website
 */
export async function scrapeCentralTicket(): Promise<ScrapedEvent[]> {
  const events: ScrapedEvent[] = []
  
  try {
    const response = await fetch(CENTRAL_TICKET_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
      },
      next: { revalidate: 0 }
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const html = await response.text()
    const $ = cheerio.load(html)
    
    // CentralTicket event card selectors (adjust based on actual DOM structure)
    const cardSelectors = [
      '.event-card',
      '.card-evento',
      '.evento-item',
      'article.event',
      '.evento',
      '[data-event]',
      '.list-events .item',
      '.events-list .event',
      '.grid-eventos .item',
      '.eventos-container .evento'
    ]
    
    let $cards = $([])
    for (const selector of cardSelectors) {
      const found = $(selector)
      if (found.length > 0) {
        $cards = found
        console.log(`[v0] CentralTicket: Found ${found.length} events with selector "${selector}"`)
        break
      }
    }
    
    if ($cards.length === 0) {
      // Try generic approach - look for links with event-like structure
      $cards = $('a[href*="/evento/"], a[href*="/event/"], a[href*="/espectaculo/"]').closest('div, article, li')
      console.log(`[v0] CentralTicket: Fallback found ${$cards.length} event containers`)
    }
    
    $cards.each((_, element) => {
      try {
        const $card = $(element)
        
        // Extract title - try multiple selectors
        const title = $card.find('h2, h3, h4, .title, .event-title, .nombre').first().text().trim() ||
                      $card.find('a').first().attr('title') ||
                      $card.find('img').first().attr('alt') ||
                      ''
        
        if (!title) {
          console.log('[v0] CentralTicket: Skipping card without title')
          return
        }
        
        // Extract venue
        const rawVenueName = $card.find('.venue, .lugar, .location, .ubicacion, [class*="venue"], [class*="lugar"]').first().text().trim() ||
                            $card.find('small, .text-muted, .info').first().text().trim() ||
                            'Salta'
        
        // Extract date
        const rawDateStr = $card.find('.date, .fecha, .datetime, [class*="date"], [class*="fecha"], time').first().text().trim() ||
                          $card.find('[datetime]').attr('datetime') ||
                          ''
        
        // Extract price
        const priceText = $card.find('.price, .precio, [class*="price"], [class*="precio"]').first().text().trim() ||
                         $card.text().match(/\$[\d.,]+/)?.[0] ||
                         '0'
        
        // Extract flyer image
        const flyerUrl = $card.find('img').first().attr('src') ||
                        $card.find('img').first().attr('data-src') ||
                        $card.find('[style*="background-image"]').css('background-image')?.replace(/url\(['"]?|['"]?\)/g, '') ||
                        ''
        
        // Extract ticket link
        const ticketLink = $card.find('a[href*="ticket"], a[href*="entrada"], a.btn, a.button').first().attr('href') ||
                          $card.find('a').first().attr('href') ||
                          ''
        
        const event: ScrapedEvent = {
          title,
          rawVenueName,
          dateTime: parseArgentineDate(rawDateStr),
          priceFrom: parsePrice(priceText),
          flyerUrl: absoluteUrl(flyerUrl, CENTRAL_TICKET_URL),
          ticketLink: absoluteUrl(ticketLink, CENTRAL_TICKET_URL),
          source: 'centralticket'
        }
        
        events.push(event)
      } catch (cardError) {
        console.error('[v0] CentralTicket: Error parsing card:', cardError)
      }
    })
    
    console.log(`[v0] CentralTicket: Successfully scraped ${events.length} events`)
    
  } catch (error) {
    console.error('[v0] CentralTicket scraper error:', error)
  }
  
  return events
}
