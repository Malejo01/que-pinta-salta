import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { hasBearerSecret } from '@/lib/api-auth'
import { withJobRun, jobTriggerFrom, type JobOutcome } from '@/lib/job-runs'
import { generarRecurrentes, type ResultadoRecurrentes } from '@/lib/recurrentes/generar'

export const dynamic = 'force-dynamic'
// Sin esto Vercel puede cortar la función a mitad y dejar la corrida en RUNNING.
export const maxDuration = 60

/**
 * GET /api/cron/recurrentes
 *
 * Genera las fechas futuras de las peñas (14 días) y de los museos (7 días,
 * martes a domingo). Idempotente: solo escribe los días que faltan. Lo dispara
 * .github/workflows/recurrentes.yml los lunes. No crea venues.
 */

function toOutcome(r: ResultadoRecurrentes): JobOutcome {
  const errores = r.items.filter((i) => i.error)
  const status =
    errores.length === 0 ? 'SUCCESS' : errores.length === r.items.length ? 'FAILED' : 'PARTIAL'
  return {
    status,
    itemsProcessed: r.insertadas,
    itemsFailed: errores.length,
    errors: errores.map((i) => `${i.titulo}: ${i.error}`),
    details: Object.fromEntries(
      r.items.map((i) => [
        i.titulo,
        {
          insertadas: i.insertadas,
          yaExistian: i.yaExistian,
          completadas: i.completadas,
          ...(i.error ? { error: i.error } : {}),
        },
      ]),
    ),
  }
}

export async function GET(request: Request) {
  if (!hasBearerSecret(request, 'CRON_SECRET')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await withJobRun(
    'recurrentes',
    jobTriggerFrom(request),
    () => generarRecurrentes(createAdminClient(), { ahora: new Date() }),
    toOutcome,
  )

  return NextResponse.json({
    status: toOutcome(result).status,
    insertadas: result.insertadas,
    completadas: result.completadas,
    conError: result.conError,
    // El detalle del error (puede traer mensajes crudos de Supabase) queda solo
    // en job_runs.errors; la respuesta, que el workflow imprime en logs, lleva un texto fijo.
    items: result.items.map((i) => ({
      ...i,
      ...(i.error ? { error: 'Falló el ítem (detalle en job_runs)' } : {}),
    })),
  })
}
