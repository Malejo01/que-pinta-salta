import { NextResponse } from 'next/server'
import { triggerApifyInstagramScraper } from '@/lib/instagram/process-apify-payload'

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: Request) {
  // 1. Verificar autorización usando el secreto cron de Vercel
  const authHeader = request.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    console.warn('[Cron Instagram] Intento de acceso no autorizado')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[Cron Instagram] Iniciando ejecución del scraper de Instagram...')
  
  const result = await triggerApifyInstagramScraper()
  
  if (!result.success) {
    return NextResponse.json({
      success: false,
      error: result.message,
      details: result.errors
    }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    message: result.message,
    runId: result.runId
  })
}
