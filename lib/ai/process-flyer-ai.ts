import { createAdminClient } from '@/lib/supabase/server'
import { extractEventFromFlyer } from './gemini'
import { AIProcessingResult, GeminiExtractionResult } from './types'
import { upsertVenue, resolveCategoryId } from '@/lib/scraper/save-to-supabase'
import { upsertEventWithDeduplication } from '@/lib/scraper/deduplicate'
import { saltaWallClockToUtcISO } from '@/lib/date-format'

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
 * Procesa un flyer individual utilizando Gemini e inserta el evento en Supabase.
 */
export async function processFlyerWithAI(flyerId: string): Promise<AIProcessingResult> {
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
    const extractedData = await extractEventFromFlyer(
      imageBuffer,
      mimeType,
      flyer.caption,
      account?.username || null
    )

    // 4. Resolver datos geográficos y categóricos
    // Resolver Venue
    const rawVenueName = cleanStringField(extractedData.venue_name)
    const venueName = rawVenueName || account?.default_venue_name || 'Lugar no especificado'
    const venueId = await upsertVenue(venueName)

    // Resolver Categoría
    const rawCategorySlug = cleanStringField(extractedData.category_slug)
    const categorySlug = rawCategorySlug || account?.default_category || 'espectaculos'
    const categoryId = await resolveCategoryId(categorySlug)

    // Formatear Fecha de Inicio. Si Gemini no extrajo fecha, usamos fallback published_at.
    // Ojo: published_at viene de Apify como instante UTC real, así que NO se convierte.
    let startDate = flyer.published_at
    const rawDate = cleanStringField(extractedData.date)
    const isValidDate = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)

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
              extracted_data: extractedData,
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

      const rawTime = cleanStringField(extractedData.start_time)
      const isValidTime = rawTime && /^\d{2}:\d{2}$/.test(rawTime)
      const timeStr = isValidTime ? rawTime : '20:00'
      // Gemini lee la hora del flyer, que es hora de pared de Salta.
      startDate = saltaWallClockToUtcISO(`${rawDate}T${timeStr}:00`)
    }

    // Generar slug del evento
    const rawTitle = cleanStringField(extractedData.title)
    const eventTitle = rawTitle || `Evento flyer @${account?.username}`
    const eventSlug = `${slugify(eventTitle)}-${flyer.ig_post_id}`

    // Evaluar si califica para auto-publicación: requiere título, fecha, hora y lugar válidos y detectados
    const hasTitle = !!extractedData.title && extractedData.title.trim().length > 0
    const hasDate = !!extractedData.date && /^\d{4}-\d{2}-\d{2}$/.test(extractedData.date)
    const hasTime = !!extractedData.start_time && /^\d{2}:\d{2}$/.test(extractedData.start_time)
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
      price_min: extractedData.price !== null ? extractedData.price : 0,
      price_max: null,
      is_free: extractedData.price === 0,
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
        extracted_data: extractedData,
        original_caption: flyer.caption,
        flyer_id: flyer.id,
        processed_at: new Date().toISOString(),
        auto_published: qualifiesForAutoPublish,
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
          extracted_data: extractedData,
          event_id: upsertRes.eventId,
          action: upsertRes.action,
          auto_published: qualifiesForAutoPublish,
        },
        ai_processed_at: new Date().toISOString(),
        venue_name: venueName,
        category: categorySlug,
        price_min: extractedData.price !== null ? extractedData.price : 0,
        is_free: extractedData.price === 0,
      })
      .eq('id', flyerId)

    return {
      success: true,
      extractedData,
      eventId: upsertRes.eventId,
      action: upsertRes.action,
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
): Promise<AIProcessingResult> {
  const supabase = createAdminClient()
  const imageUrl = flyer.storage_image_url || flyer.original_image_url

  try {
    // Resolver Venue y Categoría por defecto de la cuenta de Instagram
    const venueName = account?.default_venue_name || 'Lugar no especificado'
    const venueId = await upsertVenue(venueName)

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
        processed_at: new Date().toISOString(),
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
        },
        ai_processed_at: new Date().toISOString(),
      })
      .eq('id', flyer.id)

    return {
      success: false,
      error: errorMessage,
      eventId: upsertRes.eventId,
      action: upsertRes.action,
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
