import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { processFlyerWithAI } from '@/lib/ai/process-flyer-ai'
import { GEMINI_MODEL } from '@/lib/ai/gemini'
import { hasBearerSecret } from '@/lib/api-auth'
import { summarizeVenueErrors } from '@/lib/venues/resolve'
import { withJobRun, jobTriggerFrom, type JobOutcome } from '@/lib/job-runs'

// Configurar tiempo máximo de ejecución en Vercel (Hobby tiene límite de 10s-15s, Pro hasta 60s)
export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * POST /api/ai/process-flyers
 *
 * Endpoint desacoplado que busca flyers pendientes (ai_status = 'PENDING' y status = 'ACTIVE')
 * y los procesa por lotes llamando a la API de Gemini Vision.
 *
 * Parámetros de consulta (Query Params):
 * - limit: cantidad máxima de flyers a procesar en esta ejecución (default: 3)
 */
export async function POST(request: Request) {
  // 1. Verificar autenticación/secreto para evitar llamadas maliciosas externas.
  // Solo por header: un ?secret= quedaría en los logs de acceso. Acepta
  // CRON_SECRET (el workflow de GitHub Actions) o APIFY_WEBHOOK_SECRET.
  if (!hasBearerSecret(request, 'CRON_SECRET') && !hasBearerSecret(request, 'APIFY_WEBHOOK_SECRET')) {
    console.warn('[AI Processing Endpoint] Petición no autorizada')
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  // Cada lote queda registrado en job_runs (cola_ia).
  const { httpStatus, body } = await withJobRun('cola_ia', jobTriggerFrom(request), () => processBatch(request), batchOutcome)
  return NextResponse.json(body, { status: httpStatus })
}

type BatchReply = { httpStatus: number; body: Record<string, any> }

const reply = (httpStatus: number, body: Record<string, any>): BatchReply => ({ httpStatus, body })

function batchOutcome({ httpStatus, body }: BatchReply): JobOutcome {
  if (httpStatus >= 500) return { status: 'FAILED', errors: [String(body.error ?? 'error')] }
  const results: Array<{ success: boolean; error?: string; action?: string; venueError?: string }> = body.results ?? []
  if (results.length === 0) return { status: 'SKIPPED' }
  const failed = results.filter((r) => !r.success)
  // Un flyer con evento creado pero sin lugar (resolve_venue_id falló) no es
  // "fallido", pero la corrida igual queda PARTIAL con el error a la vista.
  const venueErrors = results.flatMap((r) => (r.venueError ? [r.venueError] : []))
  const errors = [...failed.map((r) => r.error ?? 'falló'), ...summarizeVenueErrors(venueErrors)]
  return {
    status: errors.length ? 'PARTIAL' : 'SUCCESS',
    itemsProcessed: results.length - failed.length,
    itemsFailed: failed.length,
    errors,
    details: { acciones: results.map((r) => r.action ?? null) },
  }
}

async function processBatch(request: Request): Promise<BatchReply> {
  try {
    const supabase = createAdminClient()
    
    // Parsear limit del query param o body
    const { searchParams } = new URL(request.url)
    const limitParam = searchParams.get('limit')
    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 3, 10) : 3

    // 2. Obtener flyers pendientes que estén activos
    const { data: pendingFlyers, error: fetchError } = await supabase
      .from('instagram_flyers')
      .select('id, ig_post_id')
      .eq('ai_status', 'PENDING')
      .eq('status', 'ACTIVE')
      .order('published_at', { ascending: false })
      .limit(limit)

    if (fetchError) {
      console.error('[AI Processing Endpoint] Error obteniendo flyers pendientes:', fetchError)
      return reply(500, { success: false, error: `Error en base de datos: ${fetchError.message}` })
    }

    if (!pendingFlyers || pendingFlyers.length === 0) {
      return reply(200, {
        success: true,
        message: 'No hay flyers activos con procesamiento de IA pendiente.',
        processedCount: 0,
        results: [],
      })
    }

    console.log(`[AI Processing Endpoint] Iniciando procesamiento de ${pendingFlyers.length} flyers en lote.`)

    // 3. Procesar en paralelo (Promise.allSettled) para resiliencia y velocidad
    const tasks = pendingFlyers.map(async (flyer) => {
      try {
        const result = await processFlyerWithAI(flyer.id)
        return {
          flyerId: flyer.id,
          igPostId: flyer.ig_post_id,
          success: result.success,
          eventId: result.eventId,
          action: result.action,
          error: result.error,
          venueError: result.venueError,
        }
      } catch (err: any) {
        return {
          flyerId: flyer.id,
          igPostId: flyer.ig_post_id,
          success: false,
          error: err.message || String(err),
        }
      }
    })

    const results = await Promise.allSettled(tasks)

    // Formatear resultados finales
    const processedResults = results.map((res, index) => {
      if (res.status === 'fulfilled') {
        return res.value
      } else {
        return {
          flyerId: pendingFlyers[index].id,
          igPostId: pendingFlyers[index].ig_post_id,
          success: false,
          error: `Error crítico en promesa: ${res.reason}`,
        }
      }
    })

    const successCount = processedResults.filter(r => r.success).length
    const failCount = processedResults.length - successCount

    console.log(`[AI Processing Endpoint] Lote completado. Éxitos: ${successCount}, Fallidos: ${failCount}`)

    return reply(200, {
      success: true,
      message: `Procesamiento en lote finalizado. Éxitos: ${successCount}, Fallas: ${failCount}`,
      processedCount: processedResults.length,
      results: processedResults,
    })

  } catch (err: any) {
    console.error('[AI Processing Endpoint] Error general en webhook:', err)
    return reply(500, {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    })
  }
}

/**
 * GET /api/ai/process-flyers
 * Health check / Información del estado de procesamiento. Lee con service
 * role, así que exige el mismo Bearer que el POST.
 */
export async function GET(request: Request) {
  if (!hasBearerSecret(request, 'APIFY_WEBHOOK_SECRET')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()
    
    // Obtener contadores del estado de procesamiento
    const [
      { count: pendingCount },
      { count: processedCount },
      { count: failedCount },
    ] = await Promise.all([
      supabase.from('instagram_flyers').select('*', { count: 'exact', head: true }).eq('ai_status', 'PENDING').eq('status', 'ACTIVE'),
      supabase.from('instagram_flyers').select('*', { count: 'exact', head: true }).eq('ai_status', 'PROCESSED'),
      supabase.from('instagram_flyers').select('*', { count: 'exact', head: true }).eq('ai_status', 'FAILED'),
    ])

    return NextResponse.json({
      status: 'active',
      model: GEMINI_MODEL,
      stats: {
        pending_active_flyers: pendingCount ?? 0,
        processed_flyers: processedCount ?? 0,
        failed_flyers: failedCount ?? 0,
      },
      timestamp: new Date().toISOString(),
    })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    )
  }
}
