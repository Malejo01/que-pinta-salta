import * as cheerio from 'cheerio'

const MONTHS: Record<string, number> = {
  ene: 0,
  febrero: 1,
  feb: 1,
  mar: 2,
  abril: 3,
  abr: 3,
  may: 4,
  mayo: 4,
  jun: 5,
  junio: 5,
  jul: 6,
  julio: 6,
  ago: 7,
  agosto: 7,
  sep: 8,
  septiembre: 8,
  oct: 9,
  octubre: 9,
  nov: 10,
  noviembre: 10,
  dic: 11,
  diciembre: 11,
}

export type PasslineParsedEvent = {
  title: string
  venue: string
  startDate: string
  priceMin: number
  isFree: boolean
  ticketUrl: string
  imageUrl: string | null
}

function normalizeText(input: string): string {
  return input.replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim()
}

function absoluteUrl(url: string, baseUrl: string): string {
  if (!url) return ''
  if (url.startsWith('http')) return url
  if (url.startsWith('//')) return `https:${url}`
  try {
    return new URL(url, baseUrl).href
  } catch {
    return ''
  }
}

function parsePrice(text: string): number {
  const cleaned = text.replace(/[^\d]/g, '')
  const numeric = Number.parseInt(cleaned, 10)
  return Number.isFinite(numeric) ? numeric : 0
}

function parseDateToISO(rawDate: string): string | null {
  const cleaned = normalizeText(rawDate).toLowerCase()

  const fullPattern = /(\d{1,2})\s+de\s+([a-záéíóúñ]+)(?:\s+de\s+(\d{4}))?(?:.*?(\d{1,2})[:.](\d{2}))?/i
  const fullMatch = cleaned.match(fullPattern)
  if (fullMatch) {
    const day = Number.parseInt(fullMatch[1], 10)
    const monthToken = fullMatch[2]
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
    const month = MONTHS[monthToken] ?? MONTHS[monthToken.slice(0, 3)]
    const year = fullMatch[3] ? Number.parseInt(fullMatch[3], 10) : new Date().getFullYear()
    const hour = fullMatch[4] ? Number.parseInt(fullMatch[4], 10) : 21
    const minute = fullMatch[5] ? Number.parseInt(fullMatch[5], 10) : 0

    if (Number.isFinite(day) && Number.isFinite(month) && Number.isFinite(year)) {
      return new Date(year, month, day, hour, minute).toISOString()
    }
  }

  const numericPattern = /(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{4}))?(?:.*?(\d{1,2})[:.](\d{2}))?/i
  const numericMatch = cleaned.match(numericPattern)
  if (numericMatch) {
    const day = Number.parseInt(numericMatch[1], 10)
    const month = Number.parseInt(numericMatch[2], 10) - 1
    const year = numericMatch[3] ? Number.parseInt(numericMatch[3], 10) : new Date().getFullYear()
    const hour = numericMatch[4] ? Number.parseInt(numericMatch[4], 10) : 21
    const minute = numericMatch[5] ? Number.parseInt(numericMatch[5], 10) : 0

    if (Number.isFinite(day) && Number.isFinite(month) && Number.isFinite(year)) {
      return new Date(year, month, day, hour, minute).toISOString()
    }
  }

  return null
}

function detectEventContainers($: cheerio.CheerioAPI) {
  const selectors = [
    '.card-event',
    '.event-card',
    '.box-evento',
    '.evento-item',
    'article[class*="event"]',
    '.content_event .item',
    '.events-list .item',
  ]

  for (const selector of selectors) {
    const found = $(selector)
    if (found.length > 0) {
      return found
    }
  }

  return $('a[href*="evento"], a[href*="evento.php"]').closest('article,div,li')
}

function isLikelyEventCard($card: cheerio.Cheerio<any>): boolean {
  const text = normalizeText($card.text()).toLowerCase()
  if (!text) return false

  return /fecha|desde|entradas|comprar|evento|tickets?/.test(text)
}

export function parsePasslineEventsFromHtml(html: string, baseUrl: string): PasslineParsedEvent[] {
  const $ = cheerio.load(html)
  const $cards = detectEventContainers($)
  const items: PasslineParsedEvent[] = []
  const seen = new Set<string>()

  $cards.each((_, card) => {
    const $card = $(card)
    if (!isLikelyEventCard($card)) return

    const title = normalizeText(
      $card.find('h1, h2, h3, h4, .title, .event-title, a[title]').first().text() ||
      $card.find('img').first().attr('alt') ||
      $card.find('a[title]').first().attr('title') ||
      '',
    )
    if (!title) return

    const venue = normalizeText(
      $card.find('.venue, .lugar, .location, [class*="venue"], [class*="lugar"], [class*="localidad"]').first().text() ||
      'Salta',
    )

    const dateText = normalizeText(
      $card.find('time, .date, .fecha, [class*="date"], [class*="fecha"]').first().text() ||
      $card.text(),
    )
    const startDate = parseDateToISO(dateText)
    if (!startDate) return

    const ticketHref =
      $card.find('a[href*="evento"], a[href*="tickets"], a[href*="comprar"], a.btn, a.button').first().attr('href') ||
      $card.find('a').first().attr('href') ||
      ''
    const ticketUrl = absoluteUrl(ticketHref, baseUrl)

    const imageSrc =
      $card.find('img').first().attr('src') ||
      $card.find('img').first().attr('data-src') ||
      ''
    const imageUrl = absoluteUrl(imageSrc, baseUrl) || null

    const priceText = normalizeText(
      $card.find('.price, .precio, [class*="price"], [class*="precio"]').first().text() ||
      $card.text().match(/(ARS|\$)\s*[\d\.,]+/i)?.[0] ||
      '',
    )

    const priceMin = parsePrice(priceText)
    const isFree = priceMin === 0

    const dedupKey = `${title}::${startDate}::${ticketUrl}`
    if (seen.has(dedupKey)) return
    seen.add(dedupKey)

    items.push({
      title,
      venue,
      startDate,
      priceMin,
      isFree,
      ticketUrl,
      imageUrl,
    })
  })

  return items
}

export function hasPasslineAccess(html: string): boolean {
  const marker = html.toLowerCase()
  if (marker.includes('queue-it') || marker.includes('queueittoken')) return false
  if (marker.includes('elige tu país y accede a los mejores eventos')) return false
  return true
}

export function hasNextPage(html: string, currentPage: number): boolean {
  const $ = cheerio.load(html)

  const nextHref = $('a[href*="page="]')
    .map((_, element) => $(element).attr('href') || '')
    .get()
    .find((href) => href.includes(`page=${currentPage + 1}`))

  if (nextHref) return true

  const nextLabel = $('a,button').filter((_, element) => {
    const label = normalizeText($(element).text()).toLowerCase()
    return label === 'siguiente' || label === 'next'
  })

  return nextLabel.length > 0
}
