import { NextResponse } from 'next/server'
import { checkSchedulerAuth } from '@/lib/scheduler/auth'
import { dispatchDueJobs } from '@/lib/scheduler/runner'
import { JOB_KEYS } from '@/lib/scheduler/jobs'

/**
 * GET /api/cron/dispatch
 *
 * Punto de entrada único del scheduler. Es la única ruta que Vercel Cron
 * necesita llamar: corre cada 6 h y adentro se decide qué procesos vencieron,
 * mirando la última corrida sana de cada uno en `job_runs`.
 *
 * Se eligió un dispatcher y no una entrada de cron por proceso por dos
 * razones. Una es el plan: `vercel.json` ya tenía sus entradas y los planes
 * limitan cuántas se pueden declarar. La otra es que un único punto permite
 * calendarios que la sintaxis cron no expresa —"cada 6 h pero sólo si la
 * última corrida terminó bien"— y hace que un tick perdido por un deploy se
 * recupere solo en el siguiente, en vez de saltear el día.
 *
 * Parámetros (todos opcionales, para operar a mano):
 *   ?jobs=cines,newsletter   corre sólo esos, ignorando el calendario
 *   ?force=1                 corre todos los `managed` sin mirar calendario
 *   ?limit=5                 sobrescribe el tope de items por corrida
 *   ?dry=1                   informa qué correría, sin correr nada
 */

export const dynamic = 'force-dynamic'
// Ver `SINGLE_ATTEMPT_TIMEOUT_MS` en lib/scheduler/jobs.ts: los timeouts de
// los jobs están calibrados para cortar antes que este número.
export const maxDuration = 60

export async function GET(request: Request) {
  const auth = checkSchedulerAuth(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized', detail: auth.reason }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)

  const onlyRaw = searchParams.get('jobs')
  const only = onlyRaw
    ? onlyRaw
        .split(',')
        .map((key) => key.trim())
        .filter(Boolean)
    : undefined

  if (only?.length) {
    const unknown = only.filter((key) => !JOB_KEYS.includes(key))
    if (unknown.length > 0) {
      return NextResponse.json(
        { error: `Jobs desconocidos: ${unknown.join(', ')}`, known: JOB_KEYS },
        { status: 400 },
      )
    }
  }

  const limitRaw = searchParams.get('limit')
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined
  if (limitRaw && (!Number.isFinite(limit) || (limit as number) < 0)) {
    return NextResponse.json({ error: '`limit` tiene que ser un entero >= 0.' }, { status: 400 })
  }

  const force = searchParams.get('force') === '1'
  const dryRun = searchParams.get('dry') === '1'

  try {
    const summary = await dispatchDueJobs({
      only,
      force,
      limit,
      trigger: only?.length || force ? 'manual' : 'cron',
      // En dry-run se evalúa el calendario y no se corre nada: sirve para
      // entender por qué un proceso no arrancó, sin gatillarlo.
      dryRun,
    })

    return NextResponse.json({ success: summary.failed === 0, dryRun, ...summary })
  } catch (error) {
    // Sólo se llega acá si falla el propio dispatcher (p. ej. no hay conexión
    // a Supabase para leer la bitácora). Los fallos de un job se reportan
    // dentro de `jobs[]` y no llegan hasta acá.
    console.error('[scheduler] El dispatcher falló:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido en el dispatcher',
      },
      { status: 500 },
    )
  }
}
