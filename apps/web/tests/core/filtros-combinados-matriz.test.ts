/**
 * Matriz de `home/filtros-combinados.ts` (R66, 66-q): fecha x categoría x
 * gratis x texto sobre fixtures chicos con un `ahora` fijo (hora de Salta).
 * Los resultados esperados (ids) están escritos a mano. Complementa a
 * `filtros-combinados.test.ts` (6 tests básicos) sin duplicarlo.
 * Fixtures inventados, sin red ni base.
 *
 * Calendario de octubre de 2026: jueves 22, viernes 23, sábado 24, domingo 25.
 */
import { describe, expect, it } from 'vitest'
import { atajoDesdeParametro, categoriasDisponibles, filtrarCombinado, type ItemFiltrable } from '@qps/core/home/filtros-combinados'
import type { Atajo } from '@qps/core/home/atajos'
import type { DisplayEvent } from '@qps/core/home/types'
import { saltaWallClockToDate, saltaWallClockToUtcISO } from '@qps/core/date-format'

function evento(id: string, category: string, extra: Partial<DisplayEvent> = {}): DisplayEvent {
  return {
    id,
    slug: id,
    title: `Evento ${id}`,
    venue: 'Lugar de Prueba',
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

const utc = (wallClock: string) => saltaWallClockToUtcISO(wallClock)

/** Un item con fecha: la categoría de la fila de fecha es la del evento. */
function item(
  id: string,
  category: string,
  start: string,
  extra: Partial<DisplayEvent> = {},
  end?: string
): ItemFiltrable {
  return {
    evento: evento(id, category, extra),
    paraAtajo: { start_date: utc(start), end_date: end ? utc(end) : null, category },
  }
}

const ids = (lista: DisplayEvent[]) => lista.map((e) => e.id)

// --- Jueves 22/10/2026, 15:00 en Salta ---------------------------------------
const JUEVES = saltaWallClockToDate('2026-10-22T15:00:00')

const itemsJueves: ItemFiltrable[] = [
  item('A', 'musica', '2026-10-22T21:00:00', { title: 'Recital de Prueba', price: 'gratis' }),
  item('B', 'teatro', '2026-10-22T20:00:00', { title: 'Obra de Prueba' }),
  item('C', 'musica', '2026-10-23T22:00:00', { title: 'Recital Nocturno', price: 0 }),
  item('D', 'boliches', '2026-10-22T00:00:00', { title: 'Boliche sin Hora' }), // sin hora, hoy
  item('E', 'musica', '2026-10-22T10:00:00', { title: 'Recital Matinal', price: 'gratis' }), // terminó 14:00
  item('F', 'ferias', '2026-10-22T12:00:00', { title: 'Feria de Varios Dias' }, '2026-10-24T20:00:00'),
  item('G', 'musica', '2026-10-24T23:00:00', { title: 'Recital Sabado', price: 'gratis' }),
  { evento: evento('H', 'cine', { title: 'Película de Prueba' }), paraAtajo: null },
  item('I', 'musica', '2026-10-30T21:00:00', { title: 'Recital Lejano' }),
  item('J', 'boliches', '2026-10-22T18:00:00', { title: 'Boliche Temprano' }), // con hora, antes de las 19
]

describe('filtrarCombinado: matriz fecha x categoría x gratis (jueves 15:00)', () => {
  // Protege: cada combinación de filtros da exactamente los ids esperados.
  const casos: { atajo: Atajo | null; categoria: string | null; gratis?: boolean; esperado: string[] }[] = [
    // solo fecha
    { atajo: 'hoy', categoria: null, esperado: ['A', 'B', 'D', 'F', 'H', 'J'] },
    { atajo: 'esta-noche', categoria: null, esperado: ['A', 'B', 'D', 'H'] },
    { atajo: 'finde', categoria: null, esperado: ['C', 'G', 'H'] },
    { atajo: 'semana', categoria: null, esperado: ['A', 'B', 'C', 'D', 'F', 'G', 'H', 'J'] },
    { atajo: null, categoria: null, esperado: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] },
    // fecha + categoría
    { atajo: 'hoy', categoria: 'musica', esperado: ['A'] },
    { atajo: 'semana', categoria: 'musica', esperado: ['A', 'C', 'G'] },
    { atajo: 'finde', categoria: 'musica', esperado: ['C', 'G'] },
    { atajo: 'esta-noche', categoria: 'musica', esperado: ['A'] },
    { atajo: null, categoria: 'musica', esperado: ['A', 'C', 'E', 'G', 'I'] },
    { atajo: 'hoy', categoria: 'boliches', esperado: ['D', 'J'] },
    { atajo: 'esta-noche', categoria: 'boliches', esperado: ['D'] },
    { atajo: 'finde', categoria: 'ferias', esperado: [] },
    { atajo: 'semana', categoria: 'ferias', esperado: ['F'] },
    // fecha + gratis
    { atajo: 'hoy', categoria: null, gratis: true, esperado: ['A'] },
    { atajo: 'semana', categoria: null, gratis: true, esperado: ['A', 'G'] },
    { atajo: 'finde', categoria: null, gratis: true, esperado: ['G'] },
    { atajo: null, categoria: null, gratis: true, esperado: ['A', 'E', 'G'] },
    // las tres a la vez
    { atajo: 'semana', categoria: 'musica', gratis: true, esperado: ['A', 'G'] },
    { atajo: 'finde', categoria: 'musica', gratis: true, esperado: ['G'] },
    { atajo: 'hoy', categoria: 'teatro', gratis: true, esperado: [] },
    // película (paraAtajo null): pasa con cualquier atajo, pero la categoría y el gratis sí la filtran
    { atajo: 'finde', categoria: 'cine', esperado: ['H'] },
    { atajo: 'hoy', categoria: 'cine', esperado: ['H'] },
    { atajo: 'semana', categoria: 'cine', gratis: true, esperado: [] }, // H es 'confirmar'
    { atajo: 'semana', categoria: 'musica', gratis: true, esperado: ['A', 'G'] }, // H no entra por categoría
    { atajo: null, categoria: 'cine', esperado: ['H'] },
    // categoría que no existe
    { atajo: null, categoria: 'inexistente', esperado: [] },
  ]

  it.each(casos)('atajo=$atajo categoria=$categoria gratis=$gratis', ({ atajo, categoria, gratis, esperado }) => {
    const resultado = filtrarCombinado(itemsJueves, { atajo, categoria, soloGratis: gratis }, JUEVES)
    expect(ids(resultado)).toEqual(esperado)
  })
})

describe('filtrarCombinado: fecha y vigencia', () => {
  // Protege: vigencia, eventos de varios días y la regla de boliches sin hora.
  it('un evento terminado (E, hoy 10:00 sin fin) no entra con ningún atajo', () => {
    for (const atajo of ['hoy', 'esta-noche', 'finde', 'semana'] as const) {
      expect(ids(filtrarCombinado(itemsJueves, { atajo, categoria: null }, JUEVES))).not.toContain('E')
    }
  })

  it('un evento con end_date que empezó hoy y sigue (F) está en "hoy" aunque ya haya empezado', () => {
    expect(ids(filtrarCombinado(itemsJueves, { atajo: 'hoy', categoria: 'ferias' }, JUEVES))).toEqual(['F'])
  })

  it('un evento de varios días que empezó ANTES de hoy NO aparece en "hoy" (comportamiento de atajos.ts desde la R25)', () => {
    // Fija lo que hace `eventoEnAtajo` hoy: compara solo `start_date` contra
    // la ventana (`end_date` solo decide la vigencia), igual que el caso del
    // finde de `tests/core/atajos.test.ts`. Una feria en curso queda fuera de
    // "Hoy". Si Mauro decide que tiene que entrar (R66, ops/manana.md), se
    // cambia `atajos.ts` y este caso se invierte a `['X']`.
    const enCurso: ItemFiltrable[] = [
      item('X', 'ferias', '2026-10-20T10:00:00', { title: 'Feria en Curso' }, '2026-10-25T22:00:00'),
    ]
    expect(ids(filtrarCombinado(enCurso, { atajo: 'hoy', categoria: null }, JUEVES))).toEqual([])
  })

  it('boliches/peñas sin hora de hoy entran en "esta-noche"; con hora anterior a las 19 no', () => {
    const resultado = ids(filtrarCombinado(itemsJueves, { atajo: 'esta-noche', categoria: 'boliches' }, JUEVES))
    expect(resultado).toEqual(['D'])
  })

  it('una peña sin hora de hoy entra en "esta-noche", una feria sin hora de hoy no', () => {
    const items: ItemFiltrable[] = [
      item('P', 'penas', '2026-10-22T00:00:00'),
      item('Q', 'ferias', '2026-10-22T00:00:00'),
    ]
    expect(ids(filtrarCombinado(items, { atajo: 'esta-noche', categoria: null }, JUEVES))).toEqual(['P'])
    expect(ids(filtrarCombinado(items, { atajo: 'hoy', categoria: null }, JUEVES))).toEqual(['P', 'Q'])
  })

  it('un boliche sin hora de MAÑANA no entra en "esta-noche" por la regla extra', () => {
    const items: ItemFiltrable[] = [item('R', 'boliches', '2026-10-24T00:00:00')]
    expect(ids(filtrarCombinado(items, { atajo: 'esta-noche', categoria: null }, JUEVES))).toEqual([])
  })

  it('con una lista vacía devuelve vacío', () => {
    expect(filtrarCombinado([], { atajo: 'hoy', categoria: 'musica', soloGratis: true, texto: 'x' }, JUEVES)).toEqual([])
  })
})

// --- Sábado 24/10/2026, 16:00 en Salta ---------------------------------------
const SABADO = saltaWallClockToDate('2026-10-24T16:00:00')

const itemsSabado: ItemFiltrable[] = [
  item('S1', 'musica', '2026-10-24T15:00:00', { price: 'gratis' }), // empezó hace 1 h, sigue (fin 19:00)
  item('S2', 'teatro', '2026-10-24T21:00:00'),
  item('S3', 'boliches', '2026-10-25T01:00:00'),
  item('S4', 'musica', '2026-10-25T20:00:00'),
  item('S5', 'musica', '2026-10-23T22:00:00', { price: 'gratis' }), // ayer, terminó
  item('S6', 'ferias', '2026-10-26T00:00:00'), // lunes sin hora
  item('S7', 'boliches', '2026-10-24T00:00:00'), // sábado sin hora
  item('S8', 'ferias', '2026-10-24T00:00:00'), // sábado sin hora, no es de noche
]

describe('filtrarCombinado: matriz en sábado 16:00', () => {
  // Protege: el finde "desde ahora", el cambio de día de "esta-noche" y los sin hora.
  const casos: { atajo: Atajo | null; categoria: string | null; gratis?: boolean; esperado: string[] }[] = [
    { atajo: 'hoy', categoria: null, esperado: ['S1', 'S2', 'S7', 'S8'] },
    { atajo: 'esta-noche', categoria: null, esperado: ['S2', 'S3', 'S7'] },
    { atajo: 'finde', categoria: null, esperado: ['S2', 'S3', 'S4'] },
    { atajo: 'semana', categoria: null, esperado: ['S1', 'S2', 'S3', 'S4', 'S6', 'S7', 'S8'] },
    { atajo: null, categoria: null, esperado: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'] },
    { atajo: 'finde', categoria: 'musica', esperado: ['S4'] },
    { atajo: 'finde', categoria: null, gratis: true, esperado: [] },
    { atajo: 'hoy', categoria: 'musica', gratis: true, esperado: ['S1'] },
    { atajo: 'semana', categoria: 'ferias', esperado: ['S6', 'S8'] },
    { atajo: 'esta-noche', categoria: 'boliches', esperado: ['S3', 'S7'] },
    { atajo: null, categoria: 'musica', gratis: true, esperado: ['S1', 'S5'] },
  ]

  it.each(casos)('atajo=$atajo categoria=$categoria gratis=$gratis', ({ atajo, categoria, gratis, esperado }) => {
    const resultado = filtrarCombinado(itemsSabado, { atajo, categoria, soloGratis: gratis }, SABADO)
    expect(ids(resultado)).toEqual(esperado)
  })
})

describe('filtrarCombinado: texto y gratis', () => {
  // Protege: el texto se recorta, ignora tildes y se combina con el resto; gratis es estricto.
  it('el texto con espacios alrededor se recorta y combina con categoría y fecha', () => {
    const r = filtrarCombinado(itemsJueves, { atajo: 'semana', categoria: 'musica', texto: '  recital  ' }, JUEVES)
    expect(ids(r)).toEqual(['A', 'C', 'G'])
  })

  it('texto solo con espacios o vacío no filtra', () => {
    expect(ids(filtrarCombinado(itemsJueves, { atajo: 'finde', categoria: null, texto: '   ' }, JUEVES))).toEqual(['C', 'G', 'H'])
    expect(ids(filtrarCombinado(itemsJueves, { atajo: 'finde', categoria: null, texto: '' }, JUEVES))).toEqual(['C', 'G', 'H'])
  })

  it('texto sin coincidencias da vacío', () => {
    expect(filtrarCombinado(itemsJueves, { atajo: null, categoria: null, texto: 'zzzz' }, JUEVES)).toEqual([])
  })

  it('el texto ignora tildes y mayúsculas, y alcanza a las películas (paraAtajo null)', () => {
    expect(ids(filtrarCombinado(itemsJueves, { atajo: 'hoy', categoria: null, texto: 'PELICULA' }, JUEVES))).toEqual(['H'])
  })

  it('el texto también busca en el lugar', () => {
    const r = filtrarCombinado(itemsJueves, { atajo: 'finde', categoria: null, texto: 'lugar de prueba' }, JUEVES)
    expect(ids(r)).toEqual(['C', 'G', 'H'])
  })

  it('texto + gratis + categoría: solo lo que cumple las tres', () => {
    const r = filtrarCombinado(itemsJueves, { atajo: null, categoria: 'musica', soloGratis: true, texto: 'recital' }, JUEVES)
    expect(ids(r)).toEqual(['A', 'E', 'G'])
  })

  it('price "confirmar" y 0 no son gratis', () => {
    const items: ItemFiltrable[] = [
      { evento: evento('p1', 'musica', { price: 'confirmar' }), paraAtajo: null },
      { evento: evento('p2', 'musica', { price: 0 }), paraAtajo: null },
      { evento: evento('p3', 'musica', { price: 'gratis' }), paraAtajo: null },
      { evento: evento('p4', 'musica', { price: 1500 }), paraAtajo: null },
    ]
    expect(ids(filtrarCombinado(items, { atajo: null, categoria: null, soloGratis: true }, JUEVES))).toEqual(['p3'])
    expect(ids(filtrarCombinado(items, { atajo: null, categoria: null, soloGratis: false }, JUEVES))).toEqual(['p1', 'p2', 'p3', 'p4'])
  })

  it('conserva el orden de entrada (no ordena por fecha ni por id)', () => {
    const desordenados: ItemFiltrable[] = [
      item('z', 'musica', '2026-10-24T22:00:00'),
      item('m', 'musica', '2026-10-22T20:00:00'),
      item('a', 'musica', '2026-10-23T22:00:00'),
    ]
    expect(ids(filtrarCombinado(desordenados, { atajo: 'semana', categoria: 'musica' }, JUEVES))).toEqual(['z', 'm', 'a'])
  })

  it('no modifica la lista de entrada', () => {
    const copia = [...itemsJueves]
    filtrarCombinado(itemsJueves, { atajo: 'hoy', categoria: 'musica', soloGratis: true, texto: 'recital' }, JUEVES)
    expect(itemsJueves).toEqual(copia)
  })
})

describe('categoriasDisponibles: casos de borde', () => {
  // Protege: orden estable en español, la seleccionada no desaparece ni se duplica, lo desconocido se ignora.
  const categorias = [
    { slug: 'musica', name: 'Música' },
    { slug: 'museos', name: 'Museos' },
    { slug: 'albumes', name: 'Álbumes' },
    { slug: 'zumba', name: 'Zumba' },
    { slug: 'ferias', name: 'Ferias' },
  ]

  it('empate de cantidad: orden alfabético en español (Museos antes que Música: "e" < "i")', () => {
    const r = categoriasDisponibles([evento('1', 'musica'), evento('2', 'museos')], categorias, null)
    expect(r.map((c) => c.name)).toEqual(['Museos', 'Música'])
  })

  it('empate de cantidad: la tilde no manda ("Álbumes" antes que "Zumba")', () => {
    const r = categoriasDisponibles([evento('1', 'zumba'), evento('2', 'albumes')], categorias, null)
    expect(r.map((c) => c.name)).toEqual(['Álbumes', 'Zumba'])
  })

  it('más eventos va primero aunque el nombre sea posterior', () => {
    const eventos = [evento('1', 'zumba'), evento('2', 'zumba'), evento('3', 'albumes')]
    expect(categoriasDisponibles(eventos, categorias, null).map((c) => c.slug)).toEqual(['zumba', 'albumes'])
  })

  it('la seleccionada sin eventos va al final con 0, después de las demás', () => {
    const eventos = [evento('1', 'zumba'), evento('2', 'musica'), evento('3', 'musica')]
    expect(categoriasDisponibles(eventos, categorias, 'ferias')).toEqual([
      { slug: 'musica', name: 'Música', cantidad: 2 },
      { slug: 'zumba', name: 'Zumba', cantidad: 1 },
      { slug: 'ferias', name: 'Ferias', cantidad: 0 },
    ])
  })

  it('la seleccionada que no está en `categorias` no aparece', () => {
    const r = categoriasDisponibles([evento('1', 'musica')], categorias, 'fantasma')
    expect(r).toEqual([{ slug: 'musica', name: 'Música', cantidad: 1 }])
  })

  it('la seleccionada que ya tiene eventos no se duplica y mantiene su lugar', () => {
    const eventos = [evento('1', 'zumba'), evento('2', 'musica'), evento('3', 'musica')]
    const r = categoriasDisponibles(eventos, categorias, 'zumba')
    expect(r.map((c) => c.slug)).toEqual(['musica', 'zumba'])
    expect(r.filter((c) => c.slug === 'zumba')).toHaveLength(1)
    expect(r[1].cantidad).toBe(1)
  })

  it('slugs de eventos sin categoría conocida se ignoran', () => {
    const r = categoriasDisponibles([evento('1', 'rara'), evento('2', ''), evento('3', 'otra')], categorias, null)
    expect(r).toEqual([])
  })

  it('sin eventos ni selección da lista vacía; sin eventos y con selección, solo la seleccionada', () => {
    expect(categoriasDisponibles([], categorias, null)).toEqual([])
    expect(categoriasDisponibles([], categorias, 'ferias')).toEqual([{ slug: 'ferias', name: 'Ferias', cantidad: 0 }])
  })

  it('sin categorías conocidas da vacío', () => {
    expect(categoriasDisponibles([evento('1', 'musica')], [], 'musica')).toEqual([])
  })
})

describe('atajoDesdeParametro: valores de querystring', () => {
  // Protege: solo los 4 atajos exactos pasan; expo-router puede dar arrays, números o undefined.
  it.each(['hoy', 'esta-noche', 'finde', 'semana'])('acepta "%s"', (valor) => {
    expect(atajoDesdeParametro(valor)).toBe(valor)
  })

  it.each([
    ['Hoy (mayúscula)', 'Hoy'],
    ['espacio adelante', ' hoy'],
    ['espacio atrás', 'hoy '],
    ['vacío', ''],
    ['undefined', undefined],
    ['null', null],
    ['array', ['hoy']],
    ['número', 1],
    ['cero', 0],
    ['booleano', true],
    ['objeto', { hoy: true }],
    ['mes', 'mes'],
    ['esta_noche', 'esta_noche'],
    ['ESTA-NOCHE', 'ESTA-NOCHE'],
  ])('rechaza %s', (_nombre, valor) => {
    expect(atajoDesdeParametro(valor)).toBeNull()
  })
})
