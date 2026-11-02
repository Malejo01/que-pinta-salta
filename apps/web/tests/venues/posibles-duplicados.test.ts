import { describe, expect, it } from 'vitest'
import { posiblesDuplicados } from '@/lib/venues/posibles-duplicados'

const l = (id: string, name: string) => ({ id, name })
const nombres = (m: Map<string, { name: string }[]>, id: string) => (m.get(id) ?? []).map((x) => x.name)

describe('posiblesDuplicados', () => {
  it('Brickell y Brickell Club son candidatos en las dos tarjetas', () => {
    const m = posiblesDuplicados([l('1', 'Brickell'), l('2', 'Brickell Club')])
    expect(nombres(m, '1')).toEqual(['Brickell Club'])
    expect(nombres(m, '2')).toEqual(['Brickell'])
  })

  it('Museo y Museo de Bellas Artes no (sin tokens propios)', () => {
    const m = posiblesDuplicados([l('1', 'Museo'), l('2', 'Museo de Bellas Artes')])
    expect(m.size).toBe(0)
  })

  it('un lugar nunca es candidato de sí mismo', () => {
    expect(posiblesDuplicados([l('1', 'Brickell Club'), l('1', 'Brickell Club')]).size).toBe(0)
    expect(posiblesDuplicados([l('1', 'Brickell Club')]).size).toBe(0)
  })

  it('ignora tildes y mayúsculas', () => {
    const m = posiblesDuplicados([l('1', 'Café Güemes'), l('2', 'GÜEMES Bar')])
    expect(nombres(m, '1')).toEqual(['GÜEMES Bar'])
  })

  it('ignora el artículo inicial: La Roka y Roka Club', () => {
    const m = posiblesDuplicados([l('1', 'La Roka'), l('2', 'Roka Club')])
    expect(nombres(m, '1')).toEqual(['Roka Club'])
    expect(nombres(m, '2')).toEqual(['La Roka'])
  })

  it('exige un token de 4 letras o más en común', () => {
    const m = posiblesDuplicados([l('1', 'Zoo'), l('2', 'Zoo Salta Norte')])
    expect(m.size).toBe(0)
  })

  it('lugares sin relación no son candidatos', () => {
    expect(posiblesDuplicados([l('1', 'Brickell'), l('2', 'Roka Club')]).size).toBe(0)
  })
})
