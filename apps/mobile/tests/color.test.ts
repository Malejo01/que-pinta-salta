// 24-c: `oklchToHex` (lib/color.ts) con valores conocidos y con una
// implementación de referencia independiente para el caso con croma, así
// esta suite no se limita a repetir la cuenta del propio módulo.
//
// La implementación de referencia usa la misma matriz que cita el propio
// `lib/color.ts` en su comentario de cabecera: la de Björn Ottosson /
// CSS Color 4 (https://bottosson.github.io/posts/oklab/, §13.1 "sample
// code" de https://www.w3.org/TR/css-color-4/#color-conversion-code),
// escrita de nuevo acá a mano (no se importa `lib/color.ts` dentro de
// ella) para poder detectar un error en la matriz o en el gamma del
// archivo bajo prueba.
import { describe, expect, it } from 'vitest'
import { oklchToHex } from '../lib/color'

function referenciaOklchAHex(l: number, c: number, hGrados: number): string {
  const hRad = (hGrados * Math.PI) / 180
  const a = c * Math.cos(hRad)
  const b = c * Math.sin(hRad)

  const lPrima = l + 0.3963377774 * a + 0.2158037573 * b
  const mPrima = l - 0.1055613458 * a - 0.0638541728 * b
  const sPrima = l - 0.0894841775 * a - 1.2914855480 * b

  const lCubo = lPrima ** 3
  const mCubo = mPrima ** 3
  const sCubo = sPrima ** 3

  const rLineal = 4.0767416621 * lCubo - 3.3077115913 * mCubo + 0.2309699292 * sCubo
  const gLineal = -1.2684380046 * lCubo + 2.6097574011 * mCubo - 0.3413193965 * sCubo
  const bLineal = -0.0041960863 * lCubo - 0.7034186147 * mCubo + 1.7076147010 * sCubo

  function gamma(valor: number): number {
    const v = Math.min(1, Math.max(0, valor))
    return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
  }
  function aByte(valor: number): string {
    return Math.min(255, Math.max(0, Math.round(valor * 255)))
      .toString(16)
      .padStart(2, '0')
  }

  return `#${aByte(gamma(rLineal))}${aByte(gamma(gLineal))}${aByte(gamma(bLineal))}`
}

describe('oklchToHex', () => {
  it('blanco: oklch(1 0 0) -> #ffffff', () => {
    expect(oklchToHex('oklch(1 0 0)')).toBe('#ffffff')
  })

  it('negro: oklch(0 0 0) -> #000000', () => {
    expect(oklchToHex('oklch(0 0 0)')).toBe('#000000')
  })

  it('gris oklch(0.5 0 0): coincide con la fórmula de referencia', () => {
    const esperado = referenciaOklchAHex(0.5, 0, 0)
    expect(oklchToHex('oklch(0.5 0 0)')).toBe(esperado)
    // Con croma 0 la conversión OKLab->LMS->sRGB-lineal es la identidad en
    // los tres canales (la suma de cada fila de la matriz LMS->sRGB-lineal
    // da 1), así que r, g y b lineales son iguales: el resultado tiene que
    // ser un gris puro (mismo byte en los tres canales).
    expect(esperado).toMatch(/^#([0-9a-f]{2})\1\1$/)
  })

  it('con croma dentro de sRGB, oklch(0.45 0.18 25) (el --primary claro de la web): coincide con la fórmula de referencia', () => {
    // Mismo texto que `TOKENS_CLARO.primary` en lib/theme.ts / --primary de
    // apps/web/app/globals.css: un valor real del sistema, no inventado.
    const esperado = referenciaOklchAHex(0.45, 0.18, 25)
    expect(oklchToHex('oklch(0.45 0.18 25)')).toBe(esperado)
  })

  it('acepta L en porcentaje con el mismo resultado que en fracción', () => {
    expect(oklchToHex('oklch(50% 0 0)')).toBe(oklchToHex('oklch(0.5 0 0)'))
  })

  it('ignora el canal alfa si viene presente', () => {
    expect(oklchToHex('oklch(0.45 0.18 25 / 0.5)')).toBe(oklchToHex('oklch(0.45 0.18 25)'))
  })

  it('acepta espacios de más entre los números y OKLCH en mayúsculas', () => {
    expect(oklchToHex('  OKLCH(1   0   0)  ')).toBe('#ffffff')
  })

  // Hallazgo (no es un caso pedido por la tarea, lo encontré al probar
  // espacios de más): OKLCH_RE no acepta un espacio entre el último número
  // y el paréntesis de cierre salvo que haya un canal alfa (`/ ...`) — el
  // grupo opcional de alfa es el único lugar de la regex con `\s*` antes de
  // `\)`. CSS Color 4 sí permite ese espacio. No afecta a esta app hoy
  // (ningún texto de lib/theme.ts ni de globals.css lo tiene), así que lo
  // dejo documentado en vez de forzar un cambio en lib/color.ts.
  it('con un espacio antes del paréntesis de cierre (sin alfa), tira (ver comentario arriba)', () => {
    expect(() => oklchToHex('oklch(1 0 0 )')).toThrow()
  })

  it('tira si el texto no tiene el formato oklch(...)', () => {
    expect(() => oklchToHex('rgb(255, 0, 0)')).toThrow()
    expect(() => oklchToHex('')).toThrow()
    expect(() => oklchToHex('oklch(1 0)')).toThrow()
  })
})
