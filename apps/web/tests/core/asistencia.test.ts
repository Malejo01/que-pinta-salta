/**
 * `packages/core/src/asistencia/index.ts` (R38, tarea 38-a; reescrito en la
 * R47, tarea 47-a para el tipo único "voy"). Umbral del contador,
 * `cantidadVisible` arriba y abajo del umbral, y `textoBotonVoy`.
 *
 * Las 6 combinaciones de `siguienteMarca` y los casos de `me_interesa` se
 * borraron en la R47: ese tipo y esa función ya no existen (ver
 * `asistencia-reglas.test.ts` para `esTipoAsistencia`, `textoBotonVoy` y el
 * invariante Guardar/Voy).
 */
import { describe, expect, it } from 'vitest'
import {
  ETIQUETAS_ASISTENCIA,
  UMBRAL_CONTADOR_ASISTENCIA,
  cantidadVisible,
  textoBotonVoy,
} from '@qps/core/asistencia'

describe('UMBRAL_CONTADOR_ASISTENCIA', () => {
  it('es 3 (si alguien lo cambia, este test lo cuenta)', () => {
    expect(UMBRAL_CONTADOR_ASISTENCIA).toBe(3)
  })
})

describe('cantidadVisible', () => {
  it('0 (debajo del umbral): null', () => {
    expect(cantidadVisible(0)).toBeNull()
  })

  it('2 (justo debajo del umbral): null', () => {
    expect(cantidadVisible(2)).toBeNull()
  })

  it('3 (justo en el umbral, inclusive): 3', () => {
    expect(cantidadVisible(3)).toBe(3)
  })

  it('10 (muy por arriba del umbral): 10', () => {
    expect(cantidadVisible(10)).toBe(10)
  })

  // Casos raros: `n` siempre debería venir de un `count()` de Postgres (un
  // entero finito >= 0), pero si algo falla, la regla es "se trata como sin
  // dato" (null), nunca un número roto en pantalla.
  it('NaN: null (no es un entero finito >= 0)', () => {
    expect(cantidadVisible(NaN)).toBeNull()
  })

  it('Infinity: null', () => {
    expect(cantidadVisible(Infinity)).toBeNull()
  })

  it('-Infinity: null', () => {
    expect(cantidadVisible(-Infinity)).toBeNull()
  })

  it('negativo (-1): null', () => {
    expect(cantidadVisible(-1)).toBeNull()
  })

  it('negativo por debajo de -umbral (-5): null, no se "convierte" en positivo', () => {
    expect(cantidadVisible(-5)).toBeNull()
  })

  it('decimal por arriba del umbral (3.5): null (no es un entero)', () => {
    expect(cantidadVisible(3.5)).toBeNull()
  })

  it('decimal por debajo del umbral (1.5): null', () => {
    expect(cantidadVisible(1.5)).toBeNull()
  })
})

describe('ETIQUETAS_ASISTENCIA', () => {
  it('"voy" -> "Voy"', () => {
    expect(ETIQUETAS_ASISTENCIA.voy).toBe('Voy')
  })
})

describe('textoBotonVoy', () => {
  it('debajo del umbral (0): sin número', () => {
    expect(textoBotonVoy(0)).toBe('Voy')
  })

  it('justo debajo del umbral (2): sin número', () => {
    expect(textoBotonVoy(2)).toBe('Voy')
  })

  it('en el umbral (3): con número', () => {
    expect(textoBotonVoy(3)).toBe('Voy · 3 van')
  })

  it('por arriba del umbral (5): con número', () => {
    expect(textoBotonVoy(5)).toBe('Voy · 5 van')
  })

  it('con 12: "Voy · 12 van" (el ejemplo con dos cifras)', () => {
    expect(textoBotonVoy(12)).toBe('Voy · 12 van')
  })
})
