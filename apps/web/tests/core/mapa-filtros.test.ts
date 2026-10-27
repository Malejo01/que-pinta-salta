/**
 * `mapa/filtros.ts` (Q3, C1): Gratis, Para chicos y categoría en `/mapa`,
 * combinados con la fecha. Fixtures inventadas, `ahora` fijo en hora de
 * Salta, sin red ni base. 2026-10-08 es jueves.
 */
import { describe, expect, it } from 'vitest'
import { saltaWallClockToDate, saltaWallClockToUtcISO } from '@qps/core/date-format'
import type { EventWithRelations } from '@qps/core/home/types'
import {
  armarMapaFiltrado,
  categoriasDeLosEventos,
  consultaDelMapa,
  hayFiltrosExtra,
  parsearFiltrosExtraMapa,
  SIN_FILTROS_EXTRA,
} from '@qps/core/mapa/filtros'
import { armarPinesDelMapa, parsearFiltroMapa } from '@qps/core/mapa/pines'

const AHORA = saltaWallClockToDate('2026-10-08T15:00:00')
const HOY = { tipo: 'hoy' } as const

const CATEGORIAS: Record<string, string> = { musica: 'Música', teatro: 'Teatro', infantil: 'Infantil', boliches: 'Boliches' }

let n = 0
function evento(extra: {
  categoria?: string | null
  gratis?: boolean
  tags?: string[]
  inicio?: string
  venueId?: string
  conUbicacion?: boolean
} = {}): EventWithRelations {
  n += 1
  const slug = extra.categoria === undefined ? 'musica' : extra.categoria
  const venueId = extra.venueId ?? `venue-${n}`
  return {
    id: `evento-${n}`,
    slug: `evento-${n}`,
    title: `Evento ${n}`,
    description: null,
    short_description: null,
    image_url: null,
    start_date: saltaWallClockToUtcISO(extra.inicio ?? '2026-10-08T21:00:00'),
    end_date: null,
    is_free: extra.gratis ?? false,
    price_min: extra.gratis ? 0 : 5000,
    age_restriction: 0,
    tags: extra.tags ?? [],
    status: 'PUBLISHED',
    featured_until: null,
    ticket_url: null,
    category: slug === null ? null : { slug, name: CATEGORIAS[slug] ?? slug },
    venue: {
      id: venueId,
      name: `Lugar ${venueId}`,
      address: 'Calle de Prueba 1',
      latitude: extra.conUbicacion === false ? null : -24.78,
      longitude: extra.conUbicacion === false ? null : -65.41,
    },
  } as unknown as EventWithRelations
}

const idsDe = (pines: { eventos: { id: string }[] }[]) => pines.flatMap((pin) => pin.eventos.map((e) => e.id)).sort()

describe('parsearFiltrosExtraMapa', () => {
  const validas = new Set(['musica', 'teatro'])

  it('sin parámetros: sin filtros', () => {
    expect(parsearFiltrosExtraMapa({}, validas)).toEqual(SIN_FILTROS_EXTRA)
  })

  it('gratis=1, chicos=1 y una categoría conocida', () => {
    expect(parsearFiltrosExtraMapa({ gratis: '1', chicos: '1', categoria: 'teatro' }, validas)).toEqual({
      gratis: true,
      chicos: true,
      categoria: 'teatro',
    })
  })

  it('cualquier otro valor se ignora, sin tirar', () => {
    expect(parsearFiltrosExtraMapa({ gratis: 'true', chicos: '0', categoria: 'inventada' }, validas)).toEqual(SIN_FILTROS_EXTRA)
    expect(parsearFiltrosExtraMapa({ gratis: null, chicos: null, categoria: '' }, validas)).toEqual(SIN_FILTROS_EXTRA)
  })
})

describe('consultaDelMapa', () => {
  it('ida y vuelta con parsearFiltroMapa y parsearFiltrosExtraMapa', () => {
    const filtro = { tipo: 'fecha', dia: '2026-10-10' } as const
    const extra = { gratis: true, chicos: true, categoria: 'teatro' }
    const consulta = consultaDelMapa(filtro, extra)
    expect(consulta).toBe('cuando=fecha&dia=2026-10-10&gratis=1&chicos=1&categoria=teatro')

    const params = new URLSearchParams(consulta)
    expect(parsearFiltroMapa({ cuando: params.get('cuando'), dia: params.get('dia') }, AHORA)).toEqual(filtro)
    expect(
      parsearFiltrosExtraMapa(
        { gratis: params.get('gratis'), chicos: params.get('chicos'), categoria: params.get('categoria') },
        new Set(['teatro'])
      )
    ).toEqual(extra)
  })

  it('sin filtros "qué" queda la consulta de siempre', () => {
    expect(consultaDelMapa(HOY, SIN_FILTROS_EXTRA)).toBe('cuando=hoy')
    expect(consultaDelMapa({ tipo: 'finde' }, SIN_FILTROS_EXTRA)).toBe('cuando=finde')
  })

  it('codifica el slug', () => {
    expect(consultaDelMapa(HOY, { ...SIN_FILTROS_EXTRA, categoria: 'a&b c' })).toBe('cuando=hoy&categoria=a%26b+c')
  })
})

describe('hayFiltrosExtra', () => {
  it('cualquiera de los tres lo prende', () => {
    expect(hayFiltrosExtra(SIN_FILTROS_EXTRA)).toBe(false)
    expect(hayFiltrosExtra({ ...SIN_FILTROS_EXTRA, gratis: true })).toBe(true)
    expect(hayFiltrosExtra({ ...SIN_FILTROS_EXTRA, chicos: true })).toBe(true)
    expect(hayFiltrosExtra({ ...SIN_FILTROS_EXTRA, categoria: 'musica' })).toBe(true)
  })
})

describe('categoriasDeLosEventos', () => {
  it('una por slug, por nombre, sin los eventos sin categoría', () => {
    const eventos = [evento({ categoria: 'teatro' }), evento({ categoria: 'musica' }), evento({ categoria: 'teatro' }), evento({ categoria: null })]
    expect(categoriasDeLosEventos(eventos)).toEqual([
      { slug: 'musica', name: 'Música' },
      { slug: 'teatro', name: 'Teatro' },
    ])
  })
})

describe('armarMapaFiltrado', () => {
  const gratisMusica = evento({ categoria: 'musica', gratis: true })
  const pagaMusica = evento({ categoria: 'musica' })
  const infantil = evento({ categoria: 'infantil' })
  const teatroFamilia = evento({ categoria: 'teatro', tags: ['Familia'], gratis: true })
  const boliche = evento({ categoria: 'boliches', tags: ['+18'] })
  const sinCategoria = evento({ categoria: null })
  const sinUbicacionGratis = evento({ categoria: 'musica', gratis: true, conUbicacion: false })
  const delSabado = evento({ categoria: 'musica', gratis: true, inicio: '2026-10-10T21:00:00' })
  const todos = [gratisMusica, pagaMusica, infantil, teatroFamilia, boliche, sinCategoria, sinUbicacionGratis, delSabado]

  it('sin filtros "qué" es exactamente armarPinesDelMapa (incluidos los eventos sin categoría)', () => {
    const { pines, sinUbicacion } = armarMapaFiltrado(todos, HOY, SIN_FILTROS_EXTRA, AHORA)
    expect({ pines, sinUbicacion }).toEqual(armarPinesDelMapa(todos, HOY, AHORA))
    expect(idsDe(pines)).toContain(sinCategoria.id)
  })

  it('Gratis: solo is_free, y el aviso sin ubicación cuenta solo lo filtrado', () => {
    const { pines, sinUbicacion } = armarMapaFiltrado(todos, HOY, { ...SIN_FILTROS_EXTRA, gratis: true }, AHORA)
    expect(idsDe(pines)).toEqual([gratisMusica.id, teatroFamilia.id].sort())
    expect(sinUbicacion).toBe(1)
  })

  it('Para chicos: categoría infantil o tag de familia', () => {
    const { pines } = armarMapaFiltrado(todos, HOY, { ...SIN_FILTROS_EXTRA, chicos: true }, AHORA)
    expect(idsDe(pines)).toEqual([infantil.id, teatroFamilia.id].sort())
  })

  it('categoría, y los tres juntos', () => {
    expect(idsDe(armarMapaFiltrado(todos, HOY, { ...SIN_FILTROS_EXTRA, categoria: 'musica' }, AHORA).pines)).toEqual(
      [gratisMusica.id, pagaMusica.id].sort()
    )
    expect(idsDe(armarMapaFiltrado(todos, HOY, { gratis: true, chicos: true, categoria: 'teatro' }, AHORA).pines)).toEqual([teatroFamilia.id])
    expect(armarMapaFiltrado(todos, HOY, { gratis: true, chicos: true, categoria: 'musica' }, AHORA).pines).toEqual([])
  })

  it('se combina con la fecha: el gratis del sábado no está hoy y sí con ?dia= del sábado', () => {
    expect(idsDe(armarMapaFiltrado(todos, HOY, { ...SIN_FILTROS_EXTRA, gratis: true }, AHORA).pines)).not.toContain(delSabado.id)
    const diaSabado = { tipo: 'fecha', dia: '2026-10-10' } as const
    expect(idsDe(armarMapaFiltrado(todos, diaSabado, { ...SIN_FILTROS_EXTRA, gratis: true }, AHORA).pines)).toEqual([delSabado.id])
  })

  it('las categorías cuentan fecha + gratis + chicos, sin la categoría elegida', () => {
    const { categorias } = armarMapaFiltrado(todos, HOY, { gratis: true, chicos: false, categoria: 'musica' }, AHORA)
    // Gratis de hoy: gratisMusica, teatroFamilia y el gratis sin ubicación (musica).
    expect(categorias).toEqual([
      { slug: 'musica', name: 'Música', cantidad: 2 },
      { slug: 'teatro', name: 'Teatro', cantidad: 1 },
    ])
  })

  it('la categoría elegida sin eventos en la fecha queda al final, con 0', () => {
    const { categorias, pines } = armarMapaFiltrado(todos, HOY, { gratis: true, chicos: false, categoria: 'boliches' }, AHORA)
    expect(pines).toEqual([])
    expect(categorias.at(-1)).toEqual({ slug: 'boliches', name: 'Boliches', cantidad: 0 })
  })
})
