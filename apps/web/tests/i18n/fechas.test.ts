/**
 * Fechas y precios por idioma (Q3, lib/i18n/fechas.ts). En castellano tienen
 * que dar exactamente lo mismo que antes; en inglés, Intl en-US. La zona del
 * proceso es UTC (vitest.config.ts); las fechas se arman en hora de Salta.
 */
import { describe, expect, it } from 'vitest'
import {
  formatEventDate,
  formatEventDateShort,
  formatEventDayMonth,
} from '@qps/core/date-format'
import { summarizeOccurrences } from '@qps/core/events/occurrences-summary'
import { diaMes, fechaCorta, fechaDeFiltro, fechaDeFuncion, fechaLarga, precio, resumenFunciones } from '@/lib/i18n/fechas'

const DIA = '2026-10-16' // viernes

describe('core/date-format: el locale nuevo es opcional y por omisión sigue en es-AR', () => {
  it('sin locale, igual que con es-AR explícito', () => {
    expect(formatEventDate(DIA)).toBe(formatEventDate(DIA, false, 'es-AR'))
    expect(formatEventDate(DIA, true)).toBe(formatEventDate(DIA, true, 'es-AR'))
    expect(formatEventDateShort(DIA)).toBe(formatEventDateShort(DIA, 'es-AR'))
    expect(formatEventDayMonth(DIA)).toBe(formatEventDayMonth(DIA, 'es-AR'))
  })

  it('con en-US, en inglés', () => {
    expect(formatEventDate(DIA, false, 'en-US')).toBe('Friday, October 16')
    expect(formatEventDate(DIA, true, 'en-US')).toBe('Friday, October 16, 2026')
    expect(formatEventDateShort(DIA, 'en-US')).toBe('Fri, Oct 16')
    expect(formatEventDayMonth(DIA, 'en-US')).toBe('Oct 16')
  })
})

describe('lib/i18n/fechas', () => {
  it('en castellano, lo mismo que las funciones de core sin locale', () => {
    expect(fechaLarga('es', DIA)).toBe(formatEventDate(DIA))
    expect(fechaLarga('es', DIA, true)).toBe(formatEventDate(DIA, true))
    expect(fechaCorta('es', DIA)).toBe(formatEventDateShort(DIA))
    expect(diaMes('es', DIA)).toBe(formatEventDayMonth(DIA))
    expect(fechaLarga('es', DIA)).toMatch(/^viernes/)
  })

  it('en inglés, Intl en-US', () => {
    expect(fechaLarga('en', DIA)).toBe('Friday, October 16')
    expect(fechaCorta('en', DIA)).toBe('Fri, Oct 16')
    expect(diaMes('en', DIA)).toBe('Oct 16')
  })

  it('fechaDeFiltro: en castellano, la misma cuenta que tenía filters-bar.tsx', () => {
    const comoAntes = new Intl.DateTimeFormat('es-AR', {
      dateStyle: 'medium',
      timeZone: 'America/Argentina/Salta',
    }).format(new Date(`${DIA}T00:00:00`))
    expect(fechaDeFiltro('es', DIA)).toBe(comoAntes)
    expect(fechaDeFiltro('en', DIA)).toMatch(/^Oct \d{1,2}, 2026$/)
  })

  it('fechaDeFuncion: en castellano, la misma cuenta que tenía event-card.tsx', () => {
    const comoAntes = new Date(`${DIA}T00:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
    expect(fechaDeFuncion('es', DIA)).toBe(comoAntes)
    expect(fechaDeFuncion('en', DIA)).toBe('Oct 16')
  })

  it('precio: "$5.000" en castellano (como siempre), "ARS 5,000" en inglés', () => {
    expect(precio('es', 5000)).toBe(`$${(5000).toLocaleString('es-AR')}`)
    expect(precio('es', 5000)).toBe('$5.000')
    expect(precio('en', 5000)).toBe('ARS 5,000')
    expect(precio('en', 800)).toBe('ARS 800')
  })
})

describe('resumenFunciones', () => {
  const ahora = new Date('2026-10-10T12:00:00-03:00')

  it('en castellano es summarizeOccurrences de core, sin cambios', () => {
    const funciones = [
      { date: '2026-10-12', time: '21:00' },
      { date: '2026-10-14', time: '' },
    ]
    expect(resumenFunciones('es', funciones, ahora)).toBe(summarizeOccurrences(funciones, ahora))
    expect(resumenFunciones('es', funciones, ahora)).toBe(`+2 fechas · ${formatEventDayMonth('2026-10-12')} 21:00`)
  })

  it('en inglés: "+N dates · Oct 12 21:00", sin hora "+N dates · Oct 11", todo pasado "+N dates"', () => {
    expect(
      resumenFunciones('en', [{ date: '2026-10-09', time: '21:00' }, { date: '2026-10-12', time: '21:00' }], ahora),
    ).toBe('+2 dates · Oct 12 21:00')
    expect(
      resumenFunciones(
        'en',
        [
          { date: '2026-10-09', time: '21:00' },
          { date: '2026-10-12', time: '21:00' },
          { date: '2026-10-11', time: '' },
        ],
        ahora,
      ),
    ).toBe('+3 dates · Oct 11')
    expect(
      resumenFunciones('en', [{ date: '2026-10-01', time: '21:00' }, { date: '2026-10-02', time: '' }], ahora),
    ).toBe('+2 dates')
  })

  it('con 0 o 1 funciones, null en los dos idiomas', () => {
    expect(resumenFunciones('en', [], ahora)).toBeNull()
    expect(resumenFunciones('en', [{ date: '2026-10-12', time: '21:00' }], ahora)).toBeNull()
    expect(resumenFunciones('es', [{ date: '2026-10-12', time: '21:00' }], ahora)).toBeNull()
  })

  // La versión en inglés copia la regla de core (cuál es la próxima función):
  // si core cambia y esta no, este caso lo marca.
  it.each([
    [[{ date: '2026-10-10', time: '11:00' }, { date: '2026-10-10', time: '13:00' }]],
    [[{ date: '2026-10-10', time: '' }, { date: '2026-10-11', time: '09:00' }]],
    [[{ date: '2026-10-09', time: '' }, { date: '2026-10-08', time: '23:00' }]],
    [[{ date: '2026-10-20', time: '20:30' }, { date: '2026-10-15', time: '22:00' }, { date: '2026-10-15', time: '' }]],
  ])('elige la misma función que core: %j', (funciones) => {
    const enCastellano = summarizeOccurrences(funciones, ahora)!
    const enIngles = resumenFunciones('en', funciones, ahora)!
    const partesEs = enCastellano.split(' · ')
    const partesEn = enIngles.split(' · ')
    expect(partesEn.length).toBe(partesEs.length)
    expect(partesEn[0]).toBe(partesEs[0].replace('fechas', 'dates'))
    if (partesEs[1]) {
      // Misma hora (o ninguna) y el mismo día, escrito en cada idioma.
      expect(partesEn[1].match(/\d{2}:\d{2}$/)?.[0]).toBe(partesEs[1].match(/\d{2}:\d{2}$/)?.[0])
      const elegida = funciones.find(
        (f) => partesEs[1].startsWith(formatEventDayMonth(f.date)) && partesEn[1].startsWith(formatEventDayMonth(f.date, 'en-US')),
      )
      expect(elegida).toBeDefined()
    }
  })
})
