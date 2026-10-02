import { NextResponse } from 'next/server';
import { runCinemaScrapeAndSync } from '@/lib/scraper/cinema-scraper';
import { hasBearerSecret } from '@/lib/api-auth';
import { withJobRun, jobTriggerFrom } from '@/lib/job-runs';

export async function GET(request: Request) {
  // Verificar autorización: cabecera Bearer (el cron de Vercel) o desarrollo local.
  // No se acepta ?secret=: queda en los logs de acceso.
  const isAuthorized =
    process.env.NODE_ENV === 'development' ||
    hasBearerSecret(request, 'CRON_SECRET');

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[api-scrape-cinemas] Iniciando ejecución del scraper de cines...');
  try {
    const results = await withJobRun('cines', jobTriggerFrom(request), runCinemaScrapeAndSync, (r) => ({
      status: r.success ? 'SUCCESS' : 'FAILED',
      itemsProcessed: r.processed,
      details: { inserted: r.inserted, updated: r.updated, softDeleted: r.softDeleted },
    }));
    console.log('[api-scrape-cinemas] Ejecución completada exitosamente:', results);
    return NextResponse.json(results);
  } catch (error) {
    console.error('[api-scrape-cinemas] Error en la ejecución del scraper:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
