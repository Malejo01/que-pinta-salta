import { beforeEach, describe, expect, it, vi } from 'vitest'

const createAdminClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: (...a: unknown[]) => createAdminClient(...a),
}))

import { NextRequest } from 'next/server'
import { GET } from '@/app/go/[id]/route'

const ID = '11111111-1111-4111-8111-111111111111'
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const TICKETERA = 'https://tickets.example.test/venue-de-prueba/show'

let rpc: ReturnType<typeof vi.fn>
let eqCalls: Array<[string, unknown]>

type Opts = { rpcError?: boolean; rpcThrows?: boolean; dbThrows?: boolean }

function setup(data: { ticket_url: unknown } | null, opts: Opts = {}) {
  eqCalls = []
  rpc = opts.rpcThrows
    ? vi.fn().mockRejectedValue(new Error('boom'))
    : vi.fn().mockResolvedValue({ error: opts.rpcError ? { message: 'falla' } : null })
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn(() => chain)
  chain.eq = vi.fn((c: string, v: unknown) => {
    eqCalls.push([c, v])
    return chain
  })
  chain.maybeSingle = vi.fn(async () => {
    if (opts.dbThrows) throw new Error('db caída')
    return { data }
  })
  createAdminClient.mockReturnValue({ from: vi.fn(() => chain), rpc })
}

function req(path: string, headers: Record<string, string> = { 'user-agent': UA }, method = 'GET') {
  return new NextRequest(`http://localhost.test${path}`, { method, headers })
}
const call = (r: NextRequest, id = ID) => GET(r, { params: Promise.resolve({ id }) })
const loc = (res: Response) => new URL(res.headers.get('location')!)

beforeEach(() => {
  createAdminClient.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('GET /go/[id]', () => {
  it('id no UUID: redirige al inicio sin consultar', async () => {
    setup({ ticket_url: TICKETERA })
    const res = await call(req('/go/abc?o=hero'), 'abc')
    expect(res.status).toBe(302)
    expect(loc(res).pathname).toBe('/')
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('con link: 302 al ticket_url guardado y cuenta 1 clic con el origen', async () => {
    setup({ ticket_url: TICKETERA })
    const res = await call(req(`/go/${ID}?o=hero`))
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(TICKETERA)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('record_event_metric', { p_event_id: ID, p_kind: 'click', p_origin: 'hero' })
  })

  it('solo busca eventos publicados', async () => {
    setup({ ticket_url: TICKETERA })
    await call(req(`/go/${ID}`))
    expect(eqCalls).toContainEqual(['id', ID])
    expect(eqCalls).toContainEqual(['status', 'PUBLISHED'])
  })

  it('origen inválido o ausente cuenta como directo', async () => {
    setup({ ticket_url: TICKETERA })
    await call(req(`/go/${ID}?o=hero%26x%3D1`))
    await call(req(`/go/${ID}`))
    expect(rpc.mock.calls.map((c) => c[1].p_origin)).toEqual(['directo', 'directo'])
  })

  it.each([
    ['url', 'https://malo.example.test/phishing'],
    ['next', 'https://malo.example.test/phishing'],
    ['url', '//malo.example.test'],
    ['redirect', 'https://malo.example.test'],
  ])('?%s=%s jamás cambia el destino (open redirect)', async (k, v) => {
    setup({ ticket_url: TICKETERA })
    const q = encodeURIComponent(v)
    const res = await call(req(`/go/${ID}?o=hero&${k}=${q}&url=${q}`))
    expect(res.headers.get('location')).toBe(TICKETERA)
  })

  it('?url= tampoco afecta cuando no hay link de compra', async () => {
    setup({ ticket_url: null })
    const res = await call(req(`/go/${ID}?url=https://malo.example.test`))
    expect(loc(res).origin).toBe('http://localhost.test')
    expect(loc(res).pathname).toBe(`/evento/${ID}`)
  })

  it('bot: redirige sin contar', async () => {
    setup({ ticket_url: TICKETERA })
    const res = await call(req(`/go/${ID}?o=hero`, { 'user-agent': 'Googlebot/2.1' }))
    expect(res.headers.get('location')).toBe(TICKETERA)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('sin user agent: redirige sin contar', async () => {
    setup({ ticket_url: TICKETERA })
    const res = await call(req(`/go/${ID}`, {}))
    expect(res.headers.get('location')).toBe(TICKETERA)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('prefetch: redirige sin contar', async () => {
    setup({ ticket_url: TICKETERA })
    const res = await call(req(`/go/${ID}`, { 'user-agent': UA, 'sec-purpose': 'prefetch' }))
    expect(res.headers.get('location')).toBe(TICKETERA)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('HEAD: redirige sin contar', async () => {
    setup({ ticket_url: TICKETERA })
    const res = await call(req(`/go/${ID}`, { 'user-agent': UA }, 'HEAD'))
    expect(res.headers.get('location')).toBe(TICKETERA)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('sin link: va a /evento/<id> y no cuenta', async () => {
    setup({ ticket_url: null })
    const res = await call(req(`/go/${ID}?o=hero`))
    expect(res.status).toBe(302)
    expect(loc(res).pathname).toBe(`/evento/${ID}`)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('evento inexistente: va a /evento/<id>', async () => {
    setup(null)
    const res = await call(req(`/go/${ID}`))
    expect(loc(res).pathname).toBe(`/evento/${ID}`)
  })

  it.each(['javascript:alert(1)', 'data:text/html,hola', '//otro.example.test', 'basura'])(
    'ticket_url guardado peligroso (%s) cae a la ficha',
    async (bad) => {
      setup({ ticket_url: bad })
      const res = await call(req(`/go/${ID}`))
      expect(loc(res).pathname).toBe(`/evento/${ID}`)
      expect(rpc).not.toHaveBeenCalled()
    }
  )

  it('si la RPC devuelve error, redirige igual', async () => {
    setup({ ticket_url: TICKETERA }, { rpcError: true })
    const res = await call(req(`/go/${ID}`))
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(TICKETERA)
  })

  it('si la RPC lanza, redirige igual', async () => {
    setup({ ticket_url: TICKETERA }, { rpcThrows: true })
    const res = await call(req(`/go/${ID}`))
    expect(res.headers.get('location')).toBe(TICKETERA)
  })

  it('si la base lanza, cae a la ficha', async () => {
    setup(null, { dbThrows: true })
    const res = await call(req(`/go/${ID}`))
    expect(res.status).toBe(302)
    expect(loc(res).pathname).toBe(`/evento/${ID}`)
  })

  it('si createAdminClient lanza, cae a la ficha', async () => {
    createAdminClient.mockImplementation(() => {
      throw new Error('sin env')
    })
    const res = await call(req(`/go/${ID}`))
    expect(loc(res).pathname).toBe(`/evento/${ID}`)
  })

  it.each([
    ['con link', { ticket_url: TICKETERA }, ID],
    ['sin link', { ticket_url: null }, ID],
    ['id inválido', { ticket_url: TICKETERA }, 'zzz'],
  ])('headers no-store y noindex (%s)', async (_n, data, id) => {
    setup(data)
    const res = await call(req(`/go/${id}`), id)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('x-robots-tag')).toBe('noindex')
  })
})
