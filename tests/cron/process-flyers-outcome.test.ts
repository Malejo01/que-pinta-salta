import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createAdminClient = vi.fn()
const withJobRun = vi.fn()
const processFlyerWithAI = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: (...a: unknown[]) => createAdminClient(...a),
}))
vi.mock('@/lib/job-runs', () => ({
  withJobRun: (...a: unknown[]) => withJobRun(...a),
  jobTriggerFrom: () => 'test',
}))
vi.mock('@/lib/ai/process-flyer-ai', () => ({
  processFlyerWithAI: (...a: unknown[]) => processFlyerWithAI(...a),
}))
vi.mock('@/lib/ai/gemini', () => ({ GEMINI_MODEL: 'modelo-de-prueba' }))

import { POST } from '@/app/api/ai/process-flyers/route'

const SECRETO = 'secreto-falso-de-prueba'
const entorno = process.env.CRON_SECRET

beforeEach(() => {
  createAdminClient.mockReset()
  withJobRun.mockReset()
  processFlyerWithAI.mockReset()
  process.env.CRON_SECRET = SECRETO
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  // Cola con dos flyers pendientes.
  createAdminClient.mockReturnValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: () => Promise.resolve({
                data: [{ id: 'f1', ig_post_id: 'p1' }, { id: 'f2', ig_post_id: 'p2' }],
                error: null,
              }),
            }),
          }),
        }),
      }),
    }),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  if (entorno === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = entorno
})

/** Corre el POST con withJobRun falso (sin base) y devuelve el JobOutcome que calcula la ruta. */
async function correr() {
  let outcome: Record<string, unknown> | undefined
  withJobRun.mockImplementation(
    async (_k: string, _t: string, work: () => Promise<unknown>, toOutcome: (r: unknown) => Record<string, unknown>) => {
      const result = await work()
      outcome = toOutcome(result)
      return result
    }
  )
  await POST(new Request('http://localhost.test/api/ai/process-flyers', {
    method: 'POST',
    headers: { authorization: `Bearer ${SECRETO}` },
  }))
  return outcome!
}

describe('POST /api/ai/process-flyers: estado de la corrida', () => {
  it('todo bien: SUCCESS', async () => {
    processFlyerWithAI.mockResolvedValue({ success: true, action: 'insert', eventId: 'e1' })
    const o = await correr()
    expect(o.status).toBe('SUCCESS')
    expect(o.errors).toEqual([])
  })

  it('un flyer con error de venue (success true + venueError): PARTIAL con el error en errors', async () => {
    processFlyerWithAI
      .mockResolvedValueOnce({ success: true, action: 'insert', eventId: 'e1', venueError: 'venue: Lugar Inventado QA: boom' })
      .mockResolvedValueOnce({ success: true, action: 'insert', eventId: 'e2' })
    const o = await correr()
    expect(o.status).toBe('PARTIAL')
    expect(o.errors).toContain('venue: Lugar Inventado QA: boom')
    expect(o.itemsFailed).toBe(0)
    expect(o.itemsProcessed).toBe(2)
  })

  it('un flyer que falla: PARTIAL', async () => {
    processFlyerWithAI
      .mockResolvedValueOnce({ success: false, error: 'fallo la IA' })
      .mockResolvedValueOnce({ success: true, action: 'insert', eventId: 'e2' })
    const o = await correr()
    expect(o.status).toBe('PARTIAL')
    expect(o.errors).toEqual(['fallo la IA'])
    expect(o.itemsFailed).toBe(1)
  })

  it('falla y error de venue juntos: ambos en errors', async () => {
    processFlyerWithAI
      .mockResolvedValueOnce({ success: false, error: 'fallo la IA' })
      .mockResolvedValueOnce({ success: true, action: 'insert', eventId: 'e2', venueError: 'venue: X: boom' })
    const o = await correr()
    expect(o.status).toBe('PARTIAL')
    expect(o.errors).toEqual(['fallo la IA', 'venue: X: boom'])
  })
})
