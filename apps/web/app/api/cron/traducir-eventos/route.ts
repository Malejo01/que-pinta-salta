import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { hasBearerSecret } from '@/lib/api-auth'
import { withJobRun, jobTriggerFrom, type JobOutcome } from '@/lib/job-runs'
import { traducirPendientes, type ResultadoTraduccion } from '@/lib/traduccion/traducir-pendientes'
import { DESCRIPCION_FALLO } from '@/lib/traduccion/motivos'

export const dynamic = 'force-dynamic'
// Un lote de 10 llamadas al modelo entra holgado; sin esto Vercel puede cortar a mitad.
export const maxDuration = 60

/**
 * GET /api/cron/traducir-eventos (Q4-7): traduce al inglés un lote de títulos y
 * descripciones de eventos próximos, con el tope diario de
 * `TRADUCCION_TOPE_DIARIO` (por defecto 100; 0 lo apaga). La dispara
 * `.github/workflows/traducir-eventos.yml`. Ver `lib/traduccion/traducir-pendientes.ts`.
 */
// Q6-10: con al menos este lote descartado entero, la corrida avisa (validación demasiado estricta o modelo roto).
const MINIMO_PARA_AVISAR_DESCARTES = 5

/**
 * Q6-10: `errors` lleva avisos con prefijo fijo que lee el chequeo de salud
 * (`lib/traduccion/salud.ts`): `proveedor:<código>` si la llamada al modelo
 * falló (la corrida se corta y es FAILED si no tradujo nada) y
 * `validacion:todo_descartado` si el modelo contestó pero se descartó todo.
 */
function toOutcome(r: ResultadoTraduccion | { error: string }): JobOutcome {
  if ('error' in r) return { status: 'FAILED', errors: [r.error] }
  const errors: string[] = []
  if (r.errorProveedor) errors.push(`proveedor:${r.errorProveedor} — ${DESCRIPCION_FALLO[r.errorProveedor]}`)
  const todoDescartado = r.intentados >= MINIMO_PARA_AVISAR_DESCARTES && r.traducidos === 0 && r.descartados === r.intentados
  if (todoDescartado) errors.push(`validacion:todo_descartado — ${r.descartados} de ${r.intentados} respuestas descartadas`)
  const status = r.errorProveedor
    ? r.traducidos > 0 ? 'PARTIAL' : 'FAILED'
    : r.intentados === 0 ? 'SKIPPED' : r.errores > 0 || todoDescartado ? 'PARTIAL' : 'SUCCESS'
  return {
    status,
    itemsProcessed: r.intentados,
    itemsFailed: r.errores,
    errors,
    // Solo conteos y códigos fijos: nunca títulos ni ids.
    details: {
      tope: r.tope,
      traducidosHoyAntes: r.traducidosHoyAntes,
      traducidos: r.traducidos,
      descartados: r.descartados,
      quedan: r.quedan,
      descartesPorMotivo: r.descartesPorMotivo,
      errorProveedor: r.errorProveedor,
      sinIntentar: r.sinIntentar,
    },
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
  const status = toOutcome(result).status
  // Q6-10: si el proveedor cortó la corrida sin traducir nada, 503: el workflow falla y GitHub manda mail.
  if (status === 'FAILED') return NextResponse.json({ status, ...result }, { status: 503 })
  return NextResponse.json({ status, ...result })
}
