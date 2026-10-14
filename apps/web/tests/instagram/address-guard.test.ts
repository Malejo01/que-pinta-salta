// Pura, sin red ni base: looksLikeAddress solo hace regex sobre el string.
import { describe, expect, it } from 'vitest'
import { looksLikeAddress } from '@/lib/venues/address-guard'

describe('looksLikeAddress: parece una dirección, no un nombre de lugar', () => {
  it.each(['Balcarce 980', 'Av. Belgrano 1250', 'Calle Caseros 500', 'Av. San Martín 1000'])(
    '"%s" sí parece una dirección',
    (name) => {
      expect(looksLikeAddress(name)).toBe(true)
    },
  )

  it.each(['Club 20 de Febrero', 'Sala 1', 'Live Fresh', 'La Vieja Estación'])(
    '"%s" no parece una dirección',
    (name) => {
      expect(looksLikeAddress(name)).toBe(false)
    },
  )

  it('variantes de "Avenida" completa y sin punto también cuentan', () => {
    expect(looksLikeAddress('Avenida Belgrano 1250')).toBe(true)
    expect(looksLikeAddress('Av Belgrano 1250')).toBe(true)
  })

  it('número en el medio del nombre no cuenta como altura', () => {
    expect(looksLikeAddress('La 9 de Julio Bar')).toBe(false)
  })

  it('número final de un solo dígito no cuenta como altura', () => {
    expect(looksLikeAddress('Sala 2')).toBe(false)
  })

  it('número final de más de 5 dígitos no cuenta como altura de calle', () => {
    expect(looksLikeAddress('Boliche 123456')).toBe(false)
  })

  it('string vacío, solo espacios o nulo: no es dirección', () => {
    expect(looksLikeAddress('')).toBe(false)
    expect(looksLikeAddress('   ')).toBe(false)
    expect(looksLikeAddress(null)).toBe(false)
    expect(looksLikeAddress(undefined)).toBe(false)
  })

  it('"Ruta 51" cuenta como dirección (prefijo de calle + número pegado)', () => {
    expect(looksLikeAddress('Ruta 51')).toBe(true)
  })
})
