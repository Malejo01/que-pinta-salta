import { describe, expect, it } from 'vitest'
import { isUuid, safeTicketUrl } from '@/lib/metricas'

describe('safeTicketUrl', () => {
  it('acepta http y https', () => {
    expect(safeTicketUrl('https://tickets.example.test/e/1')).toBe('https://tickets.example.test/e/1')
    expect(safeTicketUrl('http://tickets.example.test/e/1')).toBe('http://tickets.example.test/e/1')
  })
  it('recorta espacios', () => {
    expect(safeTicketUrl('  https://tickets.example.test/x  ')).toBe('https://tickets.example.test/x')
  })
  it.each([
    ['javascript', 'javascript:alert(1)'],
    ['javascript mayúsculas', 'JaVaScRiPt:alert(1)'],
    ['data', 'data:text/html,<script>alert(1)</script>'],
    ['protocol-relative', '//otro.example.test'],
    ['ruta relativa', '/evento/1'],
    ['vacío', ''],
    ['solo espacios', '   '],
    ['basura', 'no es una url'],
    ['ftp', 'ftp://example.test/x'],
    ['file', 'file:///etc/passwd'],
    ['null', null],
    ['undefined', undefined],
    ['número', 42],
    ['objeto', {}],
  ])('rechaza %s', (_n, v) => {
    expect(safeTicketUrl(v)).toBeNull()
  })
})

describe('isUuid', () => {
  it('acepta UUID válido', () => {
    expect(isUuid('11111111-1111-4111-8111-111111111111')).toBe(true)
  })
  it.each(['', 'abc', '11111111-1111-4111-8111-11111111111', '../x', "1' or 1=1", '11111111-1111-4111-8111-111111111111\n'])(
    'rechaza %j',
    (v) => {
      expect(isUuid(v)).toBe(false)
    }
  )
  it('rechaza no strings', () => {
    expect(isUuid(null)).toBe(false)
    expect(isUuid(undefined)).toBe(false)
    expect(isUuid(1)).toBe(false)
  })
})
