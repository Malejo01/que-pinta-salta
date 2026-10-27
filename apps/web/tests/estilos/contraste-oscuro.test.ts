// Contraste del tema oscuro (QPS-326, WCAG 1.4.3): `--primary` se usa para
// texto chico (etiqueta activa de la barra inferior, links `text-sm`) sobre
// `--background`, y como fondo de botones con `--primary-foreground`.
// Lee app/globals.css del disco, convierte oklch -> sRGB (OKLab de Ottosson) y
// calcula la razón de contraste WCAG. Sin red ni base.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const CSS = readFileSync(join(__dirname, '..', '..', 'app', 'globals.css'), 'utf8')

function bloqueDark(): string {
  const inicio = CSS.indexOf('\n.dark {')
  if (inicio < 0) throw new Error('falta el bloque .dark')
  return CSS.slice(inicio, CSS.indexOf('}', inicio))
}

function oklchDe(nombre: string): [number, number, number] {
  const m = new RegExp(String.raw`--${nombre}:\s*oklch\(([^)]+)\)`).exec(bloqueDark())
  if (!m) throw new Error(`falta --${nombre} (oklch) en .dark`)
  const [L, C, h] = m[1].trim().split(/\s+/).map(Number)
  return [L, C, h]
}

const recorta = (x: number) => Math.min(1, Math.max(0, x))

/** oklch -> sRGB lineal recortado a [0,1] (OKLab de Björn Ottosson). */
function oklchALineal([L, C, h]: [number, number, number]): [number, number, number] {
  const a = C * Math.cos((h * Math.PI) / 180)
  const b = C * Math.sin((h * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    recorta(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    recorta(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    recorta(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}

const luminancia = (c: [number, number, number]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

function contraste(a: [number, number, number], b: [number, number, number]): number {
  const la = luminancia(oklchALineal(a))
  const lb = luminancia(oklchALineal(b))
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

describe('conversión oklch -> luminancia (ancla)', () => {
  it('blanco y negro', () => {
    expect(luminancia(oklchALineal([1, 0, 0]))).toBeCloseTo(1, 3)
    expect(luminancia(oklchALineal([0, 0, 0]))).toBeCloseTo(0, 6)
  })
  it('contraste negro/blanco es 21', () => {
    expect(contraste([1, 0, 0], [0, 0, 0])).toBeCloseTo(21, 1)
  })
  it('gris 0.1 tiene luminancia 0.001', () => {
    expect(luminancia(oklchALineal([0.1, 0, 0]))).toBeCloseTo(0.001, 4)
  })
})

describe('tema oscuro: contraste de --primary (WCAG 1.4.3)', () => {
  const primary = oklchDe('primary')
  const fondo = oklchDe('background')
  const blanco = oklchDe('primary-foreground')
  const card = oklchDe('card')

  it('--primary sobre --background >= 4.5 (texto chico)', () => {
    expect(contraste(primary, fondo)).toBeGreaterThanOrEqual(4.5)
  })
  it('--primary-foreground sobre --primary >= 4.5 (botones)', () => {
    expect(contraste(blanco, primary)).toBeGreaterThanOrEqual(4.5)
  })
  it('--primary sobre --card >= 3 (informativo: componentes de UI)', () => {
    expect(contraste(primary, card)).toBeGreaterThanOrEqual(3)
  })
})
