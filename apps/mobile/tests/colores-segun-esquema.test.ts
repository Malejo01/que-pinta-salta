// 28-q, punto 8 (F2, 28-e, QPS-126): `coloresSegunEsquema` (lib/theme.ts) es
// pura (no importa react-native ni expo-*): `'dark'` da los tokens oscuros,
// cualquier otro valor (`'light'`, `null`, `undefined`) da los claros, con
// los 9 tokens de ColoresQPS presentes (incluidos `muted` y
// `primaryForeground`, que el diagnóstico de la ronda anterior señalaba
// como los que faltaban en algún lugar del tema, y `input`, sumado por
// 29-g para la paridad con la web).
import { describe, expect, it } from 'vitest'
import { coloresSegunEsquema, COLORES_CLARO, COLORES_OSCURO } from '../lib/theme'

const CLAVES_ESPERADAS = [
  'background',
  'foreground',
  'card',
  'primary',
  'primaryForeground',
  'muted',
  'mutedForeground',
  'border',
  'input',
] as const

describe('coloresSegunEsquema', () => {
  it("'dark' -> los tokens oscuros", () => {
    expect(coloresSegunEsquema('dark')).toEqual(COLORES_OSCURO)
  })

  it("'light' -> los tokens claros", () => {
    expect(coloresSegunEsquema('light')).toEqual(COLORES_CLARO)
  })

  it('null -> los tokens claros', () => {
    expect(coloresSegunEsquema(null)).toEqual(COLORES_CLARO)
  })

  it('undefined -> los tokens claros', () => {
    expect(coloresSegunEsquema(undefined)).toEqual(COLORES_CLARO)
  })

  it.each(['light', 'dark'] as const)('%s: están los 9 tokens, incluidos muted, primaryForeground e input', (esquema) => {
    const colores = coloresSegunEsquema(esquema)
    for (const clave of CLAVES_ESPERADAS) {
      expect(colores).toHaveProperty(clave)
      expect(typeof colores[clave]).toBe('string')
      expect(colores[clave].length).toBeGreaterThan(0)
    }
    expect(Object.keys(colores).sort()).toEqual([...CLAVES_ESPERADAS].sort())
  })

  it('claro y oscuro son objetos distintos (no el mismo objeto compartido)', () => {
    expect(coloresSegunEsquema('dark')).not.toBe(coloresSegunEsquema('light'))
  })
})
