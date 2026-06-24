import { NextResponse } from 'next/server'
import { processApifyPayload } from '@/lib/instagram/process-apify-payload'
import type { ApifyInstagramPost, ApifyWebhookPayload } from '@/lib/instagram-config'

const WEBHOOK_SECRET = process.env.APIFY_WEBHOOK_SECRET

/**
 * POST /api/webhooks/apify
 *
 * Recibe el payload de Apify cuando un Actor de Instagram termina.
 * El payload puede ser:
 *   1. Un array directo de posts (si se configura "dataset items" como body)
 *   2. Un objeto con resource.defaultDatasetId (payload por defecto de Apify)
 *
 * Para la Fase 1 usaremos el formato de array directo.
 */
export async function POST(request: Request) {
  // 1. Verificar autenticación del webhook
  const secret = request.headers.get('x-apify-webhook-secret')
    || new URL(request.url).searchParams.get('secret')

  if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
    console.warn('[Webhook Apify] Petición no autorizada')
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    // 2. Parsear el body
    const body = await request.json() as ApifyWebhookPayload

    let posts: ApifyInstagramPost[]

    if (Array.isArray(body)) {
      // Formato directo: array de posts
      posts = body
    } else if (body?.resource?.defaultDatasetId) {
      // Formato webhook estándar de Apify: necesitamos descargar el dataset
      // Esto requiere APIFY_API_TOKEN para hacer GET al dataset
      const apiToken = process.env.APIFY_API_TOKEN
      if (!apiToken) {
        return NextResponse.json(
          { error: 'APIFY_API_TOKEN not configured for dataset download' },
          { status: 500 }
        )
      }

      const datasetId = body.resource.defaultDatasetId
      const datasetUrl = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apiToken}&format=json`

      const datasetResponse = await fetch(datasetUrl)
      if (!datasetResponse.ok) {
        return NextResponse.json(
          { error: `Failed to fetch dataset: ${datasetResponse.status}` },
          { status: 502 }
        )
      }

      posts = await datasetResponse.json()
    } else {
      return NextResponse.json(
        { error: 'Invalid payload format. Expected array of posts or Apify webhook payload.' },
        { status: 400 }
      )
    }

    if (!posts.length) {
      return NextResponse.json({
        success: true,
        message: 'No posts in payload',
        processed: { inserted: 0, skipped: 0, errors: [] },
      })
    }

    console.log(`[Webhook Apify] Recibidos ${posts.length} posts para procesar`)

    // 3. Procesar los posts
    const result = await processApifyPayload(posts)

    console.log(`[Webhook Apify] Resultado: ${result.inserted} insertados, ${result.skipped} skipped, ${result.errors.length} errores`)

    return NextResponse.json({
      success: true,
      processed: result,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[Webhook Apify] Error procesando webhook:', err)
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
 * GET /api/webhooks/apify
 * Health check para verificar que el endpoint está activo.
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    engine: 'Instagram Event Engine v1',
    timestamp: new Date().toISOString(),
  })
}
