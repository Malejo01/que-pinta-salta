import { describe, expect, it } from 'vitest'
import {
  formatEventDate,
  formatEventDateShort,
  formatEventTime,
  formatSaltaClock,
  formatSaltaDayKey,
  formatSaltaInputValue,
  formatSaltaSchemaDate,
  saltaWallClockToDate,
  saltaWallClockToUtcISO,
  splitSaltaDateTime,
} from '@/lib/date-format'

describe('saltaWallClockToUtcISO', () => {
  it('hora de pared sin zona se interpreta como Salta (-03:00)', () => {
    expect(saltaWallClockToUtcISO('2026-08-07T21:00:00')).toBe('2026-08-08T00:00:00.000Z')
  })
  it('acepta espacio en vez de T y falta de segundos', () => {
    expect(saltaWallClockToUtcISO('2026-08-07 21:00')).toBe('2026-08-08T00:00:00.000Z')
    expect(saltaWallClockToUtcISO('2026-08-07T21:00')).toBe('2026-08-08T00:00:00.000Z')
  })
  it('solo fecha = 00:00 de Salta', () => {
    expect(saltaWallClockToUtcISO('2026-08-07')).toBe('2026-08-07T03:00:00.000Z')
  })
  it('respeta zona explícita (Z y offset) y es idempotente', () => {
    expect(saltaWallClockToUtcISO('2026-08-07T21:00:00Z')).toBe('2026-08-07T21:00:00.000Z')
    expect(saltaWallClockToUtcISO('2026-08-07T21:00:00-03:00')).toBe('2026-08-08T00:00:00.000Z')
    const once = saltaWallClockToUtcISO('2026-08-07T21:00:00')
    expect(saltaWallClockToUtcISO(once)).toBe(once)
  })
  it('vacío y espacios devuelven vacío', () => {
    expect(saltaWallClockToUtcISO('')).toBe('')
    expect(saltaWallClockToUtcISO('   ')).toBe('')
  })
  it('basura se devuelve tal cual, sin lanzar', () => {
    expect(saltaWallClockToUtcISO('no-es-fecha')).toBe('no-es-fecha')
  })
  it('saltaWallClockToDate devuelve el mismo instante', () => {
    expect(saltaWallClockToDate('2026-08-07T21:00:00').toISOString()).toBe('2026-08-08T00:00:00.000Z')
  })
})

describe('formatSaltaDayKey', () => {
  it('23:00 de Salta (02:00Z siguiente) sigue siendo el mismo día', () => {
    expect(formatSaltaDayKey('2026-08-08T02:00:00Z')).toBe('2026-08-07')
  })
  it('03:00Z es el comienzo del día en Salta', () => {
    expect(formatSaltaDayKey('2026-08-08T03:00:00Z')).toBe('2026-08-08')
  })
  it('una fecha YYYY-MM-DD pelada se toma como día de Salta, sin correrse', () => {
    expect(formatSaltaDayKey('2026-08-07')).toBe('2026-08-07')
  })
  it('acepta Date', () => {
    expect(formatSaltaDayKey(new Date('2026-08-07T15:00:00Z'))).toBe('2026-08-07')
  })
  it('cruce de año y de mes', () => {
    expect(formatSaltaDayKey('2027-01-01T02:59:00Z')).toBe('2026-12-31')
    expect(formatSaltaDayKey('2026-03-01T02:59:00Z')).toBe('2026-02-28')
  })
  it('fecha inválida lanza RangeError (comportamiento actual documentado)', () => {
    expect(() => formatSaltaDayKey('basura')).toThrow(RangeError)
  })
})

describe('formatSaltaClock / splitSaltaDateTime / formatSaltaInputValue', () => {
  it('hora 24h de Salta', () => {
    expect(formatSaltaClock('2026-08-08T00:30:00Z')).toBe('21:30')
    expect(formatSaltaClock('2026-08-07T15:05:00Z')).toBe('12:05')
  })
  it('medianoche de Salta es 00:00 (no 24:00)', () => {
    expect(formatSaltaClock('2026-08-07T03:00:00Z')).toBe('00:00')
  })
  it('split', () => {
    expect(splitSaltaDateTime('2026-08-08T00:30:00Z')).toEqual({ day: '2026-08-07', time: '21:30' })
  })
  it('valor para datetime-local', () => {
    expect(formatSaltaInputValue('2026-08-08T00:30:00Z')).toBe('2026-08-07T21:30')
  })
  it('round trip con saltaWallClockToUtcISO', () => {
    const wall = '2026-08-07T21:30'
    expect(formatSaltaInputValue(saltaWallClockToUtcISO(wall))).toBe(wall)
  })
})

describe('formatSaltaSchemaDate', () => {
  it('ISO con offset -03:00', () => {
    expect(formatSaltaSchemaDate('2026-08-08T00:00:00Z')).toBe('2026-08-07T21:00:00-03:00')
  })
})

describe('formatEventTime / formatEventDate / formatEventDateShort', () => {
  it('hora en es-AR, 12 horas, sin espacios raros', () => {
    const out = formatEventTime('2026-08-08T00:30:00Z')
    expect(out).not.toMatch(/[  ]/)
    expect(out).toMatch(/^09:30 p\.? ?m\.?$/i)
  })
  it('fecha larga en español, en hora de Salta', () => {
    const out = formatEventDate('2026-08-08T02:00:00Z') // viernes 7 en Salta
    expect(out.toLowerCase()).toContain('viernes')
    expect(out.toLowerCase()).toContain('agosto')
    expect(out).toContain('7')
  })
  it('withYear agrega el año', () => {
    expect(formatEventDate('2026-08-08T02:00:00Z', true)).toContain('2026')
    expect(formatEventDate('2026-08-08T02:00:00Z')).not.toContain('2026')
  })
  it('fecha corta', () => {
    const out = formatEventDateShort('2026-08-08T02:00:00Z')
    expect(out.toLowerCase()).toContain('vie')
    expect(out.toLowerCase()).toContain('ago')
  })
})
