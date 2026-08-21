import { NextResponse } from 'next/server'
import { checkSchedulerAuth } from '@/lib/scheduler/auth'
import { runJob } from '@/lib/scheduler/runner'
import { JOB_KEYS, getJob } from '@/lib/scheduler/jobs'

/**
 * GET|POST /api/cron/run/[job]
 *
 * Disparo manual de un proceso concreto, con la misma bitácora, los mismos
 * reintentos y el mismo lock de concurrencia que el disparo automático. Es lo
 * que reemplaza a "entrar a la URL del scraper a mano": lo que se corre de
 * esta forma queda registrado en `job_runs` con `trigger_source = 'manual'`.
 *
 * Ignora el calendario a propósito —si se pide, se corre—, pero no ignora el
 * lock: si el dispatcher ya está corriendo ese proceso, devuelve SKIPPED en
 * vez de duplicarlo.
 *
 *   ?limit=5   sobrescribe el tope de items de esta corrida
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function handle(
  request: Request,
  context: { params: Promise<{ job: string }> },
) {
  const auth = checkSchedulerAuth(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized', detail: auth.reason }, { status: 401 })
  }

  const { job: jobKey } = await context.params

  if (!getJob(jobKey)) {
    return NextResponse.json(
      { error: `Job desconocido: ${jobKey}`, known: JOB_KEYS },
      { status: 404 },
    )
  }

  const limitRaw = new URL(request.url).searchParams.get('limit')
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined
  if (limitRaw && (!Number.isFinite(limit) || (limit as number) < 0)) {
    return NextResponse.json({ error: '`limit` tiene que ser un entero >= 0.' }, { status: 400 })
  }

  // `runJob` no lanza: cualquier fallo vuelve como `status: 'FAILED'` con el
  // detalle adentro, así que no hace falta try/catch acá.
  const result = await runJob(jobKey, { trigger: 'manual', limit })

  return NextResponse.json(
    { success: result.status !== 'FAILED', ...result },
    // 500 cuando el proceso falló, para que un `curl --fail` o un monitor lo
    // detecte sin tener que leer el cuerpo.
    { status: result.status === 'FAILED' ? 500 : 200 },
  )
}

export const GET = handle
export const POST = handle
