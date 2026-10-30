// A1 (nube Q1, ronda de correcciones): contraste de los bloques del esqueleto
// (`colorBloqueEsqueleto`/`colorBloqueEncima` de `lib/colores.ts`), mismo
// estilo que `tests/contraste.test.ts`: sobre los tokens reales de
// `lib/theme.ts`, en los dos esquemas (la beta es solo oscura, D1, pero claro
// queda probado para cuando llegue el selector de tema).
//
// No es un mínimo de WCAG (el esqueleto es decorado, no texto ni un control):
// es una banda. Por abajo (~1,2:1), para que el bloque se distinga del fondo y
// de `card` — el `muted` de antes daba ~1,14:1 y ~1,05:1 en el valle del pulso,
// y no se veía. Por arriba (~1,8:1), para que no compita con el contenido real
// que viene después. Se mide en el punto alto del pulso (opacidad 1) y en el
// valle (`OPACIDAD_MINIMA`): en el valle la capa entera (bloques y cajas
// `card`) se compone con opacidad sobre el fondo de `PantallaEsqueleto`
// (`background`), así que se comparan los dos colores ya mezclados.
import { describe, expect, it } from 'vitest'
import { contraste } from '../lib/accesibilidad'
import { colorBloqueEncima, colorBloqueEsqueleto } from '../lib/colores'
import { OPACIDAD_MAXIMA, OPACIDAD_MINIMA } from '../lib/esqueleto'
import { COLORES_CLARO, COLORES_OSCURO, type ColoresQPS } from '../lib/theme'

const CONTRASTE_MINIMO = 1.2
const CONTRASTE_MAXIMO = 1.8
/** Lo que va encima de un bloque (badge, líneas del Hero y del precio) solo
 * tiene que asomar sobre él; en el valle baja algo más que el bloque. */
const CONTRASTE_MINIMO_ENCIMA = 1.1

/** `hex` compuesto con `opacidad` sobre `fondo` (canal a canal, en sRGB,
 * como compone la opacidad de una vista). */
function sobreFondo(hex: string, fondo: string, opacidad: number): string {
  const canales = [1, 3, 5].map((i) => {
    const arriba = parseInt(hex.slice(i, i + 2), 16)
    const abajo = parseInt(fondo.slice(i, i + 2), 16)
    return Math.round(arriba * opacidad + abajo * (1 - opacidad))
      .toString(16)
      .padStart(2, '0')
  })
  return `#${canales.join('')}`
}

describe('sobreFondo (fixtures: tiene que fallar de verdad)', () => {
  it('opacidad 1 deja el color; 0 deja el fondo; 0,5 es el promedio', () => {
    expect(sobreFondo('#ffffff', '#000000', 1)).toBe('#ffffff')
    expect(sobreFondo('#ffffff', '#000000', 0)).toBe('#000000')
    expect(sobreFondo('#ffffff', '#000000', 0.5)).toBe('#808080')
  })
})

const ESQUEMAS: [string, ColoresQPS][] = [
  ['oscuro', COLORES_OSCURO],
  ['claro', COLORES_CLARO],
]

const OPACIDADES: [string, number][] = [
  ['punto alto del pulso', OPACIDAD_MAXIMA],
  ['valle del pulso', OPACIDAD_MINIMA],
]

describe.each(ESQUEMAS)('esqueleto en %s', (_nombre, colores) => {
  const bloque = colorBloqueEsqueleto(colores)
  const encima = colorBloqueEncima(colores)

  it('los colores son hex #rrggbb y distintos de los tokens (no es `muted` disfrazado)', () => {
    expect(bloque).toMatch(/^#[0-9a-f]{6}$/i)
    expect(encima).toMatch(/^#[0-9a-f]{6}$/i)
    expect(bloque).not.toBe(colores.muted)
    expect(encima).not.toBe(bloque)
  })

  describe.each(OPACIDADES)('%s', (_momento, opacidad) => {
    const enCapa = (hex: string) => sobreFondo(hex, colores.background, opacidad)

    it(`bloque sobre background: entre ${CONTRASTE_MINIMO} y ${CONTRASTE_MAXIMO}`, () => {
      const ratio = contraste(enCapa(bloque), colores.background)
      expect(ratio).toBeGreaterThanOrEqual(CONTRASTE_MINIMO)
      expect(ratio).toBeLessThanOrEqual(CONTRASTE_MAXIMO)
    })

    it(`bloque sobre card: entre ${CONTRASTE_MINIMO} y ${CONTRASTE_MAXIMO}`, () => {
      const ratio = contraste(enCapa(bloque), enCapa(colores.card))
      expect(ratio).toBeGreaterThanOrEqual(CONTRASTE_MINIMO)
      expect(ratio).toBeLessThanOrEqual(CONTRASTE_MAXIMO)
    })

    it(`lo de encima sobre el bloque: entre ${CONTRASTE_MINIMO_ENCIMA} y ${CONTRASTE_MAXIMO}`, () => {
      const ratio = contraste(enCapa(encima), enCapa(bloque))
      expect(ratio).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_ENCIMA)
      expect(ratio).toBeLessThanOrEqual(CONTRASTE_MAXIMO)
    })
  })
})

describe('el muted de antes no alcanzaba (por qué hicieron falta colores propios)', () => {
  it('oscuro: muted sobre background queda abajo del mínimo, y más en el valle', () => {
    const { muted, background } = COLORES_OSCURO
    expect(contraste(muted, background)).toBeLessThan(CONTRASTE_MINIMO)
    expect(contraste(sobreFondo(muted, background, OPACIDAD_MINIMA), background)).toBeLessThan(CONTRASTE_MINIMO)
  })
})
