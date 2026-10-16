// 28-q, punto 9 (F1, 28-f): `textoPrecio` (lib/formato.ts) es pura.
import { describe, expect, it } from 'vitest'
import { textoPrecio } from '../lib/formato'

describe('textoPrecio', () => {
  it("'gratis' -> 'Gratis'", () => {
    expect(textoPrecio('gratis')).toBe('Gratis')
  })

  it('12500 -> "$12.500"', () => {
    expect(textoPrecio(12500)).toBe('$12.500')
  })

  it('1000000 -> "$1.000.000"', () => {
    expect(textoPrecio(1000000)).toBe('$1.000.000')
  })

  // Fijado: 0 no es "gratis" ni "confirmar" ni null/undefined, así que la
  // implementación actual lo muestra como precio ("$0"), no como "sin
  // precio". Si el día de mañana se decide tratar 0 como "Gratis", este
  // test tiene que actualizarse a propósito (no es un bug: es una decisión
  // de producto que todavía no se tomó).
  it('0 -> "$0" (fijado; no es el mismo camino que "gratis")', () => {
    expect(textoPrecio(0)).toBe('$0')
  })

  it("'confirmar' -> null", () => {
    expect(textoPrecio('confirmar')).toBeNull()
  })

  it('null -> null', () => {
    expect(textoPrecio(null)).toBeNull()
  })

  it('undefined -> null', () => {
    expect(textoPrecio(undefined)).toBeNull()
  })

  it('números negativos: el signo queda antes del agrupado (no lo pide la tarea, pero no debería romper)', () => {
    expect(textoPrecio(-1500)).toBe('$-1.500')
  })

  it('un número con decimales se redondea (no hay centavos en los precios de la base)', () => {
    expect(textoPrecio(12500.7)).toBe('$12.501')
  })
})
