/**
 * `packages/core/src/favoritos/mis-eventos.ts` (R47, tarea 47-a, QPS-197):
 * separar "Mis eventos" en ✓ Voy y ♥ Guardados sobre el resultado armado de
 * `armarFavoritos`. Sin React, sin Supabase, sin red. Fixtures inventadas.
 */
import { describe, expect, it } from 'vitest'
import { idsDeEventosVoy, separarMisEventos } from '@qps/core/favoritos/mis-eventos'
import type { ResultadoFavoritosArmados } from '@qps/core/favoritos/armar'
import type { DisplayEvent } from '@qps/core/home/types'

function evento(overrides: Partial<DisplayEvent> & { id: string }): DisplayEvent {
  return {
    slug: overrides.id,
    title: `Evento ${overrides.id}`,
    venue: 'Un lugar',
    date: '2026-10-20',
    time: '21:00',
    category: 'musica',
    categoryName: 'Música',
    price: 'confirmar',
    image: '/placeholder.svg',
    description: '',
    address: '',
    startDateTime: '2026-10-20T21:00:00-03:00',
    isFeatured: false,
    ...overrides,
  }
}

function armado(porDia: ResultadoFavoritosArmados['porDia'], flexibles: DisplayEvent[] = []): ResultadoFavoritosArmados {
  return { flexibles, porDia }
}

describe('separarMisEventos', () => {
  it('un evento con Voy aparece en voy y no en guardados', () => {
    const a = armado([{ dia: '2026-10-20', items: [evento({ id: 'e1' }), evento({ id: 'e2' })] }])
    const { voy, guardados } = separarMisEventos(a, ['e1'])

    expect(voy.map((e) => e.id)).toEqual(['e1'])
    expect(guardados.porDia[0].items.map((e) => e.id)).toEqual(['e2'])
  })

  it('orden de voy: por fecha, después startDateTime, después id', () => {
    const a = armado([
      {
        dia: '2026-10-20',
        items: [
          evento({ id: 'z', date: '2026-10-20', startDateTime: '2026-10-20T10:00:00-03:00' }),
          evento({ id: 'a', date: '2026-10-20', startDateTime: '2026-10-20T10:00:00-03:00' }),
        ],
      },
      { dia: '2026-10-19', items: [evento({ id: 'temprano', date: '2026-10-19', startDateTime: '2026-10-19T09:00:00-03:00' })] },
    ])
    const { voy } = separarMisEventos(a, ['z', 'a', 'temprano'])

    // 2026-10-19 antes que 2026-10-20; dentro del mismo día, mismo
    // startDateTime, desempata por id: "a" antes que "z".
    expect(voy.map((e) => e.id)).toEqual(['temprano', 'a', 'z'])
  })

  it('un extrasVoy cuyo id ya estaba en armado no se duplica', () => {
    const e1 = evento({ id: 'e1' })
    const a = armado([{ dia: '2026-10-20', items: [e1] }])
    const { voy } = separarMisEventos(a, ['e1'], [evento({ id: 'e1', title: 'Otra copia' })])

    expect(voy).toHaveLength(1)
    expect(voy[0].id).toBe('e1')
  })

  it('un flyer (isInstagramFlyer) y una película (isCinemaMovie) con id en idsVoy no van a Voy y siguen en guardados', () => {
    const flyer = evento({ id: 'ig-1', isInstagramFlyer: true })
    const pelicula = evento({ id: 'movie-1', isCinemaMovie: true })
    const a = armado([], [flyer, pelicula])
    const { voy, guardados } = separarMisEventos(a, ['ig-1', 'movie-1'])

    expect(voy).toEqual([])
    expect(guardados.flexibles.map((e) => e.id).sort()).toEqual(['ig-1', 'movie-1'])
  })

  it('un flyer/película en extrasVoy tampoco van a Voy', () => {
    const flyer = evento({ id: 'ig-2', isInstagramFlyer: true })
    const pelicula = evento({ id: 'movie-2', isCinemaMovie: true })
    const a = armado([])
    const { voy } = separarMisEventos(a, [], [flyer, pelicula])

    expect(voy).toEqual([])
  })

  it('sin ningún Voy, guardados es equivalente a armado', () => {
    const a = armado([{ dia: '2026-10-20', items: [evento({ id: 'e1' }), evento({ id: 'e2' })] }], [
      evento({ id: 'ig-1', isInstagramFlyer: true }),
    ])
    const { voy, guardados } = separarMisEventos(a, [])

    expect(voy).toEqual([])
    expect(guardados).toEqual(a)
  })

  it('un grupo de porDia que queda vacío se saca; uno que queda con un item se conserva', () => {
    const a = armado([
      { dia: '2026-10-19', items: [evento({ id: 'solo-voy', date: '2026-10-19' })] },
      {
        dia: '2026-10-20',
        items: [evento({ id: 'e1', date: '2026-10-20' }), evento({ id: 'e2', date: '2026-10-20' })],
      },
    ])
    const { guardados } = separarMisEventos(a, ['solo-voy', 'e1'])

    expect(guardados.porDia).toHaveLength(1)
    expect(guardados.porDia[0].dia).toBe('2026-10-20')
    expect(guardados.porDia[0].items.map((e) => e.id)).toEqual(['e2'])
  })

  it('armado no queda mutado después de llamar a la función', () => {
    const items = [evento({ id: 'e1' }), evento({ id: 'e2' })]
    const a = armado([{ dia: '2026-10-20', items }])
    const copiaAntes = JSON.parse(JSON.stringify(a))

    separarMisEventos(a, ['e1'])

    expect(a).toEqual(copiaAntes)
  })
})

describe('idsDeEventosVoy', () => {
  it('descarta kind distinto de "voy", nulos y repetidos, conservando el orden de aparición', () => {
    const filas = [
      { event_id: 'e1', kind: 'voy' },
      { event_id: 'e2', kind: 'me_interesa' },
      { event_id: null, kind: 'voy' },
      { event_id: '', kind: 'voy' },
      { event_id: 'e3', kind: 'voy' },
      { event_id: 'e1', kind: 'voy' },
    ]

    expect(idsDeEventosVoy(filas)).toEqual(['e1', 'e3'])
  })

  it('sin filas: arreglo vacío', () => {
    expect(idsDeEventosVoy([])).toEqual([])
  })
})
