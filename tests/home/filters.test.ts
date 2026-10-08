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
