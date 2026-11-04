/**
 * Q6-6 · Contraste y foco de lo nuevo de Q5/Q6 en la web (alta e ingreso,
 * perfil, carga de eventos, «Sumá un lugar» y el admin: lugares para chicos,
 * calidad, uso, sugerencias de ubicación y avisos), en tema claro y oscuro.
 *
 * Lee los tokens de `app/globals.css` (`:root` y `.dark`) y la paleta de
 * Tailwind (`tailwindcss/theme.css`) del disco, convierte oklch -> sRGB (OKLab
 * de Ottosson), compone las transparencias en sRGB como el navegador y calcula
 * la razón de contraste WCAG 2.x con una luminancia propia. Sin red ni base.
 *
 * Cada par dice dónde se usa. Los «antes» quedan como pruebas de que el valor
 * viejo de verdad no llegaba (si alguien vuelve a él, el detector de abajo lo marca).
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = join(__dirname, '..', '..')
const leer = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8')
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const CSS = leer('app/globals.css')
const PALETA = readFileSync(createRequire(import.meta.url).resolve('tailwindcss/theme.css'), 'utf8')

type Oklch = [number, number, number]
type Tema = 'claro' | 'oscuro'

function bloque(tema: Tema): string {
  const marca = tema === 'claro' ? ':root {' : '\n.dark {'
  const inicio = CSS.indexOf(marca)
  if (inicio < 0) throw new Error(`falta el bloque ${marca}`)
  return CSS.slice(inicio, CSS.indexOf('}', inicio))
}

function parsear(texto: string): Oklch {
  const [L, C, h] = texto.trim().split(/\s+/)
  return [L.endsWith('%') ? Number(L.slice(0, -1)) / 100 : Number(L), Number(C), Number(h)]
}

/** Un token del tema (`--background`, `--error`…). */
function token(nombre: string, tema: Tema): Oklch {
  const m = new RegExp(String.raw`--${nombre}:\s*oklch\(([^)]+)\)`).exec(bloque(tema))
  if (!m) throw new Error(`falta --${nombre} en ${tema}`)
  return parsear(m[1])
}

/** Un color de la paleta de Tailwind (`red-700`, `amber-800`…). */
function paleta(nombre: string): Oklch {
  const m = new RegExp(String.raw`--color-${nombre}:\s*oklch\(([^)]+)\)`).exec(PALETA)
  if (!m) throw new Error(`falta --color-${nombre} en tailwindcss/theme.css`)
  return parsear(m[1])
}

const recorta = (x: number) => Math.min(1, Math.max(0, x))

/** oklch -> sRGB lineal [0,1]. */
function lineal([L, C, h]: Oklch): [number, number, number] {
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
const aGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
const aLineal = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

type Lineal = [number, number, number]

/** `arriba` con opacidad `alfa` sobre `abajo`, compuesto en sRGB con gamma (como el navegador). */
function mezcla(arriba: Oklch | Lineal, alfa: number, abajo: Oklch | Lineal): Lineal {
  const a = aLin(arriba)
  const b = aLin(abajo)
  return a.map((c, i) => aLineal(aGamma(c) * alfa + aGamma(b[i]) * (1 - alfa))) as Lineal
}

/** Los colores se pasan como oklch (`{ oklch }`) o ya en sRGB lineal (`{ lineal }`), sin adivinar. */
type Color = { oklch: Oklch } | { lineal: Lineal }
const lin = (c: Lineal): Color => ({ lineal: c })
function aLin(c: Oklch | Lineal | Color): Lineal {
  if (Array.isArray(c)) return lineal(c as Oklch)
  return 'oklch' in c ? lineal(c.oklch) : c.lineal
}

const luminancia = ([r, g, b]: Lineal) => 0.2126 * r + 0.7152 * g + 0.0722 * b
function razon(a: Oklch | Color, b: Oklch | Color): number {
  const la = luminancia(aLin(a))
  const lb = luminancia(aLin(b))
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
const BLANCO: Oklch = [1, 0, 0]
const NEGRO: Oklch = [0, 0, 0]

describe('la cuenta (anclas)', () => {
  it('blanco/negro = 21; un gris oklch L tiene luminancia L³ (0.6 -> 0,216)', () => {
    expect(razon(BLANCO, NEGRO)).toBeCloseTo(21, 1)
    expect(luminancia(lineal([0.6, 0, 0]))).toBeCloseTo(0.216, 4)
  })
  it('componer al 50 % blanco sobre negro da el gris sRGB 0,5 (no el lineal)', () => {
    expect(luminancia(mezcla(BLANCO, 0.5, NEGRO))).toBeCloseTo(0.214, 2)
  })
})

describe.each(['claro', 'oscuro'] as const)('tema %s', (tema) => {
  const fondo = token('background', tema)
  const tarjeta = token('card', tema)
  const recuadroError = lin(mezcla(token('destructive', tema), 0.1, fondo))

  describe('texto de error (`text-error`): login, alta, contraseña, perfil, carga de eventos, «Sumá un lugar», admin', () => {
    const error = token('error', tema)
    it('>= 4,5 sobre el fondo, la tarjeta y el recuadro bg-destructive/10', () => {
      expect(razon(error, fondo)).toBeGreaterThanOrEqual(4.5)
      expect(razon(error, tarjeta)).toBeGreaterThanOrEqual(4.5)
      expect(razon(error, recuadroError)).toBeGreaterThanOrEqual(4.5)
    })
    it('antes: --destructive como texto no llegaba a 4,5 en el recuadro', () => {
      expect(razon(token('destructive', tema), recuadroError)).toBeLessThan(4.5)
    })
  })

  describe('foco (`outline-ring` del base y el anillo de Button)', () => {
    const ring = token('ring', tema)
    it('--ring entero >= 3 contra el fondo y la tarjeta (WCAG 1.4.11)', () => {
      expect(razon(ring, fondo)).toBeGreaterThanOrEqual(3)
      expect(razon(ring, tarjeta)).toBeGreaterThanOrEqual(3)
    })
    it('antes: --ring al 50 % no llegaba a 3 contra el fondo', () => {
      expect(razon(lin(mezcla(ring, 0.5, fondo)), fondo)).toBeLessThan(3)
    })
  })

  it('números del eje del gráfico de /admin/uso (--muted-foreground) >= 4,5 sobre el fondo', () => {
    expect(razon(token('muted-foreground', tema), fondo)).toBeGreaterThanOrEqual(4.5)
  })

  it('barras del gráfico (--primary) >= 3 sobre el fondo (WCAG 1.4.11, objetos gráficos)', () => {
    expect(razon(token('primary', tema), fondo)).toBeGreaterThanOrEqual(3)
  })

  it('«Lo que seguís», texto secundario (--muted-foreground) >= 4,5 sobre la tarjeta', () => {
    expect(razon(token('muted-foreground', tema), tarjeta)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('oscuro: el rojo de los links chicos sobre una tarjeta', () => {
  const tarjeta = token('card', 'oscuro')
  it('antes: --primary sobre la tarjeta no llega a 4,5 (perfil «Ver publicado», admin «Ver la sugerencia en OpenStreetMap»)', () => {
    expect(razon(token('primary', 'oscuro'), tarjeta)).toBeLessThan(4.5)
  })
  it('después: #F0585D (el de la barra inferior y el login) >= 4,5, también sobre bg-muted/30', () => {
    const f0585d = lin([0xf0, 0x58, 0x5d].map((c) => aLineal(c / 255)) as Lineal)
    expect(razon(f0585d, tarjeta)).toBeGreaterThanOrEqual(4.5)
    expect(razon(f0585d, lin(mezcla(token('muted', 'oscuro'), 0.3, tarjeta)))).toBeGreaterThanOrEqual(4.5)
  })
})

describe('perfil: el estado de cada evento (texto blanco sobre el badge, encima del flyer)', () => {
  // Los badges van sobre la foto: se mide sobre el peor caso (fondo blanco y negro).
  const ahora = ['amber-800', 'emerald-700', 'rose-700', 'slate-600']
  const antes: [string, number][] = [
    ['amber-500', 0.9],
    ['emerald-600', 0.9],
    ['rose-500', 0.9],
    ['slate-500', 0.9],
  ]
  it.each(ahora)('después: blanco sobre %s (sólido) >= 4,5', (color) => {
    expect(razon(BLANCO, paleta(color))).toBeGreaterThanOrEqual(4.5)
  })
  it.each(antes)('antes: blanco sobre %s al 90 % sobre un flyer blanco < 4,5', (color, alfa) => {
    expect(razon(BLANCO, lin(mezcla(paleta(color), alfa, BLANCO)))).toBeLessThan(4.5)
  })
})

describe('perfil › contraseña: el «Listo» en verde', () => {
  it('claro: green-800 >= 4,5 sobre el recuadro green-500/10 de la tarjeta (antes green-600: < 4,5)', () => {
    const recuadro = lin(mezcla(paleta('green-500'), 0.1, token('card', 'claro')))
    expect(razon(paleta('green-800'), recuadro)).toBeGreaterThanOrEqual(4.5)
    expect(razon(paleta('green-600'), recuadro)).toBeLessThan(4.5)
  })
  it('oscuro: green-400 >= 4,5 sobre el recuadro green-500/10 de la tarjeta', () => {
    expect(razon(paleta('green-400'), lin(mezcla(paleta('green-500'), 0.1, token('card', 'oscuro'))))).toBeGreaterThanOrEqual(4.5)
  })
})

// ---------------------------------------------------------------------------
// Detectores sobre el fuente (que nadie vuelva a lo de antes)
// ---------------------------------------------------------------------------

/** Las pantallas y componentes de Q6-6 que muestran errores. */
const ARCHIVOS_CON_ERRORES = [
  'app/auth/login/page.tsx',
  'app/auth/sign-up/page.tsx',
  'components/change-password-form.tsx',
  'app/perfil/pagina-perfil.tsx',
  'app/perfil/lo-que-seguis.tsx',
  'components/event-form.tsx',
  'components/lugares-chicos/formulario-sumar.tsx',
  'components/admin/lugares-chicos/ficha-form.tsx',
  'components/admin/lugares-chicos/acciones.tsx',
  'components/admin/lugares-chicos/pedidos.tsx',
  'app/admin/avisos/formulario-campania.tsx',
  'app/admin/avisos/formulario-aviso-equipo.tsx',
]

/** `text-destructive` como color de texto (no `text-destructive-foreground`). */
export function usosDeTextDestructive(codigo: string): number {
  return (sinComentarios(codigo).match(/(?<![\w-])text-destructive(?![\w-])/g) ?? []).length
}

describe('detector: el texto de error usa --error, no --destructive', () => {
  it('el tema define --color-error', () => {
    expect(CSS).toMatch(/--color-error:\s*var\(--error\)/)
  })
  it.each(ARCHIVOS_CON_ERRORES)('%s: sin text-destructive y con text-error', (rel) => {
    const codigo = leer(rel)
    expect(usosDeTextDestructive(codigo)).toBe(0)
    expect(codigo).toMatch(/\btext-error\b/)
  })
  it('rotura en memoria: text-destructive de vuelta -> detectado (y hover:/variantes también)', () => {
    expect(usosDeTextDestructive('<p className="text-sm text-destructive">x</p>')).toBe(1)
    expect(usosDeTextDestructive('<p className="hover:text-destructive">x</p>')).toBe(1)
    expect(usosDeTextDestructive('<p className="text-destructive-foreground">x</p>')).toBe(0)
  })
})

describe('detector: foco con --ring entero', () => {
  it('globals.css: el contorno por defecto es outline-ring (sin /50)', () => {
    const base = sinComentarios(CSS)
    expect(base).toMatch(/@apply border-border outline-ring;/)
    expect(base).not.toMatch(/outline-ring\/50/)
  })
  it('Button: anillo --ring entero, separado del botón, y sin el anillo propio de «destructive»', () => {
    const boton = sinComentarios(leer('components/ui/button.tsx'))
    expect(boton).toMatch(/focus-visible:ring-ring focus-visible:ring-\[3px\] focus-visible:ring-offset-2 focus-visible:ring-offset-background/)
    expect(boton).not.toMatch(/focus-visible:ring-ring\/50/)
    expect(boton).not.toMatch(/focus-visible:ring-destructive\//)
  })
})

describe('detector: perfil', () => {
  const perfil = sinComentarios(leer('app/perfil/pagina-perfil.tsx'))
  it('badges sólidos y oscuros (sin los 500–600 al 90 %)', () => {
    expect(perfil).not.toMatch(/bg-(amber|emerald|rose|slate)-\d+\/90/)
    for (const c of ['amber-800', 'emerald-700', 'rose-700', 'slate-600']) expect(perfil).toContain(`bg-${c} text-white`)
  })
  it('el pulso del ícono respeta «menos movimiento»', () => {
    expect(perfil).toMatch(/motion-safe:animate-pulse/)
    expect(perfil).not.toMatch(/[\s"]animate-pulse/)
  })
  it('«Ver publicado» con el rojo claro en oscuro', () => {
    expect(perfil).toMatch(/text-primary dark:text-\[#F0585D\] hover:underline/)
  })
})

describe('detector: el <h1> queda dentro del <main id="contenido"> (destino de «Saltar al contenido»)', () => {
  it.each(['app/perfil/pagina-perfil.tsx', 'components/event-form.tsx'])('%s', (rel) => {
    const c = sinComentarios(leer(rel))
    const main = c.indexOf('<main id="contenido"')
    expect(main).toBeGreaterThan(-1)
    expect(c.indexOf('<h1')).toBeGreaterThan(main)
    expect(c.match(/<main\b/g)?.length).toBe(1)
  })
})

describe('detector: admin', () => {
  it('/admin/lugares: el link a OpenStreetMap de la sugerencia, con el texto visible al principio del nombre (WCAG 2.5.3)', () => {
    const c = sinComentarios(leer('app/admin/lugares/page.tsx'))
    expect(c).not.toMatch(/aria-label=\{`Ver en OpenStreetMap la ubicación sugerida/)
    expect(c).toMatch(/Ver la sugerencia en OpenStreetMap\s*<span className="sr-only">: \{venue\.name\}, se abre en otra pestaña<\/span>/)
    expect(c).toMatch(/text-primary dark:text-\[#F0585D\] hover:underline/)
  })
  it('/admin/avisos: cada aria-describedby apunta a un id que existe en el mismo archivo', () => {
    for (const rel of ['app/admin/avisos/formulario-campania.tsx', 'app/admin/avisos/formulario-aviso-equipo.tsx']) {
      const c = leer(rel)
      const ids = [...c.matchAll(/'([\w-]+-(?:error|no-reconocido))'/g)].map((m) => m[1])
      expect(ids.length, rel).toBeGreaterThan(0)
      for (const id of ids) expect(c, `${rel}: falta id="${id}"`).toContain(`id="${id}"`)
      expect(c).toMatch(/aria-invalid=\{/)
    }
  })
  it('/admin/lugares-chicos: la lista de la pestaña tiene su <h2>', () => {
    expect(sinComentarios(leer('app/admin/lugares-chicos/page.tsx'))).toMatch(/<h2 className="sr-only">\s*\{PESTAÑAS_LUGARES_CHICOS\.find/)
  })
})
