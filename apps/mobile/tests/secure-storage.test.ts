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

import * as SecureStore from 'expo-secure-store'
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

// ---------------------------------------------------------------------------
// R28 (28-a): el hallazgo de seguridad. El bug era que si lo ilegible era
// justo la clave del contador (`clave.n`, no un pedazo), `removeItem` no
// podía borrarla (necesitaba leerla primero con `getItemAsync`, que tira) y
// entonces `setItem` tampoco podía volver a escribir nunca más: el teléfono
// quedaba sin poder guardar ninguna sesión, en silencio.
//
// El doble de abajo hace que `getItemAsync` tire **solo** cuando se le pide
// la clave del contador (`claveCantidad('sesion')`): cualquier otra clave
// (los pedazos, u otras sesiones) sigue leyendo del `almacen` en memoria
// como siempre. Se restaura la implementación normal al final de cada test
// para no afectar a los demás.
// ---------------------------------------------------------------------------
describe('getItem/setItem/removeItem: la clave del contador (.n) ilegible no deja al almacenamiento sin salida', () => {
  function conContadorIlegible(clave: string) {
    const mockGetItemAsync = vi.mocked(SecureStore.getItemAsync)
    const implementacionNormal = mockGetItemAsync.getMockImplementation()!
    mockGetItemAsync.mockImplementation(async (claveLeida: string) => {
      if (claveLeida === claveCantidad(clave)) {
        throw new Error('No se pudo descifrar (clave del contador).')
      }
      return implementacionNormal(claveLeida)
    })
    return () => {
      mockGetItemAsync.mockImplementation(implementacionNormal)
    }
  }

  it('removeItem: con la clave del contador ilegible, borra igual (no relanza) y un setItem posterior vuelve a funcionar', async () => {
    await setItem('sesion', 'valor-viejo-de-prueba')
    expect(almacen.has(claveCantidad('sesion'))).toBe(true)

    const restaurar = conContadorIlegible('sesion')
    await expect(removeItem('sesion')).resolves.toBeUndefined()
    restaurar()

    // La clave del contador ya no está (removeItem no dependió de poder
    // leerla: la borra de forma incondicional).
    expect(almacen.has(claveCantidad('sesion'))).toBe(false)

    // Y ahora el almacenamiento puede volver a guardar: antes del fix, el
    // próximo setItem también habría tirado al intentar leer la cantidad
    // anterior (que acá ya no existe, pero el escenario real es el mismo:
    // una clave .n que no se puede descifrar).
    await setItem('sesion', 'valor-nuevo-de-prueba')
    await expect(getItem('sesion')).resolves.toBe('valor-nuevo-de-prueba')
  })

  it('setItem: con la clave del contador ilegible al leer la cantidad anterior, escribe igual (no rechaza) y el valor se puede releer', async () => {
    await setItem('sesion', 'valor-viejo-de-prueba')

    const restaurar = conContadorIlegible('sesion')
    await expect(setItem('sesion', 'valor-nuevo-de-prueba')).resolves.toBeUndefined()
    restaurar()

    await expect(getItem('sesion')).resolves.toBe('valor-nuevo-de-prueba')
  })

  // 28-q, punto 2 de la parte A: el caso general (no específico del
  // contador) de "si getItemAsync tira, getItem devuelve null y no tira".
  it('getItem: si getItemAsync tira al leer la clave del contador, getItem devuelve null (no rechaza)', async () => {
    await setItem('sesion', 'valor-de-prueba')

    const restaurar = conContadorIlegible('sesion')
    await expect(getItem('sesion')).resolves.toBeNull()
    restaurar()
  })

  it('getItem: si getItemAsync tira al leer un pedazo (no el contador), también devuelve null y no tira', async () => {
    await setItem('sesion', 'x'.repeat(TAMANIO_PEDAZO * 2 + 1)) // 3 pedazos
    const clavePedazo0 = clavePedazo('sesion', 0)

    const mockGetItemAsync = vi.mocked(SecureStore.getItemAsync)
    const implementacionNormal = mockGetItemAsync.getMockImplementation()!
    mockGetItemAsync.mockImplementation(async (claveLeida: string) => {
      if (claveLeida === clavePedazo0) throw new Error('No se pudo descifrar (un pedazo).')
      return implementacionNormal(claveLeida)
    })

    await expect(getItem('sesion')).resolves.toBeNull()

    mockGetItemAsync.mockImplementation(implementacionNormal)
  })
})
