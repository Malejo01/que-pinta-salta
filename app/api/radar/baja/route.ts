import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { verifyUnsubscribe } from '@/lib/radar/baja'

export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 2048
const NO_STORE = { 'Cache-Control': 'no-store' }

function invalid() {
  return NextResponse.json({ ok: false }, { status: 400, headers: NO_STORE })
}

/**
 * Baja del Radar con un clic (QPS-016, RFC 8058). Sin login y sin confirmación.
 * Token válido: 200 { ok: true } exista o no el usuario; repetir no da error.
 * Token inválido o sin secreto: 400 { ok: false } sin detalle.
 */
export async function POST(request: NextRequest) {
  try {
    const declared = Number(request.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return invalid()

    const text = await request.text()
    if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return invalid()

    const query = request.nextUrl.searchParams
    const form = new URLSearchParams(text)
    const u = query.get('u') ?? form.get('u') ?? ''
    const t = query.get('t') ?? form.get('t') ?? ''

    if (!verifyUnsubscribe(u, t)) return invalid()

    const { error } = await createAdminClient()
      .from('user_radar_settings')
      .update({ email_frequency: 'disabled' })
      .eq('user_id', u.toLowerCase())

    if (error) {
      console.error('[RadarBaja] Error al dar de baja:', error.message)
      return NextResponse.json({ ok: false }, { status: 500, headers: NO_STORE })
    }

    const fromPage = form.get('from') === 'page' || (request.headers.get('accept') ?? '').includes('text/html')
    if (fromPage) {
      return NextResponse.redirect(new URL('/radar/baja?listo=1', request.url), { status: 303, headers: NO_STORE })
    }
    return NextResponse.json({ ok: true }, { headers: NO_STORE })
  } catch {
    return invalid()
  }
}
