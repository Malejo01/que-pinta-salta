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
 * fila reciente. Las de eventos sin lugar (.is('venue_id', null)) se distinguen:
 * la urgente es la que además llama .or(...) y devuelve `urgentes`; la otra `todos`.
 */
function clienteFalso(todos: Resultado, urgentes: Resultado = { data: [], count: 0 }) {
  const reciente = new Date().toISOString()
  const orArgs: string[] = []
  return {
    orArgs,
    from: (tabla: string) => {
      const llamadas: string[] = []
      let esSinLugar = false
      let esUrgente = false
      const resultado = (): Resultado => {
        if (tabla === 'job_last_runs') return { data: [], error: null }
        if (esSinLugar) return { error: null, ...(esUrgente ? urgentes : todos) }
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
      b.or = (filtro: string) => {
        esUrgente = true
        orArgs.push(filtro)
        llamadas.push('or')
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

type Check = { ok: boolean; detail: string; age_hours: number | null; max_hours: number | null }
const checkDe = (body: { checks: { name: string }[] }) =>
  body.checks.find((c) => c.name === 'eventos_sin_lugar') as unknown as Check

beforeEach(() => {
  createAdminClient.mockReset()
  process.env.CRON_SECRET = SECRETO
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  if (entorno === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = entorno
})

describe('GET /api/cron/health: eventos_sin_lugar', () => {
  it('sin eventos futuros sin lugar: ok y 200', async () => {
    createAdminClient.mockReturnValue(clienteFalso({ data: [], count: 0 }))
    const res = await pedir()
    const body = await res.json()
    expect(checkDe(body).ok).toBe(true)
    expect(checkDe(body).detail).toBe('todos los eventos futuros publicados tienen lugar')
    expect(body.ok).toBe(true)
    expect(res.status).toBe(200)
  })

  it('hay sin lugar pero ninguno urgente: ok true, 200, detail con total, "ninguno urgente" e ids', async () => {
    createAdminClient.mockReturnValue(
      clienteFalso({ data: [{ id: 'ev-a' }, { id: 'ev-b' }], count: 2 }, { data: [], count: 0 })
    )
    const res = await pedir()
    const body = await res.json()
    const check = checkDe(body)
    expect(check.ok).toBe(true)
    expect(check.detail).toContain('2 evento(s)')
    expect(check.detail).toContain('ninguno urgente')
    expect(check.detail).toContain('ev-a')
    expect(check.detail).toContain('ev-b')
    expect(body.ok).toBe(true)
    expect(res.status).toBe(200)
  })

  it('hay urgentes: ok false, 503, detail con cantidad de urgentes, sus ids y el total', async () => {
    createAdminClient.mockReturnValue(
      clienteFalso(
        { data: ['ev-a', 'ev-b', 'ev-c', 'ev-d', 'ev-e'].map((id) => ({ id })), count: 9 },
        { data: [{ id: 'ev-a' }, { id: 'ev-b' }], count: 2 }
      )
    )
    const res = await pedir()
    const body = await res.json()
    const check = checkDe(body)
    expect(check.ok).toBe(false)
    expect(check.detail).toContain('2 evento(s) sin lugar creados en las últimas 48 h')
    expect(check.detail).toContain('próximos 7 días')
    expect(check.detail).toContain('(hasta 5 ids: ev-a, ev-b)')
    expect(check.detail).toContain('9 futuros sin lugar en total')
    expect(check.detail).not.toContain('ev-e')
    expect(body.ok).toBe(false)
    expect(res.status).toBe(503)
  })

  it('age_hours y max_hours son null en este chequeo', async () => {
    createAdminClient.mockReturnValue(clienteFalso({ data: [], count: 0 }))
    const check = checkDe(await (await pedir()).json())
    expect(check.age_hours).toBeNull()
    expect(check.max_hours).toBeNull()
  })

  it('.or recibe created_at.gte (ahora-48h) y start_date.lte (ahora+7d) con ISO exactos', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-03-10T12:00:00.000Z'))
    const cliente = clienteFalso({ data: [], count: 0 })
    createAdminClient.mockReturnValue(cliente)
    await pedir()
    expect(cliente.orArgs).toEqual([
      'created_at.gte.2030-03-08T12:00:00.000Z,start_date.lte.2030-03-17T12:00:00.000Z',
    ])
  })

  it('error en la consulta general: 503', async () => {
    createAdminClient.mockReturnValue(clienteFalso({ data: null, count: null, error: { message: 'boom' } }))
    const res = await pedir()
    expect(res.status).toBe(503)
  })

  it('error en la consulta urgente: 503', async () => {
    createAdminClient.mockReturnValue(
      clienteFalso({ data: [], count: 0 }, { data: null, count: null, error: { message: 'boom urgente' } })
    )
    const res = await pedir()
    const body = await res.json()
    expect(res.status).toBe(503)
    expect(body.ok).toBe(false)
    // QPS-049c: texto fijo, nunca el mensaje crudo de la base.
    expect(body.error).toBe('Error consultando la base')
    expect(JSON.stringify(body)).not.toContain('boom urgente')
  })

  it('sin Bearer: 401 y no toca la base', async () => {
    const res = await GET(new Request('http://localhost.test/api/cron/health'))
    expect(res.status).toBe(401)
    expect(createAdminClient).not.toHaveBeenCalled()
  })
})
