import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createAdminClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: (...a: unknown[]) => createAdminClient(...a),
}))

import { NextRequest } from 'next/server'
import { GET, POST } from '@/app/api/radar/baja/route'
import { signUnsubscribe } from '@/lib/radar/baja'

const UID = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const SECRET = 'secreto-falso-de-prueba'
const original = process.env.RADAR_UNSUBSCRIBE_SECRET

let from: ReturnType<typeof vi.fn>
let update: ReturnType<typeof vi.fn>
let eq: ReturnType<typeof vi.fn>

function setup(result: { error: { message: string } | null } | 'throws' = { error: null }) {
  eq = vi.fn(async () => {
    if (result === 'throws') throw new Error('db caída')
    return result
  })
  update = vi.fn(() => ({ eq }))
  from = vi.fn(() => ({ update }))
  createAdminClient.mockReturnValue({ from })
}

function req(qs: string, body = '', headers: Record<string, string> = {}) {
  return new NextRequest(`https://qps.test/api/radar/baja${qs}`, { method: 'POST', body: body || undefined, headers })
}
const q = (u = UID, t = signUnsubscribe(UID)) => `?u=${u}&t=${t}`

beforeEach(() => {
  process.env.RADAR_UNSUBSCRIBE_SECRET = SECRET
  createAdminClient.mockReset()
  setup()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  if (original === undefined) delete process.env.RADAR_UNSUBSCRIBE_SECRET
  else process.env.RADAR_UNSUBSCRIBE_SECRET = original
  vi.restoreAllMocks()
})

describe('POST /api/radar/baja', () => {
  it('token válido: update disabled por user_id, 200 y no-store', async () => {
    const res = await POST(req(q()))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(from).toHaveBeenCalledWith('user_radar_settings')
    expect(update).toHaveBeenCalledWith({ email_frequency: 'disabled' })
    expect(eq).toHaveBeenCalledWith('user_id', UID)
  })
  it('One-Click: body List-Unsubscribe=One-Click con u y t en la query', async () => {
    const res = await POST(req(q(), 'List-Unsubscribe=One-Click', { 'content-type': 'application/x-www-form-urlencoded' }))
    expect(res.status).toBe(200)
    expect(eq).toHaveBeenCalledWith('user_id', UID)
  })
  it('u y t en el body del form también sirven', async () => {
    const res = await POST(req('', `u=${UID}&t=${signUnsubscribe(UID)}`))
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledTimes(1)
  })
  it('uuid en mayúsculas: baja sobre el uuid en minúsculas', async () => {
    const res = await POST(req(q(UID.toUpperCase())))
    expect(res.status).toBe(200)
    expect(eq).toHaveBeenCalledWith('user_id', UID)
  })
  it('form con from=page: 303 a /radar/baja?listo=1', async () => {
    const res = await POST(req(q(), 'from=page'))
    expect(res.status).toBe(303)
    const loc = new URL(res.headers.get('location')!)
    expect(loc.pathname + loc.search).toBe('/radar/baja?listo=1')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(update).toHaveBeenCalledTimes(1)
  })
  it('Accept text/html también redirige 303', async () => {
    const res = await POST(req(q(), '', { accept: 'text/html' }))
    expect(res.status).toBe(303)
  })
  it('usuario inexistente (update sin filas, sin error): igual 200', async () => {
    setup({ error: null })
    const res = await POST(req(q(OTHER, signUnsubscribe(OTHER))))
    expect(res.status).toBe(200)
  })
  it('repetir la baja no da error', async () => {
    const a = await POST(req(q()))
    const b = await POST(req(q()))
    expect([a.status, b.status]).toEqual([200, 200])
  })
  it('token inválido, vacío o faltante: 400 sin update ni cliente', async () => {
    const otro = signUnsubscribe(OTHER)
    for (const qs of [q(UID, 'basura'), q(UID, otro), `?u=${UID}`, `?t=${signUnsubscribe(UID)}`, '', '?u=x&t=y', `?u=${UID}&t=`]) {
      const res = await POST(req(qs))
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ ok: false })
      expect(res.headers.get('cache-control')).toBe('no-store')
    }
    expect(update).not.toHaveBeenCalled()
    expect(createAdminClient).not.toHaveBeenCalled()
  })
  it('sin secreto: 400 sin update', async () => {
    const t = signUnsubscribe(UID)
    delete process.env.RADAR_UNSUBSCRIBE_SECRET
    const res = await POST(req(`?u=${UID}&t=${t}`))
    expect(res.status).toBe(400)
    expect(update).not.toHaveBeenCalled()
  })
  it('body enorme: 400 sin update (aunque el token sea válido)', async () => {
    const res = await POST(req(q(), 'x='.padEnd(5000, 'a')))
    expect(res.status).toBe(400)
    expect(update).not.toHaveBeenCalled()
  })
  it('content-length declarado enorme: 400 sin update', async () => {
    const res = await POST(req(q(), 'a=1', { 'content-length': '999999' }))
    expect(res.status).toBe(400)
    expect(update).not.toHaveBeenCalled()
  })
  it('la base devuelve error: 500 sin detalle', async () => {
    setup({ error: { message: 'detalle interno secreto' } })
    const res = await POST(req(q()))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ ok: false })
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
  it('la consulta lanza excepción: 500, sin detalle y el log no filtra email ni token', async () => {
    setup('throws')
    const token = signUnsubscribe(UID)!
    const res = await POST(req(q()))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ ok: false })
    expect(res.headers.get('cache-control')).toBe('no-store')
    const logged = JSON.stringify((console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls)
    expect(logged).not.toContain(token)
    expect(logged).not.toContain('@')
  })
  it('createAdminClient lanza: 500 y el log no filtra el token', async () => {
    createAdminClient.mockImplementation(() => {
      throw new Error('sin credenciales')
    })
    const token = signUnsubscribe(UID)!
    const res = await POST(req(q()))
    expect(res.status).toBe(500)
    expect(update).not.toHaveBeenCalled()
    const logged = JSON.stringify((console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls)
    expect(console.error).toHaveBeenCalled()
    expect(logged).not.toContain(token)
  })
})

describe('GET /api/radar/baja', () => {
  const get = (qs: string) => GET(new NextRequest(`https://qps.test/api/radar/baja${qs}`, { method: 'GET' }))

  it('303 a /radar/baja con u y t, no-store, sin cliente ni update', async () => {
    const t = signUnsubscribe(UID)!
    const res = get(`?u=${UID}&t=${t}`)
    expect(res.status).toBe(303)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const loc = new URL(res.headers.get('location')!)
    expect(loc.origin).toBe('https://qps.test')
    expect(loc.pathname).toBe('/radar/baja')
    expect(loc.searchParams.get('u')).toBe(UID)
    expect(loc.searchParams.get('t')).toBe(t)
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })
  it('sin parámetros o con token inválido: igual redirige sin verificar ni escribir', () => {
    for (const qs of ['', '?u=x&t=y']) {
      const res = get(qs)
      expect(res.status).toBe(303)
      expect(new URL(res.headers.get('location')!).pathname).toBe('/radar/baja')
    }
    expect(createAdminClient).not.toHaveBeenCalled()
  })
  it('u con caracteres raros queda codificado y el destino no cambia (sin open redirect)', () => {
    const evil = ['//evil.test/x', 'https://evil.test', '/\\evil.test', 'a&listo=1#frag', '../../admin', 'x\r\nLocation: https://evil.test']
    for (const u of evil) {
      const res = get(`?u=${encodeURIComponent(u)}&t=${encodeURIComponent(u)}`)
      expect(res.status).toBe(303)
      const raw = res.headers.get('location')!
      const loc = new URL(raw)
      expect(loc.origin).toBe('https://qps.test')
      expect(loc.pathname).toBe('/radar/baja')
      expect(loc.hash).toBe('')
      expect([...loc.searchParams.keys()]).toEqual(['u', 't'])
      expect(loc.searchParams.get('u')).toBe(u)
      expect(raw).not.toMatch(/[\r\n]/)
    }
    expect(createAdminClient).not.toHaveBeenCalled()
  })
})
