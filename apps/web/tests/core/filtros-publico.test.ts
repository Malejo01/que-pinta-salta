/**
 * `filtros/publico.ts`: "Para chicos". La regla está acordada entre sesiones:
 * categoría `infantil` o un tag `infantil`, `apto-chicos`, `ninos`, `chicos`
 * o `familia`, sin importar mayúsculas ni tildes. El archivo es idéntico al
 * de la app (PR #117, nube Q1), así git los junta sin conflicto.
 */
import { describe, expect, it } from 'vitest'
import { esParaChicos } from '@qps/core/filtros/publico'

describe('esParaChicos', () => {
  it('la categoría infantil alcanza, sin tags', () => {
    expect(esParaChicos({ categorySlug: 'infantil' })).toBe(true)
    expect(esParaChicos({ categorySlug: 'infantil', tags: null })).toBe(true)
  })

  it.each(['infantil', 'apto-chicos', 'ninos', 'chicos', 'familia'])('el tag %s alcanza en cualquier categoría', (tag) => {
    expect(esParaChicos({ categorySlug: 'teatro', tags: [tag] })).toBe(true)
  })

  it('ignora mayúsculas y tildes (también en la categoría)', () => {
    expect(esParaChicos({ categorySlug: 'Infantil' })).toBe(true)
    expect(esParaChicos({ tags: ['Niños'] })).toBe(true)
    expect(esParaChicos({ tags: ['FAMILIA'] })).toBe(true)
    expect(esParaChicos({ tags: [' Apto-Chicos '] })).toBe(true)
  })

  it('no alcanza con otra categoría, otros tags o tags que solo contienen la palabra', () => {
    expect(esParaChicos({ categorySlug: 'boliches', tags: ['noche', '+18'] })).toBe(false)
    expect(esParaChicos({ categorySlug: 'teatro', tags: ['familiares', 'chicos-grandes', 'infantiles'] })).toBe(false)
  })

  it('sin datos: false, sin tirar', () => {
    expect(esParaChicos({})).toBe(false)
    expect(esParaChicos({ categorySlug: null, tags: null })).toBe(false)
    expect(esParaChicos({ tags: [] })).toBe(false)
  })
})
