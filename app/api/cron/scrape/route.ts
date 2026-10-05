import { NextResponse } from 'next/server'
import { hasBearerSecret } from '@/lib/api-auth'
import { withJobRun, jobTriggerFrom } from '@/lib/job-runs'
import { summarizeVenueErrors } from '@/lib/venues/resolve'
import { runScrapeJob } from './run-scrape-job'

export async function GET(request: Request) {
  if (!hasBearerSecret(request, 'CRON_SECRET')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await withJobRun('ticketeras', jobTriggerFrom(request), runScrapeJob, (r) => {
    if ('error' in r) return { status: 'FAILED', errors: [String(r.error)] }
    const sourceErrors = Object.entries(r.sourceErrors).map(([source, message]) => `${source}: ${message}`)
    const errors = [...sourceErrors, ...summarizeVenueErrors(r.venueErrors)]
    return {
      status: errors.length ? 'PARTIAL' : 'SUCCESS',
      itemsProcessed: r.database.inserted + r.database.updated,
      itemsFailed: r.database.errors,
      errors,
      details: { scraped: r.scraped, database: r.database, instagramCleanup: r.instagramCleanup },
    }
  })
  return NextResponse.json(result, { status: 'error' in result ? 500 : 200 })
}
