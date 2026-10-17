/**
 * `packages/core/src/asistencia/index.ts` (R38, tarea 38-a): la lógica
 * compartida de "Voy / Me interesa", sin red ni base. Umbral del contador,
 * las 6 combinaciones de `siguienteMarca` y `textoBoton` arriba y abajo del
 * umbral, para los dos tipos.
 */
import { describe, expect, it } from 'vitest'
import {
  ETIQUETAS_ASISTENCIA,
  UMBRAL_CONTADOR_ASISTENCIA,
  cantidadVisible,
  siguienteMarca,
  textoBoton,
  type TipoAsistencia,
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

describe('siguienteMarca: las 6 combinaciones (actual x tocado)', () => {
  it('actual null, tocado "voy": primera marca, queda en "voy"', () => {
    expect(siguienteMarca(null, 'voy')).toBe('voy')
  })

  it('actual null, tocado "me_interesa": primera marca, queda en "me_interesa"', () => {
    expect(siguienteMarca(null, 'me_interesa')).toBe('me_interesa')
  })

  it('actual "voy", tocado "voy": la misma marca, se saca (null)', () => {
    expect(siguienteMarca('voy', 'voy')).toBeNull()
  })

  it('actual "voy", tocado "me_interesa": cambia a "me_interesa"', () => {
    expect(siguienteMarca('voy', 'me_interesa')).toBe('me_interesa')
  })

  it('actual "me_interesa", tocado "voy": cambia a "voy"', () => {
    expect(siguienteMarca('me_interesa', 'voy')).toBe('voy')
  })

  it('actual "me_interesa", tocado "me_interesa": la misma marca, se saca (null)', () => {
    expect(siguienteMarca('me_interesa', 'me_interesa')).toBeNull()
  })
})

describe('ETIQUETAS_ASISTENCIA', () => {
  it('"voy" -> "Voy"', () => {
    expect(ETIQUETAS_ASISTENCIA.voy).toBe('Voy')
  })

  it('"me_interesa" -> "Me interesa"', () => {
    expect(ETIQUETAS_ASISTENCIA.me_interesa).toBe('Me interesa')
  })
})

describe('textoBoton', () => {
  const tipos: TipoAsistencia[] = ['voy', 'me_interesa']

  it.each(tipos)('%s, debajo del umbral (0): sin número', (tipo) => {
    expect(textoBoton(tipo, 0)).toBe(ETIQUETAS_ASISTENCIA[tipo])
  })

  it.each(tipos)('%s, justo debajo del umbral (2): sin número', (tipo) => {
    expect(textoBoton(tipo, 2)).toBe(ETIQUETAS_ASISTENCIA[tipo])
  })

  it.each(tipos)('%s, en el umbral (3): con número', (tipo) => {
    expect(textoBoton(tipo, 3)).toBe(`${ETIQUETAS_ASISTENCIA[tipo]} · 3`)
  })

  it.each(tipos)('%s, por arriba del umbral (5): con número', (tipo) => {
    expect(textoBoton(tipo, 5)).toBe(`${ETIQUETAS_ASISTENCIA[tipo]} · 5`)
  })

  it('"voy" con 5: "Voy · 5" (el ejemplo exacto del enunciado)', () => {
    expect(textoBoton('voy', 5)).toBe('Voy · 5')
  })
})
