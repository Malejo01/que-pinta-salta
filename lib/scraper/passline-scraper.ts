import puppeteer from 'puppeteer'
import slugify from 'slugify'
import { inferVamosCategory } from './vamos-parsers'
import { saveEventsToSupabase, type SaveResult } from './save-to-supabase'
import {
  hasNextPage,
  hasPasslineAccess,
  parsePasslineEventsFromHtml,
} from './passline-parsers'
import {
  applyPasslineSession,
  PasslineSessionRequiredError,
} from './passline-session'

const PASSLINE_BASE_URL = 'https://home.passline.com'

function buildPasslineSearchUrl(page: number) {
  const url = new URL('/eventos.php', PASSLINE_BASE_URL)
  url.searchParams.set('q', '')
  url.searchParams.set('catS', '')
  url.searchParams.set('region', '17')
  url.searchParams.set('comuna', '')
  url.searchParams.set('mes', '')
  url.searchParams.set('pais', 'argentina')
  url.searchParams.set('page', String(page))
  return url.toString()
}

function buildSlug(title: string, startDate: string, ticketUrl: string) {
  return slugify(`${title}-${startDate}-${ticketUrl}`, { lower: true, strict: true })
}

function getMaxPages(): number {
  const raw = process.env.PASSLINE_MAX_PAGES
  const parsed = raw ? Number.parseInt(raw, 10) : 8
  if (!Number.isFinite(parsed) || parsed <= 0) return 8
  return Math.min(parsed, 30)
}

function getPageDelayMs(): number {
  const raw = process.env.PASSLINE_DELAY_MS
  const parsed = raw ? Number.parseInt(raw, 10) : 1500
  if (!Number.isFinite(parsed) || parsed < 0) return 1500
  return Math.min(parsed, 8000)
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

export async function scrapePasslineSalta(): Promise<SaveResult> {
  const browser = await puppeteer.launch({ headless: true })

  try {
    const page = await browser.newPage()
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    )

    await applyPasslineSession(page)

    const maxPages = getMaxPages()
    const pageDelay = getPageDelayMs()
    const parsedEvents: ReturnType<typeof parsePasslineEventsFromHtml> = []
    const dedup = new Set<string>()

    for (let currentPage = 1; currentPage <= maxPages; currentPage++) {
      const url = buildPasslineSearchUrl(currentPage)

      const response = await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 45_000,
      })

      if (!response || !response.ok()) {
        const status = response?.status() ?? 0
        if (status === 403 || status === 429) {
          throw new PasslineSessionRequiredError(
            `Passline bloqueo la sesion (${status}). Renova cookies de sesion y reintenta.`,
          )
        }
      }

      const html = await page.content()
      if (!hasPasslineAccess(html)) {
        throw new PasslineSessionRequiredError(
          'Passline requiere validacion humana de Queue-it o seleccion de pais. Renova cookies de sesion y reintenta.',
        )
      }

      const pageEvents = parsePasslineEventsFromHtml(html, PASSLINE_BASE_URL)
      if (pageEvents.length === 0 && currentPage === 1) {
        throw new Error('No se pudieron detectar eventos en Passline con los selectores actuales.')
      }

      for (const item of pageEvents) {
        const key = `${item.title}::${item.startDate}::${item.ticketUrl}`
        if (dedup.has(key)) continue
        dedup.add(key)
        parsedEvents.push(item)
      }

      if (pageEvents.length === 0 || !hasNextPage(html, currentPage)) {
        break
      }

      await delay(pageDelay)
    }

    const eventsToSave: Parameters<typeof saveEventsToSupabase>[0] = parsedEvents.map((item) => {
      const category = inferVamosCategory(item.title)
      const slug = buildSlug(item.title, item.startDate, item.ticketUrl)

      return {
        title: item.title,
        slug,
        description: null,
        short_description: null,
        category_id: category,
        venue: item.venue,
        start_date: item.startDate,
        end_date: null,
        is_free: item.isFree,
        price_min: item.priceMin,
        ticket_url: item.ticketUrl || null,
        image_url: item.imageUrl,
        gallery_urls: item.imageUrl ? [item.imageUrl] : [],
        tags: [],
      }
    })

    if (eventsToSave.length === 0) {
      return { inserted: 0, skipped: 0, errors: ['Sin eventos detectados para Passline.'] }
    }

    return saveEventsToSupabase(eventsToSave, 'passline')
  } finally {
    await browser.close()
  }
}
