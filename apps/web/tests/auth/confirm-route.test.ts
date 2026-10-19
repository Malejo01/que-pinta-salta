import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const verifyOtp = vi.fn()
const createClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: (...a: unknown[]) => createClient(...a),
}))

import { NextRequest } from 'next/server'
import { GET } from '@/app/auth/confirm/route'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ORIGIN = 'https://qps.test'
const TOKEN = 'token-de-prueba-valido'

function req(qs: string) {
  return new NextRequest(`${ORIGIN}/auth/confirm${qs}`, { method: 'GET' })
}

function location(res: Response): string {
  const raw = res.headers.get('location')!
  const url = new URL(raw)
  return url.pathname + url.search
}

beforeEach(() => {
  verifyOtp.mockReset()
  verifyOtp.mockResolvedValue({ error: null })
  createClient.mockReset()
  createClient.mockResolvedValue({ auth: { verifyOtp } })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GET /auth/confirm: type fuera de la lista cerrada', () => {
  it('type inexistente en la lista -> /auth/error, sin llamar a verifyOtp', async () => {
    const res = await GET(req(`?token_hash=${TOKEN}&type=magiclink`))
    expect(location(res)).toBe('/auth/error')
    expect(verifyOtp).not.toHaveBeenCalled()
  })

  it('sin type -> /auth/error, sin llamar a verifyOtp', async () => {
    const res = await GET(req(`?token_hash=${TOKEN}`))
    expect(location(res)).toBe('/auth/error')
    expect(verifyOtp).not.toHaveBeenCalled()
  })
})

describe('GET /auth/confirm: token_hash inválido', () => {
  it('sin token_hash -> /auth/error, sin llamar a verifyOtp', async () => {
    const res = await GET(req('?type=recovery'))
    expect(location(res)).toBe('/auth/error')
    expect(verifyOtp).not.toHaveBeenCalled()
  })

  it('token_hash vacío -> /auth/error, sin llamar a verifyOtp', async () => {
    const res = await GET(req('?type=recovery&token_hash='))
    expect(location(res)).toBe('/auth/error')
    expect(verifyOtp).not.toHaveBeenCalled()
  })

  it('token_hash de 513 caracteres (uno más del máximo) -> /auth/error, sin llamar a verifyOtp', async () => {
    const largo = 'a'.repeat(513)
    const res = await GET(req(`?type=recovery&token_hash=${largo}`))
    expect(location(res)).toBe('/auth/error')
    expect(verifyOtp).not.toHaveBeenCalled()
  })

  it('token_hash de exactamente 512 caracteres sí se acepta (llama a verifyOtp)', async () => {
    const limite = 'a'.repeat(512)
    const res = await GET(req(`?type=recovery&token_hash=${limite}`))
    expect(verifyOtp).toHaveBeenCalledTimes(1)
    expect(location(res)).toBe('/auth/restablecer')
  })
})

describe('GET /auth/confirm: next saneado con rutaSiguienteSegura', () => {
  it('next=//evil.com con type=recovery -> no sigue el next malicioso, cae al default de recovery (/auth/restablecer)', async () => {
    const res = await GET(req(`?token_hash=${TOKEN}&type=recovery&next=${encodeURIComponent('//evil.com')}`))
    expect(location(res)).toBe('/auth/restablecer')
  })

  it('éxito con recovery -> /auth/restablecer (el default de ese type)', async () => {
    const res = await GET(req(`?token_hash=${TOKEN}&type=recovery`))
    expect(location(res)).toBe('/auth/restablecer')
  })

  it('éxito con signup, sin next -> / (el default del resto de los types)', async () => {
    const res = await GET(req(`?token_hash=${TOKEN}&type=signup`))
    expect(location(res)).toBe('/')
  })

  it('éxito con un next válido -> ese next, no el default', async () => {
    const res = await GET(req(`?token_hash=${TOKEN}&type=email&next=${encodeURIComponent('/perfil')}`))
    expect(location(res)).toBe('/perfil')
  })
})

describe('GET /auth/confirm: verifyOtp con error', () => {
  it('verifyOtp devuelve error -> /auth/error, sin ningún detalle en la URL', async () => {
    verifyOtp.mockResolvedValue({ error: { code: 'otp_expired', message: 'Token has expired or is invalid' } })
    const res = await GET(req(`?token_hash=${TOKEN}&type=recovery`))
    const raw = res.headers.get('location')!
    expect(new URL(raw).pathname).toBe('/auth/error')
    expect(raw).not.toContain('otp_expired')
    expect(raw).not.toContain('Token has expired')
  })
})

describe('GET /auth/confirm: nunca loguea el token_hash ni el type junto con el error', () => {
  it('con verifyOtp en error, ningún console.* de la llamada incluye el token', async () => {
    verifyOtp.mockResolvedValue({ error: { code: 'otp_expired', message: 'Token has expired or is invalid' } })
    await GET(req(`?token_hash=${TOKEN}&type=recovery`))
    const logged = JSON.stringify((console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls)
    expect(logged).not.toContain(TOKEN)
  })

  it('el archivo fuente no tiene ningún console.* que incluya la variable del token (detector estático)', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'app', 'auth', 'confirm', 'route.ts'), 'utf8')
    const llamadasConsole = src.match(/console\.\w+\([^)]*\)/g) ?? []
    for (const llamada of llamadasConsole) {
      expect(llamada).not.toMatch(/\btokenHash\b/)
      expect(llamada).not.toMatch(/\btoken_hash\b/)
    }
  })
})
