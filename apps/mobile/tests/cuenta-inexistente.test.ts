// Q5-16 (decisión nº18): cuenta eliminada desde la web → el teléfono borra
// las búsquedas recientes y cierra la sesión local. Nada más la borra.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/busquedas-recientes', () => ({ borrarHistorialDeBusquedas: vi.fn(async () => true) }))

import { esCuentaInexistente, revisarCuentaExistente } from '../lib/cuenta-inexistente'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))

function dobles(getUser: () => Promise<unknown>) {
  const signOut = vi.fn(async () => ({ error: null }))
  const borrarBusquedas = vi.fn(async () => true)
  const supabase = { auth: { getUser: vi.fn(getUser), signOut } } as never
  return { supabase, signOut, borrarBusquedas }
}

describe('esCuentaInexistente', () => {
  it('reconoce user_not_found (código o mensaje con 403/404)', () => {
    expect(esCuentaInexistente({ code: 'user_not_found', status: 403 })).toBe(true)
    expect(esCuentaInexistente({ status: 403, message: 'User from sub claim in JWT does not exist' })).toBe(true)
    expect(esCuentaInexistente({ status: 404, message: 'User not found' })).toBe(true)
  })
  it('nada más: sin red, 500, token vencido, otro 403', () => {
    expect(esCuentaInexistente(null)).toBe(false)
    expect(esCuentaInexistente({ name: 'AuthRetryableFetchError', status: 0 })).toBe(false)
    expect(esCuentaInexistente({ status: 500, message: 'User not found' })).toBe(false)
    expect(esCuentaInexistente({ status: 401, code: 'bad_jwt', message: 'invalid JWT' })).toBe(false)
    expect(esCuentaInexistente({ status: 403, code: 'session_not_found', message: 'Session not found' })).toBe(false)
  })
})

describe('revisarCuentaExistente', () => {
  it('la cuenta ya no existe: borra las búsquedas y cierra la sesión local', async () => {
    const d = dobles(async () => ({ data: { user: null }, error: { code: 'user_not_found', status: 403 } }))
    expect(await revisarCuentaExistente(d)).toBe('no-existe')
    expect(d.borrarBusquedas).toHaveBeenCalledTimes(1)
    expect(d.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('la cuenta existe: no borra nada', async () => {
    const d = dobles(async () => ({ data: { user: { id: 'u' } }, error: null }))
    expect(await revisarCuentaExistente(d)).toBe('existe')
    expect(d.borrarBusquedas).not.toHaveBeenCalled()
    expect(d.signOut).not.toHaveBeenCalled()
  })

  it('sin red o con otro error: no borra nada (ni si getUser tira)', async () => {
    for (const getUser of [
      async () => ({ data: { user: null }, error: { name: 'AuthRetryableFetchError', status: 0 } }),
      async () => ({ data: { user: null }, error: { status: 500, message: 'boom' } }),
      async () => {
        throw new Error('red')
      },
    ]) {
      const d = dobles(getUser)
      expect(await revisarCuentaExistente(d)).toBe('sin-dato')
      expect(d.borrarBusquedas).not.toHaveBeenCalled()
      expect(d.signOut).not.toHaveBeenCalled()
    }
    expect(await revisarCuentaExistente({ supabase: null })).toBe('sin-dato')
  })

  it('si borrar o cerrar sesión fallan, no tira', async () => {
    const d = dobles(async () => ({ data: { user: null }, error: { code: 'user_not_found' } }))
    d.borrarBusquedas.mockRejectedValueOnce(new Error('disco'))
    d.signOut.mockRejectedValueOnce(new Error('x'))
    await expect(revisarCuentaExistente(d)).resolves.toBe('no-existe')
  })

  it('el SessionProvider lo corre al arrancar con una sesión guardada', () => {
    const src = readFileSync(join(RAIZ, 'lib', 'session', 'index.tsx'), 'utf8')
    expect(src).toContain('if (data.session && supabase) void revisarCuentaExistente({ supabase })')
  })
})
