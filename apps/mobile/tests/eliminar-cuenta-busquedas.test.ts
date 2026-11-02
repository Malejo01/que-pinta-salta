// Q4-12: al eliminar la cuenta se borran también las búsquedas recientes del
// teléfono (viven en `qps:busquedas:*`, fuera de la caché a propósito).
import { describe, expect, it, vi } from 'vitest'

const borrarHistorialDeBusquedas = vi.hoisted(() => vi.fn(async () => true))

vi.mock('@/lib/supabase', () => ({ supabase: { auth: { signOut: vi.fn(async () => {}) } } }))
vi.mock('@react-native-google-signin/google-signin', () => ({ GoogleSignin: { signOut: vi.fn(async () => {}) } }))
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
}))
vi.mock('@/lib/busquedas-recientes', () => ({ borrarHistorialDeBusquedas }))

import { limpiarTrasEliminarCuenta } from '@/lib/cuenta'

describe('limpiarTrasEliminarCuenta (Q4-12)', () => {
  it('borra el historial de búsquedas, con o sin Google', async () => {
    await limpiarTrasEliminarCuenta(false)
    await limpiarTrasEliminarCuenta(true)
    expect(borrarHistorialDeBusquedas).toHaveBeenCalledTimes(2)
  })

  it('si el borrado falla, no tira (la cuenta ya no existe en el servidor)', async () => {
    borrarHistorialDeBusquedas.mockResolvedValueOnce(false)
    await expect(limpiarTrasEliminarCuenta(false)).resolves.toBeUndefined()
  })
})
