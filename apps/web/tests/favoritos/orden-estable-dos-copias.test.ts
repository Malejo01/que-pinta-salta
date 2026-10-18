/**
 * La deuda que dejó 47-a (R47, tarea 47-q, QPS-197):
 * `packages/core/src/favoritos/mis-eventos.ts` COPIÓ el comparador privado
 * `compararEstable` de `packages/core/src/favoritos/armar.ts`, porque 47-a
 * no podía tocar `armar.ts`. Nada verifica hoy que las dos copias den el
 * MISMO orden; si divergen, la sección ✓ Voy y la de ♥ Guardados se
 * ordenan distinto sin que nada avise.
 *
 * Ninguno de los dos comparadores está exportado (son funciones privadas de
 * cada módulo), así que este test no puede importarlos directo: compara el
 * ORDEN RESULTANTE, que es lo que importa y lo que no se puede evadir
 * reescribiendo un comparador para que "parezca" distinto pero siga dando
 * el mismo resultado.
 *
 * El truco: `armarFavoritos` ya ordena sus grupos con SU copia del
 * comparador (comparador A). Si se toman esos mismos items (ya ordenados
 * por A), se los mezcla (shuffle) y se los vuelve a pasar por
 * `separarMisEventos` —que los reordena con SU copia (comparador B)—, el
 * resultado tiene que volver a quedar en el mismo orden que dio A. Si A y B
 * difirieran en algún criterio de desempate, un fixture con varios empates
 * (misma fecha, mismo horario, o fechas invertidas) hace que el resultado
 * de B diverja del de A — y este test se pone en rojo.
 */
import { describe, expect, it } from 'vitest'
import { armarFavoritos, type EventoFavorito } from '@qps/core/favoritos/armar'
import { separarMisEventos } from '@qps/core/favoritos/mis-eventos'
import type { ResultadoFavoritosArmados } from '@qps/core/favoritos/armar'

function filaEvento(id: string, startDate: string): EventoFavorito {
  return {
    id,
    slug: `evento-${id}`,
    title: `Evento de prueba ${id}`,
    description: null,
    short_description: null,
    start_date: startDate,
    end_date: null,
    price_min: 0,
    is_free: true,
    image_url: null,
    ticket_url: null,
    age_restriction: 0,
    is_featured: false,
    status: 'PUBLISHED',
    category: { slug: 'teatro', name: 'Teatro' },
    venue: { name: 'Venue de Prueba', address: 'Calle de Prueba 123' },
  } as unknown as EventoFavorito
}

/** Mezcla determinística (sin azar: siempre el mismo orden) para no depender de un seed. */
function mezclarDeterministico<T>(items: T[]): T[] {
  const resultado = [...items]
  // Invierte y mueve el último al principio: suficiente para que el orden
  // de entrada no coincida con el de salida esperado, sin usar Math.random.
  resultado.reverse()
  if (resultado.length > 1) resultado.unshift(resultado.pop()!)
  return resultado
}

describe('comparador de armarFavoritos (A) vs comparador de separarMisEventos (B): mismo orden sobre la misma entrada', () => {
  it('con varios empates (mismo día, mismo horario — desempate por id) y días distintos', () => {
    // e1 y e2: mismo día, mismo horario exacto -> desempatan por id ("e1" < "e2").
    // e3: un día antes.
    // e4: el mismo día que e1/e2 pero más tarde.
    const E1 = filaEvento('e1', '2030-06-15T20:00:00-03:00')
    const E2 = filaEvento('e2', '2030-06-15T20:00:00-03:00')
    const E3 = filaEvento('e3', '2030-06-14T10:00:00-03:00')
    const E4 = filaEvento('e4', '2030-06-15T23:00:00-03:00')

    const ahora = new Date('2030-01-01T00:00:00-03:00')
    const armado = armarFavoritos({ eventos: [E1, E2, E3, E4], flyers: [], peliculas: [] }, ahora)

    // Orden A: el que dio armarFavoritos, aplanando sus grupos por día (ya
    // en el orden de los días, y cada grupo ya ordenado por su comparador).
    const ordenA = armado.porDia.flatMap((grupo) => grupo.items).map((e) => e.id)
    expect(ordenA).toEqual(['e3', 'e1', 'e2', 'e4'])

    // Se toman esos mismos items ya ordenados por A, se mezclan y se le dan
    // a separarMisEventos en un solo grupo (el "día" del grupo es
    // irrelevante para el orden de "voy": separarMisEventos solo junta
    // items y los reordena con su propio comparador).
    const itemsOrdenadosPorA = armado.porDia.flatMap((grupo) => grupo.items)
    const mezclados = mezclarDeterministico(itemsOrdenadosPorA)
    // Sanidad: el mezclado de verdad cambió el orden (si no, esta prueba no
    // demuestra nada: B podría estar "de acuerdo con A" solo porque nunca
    // tuvo que reordenar nada).
    expect(mezclados.map((e) => e.id)).not.toEqual(ordenA)

    const armadoFalso: ResultadoFavoritosArmados = { flexibles: [], porDia: [{ dia: 'cualquiera', items: mezclados }] }
    const idsTodos = itemsOrdenadosPorA.map((e) => e.id)
    const { voy: ordenB } = separarMisEventos(armadoFalso, idsTodos)

    expect(ordenB.map((e) => e.id)).toEqual(ordenA)
  })

  it('con más empates todavía (3 eventos en el mismo instante exacto): el desempate final por id coincide en los dos lados', () => {
    const E1 = filaEvento('zeta', '2031-03-10T18:00:00-03:00')
    const E2 = filaEvento('alfa', '2031-03-10T18:00:00-03:00')
    const E3 = filaEvento('medio', '2031-03-10T18:00:00-03:00')

    const ahora = new Date('2030-01-01T00:00:00-03:00')
    const armado = armarFavoritos({ eventos: [E1, E2, E3], flyers: [], peliculas: [] }, ahora)

    const ordenA = armado.porDia.flatMap((grupo) => grupo.items).map((e) => e.id)
    expect(ordenA).toEqual(['alfa', 'medio', 'zeta']) // orden alfabético por id: el único criterio que queda tras los empates

    const itemsOrdenadosPorA = armado.porDia.flatMap((grupo) => grupo.items)
    const mezclados = mezclarDeterministico(itemsOrdenadosPorA)
    expect(mezclados.map((e) => e.id)).not.toEqual(ordenA)

    const armadoFalso: ResultadoFavoritosArmados = { flexibles: [], porDia: [{ dia: 'cualquiera', items: mezclados }] }
    const { voy: ordenB } = separarMisEventos(armadoFalso, itemsOrdenadosPorA.map((e) => e.id))

    expect(ordenB.map((e) => e.id)).toEqual(ordenA)
  })
})
