// Q6-10: el chequeo de salud de la traducción diaria (puro).
import { describe, expect, it } from 'vitest'
import type { JobLastRun } from '@/lib/job-runs'
import { avisosDeTraduccion, chequeoTraduccion, MAX_HORAS } from '@/lib/traduccion/salud'

const AHORA = Date.parse('2026-11-04T12:00:00Z')
const haceHoras = (h: number) => new Date(AHORA - h * 3_600_000).toISOString()

function ultima(over: Partial<JobLastRun> = {}): JobLastRun {
  return {
    job_key: 'traduccion',
    last_status: 'SKIPPED',
    last_trigger_source: 'github-actions',
    last_started_at: haceHoras(1),
    last_finished_at: haceHoras(1),
    last_duration_ms: 400,
    last_items_processed: 0,
    last_items_failed: 0,
    last_errors: [],
    last_ok_started_at: haceHoras(1),
    last_ok_status: 'SKIPPED',
    ...over,
  }
}

describe('chequeoTraduccion', () => {
  it('sin corridas registradas no alerta', () => {
    expect(chequeoTraduccion(undefined, null, AHORA)).toMatchObject({ name: 'traduccion', ok: true, detail: 'sin corridas registradas todavía' })
  })

  it('la corrida del 3/11 con el nuevo registro: FAILED por 402 → rojo, con el motivo y sin títulos', () => {
    const conTrabajo = { status: 'FAILED', errors: ['proveedor:sin_credito — créditos de IA agotados o problema de facturación (402)'], started_at: haceHoras(2) }
    const c = chequeoTraduccion(ultima({ last_status: 'FAILED', last_ok_started_at: haceHoras(30) }), conTrabajo, AHORA)
    expect(c.ok).toBe(false)
    expect(c.detail).toContain('proveedor:sin_credito')
  })

  it('una SKIPPED de fin de tope no tapa la falla de la corrida con trabajo', () => {
    const conTrabajo = { status: 'PARTIAL', errors: ['validacion:todo_descartado — 10 de 10 respuestas descartadas'], started_at: haceHoras(3) }
    const c = chequeoTraduccion(ultima(), conTrabajo, AHORA)
    expect(c).toMatchObject({ ok: false, last_status: 'SKIPPED' })
    expect(c.detail).toContain('validacion:todo_descartado')
  })

  it('corrida sana reciente → verde; atrasada → rojo', () => {
    expect(chequeoTraduccion(ultima(), { status: 'SUCCESS', errors: [], started_at: haceHoras(2) }, AHORA).ok).toBe(true)
    expect(chequeoTraduccion(ultima({ last_ok_started_at: haceHoras(MAX_HORAS + 1) }), null, AHORA)).toMatchObject({ ok: false })
  })

  it('solo toma los avisos con prefijo fijo (nunca otro texto de errors)', () => {
    expect(avisosDeTraduccion(['traduccion: no se pudieron leer', 'proveedor:limite — x', 42])).toEqual(['proveedor:limite — x'])
    expect(avisosDeTraduccion(null)).toEqual([])
  })
})
