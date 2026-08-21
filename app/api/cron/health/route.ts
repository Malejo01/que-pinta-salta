import { NextResponse } from 'next/server'
import { checkSchedulerAuth } from '@/lib/scheduler/auth'
import { buildHealthReport } from '@/lib/scheduler/health'

/**
 * GET /api/cron/health
 *
 * Responde "¿cuándo se actualizó esto por última vez?" para cada proceso:
 * antigüedad de la última corrida sana, estado de la última corrida y sus
 * errores.
 *
 * El código HTTP también informa, para poder engancharlo a un monitor sin
 * parsear el cuerpo:
 *   200  todo al día
 *   503  algún proceso vencido (`down`) o fallando (`degraded`)
 *
 * Con `?strict=0` siempre devuelve 200 y el estado va sólo en el cuerpo.
 */

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  // Pide secreto igual que el resto del scheduler: el informe expone el
  // estado operativo del sistema y los mensajes de error de las fuentes.
  const auth = checkSchedulerAuth(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized', detail: auth.reason }, { status: 401 })
  }

  const strict = new URL(request.url).searchParams.get('strict') !== '0'

  try {
    const report = await buildHealthReport()
    const httpStatus = strict && report.status !== 'ok' ? 503 : 200

    return NextResponse.json(report, { status: httpStatus })
  } catch (error) {
    console.error('[scheduler] No se pudo armar el health check:', error)
    return NextResponse.json(
      {
        status: 'down',
        error: error instanceof Error ? error.message : 'Error desconocido',
        checkedAt: new Date().toISOString(),
      },
      { status: 503 },
    )
  }
}
