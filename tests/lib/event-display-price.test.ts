import { describe, expect, it } from 'vitest'
import { formatPriceDisplay } from '@/lib/event-display'

describe('formatPriceDisplay', () => {
  it('is_free: Gratis', () => {
    expect(formatPriceDisplay({ is_free: true })).toBe('Gratis')
  })
  it('is_free gana sobre un precio cargado', () => {
    expect(formatPriceDisplay({ is_free: true, price_min: 35000 })).toBe('Gratis')
  })
  it('35000 -> $35.000', () => {
    expect(formatPriceDisplay({ price_min: 35000 })).toBe('$35.000')
  })
  it("'35000' (string numérico) -> $35.000", () => {
    expect(formatPriceDisplay({ price_min: '35000' })).toBe('$35.000')
  })
  it('1500 -> $1.500', () => {
    expect(formatPriceDisplay({ price_min: 1500, is_free: false })).toBe('$1.500')
  })
  it.each([
    ['0', { price_min: 0 }],
    ['null', { price_min: null }],
    ['undefined', { price_min: undefined }],
    ['objeto vacío', {}],
    ['is_free null', { is_free: null, price_min: null }],
    ['is_free false y 0', { is_free: false, price_min: 0 }],
    ['string no numérico', { price_min: 'abc' }],
    ['string vacío', { price_min: '' }],
    ['negativo', { price_min: -500 }],
  ])('%s -> A confirmar', (_n, e) => {
    expect(formatPriceDisplay(e)).toBe('A confirmar')
  })
})
