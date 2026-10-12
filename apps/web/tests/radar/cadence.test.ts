import { describe, expect, it } from 'vitest'
import { isDue } from '@/lib/radar/cadence'

const NOW = new Date('2030-10-10T21:00:00.000Z')
const hace = (dias: number, extraMs = 0) => new Date(NOW.getTime() - dias * 86_400_000 - extraMs).toISOString()

describe('isDue', () => {
  it('weekly: siempre, con cualquier último envío', () => {
    expect(isDue('weekly', null, NOW)).toBe(true)
    expect(isDue('weekly', hace(0), NOW)).toBe(true)
    expect(isDue('weekly', hace(7), NOW)).toBe(true)
  })

  it('biweekly: null sí, 12 días no, 13 días sí', () => {
    expect(isDue('biweekly', null, NOW)).toBe(true)
    expect(isDue('biweekly', hace(12), NOW)).toBe(false)
    expect(isDue('biweekly', hace(13), NOW)).toBe(true)
    expect(isDue('biweekly', hace(14), NOW)).toBe(true)
  })

  it('biweekly: borde, 13 días menos 1 ms no; el mismo día no', () => {
    expect(isDue('biweekly', hace(13, -1), NOW)).toBe(false)
    expect(isDue('biweekly', hace(0), NOW)).toBe(false)
  })

  it('monthly: null sí, 26 días no, 27 días sí', () => {
    expect(isDue('monthly', null, NOW)).toBe(true)
    expect(isDue('monthly', hace(26), NOW)).toBe(false)
    expect(isDue('monthly', hace(27), NOW)).toBe(true)
    expect(isDue('monthly', hace(60), NOW)).toBe(true)
  })

  it('disabled nunca, ni con null ni con envío viejo', () => {
    expect(isDue('disabled', null, NOW)).toBe(false)
    expect(isDue('disabled', hace(400), NOW)).toBe(false)
  })

  it('frecuencia desconocida o vacía: nunca (falla cerrado)', () => {
    expect(isDue('daily', null, NOW)).toBe(false)
    expect(isDue('', null, NOW)).toBe(false)
    expect(isDue('WEEKLY', null, NOW)).toBe(false)
  })

  it('acepta Date además de string', () => {
    expect(isDue('biweekly', new Date(hace(13)), NOW)).toBe(true)
    expect(isDue('biweekly', new Date(hace(12)), NOW)).toBe(false)
  })

  it('undefined se trata como sin envío previo', () => {
    expect(isDue('monthly', undefined, NOW)).toBe(true)
  })

  it('timestamp inválido: hoy se trata como sin envío previo (se envía)', () => {
    expect(isDue('monthly', 'no-es-fecha', NOW)).toBe(true)
  })
})
