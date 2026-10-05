import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isBotOrPrefetch, isUuid, parseOrigin, recordMetric } from '@/lib/metricas'

export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 1024

function noContent() {
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
}

/**
 * Cuenta una vista de evento (QPS-027). La manda el cliente con sendBeacon al
 * montar la ficha o el modal. Responde 204 siempre: no le da información a
 * quien intente abusar.
 */
export async function POST(request: NextRequest) {
  try {
    if (isBotOrPrefetch(request.headers, request.method)) return noContent()

    // sendBeacon puede mandar text/plain: se lee como texto y se parsea.
    const text = await request.text()
    if (text.length > MAX_BODY_BYTES) return noContent()

    const body = JSON.parse(text) as { eventId?: unknown; origin?: unknown }
    if (!isUuid(body?.eventId)) return noContent()

    await recordMetric(createAdminClient(), body.eventId, 'view', parseOrigin(body.origin))
  } catch {
    // Silencioso a propósito.
  }
  return noContent()
}
