/**
 * Q6-10: el chequeo de salud de la traducción diaria (lo usa
 * `/api/cron/health`). Puro: recibe lo que la ruta leyó de `job_runs`.
 *
 * En rojo si:
 *  - la última corrida que hizo algo (no SKIPPED) de las últimas
 *    `VENTANA_FALLA_HORAS` falló en la llamada al modelo (`proveedor:…`) o
 *    descartó todo (`validacion:todo_descartado`); o
 *  - no hay una corrida sana hace más de `MAX_HORAS` (el workflow es diario).
 * Sin corridas registradas no se marca (como `recurrentes`).
 *
 * El detalle lleva solo los códigos fijos de `job_runs.errors`: nunca títulos.
 */
import type { JobLastRun } from '@/lib/job-runs'

export const MAX_HORAS = 36
export const VENTANA_FALLA_HORAS = 48

export type CorridaTraduccion = { status?: unknown; errors?: unknown; started_at?: unknown }

export type ChequeoTraduccion = {
  name: 'traduccion'
  last_at: string | null
  age_hours: number | null
  max_hours: number
  ok: boolean
  source: 'job_runs'
  last_status?: string
  detail: string
}

/** Los avisos de `job_runs.errors` que pone la ruta de la traducción (prefijos fijos). */
export function avisosDeTraduccion(errors: unknown): string[] {
  if (!Array.isArray(errors)) return []
  return errors.filter((e): e is string => typeof e === 'string' && /^(proveedor|validacion):/.test(e)).map((e) => e.slice(0, 160))
}

export function chequeoTraduccion(ultima: JobLastRun | undefined, conTrabajo: CorridaTraduccion | null, now: number): ChequeoTraduccion {
  if (!ultima) {
    return { name: 'traduccion', last_at: null, age_hours: null, max_hours: MAX_HORAS, ok: true, source: 'job_runs', detail: 'sin corridas registradas todavía' }
  }
  const lastAt = ultima.last_ok_started_at
  const age = lastAt ? Math.round(((now - new Date(lastAt).getTime()) / 3_600_000) * 10) / 10 : null
  const atrasada = age === null || age > MAX_HORAS

  const avisos = conTrabajo ? avisosDeTraduccion(conTrabajo.errors) : []
  const fallo = conTrabajo?.status === 'FAILED' || avisos.length > 0
  const cuando = typeof conTrabajo?.started_at === 'string' ? ` (${conTrabajo.started_at})` : ''

  const detalle = fallo
    ? `última corrida con trabajo${cuando}: ${avisos.length > 0 ? avisos.join('; ') : 'FAILED'}`
    : atrasada
      ? `sin corrida sana en las últimas ${MAX_HORAS} h`
      : 'workflow diario, 10:10 UTC'

  return {
    name: 'traduccion',
    last_at: lastAt,
    age_hours: age,
    max_hours: MAX_HORAS,
    ok: !fallo && !atrasada,
    source: 'job_runs',
    last_status: ultima.last_status,
    detail: detalle,
  }
}
