import { describe, expect, it } from 'vitest'
import {
  ageChip,
  arrangeRowsForToday,
  capitalizeFirst,
  cleanDescription,
  formatEventTimeDisplay,
  hasExplicitTime,
  isRelevantToday,
  orderUpcomingFirst,
  saltaStartOfDayISO,
  selectTodayEvents,
  sortEventsByTime,
} from '@/lib/event-display'

// Horas de Salta (UTC-3) expresadas en UTC para los fixtures.
const SIN_HORA = '2026-11-07T03:00:00Z' // 00:00 Salta
const A_16 = '2026-11-07T19:00:00Z' // 16:00 Salta
const A_2130 = '2026-11-08T00:30:00Z' // 21:30 Salta (07)
const A_2300 = '2026-11-08T02:00:00Z' // 23:00 Salta (07)

describe('cleanDescription', () => {
  it('null, undefined, vacío y solo espacios dan null', () => {
    expect(cleanDescription(null)).toBeNull()
    expect(cleanDescription(undefined)).toBeNull()
    expect(cleanDescription('')).toBeNull()
    expect(cleanDescription('   \n ')).toBeNull()
  })
  it('descarta la descripción automática del scraper', () => {
    expect(cleanDescription('Evento importado automáticamente desde Fuente de Prueba')).toBeNull()
    expect(cleanDescription('  evento importado automaticamente')).toBeNull()
  })
  it('devuelve el texto recortado', () => {
    expect(cleanDescription('  Show de prueba  ')).toBe('Show de prueba')
  })
  it('conserva una descripción que solo menciona la frase en el medio', () => {
    expect(cleanDescription('Es un evento importado automáticamente? no')).not.toBeNull()
  })
})

describe('ageChip', () => {
  it.each([
    [0, null],
    [null, null],
    [undefined, null],
    [17, null],
    [18, 'adultos'],
    [21, 'adultos'],
  ])('ageChip(%s) = %s', (input, expected) => {
    expect(ageChip(input as number | null | undefined)).toBe(expected)
  })
  it('valores raros no inventan chip', () => {
    expect(ageChip(-1)).toBeNull()
    expect(ageChip(Number.NaN)).toBeNull()
    expect(ageChip('18' as unknown as number)).toBeNull()
  })
})

describe('hasExplicitTime', () => {
  it('00:00 de Salta es false', () => expect(hasExplicitTime(SIN_HORA)).toBe(false))
  it('21:30 de Salta es true', () => expect(hasExplicitTime(A_2130)).toBe(true))
  it('00:00 UTC es 21:00 de Salta: true', () => {
    expect(hasExplicitTime('2026-11-07T00:00:00Z')).toBe(true)
  })
  it('acepta Date', () => expect(hasExplicitTime(new Date(A_16))).toBe(true))
  it('null, undefined, vacío e inválido son false', () => {
    expect(hasExplicitTime(null)).toBe(false)
    expect(hasExplicitTime(undefined)).toBe(false)
    expect(hasExplicitTime('')).toBe(false)
    expect(hasExplicitTime('basura')).toBe(false)
  })
})

describe('formatEventTimeDisplay', () => {
  it('21:30 en 24 h', () => expect(formatEventTimeDisplay(A_2130)).toBe('21:30'))
  it('16:00', () => expect(formatEventTimeDisplay(A_16)).toBe('16:00'))
  it('00:00 de Salta da null', () => expect(formatEventTimeDisplay(SIN_HORA)).toBeNull())
  it('00:05 de Salta sí se muestra', () => {
    expect(formatEventTimeDisplay('2026-11-07T03:05:00Z')).toBe('00:05')
  })
  it('null, vacío e inválido dan null sin lanzar', () => {
    expect(formatEventTimeDisplay(null)).toBeNull()
    expect(formatEventTimeDisplay(undefined)).toBeNull()
    expect(formatEventTimeDisplay('')).toBeNull()
    expect(formatEventTimeDisplay('basura')).toBeNull()
  })
})

describe('capitalizeFirst', () => {
  it('capitaliza solo la primera letra', () => {
    expect(capitalizeFirst('viernes, 2 de octubre')).toBe('Viernes, 2 de octubre')
  })
  it('vacío queda vacío y no toca el resto', () => {
    expect(capitalizeFirst('')).toBe('')
    expect(capitalizeFirst('ya Ok')).toBe('Ya Ok')
  })
})

describe('sortEventsByTime', () => {
  const ev = (id: string, startDateTime: string) => ({ id, startDateTime })

  it('ordena por hora de Salta, no por instante UTC', () => {
    // 23:00 Salta del 7 (02:00Z del 8) debe ir después de 16:00 Salta del 7.
    const out = sortEventsByTime([ev('b', A_2300), ev('a', A_16), ev('c', A_2130)])
    expect(out.map((e) => e.id)).toEqual(['a', 'c', 'b'])
  })
  it('compara solo la hora del día aunque los días difieran', () => {
    const out = sortEventsByTime([ev('tarde', '2026-11-07T22:00:00Z'), ev('temprano', '2026-11-09T13:00:00Z')])
    expect(out.map((e) => e.id)).toEqual(['temprano', 'tarde'])
  })
  it('los sin hora van al final', () => {
    const out = sortEventsByTime([ev('s', SIN_HORA), ev('a', A_16), ev('b', A_2300)])
    expect(out.map((e) => e.id)).toEqual(['a', 'b', 's'])
  })
  it('desempata por instante cuando la hora es igual', () => {
    const out = sortEventsByTime([ev('dia9', '2026-11-09T19:00:00Z'), ev('dia7', A_16)])
    expect(out.map((e) => e.id)).toEqual(['dia7', 'dia9'])
  })
  it('varios sin hora se ordenan por instante entre sí', () => {
    const out = sortEventsByTime([ev('later', '2026-11-09T03:00:00Z'), ev('first', SIN_HORA)])
    expect(out.map((e) => e.id)).toEqual(['first', 'later'])
  })
  it('devuelve una copia y no muta la entrada', () => {
    const input = [ev('b', A_2300), ev('a', A_16)]
    const out = sortEventsByTime(input)
    expect(out).not.toBe(input)
    expect(input.map((e) => e.id)).toEqual(['b', 'a'])
  })
  it('lista vacía y de un elemento', () => {
    expect(sortEventsByTime([])).toEqual([])
    expect(sortEventsByTime([ev('a', A_16)])).toHaveLength(1)
  })
  it('fecha inválida no lanza', () => {
    expect(() => sortEventsByTime([ev('x', 'basura'), ev('a', A_16)])).not.toThrow()
  })
})

describe('selectTodayEvents', () => {
  const hoy = '2026-11-07'
  const e = (id: string, date: string, startDateTime: string, extra = {}) => ({
    id,
    date,
    startDateTime,
    ...extra,
  })

  it('solo eventos de la fecha de hoy, ordenados por hora', () => {
    const out = selectTodayEvents(
      [e('noche', hoy, A_2300), e('manana', '2026-11-08', A_16), e('tarde', hoy, A_16)],
      hoy,
    )
    expect(out.map((x) => x.id)).toEqual(['tarde', 'noche'])
  })
  it('excluye flyers de Instagram y películas de cine', () => {
    const out = selectTodayEvents(
      [
        e('flyer', hoy, A_16, { isInstagramFlyer: true }),
        e('peli', hoy, A_16, { isCinemaMovie: true }),
        e('ok', hoy, A_2130, { isInstagramFlyer: false, isCinemaMovie: false }),
      ],
      hoy,
    )
    expect(out.map((x) => x.id)).toEqual(['ok'])
  })
  it('sin coincidencias devuelve vacío', () => {
    expect(selectTodayEvents([e('a', '2026-11-09', A_16)], hoy)).toEqual([])
    expect(selectTodayEvents([], hoy)).toEqual([])
  })
  it('no muta la entrada', () => {
    const input = [e('b', hoy, A_2300), e('a', hoy, A_16)]
    selectTodayEvents(input, hoy)
    expect(input.map((x) => x.id)).toEqual(['b', 'a'])
  })
})

describe('arrangeRowsForToday', () => {
  const ev = (id: string, startDateTime: string) => ({ id, startDateTime })

  it('ordena cada fila por hora y deja cine al final', () => {
    const rows = [
      { category: 'cine', events: [ev('c2', A_2300), ev('c1', A_16)] },
      { category: 'musica', events: [ev('m2', A_2300), ev('m1', A_16)] },
      { category: 'teatro', events: [ev('t1', A_2130)] },
    ]
    const out = arrangeRowsForToday(rows)
    expect(out.map((r) => r.category)).toEqual(['musica', 'teatro', 'cine'])
    expect(out[0].events.map((x) => x.id)).toEqual(['m1', 'm2'])
    expect(out[2].events.map((x) => x.id)).toEqual(['c1', 'c2'])
  })
  it('el resto conserva su orden relativo', () => {
    const rows = [
      { category: 'b', events: [] as { startDateTime: string }[] },
      { category: 'a', events: [] as { startDateTime: string }[] },
    ]
    expect(arrangeRowsForToday(rows).map((r) => r.category)).toEqual(['b', 'a'])
  })
  it('conserva otras propiedades de la fila y no muta la entrada', () => {
    const rows = [{ category: 'musica', title: 'Fila de Prueba', events: [ev('b', A_2300), ev('a', A_16)] }]
    const out = arrangeRowsForToday(rows)
    expect(out[0].title).toBe('Fila de Prueba')
    expect(rows[0].events.map((x) => x.id)).toEqual(['b', 'a'])
  })
  it('sin filas devuelve vacío', () => {
    expect(arrangeRowsForToday([])).toEqual([])
  })
})

describe('saltaStartOfDayISO', () => {
  it('mediodía UTC: 00:00 de Salta de ese día = 03:00Z', () => {
    expect(saltaStartOfDayISO(new Date('2026-11-07T12:00:00Z'))).toBe('2026-11-07T03:00:00.000Z')
  })
  it('lunes 01:30 UTC sigue siendo domingo en Salta: inicio = domingo 03:00Z', () => {
    expect(saltaStartOfDayISO(new Date('2026-11-09T01:30:00Z'))).toBe('2026-11-08T03:00:00.000Z')
  })
  it('límite: 02:59:59Z es el día anterior, 03:00:00Z el nuevo', () => {
    expect(saltaStartOfDayISO(new Date('2026-11-09T02:59:59Z'))).toBe('2026-11-08T03:00:00.000Z')
    expect(saltaStartOfDayISO(new Date('2026-11-09T03:00:00Z'))).toBe('2026-11-09T03:00:00.000Z')
  })
  it('cruce de año', () => {
    expect(saltaStartOfDayISO(new Date('2027-01-01T01:00:00Z'))).toBe('2026-12-31T03:00:00.000Z')
  })
  it('sin argumento devuelve un ISO que termina en 03:00:00.000Z', () => {
    expect(saltaStartOfDayISO()).toMatch(/T03:00:00\.000Z$/)
  })
})

// Ahora = 23:00 de Salta del 2026-11-07 (02:00Z del 8).
const AHORA_2300 = new Date('2026-11-08T02:00:00Z').getTime()
const A_10 = '2026-11-07T13:00:00Z' // 10:00 Salta
const A_14 = '2026-11-07T17:00:00Z' // 14:00 Salta
const FIN_2330 = '2026-11-08T02:30:00Z' // 23:30 Salta

describe('isRelevantToday', () => {
  it('función de las 14:00 de teatro a las 23:00: no es relevante', () => {
    expect(isRelevantToday({ startDateTime: A_14, category: 'teatro' }, AHORA_2300)).toBe(false)
  })
  it('museo de las 10:00 a las 23:00: sí (larga duración)', () => {
    expect(isRelevantToday({ startDateTime: A_10, category: 'museos' }, AHORA_2300)).toBe(true)
  })
  it('evento de las 14:00 con fin 23:30: sí', () => {
    expect(isRelevantToday({ startDateTime: A_14, endDateTime: FIN_2330, category: 'teatro' }, AHORA_2300)).toBe(true)
  })
  it('evento de las 14:00 con fin ya pasado: no', () => {
    expect(isRelevantToday({ startDateTime: A_14, endDateTime: '2026-11-07T20:00:00Z' }, AHORA_2300)).toBe(false)
  })
  it('por empezar (start >= now): sí; justo a la hora: sí', () => {
    expect(isRelevantToday({ startDateTime: A_2300 }, AHORA_2300)).toBe(true)
    expect(isRelevantToday({ startDateTime: '2026-11-08T02:00:00Z' }, AHORA_2300)).toBe(true)
  })
  it('fin exactamente ahora cuenta como relevante', () => {
    expect(isRelevantToday({ startDateTime: A_14, endDateTime: '2026-11-08T02:00:00Z' }, AHORA_2300)).toBe(true)
  })
  it('fechas inválidas: false; fin inválido o null no rompe', () => {
    expect(isRelevantToday({ startDateTime: 'basura', category: 'museos' }, AHORA_2300)).toBe(false)
    expect(isRelevantToday({ startDateTime: A_14, endDateTime: 'basura' }, AHORA_2300)).toBe(false)
    expect(isRelevantToday({ startDateTime: A_14, endDateTime: null, category: null }, AHORA_2300)).toBe(false)
  })
  it('categoría distinta de museos que ya empezó no es de larga duración', () => {
    expect(isRelevantToday({ startDateTime: A_10, category: 'museo' }, AHORA_2300)).toBe(false)
  })
})

describe('orderUpcomingFirst', () => {
  const ev = (id: string, startDateTime: string) => ({ id, startDateTime })
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id)

  it('lo por empezar va antes que lo ya empezado, cada grupo en su orden', () => {
    const out = orderUpcomingFirst(
      [ev('ya1', A_10), ev('prox1', A_2300), ev('ya2', A_14), ev('prox2', '2026-11-08T03:00:00Z')],
      AHORA_2300,
    )
    expect(ids(out)).toEqual(['prox1', 'prox2', 'ya1', 'ya2'])
  })
  it('sin nowMs devuelve una copia sin reordenar', () => {
    const input = [ev('b', A_2300), ev('a', A_10)]
    const out = orderUpcomingFirst(input)
    expect(out).not.toBe(input)
    expect(ids(out)).toEqual(['b', 'a'])
  })
  it('con nowMs no muta la entrada', () => {
    const input = [ev('ya', A_10), ev('prox', A_2300)]
    orderUpcomingFirst(input, AHORA_2300)
    expect(ids(input)).toEqual(['ya', 'prox'])
  })
  it('vacío y fecha inválida (cae en "ya empezado") no lanzan', () => {
    expect(orderUpcomingFirst([], AHORA_2300)).toEqual([])
    expect(ids(orderUpcomingFirst([ev('x', 'basura'), ev('prox', A_2300)], AHORA_2300))).toEqual(['prox', 'x'])
  })
})

describe('selectTodayEvents y arrangeRowsForToday con nowMs', () => {
  const hoy = '2026-11-07'
  const e = (id: string, startDateTime: string) => ({ id, date: hoy, startDateTime })

  it('selectTodayEvents con nowMs: lo por empezar primero, luego lo ya empezado (ambos por hora)', () => {
    const out = selectTodayEvents([e('noche', A_2300), e('manana', A_10), e('tarde', A_14), e('tarde-noche', A_2130)], hoy, AHORA_2300)
    // 21:30 Salta del 7 es 00:30Z del 8, anterior a 23:00: ya empezó.
    expect(out.map((x) => x.id)).toEqual(['noche', 'manana', 'tarde', 'tarde-noche'])
  })
  it('selectTodayEvents sin nowMs: igual que antes (solo por hora)', () => {
    const out = selectTodayEvents([e('noche', A_2300), e('manana', A_10), e('tarde', A_14)], hoy)
    expect(out.map((x) => x.id)).toEqual(['manana', 'tarde', 'noche'])
  })
  it('arrangeRowsForToday con nowMs: por empezar primero en cada fila y cine al final', () => {
    const rows = [
      { category: 'cine', events: [e('c-ya', A_10), e('c-prox', A_2300)] },
      { category: 'musica', events: [e('m-ya', A_10), e('m-prox', A_2300), e('m-ya2', A_14)] },
    ]
    const out = arrangeRowsForToday(rows, AHORA_2300)
    expect(out.map((r) => r.category)).toEqual(['musica', 'cine'])
    expect(out[0].events.map((x) => x.id)).toEqual(['m-prox', 'm-ya', 'm-ya2'])
    expect(out[1].events.map((x) => x.id)).toEqual(['c-prox', 'c-ya'])
  })
  it('arrangeRowsForToday sin nowMs: igual que antes', () => {
    const rows = [{ category: 'musica', events: [e('b', A_2300), e('a', A_10)] }]
    expect(arrangeRowsForToday(rows)[0].events.map((x) => x.id)).toEqual(['a', 'b'])
  })
})
