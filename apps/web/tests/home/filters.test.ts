/**
 * `lib/home/filters.ts`: normalización de texto de búsqueda, filtro de la
 * agenda (`filterEvents`), agrupado por categoría (`groupByCategory`) y fila
 * "Hoy en Salta" (`selectTodayRow`). Fixtures inventadas y evidentes; sin red
 * ni base.
 */
import { describe, expect, it } from 'vitest'
import { normalizeFilterText, filterEvents, groupByCategory, selectTodayRow } from '@/lib/home/filters'
import { formatDateInSalta } from '@/lib/home/transform'
import type { DisplayEvent } from '@/lib/home/types'
import type { Category } from '@/lib/types'
import { saltaWallClockToDate } from '@/lib/date-format'

const salta = (wallClock: string) => saltaWallClockToDate(wallClock)

function makeCategory(slug: string, name: string): Category {
  return { id: `cat-${slug}`, slug, name, color: null, icon: null, created_at: null }
}

let autoId = 0
function makeDisplayEvent(overrides: Partial<DisplayEvent> = {}): DisplayEvent {
  autoId += 1
  return {
    id: overrides.id ?? `evento-de-prueba-${autoId}`,
    slug: overrides.slug ?? `evento-de-prueba-${autoId}`,
    title: overrides.title ?? 'Evento de Prueba',
    venue: overrides.venue ?? 'Venue de Prueba',
    date: overrides.date ?? '2030-10-10',
    time: overrides.time ?? '21:00',
    category: overrides.category ?? 'boliches',
    categoryName: overrides.categoryName ?? 'Boliches',
    price: overrides.price ?? 'confirmar',
    image: overrides.image ?? '/placeholder.svg?height=600&width=400',
    description: overrides.description ?? '',
    address: overrides.address ?? '',
    startDateTime: overrides.startDateTime ?? salta('2030-10-10T21:00:00').toISOString(),
    isFeatured: overrides.isFeatured ?? false,
    ...overrides,
  }
}

describe('normalizeFilterText', () => {
  it('sin acentos, en minúscula y sin espacios en los bordes', () => {
    expect(normalizeFilterText('  PEÑA de Prueba  ')).toBe('pena de prueba')
  })
})

describe('filterEvents', () => {
  const now = salta('2030-10-10T12:00:00')
  const saltaTodayStr = '2030-10-10'

  const pena = makeDisplayEvent({
    id: 'pena-de-prueba',
    title: 'Peña de Prueba',
    venue: 'Venue de Prueba',
    address: 'Avenida de Prueba 100',
    category: 'penas',
    date: '2030-10-10',
    startDateTime: salta('2030-10-10T21:00:00').toISOString(),
    isFeatured: false,
  })
  const recital = makeDisplayEvent({
    id: 'recital-de-prueba',
    title: 'Recital de Prueba',
    venue: 'Otro Lugar de Prueba',
    address: 'Belgrano 200',
    category: 'recitales',
    date: '2030-10-14',
    startDateTime: salta('2030-10-14T20:00:00').toISOString(),
    isFeatured: true,
  })
  const feria = makeDisplayEvent({
    id: 'feria-de-prueba',
    title: 'Feria de Prueba',
    venue: 'Plaza de Prueba',
    address: 'San Martín 300',
    category: 'ferias',
    date: '2030-10-25',
    startDateTime: salta('2030-10-25T10:00:00').toISOString(),
    isFeatured: false,
  })
  const flyer = makeDisplayEvent({
    id: 'ig-flyer-de-prueba',
    title: 'Boliche Flyer de Prueba',
    venue: 'Boliche de Prueba',
    address: '',
    category: 'boliches',
    date: '2030-10-10',
    startDateTime: salta('2030-10-10T23:00:00').toISOString(),
    isFeatured: false,
    isInstagramFlyer: true,
  })
  const lejano = makeDisplayEvent({
    id: 'evento-lejano-de-prueba',
    title: 'Evento Lejano de Prueba',
    venue: 'Venue de Prueba',
    address: 'Avenida de Prueba 100',
    category: 'penas',
    date: '2030-12-01',
    startDateTime: salta('2030-12-01T21:00:00').toISOString(),
    isFeatured: false,
  })
  const all = [pena, recital, feria, flyer, lejano]

  const especialDeHoy = makeDisplayEvent({
    id: 'especial-de-hoy',
    title: 'Especial de Hoy de Prueba',
    venue: 'Venue Especial de Prueba',
    category: 'penas',
    date: saltaTodayStr,
    startDateTime: salta('2030-10-10T11:00:00').toISOString(), // ya empezó
    isFeatured: false,
  })
  // Deliberadamente distinto del subconjunto "hoy" de `all`, para probar que
  // filterEvents usa este parámetro y no uno derivado de `all`.
  const today = [especialDeHoy]

  it('"hoy" sin fecha exacta: usa el parámetro todayDisplayEvents, no un recorte de allDisplayEvents', () => {
    const result = filterEvents(all, today, saltaTodayStr, '', '', '', null, 'hoy', null, true)
    expect(result.map((e) => e.id)).toEqual(['especial-de-hoy'])
  })

  it('búsqueda: sin acentos ni mayúsculas, por título o lugar', () => {
    const result = filterEvents(all, today, saltaTodayStr, 'PENA', '', '', null, null, null, true)
    expect(result.map((e) => e.id)).toEqual(['pena-de-prueba'])
  })

  it('filtro de establecimiento: coincide con el lugar, normalizado', () => {
    const result = filterEvents(all, today, saltaTodayStr, '', 'venue de prueba', '', null, null, null, true)
    expect(result.map((e) => e.id).sort()).toEqual(['evento-lejano-de-prueba', 'pena-de-prueba'])
  })

  it('filtro de ubicación: coincide con la dirección, normalizada', () => {
    const result = filterEvents(all, today, saltaTodayStr, '', '', 'San Martin', null, null, null, true)
    expect(result.map((e) => e.id)).toEqual(['feria-de-prueba'])
  })

  it('fecha exacta', () => {
    const result = filterEvents(all, today, saltaTodayStr, '', '', '', '2030-10-14', null, null, true)
    expect(result.map((e) => e.id)).toEqual(['recital-de-prueba'])
  })

  it('rango "semana": incluye hoy y los próximos 7 días; además, los flyers de Instagram ordenan primero', () => {
    const result = filterEvents(all, today, saltaTodayStr, '', '', '', null, 'semana', null, true)
    expect(result.map((e) => e.id)).toEqual(['ig-flyer-de-prueba', 'pena-de-prueba', 'recital-de-prueba'])
  })

  it('rango "mes": incluye hasta un mes desde hoy', () => {
    const result = filterEvents(all, today, saltaTodayStr, '', '', '', null, 'mes', null, false)
    expect(result.map((e) => e.id)).toEqual(['pena-de-prueba', 'recital-de-prueba', 'feria-de-prueba'])
  })

  it('"tendencias": solo los destacados', () => {
    const result = filterEvents(all, today, saltaTodayStr, '', '', '', null, 'tendencias', null, true)
    expect(result.map((e) => e.id)).toEqual(['recital-de-prueba'])
  })

  it('categoría + rango de fechas combinados: "penas" dentro del mes deja afuera al lejano (fuera del mes)', () => {
    const result = filterEvents(all, today, saltaTodayStr, '', '', '', null, 'mes', 'penas', true)
    expect(result.map((e) => e.id)).toEqual(['pena-de-prueba'])
  })

  it('instagram=false: excluye los flyers', () => {
    const result = filterEvents(all, today, saltaTodayStr, '', '', '', null, 'semana', null, false)
    expect(result.some((e) => e.isInstagramFlyer)).toBe(false)
  })
})

describe('groupByCategory', () => {
  const now = salta('2030-10-10T12:00:00')
  const boliches = makeCategory('boliches', 'Boliches')
  const cine = makeCategory('cine', 'Cine')
  const penas = makeCategory('penas', 'Peñas')
  const ferias = makeCategory('ferias', 'Ferias')
  const sortedCategories = [penas, boliches, ferias, cine]

  const events = [
    ...Array.from({ length: 3 }, (_, i) => makeDisplayEvent({ id: `boliches-${i}`, category: 'boliches' })),
    ...Array.from({ length: 2 }, (_, i) => makeDisplayEvent({ id: `cine-${i}`, category: 'cine' })),
    makeDisplayEvent({ id: 'penas-0', category: 'penas' }),
    // ferias: 0 eventos
  ]

  it('sin el filtro "Hoy": ordena las filas por cantidad de eventos, de mayor a menor (Cine no se fuerza al final)', () => {
    const rows = groupByCategory(sortedCategories, events, null, null, now)
    expect(rows.map((r) => r.category)).toEqual(['boliches', 'cine', 'penas', 'ferias'])
  })

  it('con el filtro "Hoy" (sin fecha exacta): Cine siempre al final, sin importar su cantidad de eventos', () => {
    const rows = groupByCategory(sortedCategories, events, 'hoy', null, now)
    expect(rows[rows.length - 1].category).toBe('cine')
    expect(rows.map((r) => r.category)).toContain('boliches')
  })

  it('con fecha exacta (aunque date sea "hoy"): no se activa el reordenamiento especial de Cine', () => {
    const rows = groupByCategory(sortedCategories, events, 'hoy', '2030-10-10', now)
    expect(rows.map((r) => r.category)).toEqual(['boliches', 'cine', 'penas', 'ferias'])
  })
})

// Decisión 4 (R50, QPS-239): dentro de cada fila de categoría, los
// destacados van primero.
describe('groupByCategory: destacados primero en su fila (decisión 4, R50)', () => {
  const now = salta('2030-10-10T12:00:00')
  const boliches = makeCategory('boliches', 'Boliches')
  const sortedCategories = [boliches]

  it('sin el filtro "hoy": los destacados quedan primero (ordenados entre ellos por fecha ascendente); el resto conserva el orden que traía (flyers primero, después fecha)', () => {
    const flyer = makeDisplayEvent({
      id: 'flyer-boliches',
      category: 'boliches',
      isInstagramFlyer: true,
      startDateTime: salta('2030-10-20T21:00:00').toISOString(),
    })
    const normalTemprano = makeDisplayEvent({
      id: 'normal-temprano',
      category: 'boliches',
      startDateTime: salta('2030-10-11T21:00:00').toISOString(),
    })
    const destacadoTardio = makeDisplayEvent({
      id: 'destacado-tardio',
      category: 'boliches',
      isFeatured: true,
      startDateTime: salta('2030-10-18T21:00:00').toISOString(),
    })
    const destacadoTemprano = makeDisplayEvent({
      id: 'destacado-temprano',
      category: 'boliches',
      isFeatured: true,
      startDateTime: salta('2030-10-12T21:00:00').toISOString(),
    })
    // Orden de entrada deliberadamente "desordenado" entre los destacados
    // (tardío antes que temprano), como ya deja `filterEvents` (flyers
    // primero, después por fecha: no conoce `isFeatured` para el orden).
    const filteredEvents = [flyer, normalTemprano, destacadoTardio, destacadoTemprano]

    const rows = groupByCategory(sortedCategories, filteredEvents, null, null, now)
    expect(rows[0].events.map((e) => e.id)).toEqual([
      'destacado-temprano',
      'destacado-tardio',
      'flyer-boliches',
      'normal-temprano',
    ])
  })

  it('el orden de las filas (por cantidad de eventos) no cambia por tener destacados', () => {
    const cine = makeCategory('cine', 'Cine')
    const sortedCategoriesConCine = [boliches, cine]
    const filteredEvents = [
      makeDisplayEvent({ id: 'boliches-destacado', category: 'boliches', isFeatured: true }),
      ...Array.from({ length: 3 }, (_, i) => makeDisplayEvent({ id: `cine-${i}`, category: 'cine' })),
    ]

    const rows = groupByCategory(sortedCategoriesConCine, filteredEvents, null, null, now)
    // Cine tiene 3 eventos y boliches 1: cine va primero igual, el destacado
    // no cambia el orden de las filas (solo el orden dentro de la suya).
    expect(rows.map((r) => r.category)).toEqual(['cine', 'boliches'])
  })

  // Trampa (R50): con "hoy", `arrangeRowsForToday` reordena cada fila por
  // hora y pisa la garantía de "destacados primero". Se deja documentado
  // con el comportamiento real encontrado (no se tocó `arrangeRowsForToday`,
  // de `event-display.ts`, que no es archivo propio de esta tarea).
  it('con el filtro "hoy": el destacado NO queda garantizado primero (arrangeRowsForToday reordena por hora y pisa "destacados primero")', () => {
    const normalProximo = makeDisplayEvent({
      id: 'normal-14hs',
      category: 'boliches',
      date: '2030-10-10',
      startDateTime: salta('2030-10-10T14:00:00').toISOString(),
    })
    const destacadoMasTarde = makeDisplayEvent({
      id: 'destacado-20hs',
      category: 'boliches',
      isFeatured: true,
      date: '2030-10-10',
      startDateTime: salta('2030-10-10T20:00:00').toISOString(),
    })

    // Sin "hoy": destacadosPrimero pondría el destacado primero.
    const sinHoy = groupByCategory(sortedCategories, [normalProximo, destacadoMasTarde], null, null, now)
    expect(sinHoy[0].events.map((e) => e.id)).toEqual(['destacado-20hs', 'normal-14hs'])

    // Con "hoy": ambos todavía no empezaron (now=12:00), así que
    // arrangeRowsForToday los ordena por hora (14:00 antes que 20:00) y el
    // no destacado queda primero, pisando la garantía de "destacados primero".
    const conHoy = groupByCategory(sortedCategories, [normalProximo, destacadoMasTarde], 'hoy', null, now)
    expect(conHoy[0].events.map((e) => e.id)).toEqual(['normal-14hs', 'destacado-20hs'])
  })
})

describe('selectTodayRow', () => {
  const saltaTodayStr = '2030-10-10'

  it('incluye lo que ya empezó hoy (caso museos) y lo pone después de lo que todavía no empezó', () => {
    const yaEmpezo = makeDisplayEvent({
      id: 'museo-de-prueba',
      date: saltaTodayStr,
      time: '10:00',
      startDateTime: salta('2030-10-10T10:00:00').toISOString(),
    })
    const porEmpezar = makeDisplayEvent({
      id: 'recital-de-prueba',
      date: saltaTodayStr,
      time: '21:00',
      startDateTime: salta('2030-10-10T21:00:00').toISOString(),
    })
    const now = salta('2030-10-10T15:00:00')

    const result = selectTodayRow([yaEmpezo, porEmpezar], saltaTodayStr, now)
    expect(result.map((e) => e.id)).toEqual(['recital-de-prueba', 'museo-de-prueba'])
  })

  it('excluye lo de ayer aunque esté en la lista de "hoy"', () => {
    const deAyer = makeDisplayEvent({ id: 'evento-de-ayer', date: '2030-10-09' })
    const deHoy = makeDisplayEvent({ id: 'evento-de-hoy', date: saltaTodayStr })
    const now = salta('2030-10-10T12:00:00')

    const result = selectTodayRow([deAyer, deHoy], saltaTodayStr, now)
    expect(result.map((e) => e.id)).toEqual(['evento-de-hoy'])
  })

  it('excluye flyers de Instagram y películas de cine (no son "funciones de hoy")', () => {
    const flyer = makeDisplayEvent({ id: 'flyer-de-prueba', date: saltaTodayStr, isInstagramFlyer: true })
    const pelicula = makeDisplayEvent({ id: 'pelicula-de-prueba', date: saltaTodayStr, isCinemaMovie: true })
    const real = makeDisplayEvent({ id: 'evento-real-de-prueba', date: saltaTodayStr })
    const now = salta('2030-10-10T12:00:00')

    const result = selectTodayRow([flyer, pelicula, real], saltaTodayStr, now)
    expect(result.map((e) => e.id)).toEqual(['evento-real-de-prueba'])
  })

  it('23:30 de Salta cae en su día y no en el siguiente en UTC', () => {
    // Si el día de este evento se hubiera calculado en UTC crudo en vez de
    // con formatDateInSalta, habría quedado "2030-10-11" (el error clásico).
    const startDateTime = salta('2030-10-10T23:30:00').toISOString()
    const diaCorrecto = formatDateInSalta(new Date(startDateTime))
    expect(diaCorrecto).toBe('2030-10-10')

    const funcionNocturna = makeDisplayEvent({ id: 'funcion-nocturna-de-prueba', date: diaCorrecto, time: '23:30', startDateTime })
    const now = salta('2030-10-10T20:00:00')

    const result = selectTodayRow([funcionNocturna], saltaTodayStr, now)
    expect(result.map((e) => e.id)).toEqual(['funcion-nocturna-de-prueba'])
  })
})
