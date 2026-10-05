import { describe, expect, it } from 'vitest'
import { eventHref, goHref, METRIC_ORIGINS, parseOrigin } from '@/lib/metricas'

const ID = '11111111-1111-4111-8111-111111111111'

describe('eventHref / goHref', () => {
  it('eventHref con origen', () => {
    expect(eventHref(ID, 'hoy')).toBe(`/evento/${ID}?o=hoy`)
  })
  it('eventHref sin origen queda limpio', () => {
    expect(eventHref(ID)).toBe(`/evento/${ID}`)
  })
  it('goHref arma /go con origen', () => {
    expect(goHref(ID, 'ficha')).toBe(`/go/${ID}?o=ficha`)
  })
})

describe('parseOrigin', () => {
  it.each(METRIC_ORIGINS)('acepta %s', (o) => {
    expect(parseOrigin(o)).toBe(o)
  })
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['vacío', ''],
    ['raro', 'xyz'],
    ['mayúsculas', 'HERO'],
    ['con espacios', ' hero '],
    ['inyección &', 'hero&x=1'],
    ['path traversal', '../'],
    ['número', 5],
    ['array', ['hero']],
    ['objeto', { toString: () => 'hero' }],
    ['booleano', true],
  ])('%s cae a directo', (_n, v) => {
    expect(parseOrigin(v)).toBe('directo')
  })
})
