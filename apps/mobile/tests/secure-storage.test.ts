// 24-c: lib/secure-storage.ts.
// - Las funciones de partir/unir/claves (pura, sin import de expo-secure-store
//   en tiempo de ejecución) se prueban directamente.
// - getItem/setItem/removeItem (el adaptador que sí llama a SecureStore) se
//   prueban con un doble en memoria: `vi.mock('expo-secure-store', ...)` con
//   un Map, nunca el SecureStore real (ni red ni teléfono).
import { beforeEach, describe, expect, it, vi } from 'vitest'

const almacen = new Map<string, string>()

// `vi.mock` se eleva (hoist) por encima de los imports estáticos de abajo,
// así que `../lib/secure-storage` ya ve este doble al importar
// `expo-secure-store`.
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (clave: string) => (almacen.has(clave) ? almacen.get(clave)! : null)),
  setItemAsync: vi.fn(async (clave: string, valor: string) => {
    almacen.set(clave, valor)
  }),
  deleteItemAsync: vi.fn(async (clave: string) => {
    almacen.delete(clave)
  }),
}))

import {
  claveCantidad,
  clavePedazo,
  getItem,
  indicesSobrantes,
  parsearCantidad,
  partir,
  removeItem,
  setItem,
  TAMANIO_PEDAZO,
  unir,
} from '../lib/secure-storage'

beforeEach(() => {
  almacen.clear()
})

describe('funciones puras', () => {
  it('partir: un valor vacío no genera pedazos', () => {
    expect(partir('')).toEqual([])
  })

  it('partir: un valor corto es un solo pedazo', () => {
    expect(partir('hola')).toEqual(['hola'])
  })

  it(`partir: corta cada TAMANIO_PEDAZO (${TAMANIO_PEDAZO}) caracteres`, () => {
    const valor = 'x'.repeat(TAMANIO_PEDAZO * 2 + 5)
    const pedazos = partir(valor)
    expect(pedazos).toHaveLength(3)
    expect(pedazos[0]).toHaveLength(TAMANIO_PEDAZO)
    expect(pedazos[1]).toHaveLength(TAMANIO_PEDAZO)
    expect(pedazos[2]).toHaveLength(5)
    expect(pedazos.join('')).toBe(valor)
  })

  it('unir: concatena los pedazos en orden', () => {
    expect(unir(['ab', 'cd', 'ef'])).toBe('abcdef')
    expect(unir([])).toBe('')
  })

  it('unir: null si falta algún pedazo', () => {
    expect(unir(['ab', null, 'ef'])).toBeNull()
  })

  it('claveCantidad / clavePedazo: nombres de clave esperados', () => {
    expect(claveCantidad('sesion')).toBe('sesion.n')
    expect(clavePedazo('sesion', 0)).toBe('sesion.0')
    expect(clavePedazo('sesion', 2)).toBe('sesion.2')
  })

  it('parsearCantidad: null o no numérico cuenta como 0', () => {
    expect(parsearCantidad(null)).toBe(0)
    expect(parsearCantidad('no-es-un-numero')).toBe(0)
    expect(parsearCantidad('-1')).toBe(0)
    expect(parsearCantidad('3')).toBe(3)
  })

  it('indicesSobrantes: los índices que sobran al reducir la cantidad de pedazos', () => {
    expect(indicesSobrantes(3, 1)).toEqual([1, 2])
    expect(indicesSobrantes(3, 3)).toEqual([])
    expect(indicesSobrantes(1, 3)).toEqual([])
    expect(indicesSobrantes(0, 0)).toEqual([])
  })
})

describe('getItem/setItem/removeItem (con el doble en memoria de SecureStore)', () => {
  it('una sesión de 5000 caracteres va y vuelve igual', async () => {
    const sesionDePrueba = 'sesion-de-prueba-'.repeat(300).slice(0, 5000)
    expect(sesionDePrueba).toHaveLength(5000)

    await setItem('sesion', sesionDePrueba)
    await expect(getItem('sesion')).resolves.toBe(sesionDePrueba)

    // 5000 caracteres con TAMANIO_PEDAZO=1800 son 3 pedazos.
    expect(almacen.get(claveCantidad('sesion'))).toBe('3')
  })

  it('pasar de 3 pedazos a 1 borra los pedazos sobrantes', async () => {
    const valorLargo = 'x'.repeat(TAMANIO_PEDAZO * 2 + 1) // 3 pedazos
    await setItem('sesion', valorLargo)
    expect(almacen.has(clavePedazo('sesion', 2))).toBe(true)

    const valorCorto = 'corto' // 1 pedazo
    await setItem('sesion', valorCorto)

    expect(almacen.get(claveCantidad('sesion'))).toBe('1')
    expect(almacen.has(clavePedazo('sesion', 1))).toBe(false)
    expect(almacen.has(clavePedazo('sesion', 2))).toBe(false)
    await expect(getItem('sesion')).resolves.toBe(valorCorto)
  })

  it('con un pedazo faltante, getItem devuelve null', async () => {
    await setItem('sesion', 'x'.repeat(TAMANIO_PEDAZO * 2 + 1)) // 3 pedazos: .0 .1 .2
    almacen.delete(clavePedazo('sesion', 1)) // se "pierde" el pedazo del medio

    await expect(getItem('sesion')).resolves.toBeNull()
  })

  it('getItem sin ningún dato guardado devuelve null', async () => {
    await expect(getItem('no-existe')).resolves.toBeNull()
  })

  it('removeItem borra todo (la cantidad y todos los pedazos)', async () => {
    await setItem('sesion', 'x'.repeat(TAMANIO_PEDAZO * 2 + 1)) // 3 pedazos
    expect(almacen.size).toBeGreaterThan(0)

    await removeItem('sesion')

    expect(almacen.has(claveCantidad('sesion'))).toBe(false)
    expect(almacen.has(clavePedazo('sesion', 0))).toBe(false)
    expect(almacen.has(clavePedazo('sesion', 1))).toBe(false)
    expect(almacen.has(clavePedazo('sesion', 2))).toBe(false)
    await expect(getItem('sesion')).resolves.toBeNull()
  })
})
