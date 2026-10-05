import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isBotOrPrefetch, isUuid, parseOrigin, recordMetric, safeTicketUrl } from '@/lib/metricas'

export const dynamic = 'force-dynamic'

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex',
}

/** Destino: ticket_url guardado (ya validado http/https) o una ruta propia. */
function redirectTo(request: NextRequest, destination: string) {
  const url = new URL(destination, request.url)
  return new NextResponse(null, { status: 302, headers: { ...NO_CACHE_HEADERS, Location: url.toString() } })
}

/**
 * Salida a la ticketera con conteo del clic (QPS-027).
 * El destino sale SIEMPRE de events.ticket_url; nada del request se usa como
 * destino. Si algo falla, se redirige igual: medir no rompe la compra.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  if (!isUuid(id)) {
    return redirectTo(request, '/')
  }

  let ticketUrl: string | null = null
  let supabase: ReturnType<typeof createAdminClient> | null = null

  try {
    supabase = createAdminClient()
    const { data } = await supabase
      .from('events')
      .select('ticket_url')
      .eq('id', id)
      .eq('status', 'PUBLISHED')
      .maybeSingle()
    ticketUrl = safeTicketUrl(data?.ticket_url)
  } catch (err) {
    console.error('[go] no se pudo leer el evento:', err instanceof Error ? err.message : err)
  }

  if (!ticketUrl) {
    return redirectTo(request, `/evento/${id}`)
  }

  if (supabase && !isBotOrPrefetch(request.headers, request.method)) {
    const origin = parseOrigin(request.nextUrl.searchParams.get('o'))
    await recordMetric(supabase, id, 'click', origin)
  }

  return redirectTo(request, ticketUrl)
}
