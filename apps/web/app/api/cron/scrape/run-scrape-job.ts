import { createAdminClient } from '@/lib/supabase/server'
import { scrapeNorteTicket, scrapeEntradaUno, scrapeAlpogo } from './providers'
import { ScrapedEvent } from './types'
import { upsertEventWithDeduplication } from '@/lib/scraper/deduplicate'
import { formatVenueError, resolveVenueId } from '@/lib/venues/resolve'
import { archiveExpiredFlyers } from '@/lib/instagram/process-apify-payload'
import { resolveCategoryWithAliases } from '@/lib/scraper/categorize'
import { formatSaltaDayKey } from '@/lib/date-format'
import { copyExternalImage, isOwnStorageUrl } from '@/lib/images/external'
import { INSTAGRAM_ENGINE_CONFIG } from '@/lib/instagram-config'
import { isThumbnail } from '@/lib/scraper/merge-events'

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
 * Resuelve el venue_id canónico de un nombre crudo; si no existe, lo crea.
 *
 * Antes esta ruta tenía su propia resolución con `ilike('name', '%'+name+'%')`:
 * el match por substring devolvía cualquier fila que contuviera el texto (con
 * "%one%" matcheaba "Centro de Convenciones Salta"), y `.single()` sobre un
 * ilike con varias filas fallaba y caía a crear un venue duplicado. Ahora va,
 * como las demás rutas de ingesta, por resolve_venue_id() en Postgres: alias y
 * nombre exacto normalizados primero; el fuzzy solo sugiere a revisión.
 */
async function resolveVenue(
  supabase: ReturnType<typeof createAdminClient>,
  rawVenueName: string,
  source: string,
  onError: (rawName: string, message: string) => void
) {
  return resolveVenueId(supabase, rawVenueName, { source, autocreate: true, onError })
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
  // Fallas de resolve_venue_id: el evento se crea igual, sin lugar, pero la
  // corrida tiene que quedar PARTIAL para que se vea.
  const venueErrors: string[] = []
  const onVenueError = (rawName: string, message: string) => {
    venueErrors.push(formatVenueError(rawName, message))
  }

  // Categorías consideradas comerciales prioritarias
  const commercialCategories = new Set(['recitales', 'teatro', 'boliches', 'penas'])

  // Creado al toque, no acá arriba: si ningún evento trae imagen externa no
  // tiene sentido pedirlo. Mismo patrón que lib/scraper/save-to-supabase.ts.
  let storageClient: ReturnType<typeof supabase.storage.from> | null = null

  for (const event of events) {
    try {
      // Resolve venue and category
      const venueId = await resolveVenue(supabase, event.rawVenueName, event.source, onVenueError)
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

      // Copiar el afiche externo a Storage (QPS-144): antes, este cron
      // guardaba `event.flyerUrl` crudo y sólo los botones del admin
      // (lib/scraper/save-to-supabase.ts) copiaban la imagen a nuestro
      // Storage. Mismo bloque, mismas funciones: si la copia falla
      // (devuelve null) o lanza, queda la URL original y el evento se guarda
      // igual, como hoy — el try/catch es local a la copia, no al evento
      // entero, para no contarlo como error de procesamiento ni saltearlo.
      // El `try` cubre también crear `storageClient`, no sólo
      // `copyExternalImage`: un cron que no puede copiar imágenes (acá,
      // porque `supabase.storage.from` lanzó) tiene que seguir ingestando el
      // evento con la URL cruda, no perder la corrida (vuelta 2, 31-a).
      //
      // Una miniatura NO se copia (vuelta 1, 31-a, bloqueante del revisor):
      // una vez copiada, la URL pasa a ser `externas/<sha1 hex>.<ext>`, y un
      // digest hexadecimal nunca puede contener el texto que `isThumbnail`
      // busca ("150x150", "thumb") — quedaría atascada para siempre, sin que
      // ninguna corrida futura con la imagen grande pueda reemplazarla (ver
      // el comentario de `isThumbnail` en merge-events.ts). Dejando la
      // miniatura cruda sin copiar, el merge la sigue viendo como miniatura y
      // la excepción de calidad la reemplaza en cuanto llegue la grande.
      if (eventData.image_url && !isOwnStorageUrl(eventData.image_url) && !isThumbnail(eventData.image_url)) {
        try {
          storageClient ??= supabase.storage.from(INSTAGRAM_ENGINE_CONFIG.STORAGE_BUCKET)
          const storageUrl = await copyExternalImage(eventData.image_url, storageClient)
          if (storageUrl) {
            eventData.image_url = storageUrl
          }
        } catch (copyError) {
          console.error(`[v0] Error copiando imagen a Storage para ${event.title}:`, copyError)
        }
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
  
  return { results, venueErrors }
}

/**
 * Scrape de NorteTicket, EntradaUno y AlPogo + limpieza de flyers de Instagram.
 * Sin autenticación: la verifica quien lo llama (el cron con CRON_SECRET, la
 * server action del panel con el rol ADMIN). Nunca lanza: los errores vuelven
 * en el cuerpo con success: false.
 */
export async function runScrapeJob() {
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
    const { results, venueErrors } = await upsertScrapedEvents(allEvents)
    
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

    return {
      success: failedSources.length === 0,
      scraped: {
        ...scrapedBySource,
        total: allEvents.length
      },
      sourceErrors,
      database: results,
      venueErrors,
      instagramCleanup: {
        archivedFlyers: archivedFlyersCount
      },
      timestamp: new Date().toISOString()
    }
    
  } catch (error) {
    console.error('[v0] Scrape job failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
