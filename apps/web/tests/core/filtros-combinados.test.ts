import { describe, expect, it } from 'vitest'
import { atajoDesdeParametro, categoriasDisponibles, filtrarCombinado, type ItemFiltrable } from '@qps/core/home/filtros-combinados'
import type { DisplayEvent } from '@qps/core/home/types'

function evento(id: string, category: string, extra: Partial<DisplayEvent> = {}): DisplayEvent {
  return {
    id,
    slug: id,
    title: `Evento ${id}`,
    venue: 'Lugar',
    date: '',
    time: '',
    category,
    categoryName: category,
    price: 'confirmar',
    image: '',
    description: '',
    address: '',
    startDateTime: '',
    isFeatured: false,
    ...extra,
  } as DisplayEvent
}

const AHORA = new Date('2026-10-23T15:00:00Z')

const items: ItemFiltrable[] = [
  { evento: evento('a', 'musica', { price: 'gratis' }), paraAtajo: { start_date: '2026-10-23T23:00:00Z', category: 'musica' } },
  { evento: evento('b', 'teatro'), paraAtajo: { start_date: '2026-10-23T23:00:00Z', category: 'teatro' } },
  { evento: evento('c', 'musica'), paraAtajo: { start_date: '2026-12-25T23:00:00Z', category: 'musica' } },
  { evento: evento('d', 'cine'), paraAtajo: null },
]

const ids = (lista: DisplayEvent[]) => lista.map((e) => e.id)

describe('filtrarCombinado', () => {
  it('sin filtros devuelve todo en el mismo orden', () => {
    expect(ids(filtrarCombinado(items, { atajo: null, categoria: null }, AHORA))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('atajo: las películas (paraAtajo null) pasan siempre', () => {
    expect(ids(filtrarCombinado(items, { atajo: 'hoy', categoria: null }, AHORA))).toEqual(['a', 'b', 'd'])
  })

  it('atajo + categoría + gratis se combinan', () => {
    expect(ids(filtrarCombinado(items, { atajo: 'hoy', categoria: 'musica' }, AHORA))).toEqual(['a'])
    expect(ids(filtrarCombinado(items, { atajo: null, categoria: 'musica', soloGratis: true }, AHORA))).toEqual(['a'])
    expect(ids(filtrarCombinado(items, { atajo: null, categoria: 'cine' }, AHORA))).toEqual(['d'])
  })
})

describe('categoriasDisponibles', () => {
  const categorias = [
    { slug: 'teatro', name: 'Teatro' },
    { slug: 'musica', name: 'Música' },
    { slug: 'cine', name: 'Cine' },
    { slug: 'ferias', name: 'Ferias' },
  ]

  it('ordena por cantidad, desempata por nombre y omite las vacías y los slugs desconocidos', () => {
    const eventos = [evento('1', 'musica'), evento('2', 'musica'), evento('3', 'teatro'), evento('4', 'cine'), evento('5', 'rara')]
    expect(categoriasDisponibles(eventos, categorias, null)).toEqual([
      { slug: 'musica', name: 'Música', cantidad: 2 },
      { slug: 'cine', name: 'Cine', cantidad: 1 },
      { slug: 'teatro', name: 'Teatro', cantidad: 1 },
    ])
  })

  it('la seleccionada sin eventos aparece al final con cantidad 0', () => {
    const resultado = categoriasDisponibles([evento('1', 'musica')], categorias, 'ferias')
    expect(resultado).toEqual([
      { slug: 'musica', name: 'Música', cantidad: 1 },
      { slug: 'ferias', name: 'Ferias', cantidad: 0 },
    ])
  })
})

describe('atajoDesdeParametro', () => {
  it('acepta los 4 atajos y rechaza el resto', () => {
    for (const a of ['hoy', 'esta-noche', 'finde', 'semana']) expect(atajoDesdeParametro(a)).toBe(a)
    expect(atajoDesdeParametro('mes')).toBeNull()
    expect(atajoDesdeParametro(undefined)).toBeNull()
    expect(atajoDesdeParametro(['hoy'])).toBeNull()
  })
})

describe('filtrarCombinado: paraChicos (Q3, C1)', () => {
  const conPublico: ItemFiltrable[] = [
    { evento: evento('infantil', 'infantil'), paraAtajo: null },
    { evento: evento('teatro-familia', 'teatro', { tags: ['Familia'], price: 'gratis' }), paraAtajo: null },
    { evento: evento('boliche', 'boliches', { tags: ['noche'] }), paraAtajo: null },
    { evento: evento('sin-tags', 'teatro'), paraAtajo: null },
  ]

  it('deja solo lo que es para chicos (esParaChicos), en el mismo orden', () => {
    expect(ids(filtrarCombinado(conPublico, { atajo: null, categoria: null, paraChicos: true }, AHORA))).toEqual(['infantil', 'teatro-familia'])
  })

  it('se combina con categoría y con gratis', () => {
    expect(ids(filtrarCombinado(conPublico, { atajo: null, categoria: 'teatro', paraChicos: true }, AHORA))).toEqual(['teatro-familia'])
    expect(ids(filtrarCombinado(conPublico, { atajo: null, categoria: null, paraChicos: true, soloGratis: true }, AHORA))).toEqual(['teatro-familia'])
  })

  it('apagado (o ausente) no filtra', () => {
    expect(ids(filtrarCombinado(conPublico, { atajo: null, categoria: null, paraChicos: false }, AHORA))).toHaveLength(4)
  })
})
