import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeEventsDb, type EventRow } from '../events/fake-events-db'

const createAdminClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: (...a: unknown[]) => createAdminClient(...a),
}))

import { NextRequest } from 'next/server'
import { GET } from '@/app/go/[id]/route'

const uid = (n: number) => `12345678-1234-4234-8234-${String(n).padStart(12, '0')}`
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const TICKETERA = 'https://tickets.example.test/venue-de-prueba/show'

const ev = (n: number, over: EventRow = {}, mergedInto?: string): EventRow => ({
  id: uid(n),
  status: 'PUBLISHED',
  ticket_url: TICKETERA,
  ai_metadata: mergedInto ? { merged_into_event_id: mergedInto } : null,
  ...over,
})

let rpc: ReturnType<typeof vi.fn>

function setup(rows: EventRow[]) {
  const db = createFakeEventsDb(rows)
  rpc = vi.fn().mockResolvedValue({ error: null })
  createAdminClient.mockReturnValue({ from: db.client.from, rpc })
  return db
}
const call = (id: string, qs = '') =>
  GET(new NextRequest(`http://localhost.test/go/${id}${qs}`, { headers: { 'user-agent': UA } }), {
    params: Promise.resolve({ id }),
  })
const loc = (res: Response) => new URL(res.headers.get('location')!)

beforeEach(() => {
  createAdminClient.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('GET /go/[id] con eventos fusionados', () => {
  it('/go/<fusionado>?o=radar redirige a /go/<destino>?o=radar', async () => {
    setup([ev(1, { status: 'DRAFT' }, uid(2)), ev(2)])
    const res = await call(uid(1), '?o=radar')
    expect(res.status).toBe(302)
    const to = loc(res)
    expect(to.origin).toBe('http://localhost.test')
    expect(to.pathname).toBe(`/go/${uid(2)}`)
    expect(to.searchParams.get('o')).toBe('radar')
  })

  it('no cuenta el clic en el fusionado (se cuenta en el destino, al seguir la redirección)', async () => {
    setup([ev(1, { status: 'DRAFT' }, uid(2)), ev(2)])
    await call(uid(1), '?o=radar')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('cadena de 2 saltos: redirige directo al destino final', async () => {
    setup([ev(1, { status: 'DRAFT' }, uid(2)), ev(2, { status: 'DRAFT' }, uid(3)), ev(3)])
    const res = await call(uid(1), '?o=hero')
    expect(loc(res).pathname).toBe(`/go/${uid(3)}`)
    expect(loc(res).searchParams.get('o')).toBe('hero')
  })

  it('sin o: redirige a /go/<destino> sin ?o=', async () => {
    setup([ev(1, { status: 'DRAFT' }, uid(2)), ev(2)])
    const res = await call(uid(1))
    expect(loc(res).pathname).toBe(`/go/${uid(2)}`)
    expect(loc(res).search).toBe('')
  })

  it('con o=radar lo conserva', async () => {
    setup([ev(1, { status: 'DRAFT' }, uid(2)), ev(2)])
    const res = await call(uid(1), '?o=radar')
    expect(loc(res).search).toBe('?o=radar')
  })

  it.each(['hero%26x%3D1', 'malo', 'https%3A%2F%2Fmalo.example.test'])('o inválido (%s) no se propaga', async (bad) => {
    setup([ev(1, { status: 'DRAFT' }, uid(2)), ev(2)])
    const res = await call(uid(1), `?o=${bad}`)
    const to = loc(res)
    expect(to.pathname).toBe(`/go/${uid(2)}`)
    expect(to.search).toBe('')
  })

  it('sin fusión y no PUBLISHED: va a /evento/<id>, como hoy', async () => {
    setup([ev(1, { status: 'DRAFT' })])
    const res = await call(uid(1), '?o=radar')
    expect(loc(res).pathname).toBe(`/evento/${uid(1)}`)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('fusionado cuyo destino no está PUBLISHED: va a /evento/<id>', async () => {
    setup([ev(1, { status: 'DRAFT' }, uid(2)), ev(2, { status: 'DRAFT' })])
    const res = await call(uid(1))
    expect(loc(res).pathname).toBe(`/evento/${uid(1)}`)
  })

  it('fusionado con ciclo: no entra en bucle y va a /evento/<id>', async () => {
    setup([ev(1, { status: 'DRAFT' }, uid(2)), ev(2, { status: 'DRAFT' }, uid(1))])
    const res = await call(uid(1))
    expect(loc(res).pathname).toBe(`/evento/${uid(1)}`)
  })

  it('no regresión: PUBLISHED con link sigue yendo a la ticketera y cuenta el clic', async () => {
    setup([ev(1)])
    const res = await call(uid(1), '?o=hero')
    expect(res.headers.get('location')).toBe(TICKETERA)
    expect(rpc).toHaveBeenCalledWith('record_event_metric', { p_event_id: uid(1), p_kind: 'click', p_origin: 'hero' })
  })

  it('headers no-store y noindex también en la redirección de fusión', async () => {
    setup([ev(1, { status: 'DRAFT' }, uid(2)), ev(2)])
    const res = await call(uid(1))
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('x-robots-tag')).toBe('noindex')
  })
})
