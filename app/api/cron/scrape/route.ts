import { NextResponse } from 'next/server'
import { hasBearerSecret } from '@/lib/api-auth'
import { runScrapeJob } from './run-scrape-job'

export async function GET(request: Request) {
  if (!hasBearerSecret(request, 'CRON_SECRET')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runScrapeJob()
  return NextResponse.json(result, { status: 'error' in result ? 500 : 200 })
}
