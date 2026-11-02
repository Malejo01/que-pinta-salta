import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { hasBearerSecret } from '@/lib/api-auth'
import { withJobRun, jobTriggerFrom, type JobOutcome } from '@/lib/job-runs'
import { traducirPendientes, type ResultadoTraduccion } from '@/lib/traduccion/traducir-pendientes'

export const dynamic = 'force-dynamic'
// Un lote de 10 llamadas al modelo entra holgado; sin esto Vercel puede cortar a mitad.
export const maxDuration = 60

/**
 * GET /api/cron/traducir-eventos (Q4-7): traduce al inglés un lote de títulos y
 * descripciones de eventos próximos, con el tope diario de
 * `TRADUCCION_TOPE_DIARIO` (por defecto 100; 0 lo apaga). La dispara
 * `.github/workflows/traducir-eventos.yml`. Ver `lib/traduccion/traducir-pendientes.ts`.
 */
function toOutcome(r: ResultadoTraduccion | { error: string }): JobOutcome {
  if ('error' in r) return { status: 'FAILED', errors: [r.error] }
  const status = r.intentados === 0 ? 'SKIPPED' : r.errores > 0 ? 'PARTIAL' : 'SUCCESS'
  return {
    status,
    itemsProcessed: r.intentados,
    itemsFailed: r.errores,
    // Solo conteos: nunca títulos ni ids.
    details: { tope: r.tope, traducidosHoyAntes: r.traducidosHoyAntes, traducidos: r.traducidos, descartados: r.descartados, quedan: r.quedan },
  }
}

export async function GET(request: Request) {
  if (!hasBearerSecret(request, 'CRON_SECRET')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await withJobRun(
    'traduccion',
    jobTriggerFrom(request),
    async (): Promise<ResultadoTraduccion | { error: string }> => {
      try {
        return await traducirPendientes(createAdminClient(), { ahora: new Date(), topeTexto: process.env.TRADUCCION_TOPE_DIARIO })
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'error' }
      }
    },
    toOutcome,
  )

  if ('error' in result) return NextResponse.json({ status: 'FAILED' }, { status: 500 })
  return NextResponse.json({ status: toOutcome(result).status, ...result })
}
