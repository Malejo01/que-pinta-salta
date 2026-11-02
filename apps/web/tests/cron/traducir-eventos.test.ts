// R-3 (Q4-7): GET /api/cron/traducir-eventos. Sin red, sin base y sin modelo:
// se mockean el cliente admin, job_runs y el proceso (`traducirPendientes`).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createAdminClient = vi.fn(() => ({}))
const withJobRun = vi.fn()
const traducirPendientes = vi.fn()
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => createAdminClient() }))
vi.mock('@/lib/job-runs', () => ({ withJobRun: (...a: unknown[]) => withJobRun(...a), jobTriggerFrom: () => 'test' }))
vi.mock('@/lib/traduccion/traducir-pendientes', () => ({ traducirPendientes: (...a: unknown[]) => traducirPendientes(...a) }))

import { GET, maxDuration } from '@/app/api/cron/traducir-eventos/route'

const SECRETO = 'secreto-de-prueba'
const llamar = (auth = `Bearer ${SECRETO}`) => GET(new Request('http://localhost.test/api/cron/traducir-eventos', { headers: { authorization: auth } }))
type ToOutcome = (r: unknown) => { status: string; itemsProcessed?: number; itemsFailed?: number; details?: Record<string, unknown>; errors?: string[] }

const entorno = { ...process.env }
beforeEach(() => {
  process.env.CRON_SECRET = SECRETO
  delete process.env.TRADUCCION_TOPE_DIARIO
  withJobRun.mockReset()
  withJobRun.mockImplementation(async (_k: string, _t: string, work: () => Promise<unknown>) => work())
  traducirPendientes.mockReset()
  createAdminClient.mockClear()
})
afterEach(() => {
  process.env = { ...entorno }
})

describe('GET /api/cron/traducir-eventos', () => {
  it('sin el secreto: 401 y no toca nada (ni job_runs, ni la base, ni el modelo)', async () => {
    const res = await llamar('Bearer otro')
    expect(res.status).toBe(401)
    expect(withJobRun).not.toHaveBeenCalled()
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(traducirPendientes).not.toHaveBeenCalled()
  })

  it('registra en job_runs como "traduccion" y pasa el tope de la variable', async () => {
    process.env.TRADUCCION_TOPE_DIARIO = '25'
    traducirPendientes.mockResolvedValue({ tope: 25, traducidosHoyAntes: 0, intentados: 10, traducidos: 9, descartados: 1, errores: 0, quedan: true })
    const res = await llamar()
    expect(res.status).toBe(200)
    expect(withJobRun.mock.calls[0][0]).toBe('traduccion')
    expect(traducirPendientes.mock.calls[0][1]).toMatchObject({ topeTexto: '25' })
    expect(await res.json()).toMatchObject({ status: 'SUCCESS', traducidos: 9, quedan: true })
  })

  it('job_runs: solo conteos; SKIPPED sin nada para traducir, PARTIAL con errores, FAILED si tira', async () => {
    traducirPendientes.mockResolvedValue({ tope: 100, traducidosHoyAntes: 100, intentados: 0, traducidos: 0, descartados: 0, errores: 0, quedan: false })
    await llamar()
    const toOutcome = withJobRun.mock.calls[0][3] as ToOutcome
    expect(toOutcome({ tope: 100, traducidosHoyAntes: 100, intentados: 0, traducidos: 0, descartados: 0, errores: 0, quedan: false }).status).toBe('SKIPPED')
    const parcial = toOutcome({ tope: 100, traducidosHoyAntes: 0, intentados: 10, traducidos: 8, descartados: 1, errores: 1, quedan: false })
    expect(parcial).toMatchObject({ status: 'PARTIAL', itemsProcessed: 10, itemsFailed: 1 })
    expect(Object.keys(parcial.details ?? {}).sort()).toEqual(['descartados', 'quedan', 'tope', 'traducidos', 'traducidosHoyAntes'])
    expect(toOutcome({ error: 'traduccion: no se pudieron leer los eventos pendientes' })).toMatchObject({ status: 'FAILED' })
  })

  it('si el proceso tira: 500 genérico, sin el mensaje en la respuesta', async () => {
    traducirPendientes.mockRejectedValue(new Error('detalle interno'))
    const res = await llamar()
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('detalle interno')
  })

  it('declara maxDuration (Vercel no la corta a mitad)', () => {
    expect(maxDuration).toBe(60)
  })
})
