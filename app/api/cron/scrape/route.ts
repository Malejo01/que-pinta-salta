import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { scrapeNorteTicket, scrapeCentralTicket, scrapeEntradaUno, scrapeAlpogo } from './providers'
import { ScrapedEvent } from './types'
import { upsertEventWithDeduplication } from '@/lib/scraper/deduplicate'
import { archiveExpiredFlyers } from '@/lib/instagram/process-apify-payload'

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
 * using aliases or direct name matching
 */
async function resolveVenue(supabase: ReturnType<typeof createAdminClient>, rawVenueName: string) {
  // First try direct venue match
  const { data: directMatch } = await supabase
    .from('venues')
    .select('id, name')
    .ilike('name', `%${rawVenueName}%`)
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
    .ilike('alias', `%${rawVenueName}%`)
    .limit(1)
    .single()
  
  if (aliasMatch) {
    return aliasMatch.target_id
  }
  
  return null
}

/**
 * Attempts to infer category from event title or venue
 */
async function resolveCategory(supabase: ReturnType<typeof createAdminClient>, title: string, venueName: string) {
  const titleLower = title.toLowerCase()
  const venueLower = venueName.toLowerCase()
  const combined = `${titleLower} ${venueLower}`
  
  // Keyword mappings for category inference
  const categoryKeywords: Record<string, string[]> = {
    'penas': ['peña', 'folklore', 'folklorica', 'chacarera', 'zamba', 'carnavalito'],
    'boliches': ['boliche', 'disco', 'electrónica', 'dj', 'fiesta', 'amnesia', 'club'],
    'teatro': ['teatro', 'obra', 'musical', 'ballet', 'danza', 'comedia'],
    'cine': ['cine', 'película', 'film', 'proyección'],
    'ferias': ['feria', 'mercado', 'artesanal', 'gastronomía'],
    'talleres': ['taller', 'curso', 'workshop', 'clase']
  }
  
  for (const [slug, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(kw => combined.includes(kw))) {
      const { data } = await supabase
        .from('categories')
        .select('id')
        .eq('slug', slug)
        .single()
      
      if (data) return data.id
    }
  }
  
  // Check category aliases
  const { data: aliasMatch } = await supabase
    .from('aliases')
    .select('target_id')
    .eq('target_type', 'category')
    .or(categoryKeywords['penas'].map(k => `alias.ilike.%${k}%`).join(','))
    .limit(1)
    .single()
  
  if (aliasMatch) {
    return aliasMatch.target_id
  }
  
  // Default to first category if nothing matches
  const { data: defaultCategory } = await supabase
    .from('categories')
    .select('id')
    .limit(1)
    .single()
  
  return defaultCategory?.id || null
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
      const categoryId = await resolveCategory(supabase, event.title, event.rawVenueName)
      
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
      const dateStr = event.dateTime.toISOString().split('T')[0]
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
    // Run all scrapers in parallel
    const [norteTicketEvents, centralTicketEvents, entradaUnoEvents, alpogoEvents] = await Promise.all([
      scrapeNorteTicket(),
      scrapeCentralTicket(),
      scrapeEntradaUno(),
      scrapeAlpogo()
    ])
    
    const allEvents = [...norteTicketEvents, ...centralTicketEvents, ...entradaUnoEvents, ...alpogoEvents]
    
    console.log(`[v0] Total events scraped: ${allEvents.length}`)
    console.log(`[v0] - NorteTicket: ${norteTicketEvents.length}`)
    console.log(`[v0] - CentralTicket: ${centralTicketEvents.length}`)
    console.log(`[v0] - EntradaUno: ${entradaUnoEvents.length}`)
    console.log(`[v0] - AlPogo: ${alpogoEvents.length}`)
    
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
    
    return NextResponse.json({
      success: true,
      scraped: {
        norteticket: norteTicketEvents.length,
        centralticket: centralTicketEvents.length,
        entradauno: entradaUnoEvents.length,
        alpogo: alpogoEvents.length,
        total: allEvents.length
      },
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
