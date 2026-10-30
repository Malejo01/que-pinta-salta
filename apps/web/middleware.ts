import { updateSession } from '@/lib/supabase/proxy'
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { decideGone, GONE_HTML, parseGonePath, type GoneDecision } from '@/lib/seo/gone'

/**
 * 308 / 410 de /flyer/<uuid>, /evento/<uuid> y /en/evento/<uuid> que ya no
 * existen (lib/seo/gone.ts).
 * Una página no puede responder 410, por eso va acá. Corre en paralelo con
 * updateSession (que ya consulta Supabase en cada pedido), así que no suma una
 * vuelta más a la latencia.
 */
async function goneCheck(request: NextRequest): Promise<GoneDecision> {
  const target = parseGonePath(request.nextUrl.pathname)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!target || !url || !key) return { kind: 'pass' }

  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const hasSession = request.cookies.getAll().some((c) => c.name.startsWith('sb-') && c.name.includes('auth-token'))
  return decideGone(client, target, hasSession)
}

export async function middleware(request: NextRequest) {
  const [sessionResponse, decision] = await Promise.all([updateSession(request), goneCheck(request)])

  if (decision.kind === 'pass') return sessionResponse

  const response =
    decision.kind === 'redirect'
      ? NextResponse.redirect(new URL(decision.location, request.url), 308)
      : new NextResponse(GONE_HTML, {
          status: 410,
          headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex' },
        })
  // Las cookies de sesión que haya refrescado updateSession no se pierden.
  for (const cookie of sessionResponse.cookies.getAll()) response.cookies.set(cookie)
  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
