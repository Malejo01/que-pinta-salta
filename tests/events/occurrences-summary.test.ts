import { describe, expect, it } from 'vitest'
import { summarizeOccurrences } from '@/lib/events/occurrences-summary'
import { formatEventDateShort, saltaWallClockToDate } from '@/lib/date-format'

// Hora de pared de Salta -> instante real, usando la misma conversión que el
// código de producción (lib/date-format.ts), para no depender de la TZ de la
// máquina que corre los tests (vitest.config.ts fija TZ=UTC).
const salta = (wallClock: string) => saltaWallClockToDate(wallClock)

describe('summarizeOccurrences', () => {
  it('sin ocurrencias: null', () => {
    expect(summarizeOccurrences([], salta('2030-10-01T00:00:00'))).toBeNull()
  })

  it('una sola ocurrencia: null (no hay "varias fechas" que resumir)', () => {
    const occs = [{ date: '2030-10-10', time: '21:00' }]
    expect(summarizeOccurrences(occs, salta('2030-10-01T00:00:00'))).toBeNull()
  })

  it('2 o más con la próxima futura: muestra el conteo y la fecha más cercana que falta', () => {
    const occs = [
      { date: '2030-10-05', time: '20:00' }, // ya pasó
      { date: '2030-10-20', time: '21:00' }, // futura, pero no es la más cercana
      { date: '2030-10-12', time: '21:00' }, // futura y la más cercana
    ]
    const now = salta('2030-10-10T15:00:00')
    expect(summarizeOccurrences(occs, now)).toBe(
      `+3 fechas · próxima: ${formatEventDateShort('2030-10-12')} 21:00`
    )
  })

  it('todas pasadas: solo "+N fechas", sin "próxima"', () => {
    const occs = [
      { date: '2030-10-01', time: '20:00' },
      { date: '2030-10-02', time: '20:00' },
      { date: '2030-10-03', time: '' },
    ]
    const now = salta('2030-10-10T15:00:00')
    expect(summarizeOccurrences(occs, now)).toBe('+3 fechas')
  })

  it('sin hora: la próxima se muestra solo con el día, sin "00:00"', () => {
    const occs = [
      { date: '2030-10-01', time: '20:00' }, // pasada
      { date: '2030-10-15', time: '' }, // futura, sin hora explícita
    ]
    const now = salta('2030-10-10T15:00:00')
    const label = summarizeOccurrences(occs, now)
    expect(label).toBe(`+2 fechas · próxima: ${formatEventDateShort('2030-10-15')}`)
    expect(label).not.toContain('00:00')
  })

  describe('23:30 de Salta cae en ese día, no en el siguiente en UTC', () => {
    // 23:30 en Salta (UTC-3) es 02:30 UTC del día calendario siguiente. Si
    // alguna vez se comparara en UTC crudo en lugar de convertir con
    // saltaWallClockToDate, esto se podría romper.
    const occs = [
      { date: '2030-10-05', time: '20:00' }, // pasada, de relleno (para no caer en el caso "una sola")
      { date: '2030-10-10', time: '23:30' },
    ]

    it('a las 23:25 de Salta del mismo día: todavía es la próxima, y se muestra el día 10', () => {
      const now = salta('2030-10-10T23:25:00')
      expect(summarizeOccurrences(occs, now)).toBe(
        `+2 fechas · próxima: ${formatEventDateShort('2030-10-10')} 23:30`
      )
    })

    it('a las 23:35 de Salta del mismo día: ya pasó, cae a "todas pasadas"', () => {
      const now = salta('2030-10-10T23:35:00')
      expect(summarizeOccurrences(occs, now)).toBe('+2 fechas')
    })

    it('consultado a mediodía del mismo día: la etiqueta no se corre al día 11', () => {
      const now = salta('2030-10-10T12:00:00')
      const label = summarizeOccurrences(occs, now)
      expect(label).toContain(formatEventDateShort('2030-10-10'))
      expect(label).not.toContain(formatEventDateShort('2030-10-11'))
    })
  })
})
