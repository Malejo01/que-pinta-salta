import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { processFlyerWithAI } from '@/lib/ai/process-flyer-ai'

// Configurar tiempo máximo de ejecución en Vercel (Hobby tiene límite de 10s-15s, Pro hasta 60s)
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const WEBHOOK_SECRET = process.env.APIFY_WEBHOOK_SECRET

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
  // 1. Verificar autenticación/secreto para evitar llamadas maliciosas externas
  const urlSecret = new URL(request.url).searchParams.get('secret')
  const authHeader = request.headers.get('Authorization')
  
  let incomingSecret = urlSecret
  if (authHeader && authHeader.startsWith('Bearer ')) {
    incomingSecret = authHeader.substring(7)
  }

  if (WEBHOOK_SECRET && incomingSecret !== WEBHOOK_SECRET) {
    console.warn('[AI Processing Endpoint] Petición no autorizada')
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

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
      return NextResponse.json(
        { success: false, error: `Error en base de datos: ${fetchError.message}` },
        { status: 500 }
      )
    }

    if (!pendingFlyers || pendingFlyers.length === 0) {
      return NextResponse.json({
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

    return NextResponse.json({
      success: true,
      message: `Procesamiento en lote finalizado. Éxitos: ${successCount}, Fallas: ${failCount}`,
      processedCount: processedResults.length,
      results: processedResults,
    })

  } catch (err: any) {
    console.error('[AI Processing Endpoint] Error general en webhook:', err)
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/ai/process-flyers
 * Health check / Información del estado de procesamiento
 */
export async function GET(request: Request) {
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
      model: 'gemini-2.5-flash',
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
