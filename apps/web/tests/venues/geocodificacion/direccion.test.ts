import { describe, expect, it } from 'vitest'
import { calleYNumero, normalizarDireccion } from '@/lib/venues/geocodificacion/direccion'

describe('normalizarDireccion', () => {
  const casos: Array<[string, string]> = [
    ['Avenida Jhon F. Kennedy', 'Avenida John F. Kennedy'],
    ['San martin 484', 'San Martín 484'],
    ['Av. Uruguay 750, Salta', 'Avenida Uruguay 750'],
    ['Avda. Belgrano 100', 'Avenida Belgrano 100'],
    ['Av Belgrano 100', 'Avenida Belgrano 100'],
    ['Balcarce 875, Salta, Argentina', 'Balcarce 875'],
    ['Balcarce 875, Salta Capital', 'Balcarce 875'],
    ['Balcarce 875, Capital', 'Balcarce 875'],
    ['Balcarce 875,   Salta  ,  Argentina', 'Balcarce 875'],
    ['Guemes 300', 'Güemes 300'],
    ['  Zuviria    55 ', 'Zuviría 55'],
    ['Gral. Güemes 10', 'General Güemes 10'],
    ['Marcelino Freyre 1438-1498', 'Marcelino Freyre 1438-1498'],
    ['Calle Larga s/n', 'Calle Larga s/n'],
    ['Ruta 9', 'Ruta 9'],
  ]
  for (const [entrada, salida] of casos) {
    it(`"${entrada}" -> "${salida}"`, () => {
      expect(normalizarDireccion(entrada)).toBe(salida)
    })
  }

  it('una dirección que ya viene bien no se toca (no duplica ni pierde tildes)', () => {
    expect(normalizarDireccion('San Martín 484')).toBe('San Martín 484')
    expect(normalizarDireccion('Güemes 300')).toBe('Güemes 300')
  })

  it('una dirección rara que no se reconoce queda igual', () => {
    expect(normalizarDireccion('Pasaje Inventado, Barrio Ficticio')).toBe('Pasaje Inventado, Barrio Ficticio')
  })

  it('"Avenida" ya escrita no se vuelve a transformar', () => {
    expect(normalizarDireccion('Avenida Uruguay 750')).toBe('Avenida Uruguay 750')
  })

  it('solo colas: queda vacío', () => {
    expect(normalizarDireccion('Salta')).toBe('')
    expect(normalizarDireccion('Salta, Argentina')).toBe('')
    expect(normalizarDireccion('   ')).toBe('')
  })

  it('"Salta" en el medio no se saca (solo las colas)', () => {
    expect(normalizarDireccion('Salta Club, Mitre 20')).toBe('Salta Club, Mitre 20')
  })
})

describe('calleYNumero', () => {
  it('calle + número', () => {
    expect(calleYNumero('Necochea 719')).toEqual({ calle: 'Necochea', numero: '719' })
    expect(calleYNumero('Avenida Uruguay 750')).toEqual({ calle: 'Avenida Uruguay', numero: '750' })
  })

  it('rango: el primer número', () => {
    expect(calleYNumero('Marcelino Freyre 1438-1498')).toEqual({ calle: 'Marcelino Freyre', numero: '1438' })
  })

  it('con "N°", "Nro." o "#"', () => {
    expect(calleYNumero('San Martín N° 484')).toEqual({ calle: 'San Martín', numero: '484' })
    expect(calleYNumero('San Martín Nro. 484')).toEqual({ calle: 'San Martín', numero: '484' })
    expect(calleYNumero('San Martín #484')).toEqual({ calle: 'San Martín', numero: '484' })
  })

  it('usa solo el primer tramo antes de una coma', () => {
    expect(calleYNumero('Necochea 719, Barrio Ficticio')).toEqual({ calle: 'Necochea', numero: '719' })
  })

  it('null para "s/n", "Ruta 9", rutas con número, solo calle, solo número o vacío', () => {
    for (const d of [
      'Calle Larga s/n',
      'Calle Larga S/N',
      'Ruta 9',
      'Ruta Nacional 51',
      'Ruta Provincial 28',
      'RN 51',
      'Avenida John F. Kennedy',
      '719',
      '',
      'Km 1600',
    ]) {
      expect(calleYNumero(d), d).toBeNull()
    }
  })

  it('números de más de 5 dígitos no son de puerta', () => {
    expect(calleYNumero('Calle Inventada 123456')).toBeNull()
  })
})
