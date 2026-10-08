import { createAdminClient } from '@/lib/supabase/server'
import { extractEventFromFlyer } from './gemini'
import { AIProcessingResult, GeminiExtractionResult } from './types'
import { upsertVenue, resolveCategoryId } from '@/lib/scraper/save-to-supabase'
import { upsertEventWithDeduplication } from '@/lib/scraper/deduplicate'
import { saltaWallClockToUtcISO } from '@/lib/date-format'
import { validatePrice, validateStartTime, validateVenue } from './validate-extraction'

// Helper simple de slugify para evitar problemas con importaciones
function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
    .replace(/\s+/g, '-')           // Reemplazar espacios por guiones
    .replace(/[^\w\-]+/g, '')       // Quitar caracteres especiales
    .replace(/\-\-+/g, '-')         // Colapsar guiones múltiples
    .replace(/^-+/, '')             // Quitar guiones iniciales
    .replace(/-+$/, '')             // Quitar guiones finales
}

// Limpia campos de texto que la IA podría devolver como el string "null"
function cleanStringField(val: any): string | null {
  if (val === null || val === undefined) return null
  const s = String(val).trim()
  if (s.toLowerCase() === 'null' || s === '') return null
  return s
}

/**
 * Descarga una imagen desde una URL y retorna un Buffer y su mimeType.
 */
async function fetchImageBuffer(url: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; QuePintaSalta/1.0)',
    },
  })

  if (!response.ok) {
    throw new Error(`Fallo al descargar imagen para procesar con IA: ${response.statusText}`)
  }

  const contentType = response.headers.get('content-type') || 'image/jpeg'
  const arrayBuffer = await response.arrayBuffer()
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: contentType,
  }
}

/**
 * Resultado del procesamiento. `venueError` se completa cuando resolve_venue_id
 * falló: el evento se crea igual, sin lugar, pero la corrida tiene que quedar
 * PARTIAL (lo cuenta batchOutcome en app/api/ai/process-flyers/route.ts).
 */
export type FlyerProcessingResult = AIProcessingResult & { venueError?: string }

/** Arma el mensaje "venue: <nombre crudo>: <mensaje>" (máx. 200 caracteres). */
function venueErrorMessage(rawName: string, message: string): string {
  return `venue: ${rawName}: ${message}`.slice(0, 200)
}

/**
 * Texto fijo para ai_metadata: anon puede leerlo (flyers ACTIVE y eventos
 * PUBLISHED), así que no lleva el nombre ni el mensaje crudo de la base. El
 * detalle completo va solo al resultado (job_runs.errors, solo admins).
 */
const VENUE_ERROR_PUBLIC = 'no se pudo resolver el lugar'

/**
 * Procesa un flyer individual utilizando Gemini e inserta el evento en Supabase.
 */
export async function processFlyerWithAI(flyerId: string): Promise<FlyerProcessingResult> {
  const supabase = createAdminClient()

  // 1. Obtener el flyer con la cuenta asociada
  const { data: flyer, error: flyerError } = await supabase
    .from('instagram_flyers')
    .select(`
      *,
      account:instagram_accounts(*)
    `)
    .eq('id', flyerId)
    .single()

  if (flyerError || !flyer) {
    return {
      success: false,
      error: `No se pudo obtener el flyer: ${flyerError?.message || 'No encontrado'}`,
    }
  }

  // Si ya fue procesado con éxito, lo saltamos
  if (flyer.ai_status === 'PROCESSED') {
    return {
      success: true,
      action: 'skip',
      error: 'Flyer ya procesado previamente con éxito.',
    }
  }

  const account = flyer.account
  const imageUrl = flyer.storage_image_url || flyer.original_image_url

  if (!imageUrl) {
    await supabase
      .from('instagram_flyers')
      .update({
        ai_status: 'SKIPPED',
        ai_metadata: { error: 'Flyer sin URL de imagen válida.' },
        ai_processed_at: new Date().toISOString(),
      })
      .eq('id', flyerId)

    return {
      success: false,
      error: 'El flyer no contiene una URL de imagen para procesar.',
    }
  }

  let imageBuffer: Buffer
  let mimeType: string

  // 2. Descargar la imagen
  try {
    const res = await fetchImageBuffer(imageUrl)
    imageBuffer = res.buffer
    mimeType = res.mimeType
  } catch (downloadError: any) {
    console.error(`[AI Pipeline] Error descargando imagen del flyer ${flyerId}:`, downloadError)
    
    // Guardar estado fallido y continuar con el guardado fallback del evento
    return await handleProcessingFallback(
      flyer,
      account,
      `Error de descarga de imagen: ${downloadError.message || downloadError}`
    )
  }

  // 3. Invocar a Gemini
  try {
    const rawExtraction = await extractEventFromFlyer(
      imageBuffer,
      mimeType,
      flyer.caption,
      account?.username || null
    )
    // flyer_text solo vive en memoria para los controles: no se persiste ni se devuelve.
    const { flyer_text: flyerText, ...publicData } = rawExtraction
    const extractedData = publicData

    // 4. Resolver datos geográficos y categóricos
    // Controles deterministas sobre la salida del modelo (QPS-062, QPS-065).
    // flyer_text es la transcripción del flyer que devuelve el propio modelo.
    const price = validatePrice(extractedData.price, flyer.caption, flyerText)
    const timeCheck = validateStartTime(extractedData.start_time, flyer.caption, flyerText)

    // Resolver Venue. validateVenue solo clasifica (QPS-070): el lugar elegido es
    // el mismo de siempre, inferred/source no cambian ni qualifiesForAutoPublish ni el estado.
    const rawVenueName = cleanStringField(extractedData.venue_name)
    const venueCheck = validateVenue(rawVenueName, account?.default_venue_name, flyer.caption, flyerText)
    const venueName = venueCheck.name
    let venueError: string | undefined
    const venueId = await upsertVenue(venueName, 'instagram-ai', (raw, message) => {
      venueError = venueErrorMessage(raw, message)
    })

    // Resolver Categoría
    const rawCategorySlug = cleanStringField(extractedData.category_slug)
    const categorySlug = rawCategorySlug || account?.default_category || 'espectaculos'
    const categoryId = await resolveCategoryId(categorySlug)

    // Formatear Fecha de Inicio. Si Gemini no extrajo fecha, usamos fallback published_at.
    // Ojo: published_at viene de Apify como instante UTC real, así que NO se convierte.
    let startDate = flyer.published_at
    const rawDate = cleanStringField(extractedData.date)
    const isValidDate = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
    // QPS-073: de dónde salió la fecha final, para exigir confirmación en
    // publishDraftEvent cuando no vino del flyer sino del posteo.
    const dateSource = isValidDate ? 'flyer' : 'published_at'

    if (isValidDate) {
      // Validar si la fecha extraída es anterior a la fecha actual (local en Argentina/Salta)
      const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Salta' })
      
      if (rawDate < todayStr) {
        // Evento caducado: marcar flyer como SKIPPED en base de datos y salir
        await supabase
          .from('instagram_flyers')
          .update({
            ai_status: 'SKIPPED',
            ai_metadata: {
              message: 'Evento caducado',
              extracted_data: publicData,
              processed_at: new Date().toISOString()
            },
            ai_processed_at: new Date().toISOString()
          })
          .eq('id', flyerId)

        return {
          success: true,
          action: 'skip',
          error: 'Evento caducado'
        }
      }

      // Hora de pared de Salta; sin hora escrita en caption/flyer, 00:00 (QPS-065).
      startDate = saltaWallClockToUtcISO(`${rawDate}T${timeCheck.time}:00`)
    }

    // Generar slug del evento
    const rawTitle = cleanStringField(extractedData.title)
    const eventTitle = rawTitle || `Evento flyer @${account?.username}`
    const eventSlug = `${slugify(eventTitle)}-${flyer.ig_post_id}`

    // Evaluar si califica para auto-publicación: requiere título, fecha, hora y lugar válidos y detectados
    const hasTitle = !!extractedData.title && extractedData.title.trim().length > 0
    const hasDate = !!extractedData.date && /^\d{4}-\d{2}-\d{2}$/.test(extractedData.date)
    const hasTime = timeCheck.reliable
    const hasVenue = !!venueName && venueName !== 'Lugar no especificado'
    
    const qualifiesForAutoPublish = !!(hasTitle && hasDate && hasTime && hasVenue)
    const eventStatus = qualifiesForAutoPublish ? 'PUBLISHED' : 'DRAFT'

    // Armar data del evento
    const eventData = {
      title: eventTitle,
      slug: eventSlug,
      description: flyer.caption || null,
      short_description: null,
      category_id: categoryId || null,
      venue_id: venueId || null,
      image_url: imageUrl,
      gallery_urls: [],
      start_date: startDate,
      end_date: null,
      is_recurring: false,
      recurrence_rule: null,
      price_min: price !== null ? price : 0,
      price_max: null,
      is_free: price === 0,
      ticket_url: flyer.ig_post_url,
      is_commercial: false,
      age_restriction: 0,
      tags: extractedData.artists || [],
      status: eventStatus,
      is_featured: false,
      view_count: 0,
      created_by: null,
      classification_source: 'scraper',
      ai_metadata: {
        extracted_data: publicData,
        original_caption: flyer.caption,
        flyer_id: flyer.id,
        processed_at: new Date().toISOString(),
        auto_published: qualifiesForAutoPublish,
        // Medición de QPS-065: si la hora del modelo se confirmó en el texto.
        time_reliable: timeCheck.reliable,
        // QPS-073: 'flyer' si la fecha vino de la IA, 'published_at' si fue fallback.
        date_source: dateSource,
        // Medición de QPS-070: si el lugar quedó inferido (sin confirmar en el texto) y de dónde salió.
        venue_inferred: venueCheck.inferred,
        venue_source: venueCheck.source,
        ...(venueError ? { venue_error: VENUE_ERROR_PUBLIC } : {}),
      },
    }

    // 5. Insertar / Actualizar con deduplicación
    const upsertRes = await upsertEventWithDeduplication(eventData, 'instagram-ai', supabase)

    // 6. Actualizar estado del flyer original
    await supabase
      .from('instagram_flyers')
      .update({
        ai_status: 'PROCESSED',
        ai_metadata: {
          extracted_data: publicData,
          event_id: upsertRes.eventId,
          action: upsertRes.action,
          auto_published: qualifiesForAutoPublish,
          time_reliable: timeCheck.reliable,
          date_source: dateSource,
          venue_inferred: venueCheck.inferred,
          venue_source: venueCheck.source,
          ...(venueError ? { venue_error: VENUE_ERROR_PUBLIC } : {}),
        },
        ai_processed_at: new Date().toISOString(),
        venue_name: venueName,
        category: categorySlug,
        price_min: price !== null ? price : 0,
        is_free: price === 0,
      })
      .eq('id', flyerId)

    return {
      success: true,
      extractedData: publicData,
      eventId: upsertRes.eventId,
      action: upsertRes.action,
      ...(venueError ? { venueError } : {}),
    }
  } catch (aiError: any) {
    console.error(`[AI Pipeline] Error procesando con Gemini en flyer ${flyerId}:`, aiError)
    
    // Guardar estado fallido y continuar con el guardado fallback del evento
    return await handleProcessingFallback(
      flyer,
      account,
      `Error de IA o procesamiento: ${aiError.message || aiError}`
    )
  }
}

/**
 * Maneja el fallback en caso de excepción (Gemini fallido, timeout, imagen rota).
 * Inserta el evento en estado DRAFT pero con campos nulos para revisión manual y
 * marca el flyer original como FAILED en base de datos.
 */
async function handleProcessingFallback(
  flyer: any,
  account: any,
  errorMessage: string
): Promise<FlyerProcessingResult> {
  const supabase = createAdminClient()
  const imageUrl = flyer.storage_image_url || flyer.original_image_url

  try {
    // Resolver Venue y Categoría por defecto de la cuenta de Instagram
    const venueName = account?.default_venue_name || 'Lugar no especificado'
    let venueError: string | undefined
    const venueId = await upsertVenue(venueName, 'instagram-ai', (raw, message) => {
      venueError = venueErrorMessage(raw, message)
    })

    const categorySlug = account?.default_category || 'espectaculos'
    const categoryId = await resolveCategoryId(categorySlug)

    const eventTitle = `Revisar: Flyer de @${account?.username || 'Instagram'}`
    const eventSlug = `revisar-flyer-${flyer.ig_post_id}`

    // Insertar evento vacío en estado DRAFT
    const fallbackEventData = {
      title: eventTitle,
      slug: eventSlug,
      description: flyer.caption || null,
      short_description: null,
      category_id: categoryId || null,
      venue_id: venueId || null,
      image_url: imageUrl,
      gallery_urls: [],
      start_date: flyer.published_at, // Usar fecha de publicación del post como fallback
      end_date: null,
      is_recurring: false,
      recurrence_rule: null,
      price_min: 0,
      price_max: null,
      is_free: false,
      ticket_url: flyer.ig_post_url,
      is_commercial: false,
      age_restriction: 0,
      tags: [],
      status: 'DRAFT', // Obligatorio
      is_featured: false,
      view_count: 0,
      created_by: null,
      classification_source: 'scraper',
      ai_metadata: {
        error: errorMessage,
        original_caption: flyer.caption,
        flyer_id: flyer.id,
        is_fallback: true,
        // QPS-073: en la falla no corrió la IA, así que la fecha siempre es published_at.
        date_source: 'published_at',
        processed_at: new Date().toISOString(),
        ...(venueError ? { venue_error: VENUE_ERROR_PUBLIC } : {}),
      },
    }

    const upsertRes = await upsertEventWithDeduplication(fallbackEventData, 'instagram-ai', supabase)

    // Actualizar el flyer a FAILED pero linkear el evento de fallback
    await supabase
      .from('instagram_flyers')
      .update({
        ai_status: 'FAILED',
        ai_metadata: {
          error: errorMessage,
          event_id: upsertRes.eventId,
          is_fallback: true,
          date_source: 'published_at',
          ...(venueError ? { venue_error: VENUE_ERROR_PUBLIC } : {}),
        },
        ai_processed_at: new Date().toISOString(),
      })
      .eq('id', flyer.id)

    return {
      success: false,
      error: errorMessage,
      eventId: upsertRes.eventId,
      action: upsertRes.action,
      ...(venueError ? { venueError } : {}),
    }
  } catch (fallbackError: any) {
    console.error(`[AI Pipeline] Error crítico en el fallback para flyer ${flyer.id}:`, fallbackError)
    
    // Si incluso el fallback falla en base de datos, marcamos el flyer como FAILED sin evento asociado
    try {
      await supabase
        .from('instagram_flyers')
        .update({
          ai_status: 'FAILED',
          ai_metadata: {
            error: errorMessage,
            fallback_error: fallbackError.message || fallbackError,
          },
          ai_processed_at: new Date().toISOString(),
        })
        .eq('id', flyer.id)
    } catch (dbErr) {
      console.error('[AI Pipeline] Error guardando estado de falla en BD:', dbErr)
    }

    return {
      success: false,
      error: `Error crítico en fallback: ${fallbackError.message || fallbackError}`,
    }
  }
}
