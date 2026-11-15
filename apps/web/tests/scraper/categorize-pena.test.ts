import { describe, expect, it } from 'vitest'
import { inferCategorySlug } from '@/lib/scraper/categorize'

// Pendiente de #173 (docs/PENDIENTES.md, Q5): «Peña» sola no se reconocía,
// porque el texto se normaliza sin tildes antes de la regex.
describe('inferCategorySlug: «Peña» sola', () => {
  it.each([
    ['Peña de los Viernes', ''],
    ['PEÑA FAMILIAR', ''],
    ['Gran peña bailable', ''],
    ['Noche de peñas', ''],
    ['Sábado de música', 'Peña La Casona'],
  ])('«%s» (lugar «%s») es peña', (titulo, lugar) => {
    expect(inferCategorySlug(titulo, '', lugar)).toBe('penas')
  })

  it('«vale la pena» o «sin pena ni gloria» no la convierten en peña', () => {
    expect(inferCategorySlug('Obra que vale la pena', 'Una comedia.', 'Teatro de Prueba')).not.toBe('penas')
    expect(inferCategorySlug('Stand up: sin pena ni gloria', '', '')).toBe('humor')
  })

  it('en la descripción, «pena» sola no alcanza (puede ser «vale la pena» o «una pena»)', () => {
    expect(inferCategorySlug('Recital de rock', 'Una pena que termine la gira.', '')).toBe('recitales')
  })

  it('las palabras de siempre siguen funcionando', () => {
    expect(inferCategorySlug('Noche de chacarera y zamba')).toBe('penas')
    expect(inferCategorySlug('Show de folklore')).toBe('penas')
  })

  it('palabras que contienen «pena» no cuentan («penal», «Penalty Club»)', () => {
    expect(inferCategorySlug('Final por penales', '', 'Estadio de Prueba')).not.toBe('penas')
    expect(inferCategorySlug('Fiesta retro', '', 'Penalty Club')).toBe('boliches')
  })
})
