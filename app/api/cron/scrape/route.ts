import { NextResponse } from 'next/server'
import { runScrapeJob } from './run-scrape-job'

// Verify cron secret to prevent unauthorized access
const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runScrapeJob()
  return NextResponse.json(result, { status: 'error' in result ? 500 : 200 })
}
