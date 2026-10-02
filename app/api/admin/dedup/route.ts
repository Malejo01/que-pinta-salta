import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runDedupCleanup, formatReport } from '@/lib/scraper/dedup-cleanup'

/**
 * Limpieza retroactiva de duplicados, disponible desde el panel admin.
 *
 *   GET  /api/admin/dedup                -> dry-run en JSON
 *   GET  /api/admin/dedup?format=text    -> dry-run en texto plano
 *   POST /api/admin/dedup  { "apply": true }  -> ejecuta las fusiones
 *
 * El GET nunca escribe. El POST sin `apply: true` tampoco: devuelve el mismo
 * dry-run, para que "ver qué haría" y "hacerlo" sean dos llamadas distintas y
 * no un parámetro que se olvida.
 *
 * Autorización: sesión de ADMIN, o `Authorization: Bearer $CRON_SECRET` para
 * poder llamarlo desde un cron o desde un script sin sesión.
 */

const CRON_SECRET = process.env.CRON_SECRET

async function authorize(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('authorization')
  if (CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`) return null

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 'No autenticado'

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  return profile?.role === 'ADMIN' ? null : 'Sin permisos de administrador'
}

function parseOptions(url: URL) {
  const maxGroups = url.searchParams.get('maxGroups')
  return {
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
    includePast: url.searchParams.get('includePast') === 'true',
    maxGroups: maxGroups ? Number(maxGroups) : undefined,
  }
}

export async function GET(request: Request) {
  const denied = await authorize(request)
  if (denied) return NextResponse.json({ error: denied }, { status: 401 })

  const url = new URL(request.url)

  try {
    const report = await runDedupCleanup({ ...parseOptions(url), dryRun: true })

    if (url.searchParams.get('format') === 'text') {
      return new NextResponse(formatReport(report), {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      })
    }

    return NextResponse.json(report)
  } catch (error: any) {
    console.error('[admin/dedup] Dry-run falló:', error)
    return NextResponse.json({ error: error?.message || 'Error desconocido' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const denied = await authorize(request)
  if (denied) return NextResponse.json({ error: denied }, { status: 401 })

  const url = new URL(request.url)
  let body: any = {}
  try {
    body = await request.json()
  } catch {
    // Cuerpo vacío: se trata como dry-run.
  }

  const apply = body?.apply === true

  try {
    const report = await runDedupCleanup({ ...parseOptions(url), dryRun: !apply })

    console.log(
      `[admin/dedup] ${apply ? 'APLICADO' : 'dry-run'}: ` +
      `${report.totalMerges} fusiones sobre ${report.scannedEvents} eventos`
    )

    return NextResponse.json(report, { status: report.errors.length > 0 ? 207 : 200 })
  } catch (error: any) {
    console.error('[admin/dedup] Falló:', error)
    return NextResponse.json({ error: error?.message || 'Error desconocido' }, { status: 500 })
  }
}
