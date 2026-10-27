import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { hasBearerSecret } from '@/lib/api-auth'
import { withJobRun, jobTriggerFrom, type JobOutcome } from '@/lib/job-runs'
import { registrarOcupacionDelDia } from '@/lib/publicidad/ocupacion'
import { proponerCicloDelMes, type ResultadoCiclo } from '@/lib/publicidad/ciclo'
import { medirBajas } from '@/lib/publicidad/bajas'
import { generarReportes } from '@/lib/publicidad/reportes'

export const dynamic = 'force-dynamic'
// Sin esto Vercel puede cortar la función a mitad y dejar la corrida en RUNNING.
export const maxDuration = 60

/**
 * GET /api/cron/publicidad
 *
 * Cuatro pasos independientes, en este orden: la ocupación del día, el ciclo de
 * precios del mes, la medición de bajas del push patrocinado y los reportes de
 * las campañas que terminaron. Si uno falla, los otros corren igual. Idempotente.
 * Lo dispara .github/workflows/publicidad.yml todos los días. No manda nada
 * hacia afuera; lee el tipo de cambio de una fuente externa.
 */

export interface ResultadoPublicidad {
  ocupacion: 'ok' | 'error'
  ciclo: ResultadoCiclo | 'error'
  bajasMedidas: number
  pausado: boolean
  reportes: number
  /** Cuántos de los cuatro pasos no terminaron bien. */
  pasosConError: number
  /** Los textos de error (fijos, sin ids de personas): solo van a job_runs.errors. */
  errores: string[]
}

const PASOS = 4

function mensaje(paso: string, err: unknown): string {
  return `${paso}: ${err instanceof Error ? err.message : 'error desconocido'}`
}

async function correrPublicidad(): Promise<ResultadoPublicidad> {
  const admin = createAdminClient()
  const ahora = new Date()
  const r: ResultadoPublicidad = {
    ocupacion: 'ok',
    ciclo: 'ya-existia',
    bajasMedidas: 0,
    pausado: false,
    reportes: 0,
    pasosConError: 0,
    errores: [],
  }

  try {
    await registrarOcupacionDelDia(admin, ahora)
  } catch (err) {
    r.ocupacion = 'error'
    r.pasosConError += 1
    r.errores.push(mensaje('ocupación', err))
  }

  try {
    r.ciclo = await proponerCicloDelMes(admin, { ahora, fetch })
    if (r.ciclo === 'sin-tipo-de-cambio') {
      r.pasosConError += 1
      r.errores.push('ciclo: sin tipo de cambio (ni de la fuente ni de un ciclo anterior); se reintenta mañana')
    }
  } catch (err) {
    r.ciclo = 'error'
    r.pasosConError += 1
    r.errores.push(mensaje('ciclo', err))
  }

  try {
    const bajas = await medirBajas(admin, ahora)
    r.bajasMedidas = bajas.medidas
    r.pausado = bajas.pausado
    if (bajas.fallidas > 0) {
      r.pasosConError += 1
      r.errores.push(`bajas: ${bajas.fallidas} campañas con error`)
    }
  } catch (err) {
    r.pasosConError += 1
    r.errores.push(mensaje('bajas', err))
  }

  try {
    r.reportes = (await generarReportes(admin, ahora)).creados
  } catch (err) {
    r.pasosConError += 1
    r.errores.push(mensaje('reportes', err))
  }

  return r
}

function toOutcome(r: ResultadoPublicidad): JobOutcome {
  const status = r.pasosConError === 0 ? 'SUCCESS' : r.pasosConError >= PASOS ? 'FAILED' : 'PARTIAL'
  return {
    status,
    itemsProcessed: r.bajasMedidas + r.reportes,
    itemsFailed: r.pasosConError,
    errors: r.errores,
    // Solo cantidades y códigos: ningún id de persona ni mensaje crudo.
    details: {
      ocupacion: r.ocupacion,
      ciclo: r.ciclo,
      bajasMedidas: r.bajasMedidas,
      pausado: r.pausado,
      reportes: r.reportes,
    },
  }
}

export async function GET(request: Request) {
  if (!hasBearerSecret(request, 'CRON_SECRET')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await withJobRun('publicidad', jobTriggerFrom(request), correrPublicidad, toOutcome)

  return NextResponse.json({
    status: toOutcome(result).status,
    ocupacion: result.ocupacion,
    ciclo: result.ciclo,
    bajasMedidas: result.bajasMedidas,
    pausado: result.pausado,
    reportes: result.reportes,
    pasosConError: result.pasosConError,
    // El detalle de los errores queda solo en job_runs.errors; la respuesta, que
    // el workflow imprime en logs, lleva un texto fijo.
    ...(result.pasosConError > 0 ? { error: 'Algún paso falló (detalle en job_runs)' } : {}),
  })
}
