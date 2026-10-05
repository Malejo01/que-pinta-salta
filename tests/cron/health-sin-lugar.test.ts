import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createAdminClient = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: (...a: unknown[]) => createAdminClient(...a),
}))

import { GET } from '@/app/api/cron/health/route'

const SECRETO = 'secreto-falso-de-prueba'
const entorno = process.env.CRON_SECRET

type Resultado = { data?: unknown; count?: number | null; error?: { message: string } | null }

/**
 * Cliente falso con builder encadenable. Las consultas de antigüedad devuelven una
 * fila reciente; la de eventos sin lugar (la que llama .is('venue_id', null))
 * devuelve `sinLugar`.
 */
function clienteFalso(sinLugar: Resultado) {
  const reciente = new Date().toISOString()
  return {
    from: (tabla: string) => {
      const llamadas: string[] = []
      let esSinLugar = false
      const resultado = (): Resultado => {
        if (tabla === 'job_last_runs') return { data: [], error: null }
        if (esSinLugar) return { error: null, ...sinLugar }
        if (tabla === 'cinema_movies') return { data: { updated_at: reciente }, error: null }
        if (tabla === 'instagram_flyers') {
          // oldestPending: sin pendientes. Los otros: una fila reciente.
          return llamadas.includes('eq')
            ? { data: null, error: null }
            : { data: { fetched_at: reciente, ai_processed_at: reciente }, error: null }
        }
        return { data: { updated_at: reciente }, error: null }
      }
      const b: Record<string, unknown> = {}
      for (const m of ['select', 'in', 'order', 'limit', 'not', 'eq', 'gte']) {
        b[m] = () => { llamadas.push(m); return b }
      }
      b.is = (col: string, val: unknown) => {
        if (col === 'venue_id' && val === null) esSinLugar = true
        llamadas.push('is')
        return b
      }
      b.maybeSingle = () => Promise.resolve(resultado())
      b.then = (res: (r: Resultado) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve(resultado()).then(res, rej)
      return b
    },
  }
}

const pedir = () =>
  GET(new Request('http://localhost.test/api/cron/health', { headers: { authorization: `Bearer ${SECRETO}` } }))

beforeEach(() => {
  createAdminClient.mockReset()
  process.env.CRON_SECRET = SECRETO
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  if (entorno === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = entorno
})

describe('GET /api/cron/health: eventos_sin_lugar', () => {
  it('sin eventos futuros sin lugar: ok y 200', async () => {
    createAdminClient.mockReturnValue(clienteFalso({ data: [], count: 0 }))
    const res = await pedir()
    const body = await res.json()
    const check = body.checks.find((c: { name: string }) => c.name === 'eventos_sin_lugar')
    expect(check.ok).toBe(true)
    expect(body.ok).toBe(true)
    expect(res.status).toBe(200)
  })

  it('con eventos futuros sin lugar: ok false, 503, cantidad e ids en detail', async () => {
    createAdminClient.mockReturnValue(
      clienteFalso({ data: [{ id: 'ev-a' }, { id: 'ev-b' }, { id: 'ev-c' }], count: 3 })
    )
    const res = await pedir()
    const body = await res.json()
    const check = body.checks.find((c: { name: string }) => c.name === 'eventos_sin_lugar')
    expect(check.ok).toBe(false)
    expect(check.detail).toContain('3')
    expect(check.detail).toContain('ev-a')
    expect(check.detail).toContain('ev-c')
    expect(body.ok).toBe(false)
    expect(res.status).toBe(503)
  })

  it('con mas de 5: el count total manda y el detail lista solo los ids devueltos (hasta 5)', async () => {
    const ids = ['i1', 'i2', 'i3', 'i4', 'i5'].map((id) => ({ id }))
    createAdminClient.mockReturnValue(clienteFalso({ data: ids, count: 12 }))
    const body = await (await pedir()).json()
    const check = body.checks.find((c: { name: string }) => c.name === 'eventos_sin_lugar')
    expect(check.ok).toBe(false)
    expect(check.detail).toContain('12')
    expect(check.detail).toContain('i5')
  })

  it('error de la consulta: 503', async () => {
    createAdminClient.mockReturnValue(clienteFalso({ data: null, count: null, error: { message: 'boom' } }))
    const res = await pedir()
    expect(res.status).toBe(503)
  })

  it('sin Bearer: 401 y no toca la base', async () => {
    const res = await GET(new Request('http://localhost.test/api/cron/health'))
    expect(res.status).toBe(401)
    expect(createAdminClient).not.toHaveBeenCalled()
  })
})
