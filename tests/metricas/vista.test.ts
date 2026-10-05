import { beforeEach, describe, expect, it, vi } from 'vitest'

const createAdminClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: (...a: unknown[]) => createAdminClient(...a),
}))

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/metricas/vista/route'

const ID = '11111111-1111-4111-8111-111111111111'
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

let rpc: ReturnType<typeof vi.fn>

function post(body: string, headers: Record<string, string> = {}) {
  return POST(
    new NextRequest('http://localhost.test/api/metricas/vista', {
      method: 'POST',
      body,
      headers: { 'user-agent': UA, ...headers },
    })
  )
}

beforeEach(() => {
  rpc = vi.fn().mockResolvedValue({ error: null })
  createAdminClient.mockReset()
  createAdminClient.mockReturnValue({ rpc })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/metricas/vista', () => {
  it('JSON válido: cuenta una vista', async () => {
    const res = await post(JSON.stringify({ eventId: ID, origin: 'hoy' }), { 'content-type': 'application/json' })
    expect(res.status).toBe(204)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('record_event_metric', { p_event_id: ID, p_kind: 'view', p_origin: 'hoy' })
  })

  it('text/plain (sendBeacon): cuenta', async () => {
    const res = await post(JSON.stringify({ eventId: ID, origin: 'fila' }), {
      'content-type': 'text/plain;charset=UTF-8',
    })
    expect(res.status).toBe(204)
    expect(rpc).toHaveBeenCalledWith('record_event_metric', { p_event_id: ID, p_kind: 'view', p_origin: 'fila' })
  })

  it('origen inválido o ausente cuenta como directo', async () => {
    await post(JSON.stringify({ eventId: ID, origin: '../' }))
    await post(JSON.stringify({ eventId: ID }))
    expect(rpc.mock.calls.map((c) => c[1].p_origin)).toEqual(['directo', 'directo'])
  })

  it.each([
    ['UUID inválido', JSON.stringify({ eventId: 'abc', origin: 'hero' })],
    ['eventId ausente', JSON.stringify({ origin: 'hero' })],
    ['eventId no string', JSON.stringify({ eventId: 5 })],
    ['JSON roto', '{"eventId": '],
    ['no es JSON', 'hola'],
    ['null', 'null'],
    ['body vacío', ''],
    ['body enorme', JSON.stringify({ eventId: ID, origin: 'hero', basura: 'x'.repeat(5000) })],
  ])('%s: 204 sin contar', async (_n, body) => {
    const res = await post(body)
    expect(res.status).toBe(204)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('bot: 204 sin contar', async () => {
    const res = await post(JSON.stringify({ eventId: ID, origin: 'hero' }), { 'user-agent': 'Googlebot/2.1' })
    expect(res.status).toBe(204)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('prefetch: 204 sin contar', async () => {
    const res = await post(JSON.stringify({ eventId: ID }), { purpose: 'prefetch' })
    expect(res.status).toBe(204)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('si la RPC falla, igual 204', async () => {
    rpc.mockRejectedValue(new Error('boom'))
    const res = await post(JSON.stringify({ eventId: ID }))
    expect(res.status).toBe(204)
  })
})
