// R-1 · «Cerca de casa» en «Lugares para chicos» (Q5-4): `ubicacionSiYaConcedida`
// con `expo-location` de mentira. Esta pantalla NUNCA pide el permiso: solo
// usa la ubicación si ya estaba concedida, y aproximada (2 decimales, ~1 km).
// Antes, lugares-chicos.test.ts lo fijaba leyendo el fuente.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ubicacionSiYaConcedida } from '@/lib/ubicacion'

const loc = vi.hoisted(() => ({
  estado: 'granted' as string,
  posicion: { coords: { latitude: -24.788312, longitude: -65.410644 } } as unknown,
  falla: false,
  pidio: 0,
  opciones: [] as unknown[],
}))

vi.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: async () => ({ status: loc.estado }),
  requestForegroundPermissionsAsync: async () => {
    loc.pidio++
    return { status: 'granted' }
  },
  getCurrentPositionAsync: async (o: unknown) => {
    loc.opciones.push(o)
    if (loc.falla) throw new Error('GPS apagado')
    return loc.posicion
  },
}))

beforeEach(() => {
  loc.estado = 'granted'
  loc.falla = false
  loc.pidio = 0
  loc.opciones = []
})

describe('ubicacionSiYaConcedida', () => {
  it('con el permiso ya concedido: la posición aproximada (2 decimales), con precisión «Balanced»', async () => {
    expect(await ubicacionSiYaConcedida()).toEqual({ ok: true, latitud: -24.79, longitud: -65.41 })
    expect(loc.opciones).toEqual([{ accuracy: 3 }])
    expect(loc.pidio).toBe(0)
  })

  it.each(['denied', 'undetermined'])('permiso %s: «sin-permiso», sin pedirlo y sin leer la posición', async (estado) => {
    loc.estado = estado
    expect(await ubicacionSiYaConcedida()).toEqual({ ok: false, motivo: 'sin-permiso' })
    expect(loc.pidio).toBe(0)
    expect(loc.opciones).toEqual([])
  })

  it('si la posición falla (GPS apagado): «no-disponible», nunca tira', async () => {
    loc.falla = true
    expect(await ubicacionSiYaConcedida()).toEqual({ ok: false, motivo: 'no-disponible' })
  })
})
