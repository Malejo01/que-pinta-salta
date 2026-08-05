import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { scrapeNorteTicket, scrapeEntradaUno, scrapeAlpogo } from './providers'
import { ScrapedEvent } from './types'
import { upsertEventWithDeduplication } from '@/lib/scraper/deduplicate'
import { upsertVenue } from '@/lib/scraper/save-to-supabase'
import { archiveExpiredFlyers } from '@/lib/instagram/process-apify-payload'
import { resolveCategoryWithAliases } from '@/lib/scraper/categorize'
import { formatSaltaDayKey } from '@/lib/date-format'

// Verify cron secret to prevent unauthorized access
const CRON_SECRET = process.env.CRON_SECRET

/**
 * Generates a URL-friendly slug from a title
 */
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 100)
}

/**
 * Attempts to match a raw venue name to an existing venue in the database
 * using aliases or direct name matching. Si no existe, lo crea.
 *
 * Algunas fuentes traen el venue como "Teatro del Huerto, Salta, Salta"
 * (nombre + domicilio), así que el match se hace contra la parte anterior
 * a la primera coma. Crear el venue faltante importa: sin venue_id,
 * findDuplicateEvent() no puede deduplicar por lugar y fecha.
 */
async function resolveVenue(supabase: ReturnType<typeof createAdminClient>, rawVenueName: string) {
  if (!rawVenueName) return null

  const name = rawVenueName.split(',')[0].trim()
  if (!name) return null

  // First try direct venue match
  const { data: directMatch } = await supabase
    .from('venues')
    .select('id, name')
    .ilike('name', `%${name}%`)
    .limit(1)
    .single()

  if (directMatch) {
    return directMatch.id
  }

  // Try aliases table
  const { data: aliasMatch } = await supabase
    .from('aliases')
    .select('target_id')
    .eq('target_type', 'venue')
    .ilike('alias', `%${name}%`)
    .limit(1)
    .single()

  if (aliasMatch) {
    return aliasMatch.target_id
  }

  // Crear el venue, igual que hace la ruta manual vía saveEventsToSupabase.
  // Se pasa la cadena completa para que quede el domicilio en `address`.
  return await upsertVenue(rawVenueName)
}



/**
 * Inserts or updates scraped events in the database
 */
async function upsertScrapedEvents(events: ScrapedEvent[]) {
  const supabase = createAdminClient()
  
  const results = {
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: 0
  }
  
  // Categorías consideradas comerciales prioritarias
  const commercialCategories = new Set(['recitales', 'teatro', 'boliches', 'penas'])

  for (const event of events) {
    try {
      // Resolve venue and category
      const venueId = await resolveVenue(supabase, event.rawVenueName)
      const categoryId = await resolveCategoryWithAliases(supabase, event.title, '', event.rawVenueName)
      
      if (!categoryId) {
        console.error(`[v0] Could not resolve category for: ${event.title}`)
        results.errors++
        continue
      }

      // Obtener el slug de la categoría para determinar si es de tipo comercial
      const { data: catData } = await supabase
        .from('categories')
        .select('slug')
        .eq('id', categoryId)
        .single()
      
      const isCommercial = catData ? commercialCategories.has(catData.slug) : false
      
      // Generate a unique base slug (without source at the end to unify duplicates)
      const baseSlug = generateSlug(event.title)
      const dateStr = formatSaltaDayKey(event.dateTime)
      const slug = `${baseSlug}-${dateStr}`
      
      const eventData = {
        title: event.title,
        slug,
        description: `Evento importado automáticamente desde ${event.source}`,
        short_description: `${event.title} en ${event.rawVenueName}`,
        category_id: categoryId,
        venue_id: venueId,
        image_url: event.flyerUrl,
        start_date: event.dateTime.toISOString(),
        price_min: event.priceFrom,
        is_free: event.isFree ?? (event.priceFrom === 0),
        ticket_url: event.ticketLink,
        status: 'PUBLISHED' as const,
        is_featured: false,
        is_commercial: isCommercial,
        tags: [event.source, 'scraped']
      }
      
      const upsertResult = await upsertEventWithDeduplication(eventData, event.source, supabase)
      
      if (upsertResult.action === 'insert') {
        results.inserted++
      } else if (upsertResult.action === 'update') {
        results.updated++
      } else {
        results.skipped++
      }
    } catch (err) {
      console.error(`[v0] Error processing event ${event.title}:`, err)
      results.errors++
    }
  }
  
  return results
}

export async function GET(request: Request) {
  // Verify authorization
  const authHeader = request.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  console.log('[v0] Starting scrape job...')
  
  try {
    // Run all scrapers in parallel.
    // allSettled y no all: si una fuente falla, las demás igual se ingestan y
    // el error queda reportado por fuente en vez de perderse.
    const providers = [
      { key: 'norteticket', run: scrapeNorteTicket },
      { key: 'entradauno', run: scrapeEntradaUno },
      { key: 'alpogo', run: scrapeAlpogo },
    ] as const

    const settled = await Promise.allSettled(providers.map((provider) => provider.run()))

    const allEvents: ScrapedEvent[] = []
    const scrapedBySource: Record<string, number> = {}
    const sourceErrors: Record<string, string> = {}

    settled.forEach((outcome, index) => {
      const { key } = providers[index]

      if (outcome.status === 'fulfilled') {
        scrapedBySource[key] = outcome.value.length
        allEvents.push(...outcome.value)
        console.log(`[v0] - ${key}: ${outcome.value.length}`)
      } else {
        const message = outcome.reason instanceof Error
          ? outcome.reason.message
          : String(outcome.reason)
        scrapedBySource[key] = 0
        sourceErrors[key] = message
        console.error(`[v0] - ${key}: FALLÓ -> ${message}`)
      }
    })

    console.log(`[v0] Total events scraped: ${allEvents.length}`)

    // Upsert all events to database
    const results = await upsertScrapedEvents(allEvents)
    
    console.log('[v0] Scrape job completed:', results)

    // Limpieza de flyers de Instagram expirados (TTL 14 días)
    let archivedFlyersCount = 0
    try {
      archivedFlyersCount = await archiveExpiredFlyers()
      console.log(`[v0] Instagram flyer cleanup: ${archivedFlyersCount} archivados`)
    } catch (cleanupError) {
      console.error('[v0] Error en cleanup de flyers IG:', cleanupError)
    }
    
    const failedSources = Object.keys(sourceErrors)

    return NextResponse.json({
      success: failedSources.length === 0,
      scraped: {
        ...scrapedBySource,
        total: allEvents.length
      },
      sourceErrors,
      database: results,
      instagramCleanup: {
        archivedFlyers: archivedFlyersCount
      },
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('[v0] Scrape job failed:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
