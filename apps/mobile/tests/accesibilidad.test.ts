// 46-a: base pura de accesibilidad (lib/accesibilidad.ts). Contraste WCAG
// 2.x, hitSlop mínimo (48dp, guía de Android) y tope de escala de fuente
// para cajas de tamaño fijo. El test de contraste sobre los tokens reales de
// la app (COLORES_CLARO/COLORES_OSCURO) vive aparte, en
// tests/contraste.test.ts.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  AREA_TACTIL_MINIMA,
  ESCALA_MAXIMA_COMPACTA,
  contraste,
  cumpleContraste,
  hitSlopPara,
  luminanciaRelativa,
  tamanioConEscala,
} from '../lib/accesibilidad'

describe('AREA_TACTIL_MINIMA', () => {
  it('es 48 (guía de Android)', () => {
    expect(AREA_TACTIL_MINIMA).toBe(48)
  })
})

describe('hitSlopPara', () => {
  it('40 (cuadrado): 4 en los cuatro lados', () => {
    expect(hitSlopPara(40)).toEqual({ top: 4, bottom: 4, left: 4, right: 4 })
  })

  it('48 (ya llega): los cuatro en 0', () => {
    expect(hitSlopPara(48)).toEqual({ top: 0, bottom: 0, left: 0, right: 0 })
  })

  it('50 (pasado): los cuatro en 0, nunca negativo', () => {
    expect(hitSlopPara(50)).toEqual({ top: 0, bottom: 0, left: 0, right: 0 })
  })

  it('(20, 6): left/right 14, top/bottom 21', () => {
    expect(hitSlopPara(20, 6)).toEqual({ top: 21, bottom: 21, left: 14, right: 14 })
  })

  it('redondea hacia arriba con un lado impar (7): faltante 41, mitad 20,5 -> 21', () => {
    // ancho=7 (impar): faltanteHorizontal = 48-7 = 41, 41/2 = 20,5 -> ceil 21.
    // alto=48 ya llega: faltanteVertical = 0.
    expect(hitSlopPara(7, 48)).toEqual({ top: 0, bottom: 0, left: 21, right: 21 })
  })

  it('con un solo argumento, alto es igual a ancho (elemento cuadrado)', () => {
    expect(hitSlopPara(44)).toEqual(hitSlopPara(44, 44))
  })
})

describe('luminanciaRelativa / contraste', () => {
  it('contraste(#000000, #ffffff) da 21', () => {
    expect(contraste('#000000', '#ffffff')).toBe(21)
  })

  it('contraste(x, x) da 1, sea cual sea x', () => {
    expect(contraste('#123456', '#123456')).toBe(1)
    expect(contraste('#ffffff', '#ffffff')).toBe(1)
    expect(contraste('#000000', '#000000')).toBe(1)
  })

  it('el orden de los argumentos no cambia el resultado', () => {
    expect(contraste('#777777', '#f0f0f0')).toBe(contraste('#f0f0f0', '#777777'))
  })

  it('luminanciaRelativa(#ffffff) es 1 y luminanciaRelativa(#000000) es 0', () => {
    expect(luminanciaRelativa('#ffffff')).toBe(1)
    expect(luminanciaRelativa('#000000')).toBe(0)
  })

  it('tira con un hex de 3 dígitos (#fff), no lo acepta en silencio', () => {
    expect(() => luminanciaRelativa('#fff')).toThrow()
    expect(() => contraste('#fff', '#000000')).toThrow()
  })

  it('tira con rgb(...)', () => {
    expect(() => luminanciaRelativa('rgb(255, 255, 255)')).toThrow()
  })

  it('tira con oklch(...)', () => {
    expect(() => luminanciaRelativa('oklch(1 0 0)')).toThrow()
  })

  it('tira con una cadena vacía', () => {
    expect(() => luminanciaRelativa('')).toThrow()
  })

  it('tira con dígitos hex inválidos (#GGGGGG)', () => {
    expect(() => luminanciaRelativa('#GGGGGG')).toThrow()
  })
})

describe('cumpleContraste', () => {
  it("'texto' exige 4,5", () => {
    expect(cumpleContraste(4.5, 'texto')).toBe(true)
    expect(cumpleContraste(4.49, 'texto')).toBe(false)
  })

  it("'texto-grande' exige 3", () => {
    expect(cumpleContraste(3, 'texto-grande')).toBe(true)
    expect(cumpleContraste(2.99, 'texto-grande')).toBe(false)
  })

  it("'componente' exige 3", () => {
    expect(cumpleContraste(3, 'componente')).toBe(true)
    expect(cumpleContraste(2.99, 'componente')).toBe(false)
  })
})

describe('ESCALA_MAXIMA_COMPACTA', () => {
  it('es 1,4', () => {
    expect(ESCALA_MAXIMA_COMPACTA).toBe(1.4)
  })
})

describe('tamanioConEscala', () => {
  it('con tope (ESCALA_MAXIMA_COMPACTA): 14 x min(2, 1,4) = 19,6', () => {
    expect(tamanioConEscala(14, 2, ESCALA_MAXIMA_COMPACTA)).toBeCloseTo(19.6, 5)
  })

  it('sin tope: 14 x 2 = 28', () => {
    expect(tamanioConEscala(14, 2)).toBe(28)
  })

  it('con fontScale por debajo del tope, el tope no recorta nada', () => {
    expect(tamanioConEscala(14, 1, ESCALA_MAXIMA_COMPACTA)).toBe(14)
  })
})

// Mismo chequeo de texto que tests/dimensions.test.ts/tests/iconos.test.ts
// (lectura estática del archivo, sin montar nada de React Native): este
// módulo es puro, así que no tiene que importar react-native ni expo-*.
describe('lib/accesibilidad.ts: no importa react-native ni expo-*', () => {
  const SRC = readFileSync(fileURLToPath(new URL('../lib/accesibilidad.ts', import.meta.url)), 'utf8')

  it('no tiene ningún import/require de react-native', () => {
    expect(SRC).not.toMatch(/\bfrom\s+['"]react-native['"]/)
    expect(SRC).not.toMatch(/\brequire\(\s*['"]react-native['"]\s*\)/)
  })

  it('no tiene ningún import/require de expo-*', () => {
    expect(SRC).not.toMatch(/\bfrom\s+['"]expo-[^'"]*['"]/)
    expect(SRC).not.toMatch(/\brequire\(\s*['"]expo-[^'"]*['"]\s*\)/)
  })

  it('no usa allowFontScaling (esta tarea no lo toca)', () => {
    expect(SRC).not.toMatch(/allowFontScaling/)
  })
})
