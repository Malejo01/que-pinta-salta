import { NextResponse } from 'next/server';
import { runCinemaScrapeAndSync } from '@/lib/scraper/cinema-scraper';

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: Request) {
  // Verificar autorización (soporta cabecera Bearer, parámetro de consulta ?secret= y desarrollo local)
  const authHeader = request.headers.get('authorization');
  const { searchParams } = new URL(request.url);
  const secretParam = searchParams.get('secret');
  
  const isAuthorized = 
    !CRON_SECRET || 
    authHeader === `Bearer ${CRON_SECRET}` || 
    secretParam === CRON_SECRET ||
    process.env.NODE_ENV === 'development';

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[api-scrape-cinemas] Iniciando ejecución del scraper de cines...');
  try {
    const results = await runCinemaScrapeAndSync();
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
