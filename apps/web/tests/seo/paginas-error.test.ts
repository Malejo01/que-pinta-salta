import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { GONE_HTML } from '@/lib/seo/gone'
import { metadata } from '@/app/not-found'

/** oklch -> sRGB hex (Björn Ottosson). */
function oklchAHex(L: number, C: number, hDeg: number): string {
  const a = C * Math.cos((hDeg * Math.PI) / 180)
  const b = C * Math.sin((hDeg * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  return (
    '#' +
    lin
      .map((x) => {
        const c = Math.min(1, Math.max(0, x))
        const g = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
        return Math.round(g * 255).toString(16).padStart(2, '0')
      })
      .join('')
  )
}

const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')

function variable(bloque: ':root' | '.dark', nombre: string): string {
  const inicio = css.indexOf(`\n${bloque} {`)
  const fin = css.indexOf('}', inicio)
  const m = new RegExp(String.raw`--${nombre}:\s*oklch\(([^)]+)\)`).exec(css.slice(inicio, fin))
  if (!m) throw new Error(`falta --${nombre} en ${bloque}`)
  const [L, C, h] = m[1].trim().split(/\s+/).map(Number)
  return oklchAHex(L, C, h)
}

const NOMBRES = ['background', 'foreground', 'primary', 'primary-foreground', 'muted-foreground']

describe('GONE_HTML', () => {
  it('una sola meta robots, noindex', () => {
    expect(GONE_HTML.match(/<meta name="robots"/g)).toHaveLength(1)
    expect(GONE_HTML).toContain('<meta name="robots" content="noindex">')
  })

  it('modo oscuro y las dos salidas', () => {
    expect(GONE_HTML).toContain('@media (prefers-color-scheme: dark)')
    expect(GONE_HTML).toContain('href="/"')
    expect(GONE_HTML).toContain('href="/buscar"')
  })

  it('sin datos del evento ni del flyer', () => {
    expect(GONE_HTML).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i)
    expect(GONE_HTML).not.toMatch(/\$\{/)
  })

  it('los hex coinciden con los oklch de globals.css (claro y oscuro)', () => {
    const [claro, oscuro] = GONE_HTML.split('@media (prefers-color-scheme: dark)')
    for (const n of NOMBRES) {
      expect(claro).toContain(variable(':root', n))
      if (n !== 'primary-foreground') expect(oscuro).toContain(variable('.dark', n))
    }
    expect(oscuro).toContain(variable('.dark', 'primary-foreground'))
  })
})

describe('app/not-found', () => {
  it('exporta robots con noindex', () => {
    const robots = metadata.robots as { index?: boolean; follow?: boolean; googleBot?: { index?: boolean } }
    expect(robots.index).toBe(false)
    expect(robots.follow).toBe(true)
    expect(robots.googleBot?.index).toBe(false)
  })
})
