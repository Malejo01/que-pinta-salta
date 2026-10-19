import { describe, expect, it, vi } from 'vitest'
import { crearCache } from '@/lib/venues/geocodificacion/cache'

describe('crearCache', () => {
  it('un hit no llama a escribir ni necesita red: devuelve el valor guardado', () => {
    const almacen = { contenido: JSON.stringify({ clave1: { valor: { a: 1 }, guardadoEn: '2026-10-18T00:00:00Z' } }) }
    const escribir = vi.fn((t: string) => (almacen.contenido = t))
    const cache = crearCache({ leer: () => almacen.contenido, escribir })

    expect(cache.obtener('clave1')).toEqual({ a: 1 })
    expect(escribir).not.toHaveBeenCalled()
  })

  it('un miss devuelve undefined', () => {
    const cache = crearCache({ leer: () => null, escribir: () => {} })
    expect(cache.obtener('no-existe')).toBeUndefined()
  })

  it('JSON roto: arranca vacía, no tira, y avisa', () => {
    const avisar = vi.fn()
    let cache: ReturnType<typeof crearCache> | undefined
    expect(() => {
      cache = crearCache({ leer: () => '{ esto no es json', escribir: () => {}, avisar })
    }).not.toThrow()

    expect(cache!.obtener('cualquiera')).toBeUndefined()
    expect(avisar).toHaveBeenCalledTimes(1)
    expect(cache!.aviso).not.toBeNull()
  })

  it('JSON válido pero no es un objeto (un array, o un string): arranca vacía y avisa', () => {
    const avisar1 = vi.fn()
    const cache1 = crearCache({ leer: () => '[1, 2, 3]', escribir: () => {}, avisar: avisar1 })
    expect(cache1.obtener('x')).toBeUndefined()
    expect(avisar1).toHaveBeenCalledTimes(1)

    const avisar2 = vi.fn()
    const cache2 = crearCache({ leer: () => '"un string"', escribir: () => {}, avisar: avisar2 })
    expect(cache2.obtener('x')).toBeUndefined()
    expect(avisar2).toHaveBeenCalledTimes(1)
  })

  it('leer() devuelve null (primera corrida, sin archivo): arranca vacía sin avisar', () => {
    const avisar = vi.fn()
    const cache = crearCache({ leer: () => null, escribir: () => {}, avisar })
    expect(cache.obtener('x')).toBeUndefined()
    expect(avisar).not.toHaveBeenCalled()
    expect(cache.aviso).toBeNull()
  })

  it('persiste después de cada guardar (una corrida cortada no pierde lo hecho)', () => {
    const almacen = { contenido: null as string | null }
    const escribir = vi.fn((t: string) => (almacen.contenido = t))
    const cache = crearCache({ leer: () => almacen.contenido, escribir })

    cache.guardar('a', { x: 1 })
    expect(escribir).toHaveBeenCalledTimes(1)
    expect(almacen.contenido).toContain('"a"')

    cache.guardar('b', { x: 2 })
    expect(escribir).toHaveBeenCalledTimes(2)
    expect(almacen.contenido).toContain('"a"')
    expect(almacen.contenido).toContain('"b"')
  })

  it('guarda con la fecha en que se guardó (inyectada con ahora)', () => {
    const almacen = { contenido: null as string | null }
    const cache = crearCache({
      leer: () => almacen.contenido,
      escribir: (t) => (almacen.contenido = t),
      ahora: () => '2026-10-18T12:00:00.000Z',
    })

    cache.guardar('a', { x: 1 })
    const guardado = JSON.parse(almacen.contenido!)
    expect(guardado.a.guardadoEn).toBe('2026-10-18T12:00:00.000Z')
    expect(guardado.a.valor).toEqual({ x: 1 })
  })
})
