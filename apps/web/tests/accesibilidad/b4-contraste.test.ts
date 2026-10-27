/**
 * B4 (accesibilidad): el contraste de cada color que cambió, calculado de
 * verdad (WCAG 1.4.3, AA: 4,5:1 para texto normal) contra el fondo real en
 * el tema en que se ve.
 *
 * - Los tokens del tema (`--background`, `--card`, `--primary`, …) se leen
 *   de app/globals.css, de `:root` (claro) y de `.dark` (oscuro).
 * - Los colores de Tailwind (`emerald-700`, `red-400`, …) se leen de
 *   tailwindcss/theme.css, el mismo archivo que usa el build.
 * - Los fondos translúcidos (`bg-card/80`, `bg-primary/10`) se componen en
 *   sRGB, como los pinta el navegador (y como los mide axe).
 * - Cada par además verifica que la clase esté en el archivo: si alguien
 *   cambia el color en el componente, este test deja de describir el código
 *   y se pone en rojo.
 *
 * Los "antes" de los comentarios son los de la auditoría B1 (axe 4.14 sobre
 * un build local): docs/auditoria-web-27-10.md.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { CLASES_TEXTO_ERROR } from '@/lib/accesibilidad/formularios'

type RGB = [number, number, number]

const ROOT = join(__dirname, '..', '..')
const leer = (ruta: string) => readFileSync(join(ROOT, ruta), 'utf8')
const CSS = leer('app/globals.css')
const TAILWIND = readFileSync(createRequire(import.meta.url).resolve('tailwindcss/theme.css'), 'utf8')

// --- color --------------------------------------------------------------

/** oklch -> sRGB 0..255 (OKLab de Björn Ottosson), recortado al gamut. */
function oklch(L: number, C: number, h: number): RGB {
  const a = C * Math.cos((h * Math.PI) / 180)
  const b = C * Math.sin((h * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const lineal = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  return lineal.map((x) => {
    const v = Math.min(1, Math.max(0, x))
    return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)
  }) as RGB
}

function parsearOklch(valor: string): RGB {
  const m = /oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*\)/.exec(valor)
  if (!m) throw new Error(`no es oklch: ${valor}`)
  const L = Number(m[1]) / (m[2] ? 100 : 1)
  return oklch(L, Number(m[3]), Number(m[4]))
}

const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB
const BLANCO: RGB = [255, 255, 255]
const NEGRO: RGB = [0, 0, 0]

/** `fg` con opacidad `alfa` encima de `bg` (composición en sRGB, como el navegador). */
const sobre = (fg: RGB, alfa: number, bg: RGB): RGB => fg.map((v, i) => v * alfa + bg[i] * (1 - alfa)) as RGB

function luminancia(c: RGB): number {
  const [r, g, b] = c.map((v) => {
    const x = v / 255
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contraste(a: RGB, b: RGB): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

// --- tokens -------------------------------------------------------------

function bloque(selector: ':root' | '.dark'): string {
  const inicio = CSS.indexOf(`\n${selector} {`)
  if (inicio < 0) throw new Error(`falta ${selector} en globals.css`)
  return CSS.slice(inicio, CSS.indexOf('}', inicio))
}

function token(tema: 'claro' | 'oscuro', nombre: string): RGB {
  const m = new RegExp(String.raw`--${nombre}:\s*(oklch\([^)]+\))`).exec(bloque(tema === 'claro' ? ':root' : '.dark'))
  if (!m) throw new Error(`falta --${nombre} en ${tema}`)
  return parsearOklch(m[1])
}

function tw(nombre: string): RGB {
  const m = new RegExp(String.raw`--color-${nombre}:\s*(oklch\([^)]+\))`).exec(TAILWIND)
  if (!m) throw new Error(`falta --color-${nombre} en tailwindcss/theme.css`)
  return parsearOklch(m[1])
}

const claro = (n: string) => token('claro', n)
const oscuro = (n: string) => token('oscuro', n)

// El rojo de texto para fondos oscuros que usa B4 en vez de `--primary`
// (#db373a) cuando el fondo no es `--background` puro.
const ROJO_TEXTO_OSCURO = hex('#E8555A')
const ROJO_MARCA = hex('#C12026')

// Superficies compuestas.
const pieClaro = sobre(claro('card'), 0.8, claro('background')) // footer: bg-card/80
const pieOscuro = sobre(oscuro('card'), 0.8, oscuro('background'))
// Barras translúcidas (header y barra inferior: bg-background/60 con blur)
// sobre lo peor que puede haber abajo, una tarjeta.
const barraOscura = sobre(oscuro('background'), 0.6, oscuro('card'))
const barraClara = sobre(claro('background'), 0.6, claro('card'))

interface Par {
  nombre: string
  archivo: string
  /** Texto que tiene que estar en el archivo (la clase que da el color). */
  clase: string
  texto: RGB
  fondo: RGB
  minimo?: number
}

const PARES: Par[] = [
  // Pie (todas las páginas). Antes en oscuro: 3,32 / 4,1 / 4,38.
  { nombre: 'pie "Que pinta?" oscuro', archivo: 'components/footer.tsx', clase: 'text-[#C12026] dark:text-[#E8555A]', texto: ROJO_TEXTO_OSCURO, fondo: pieOscuro },
  { nombre: 'pie "Que pinta?" claro', archivo: 'components/footer.tsx', clase: 'text-[#C12026] dark:text-[#E8555A]', texto: ROJO_MARCA, fondo: pieClaro },
  { nombre: 'pie "Contactame" oscuro', archivo: 'components/footer.tsx', clase: 'text-primary dark:text-[#E8555A]', texto: ROJO_TEXTO_OSCURO, fondo: sobre(oscuro('primary'), 0.1, pieOscuro) },
  { nombre: 'pie "Contactame" oscuro, hover (bg-primary/20)', archivo: 'components/footer.tsx', clase: 'hover:bg-primary/20', texto: ROJO_TEXTO_OSCURO, fondo: sobre(oscuro('primary'), 0.2, pieOscuro) },
  { nombre: 'pie "Contactame" claro', archivo: 'components/footer.tsx', clase: 'bg-primary/10', texto: claro('primary'), fondo: sobre(claro('primary'), 0.1, pieClaro) },
  { nombre: 'pie autor oscuro', archivo: 'components/footer.tsx', clase: 'font-medium text-primary dark:text-[#E8555A]', texto: ROJO_TEXTO_OSCURO, fondo: pieOscuro },
  { nombre: 'pie autor oscuro, hover', archivo: 'components/footer.tsx', clase: 'dark:hover:text-red-300', texto: tw('red-300'), fondo: pieOscuro },

  // Navbar (desde sm:) y barra inferior. Antes, "Radar" activo: 4,43.
  { nombre: 'navbar "Que pinta?" oscuro', archivo: 'components/navbar.tsx', clase: 'text-[#C12026] dark:text-[#E8555A]', texto: ROJO_TEXTO_OSCURO, fondo: barraOscura },
  { nombre: 'navbar "Que pinta?" claro', archivo: 'components/navbar.tsx', clase: 'text-[#C12026] dark:text-[#E8555A]', texto: ROJO_MARCA, fondo: barraClara },
  { nombre: 'barra inferior, ítem activo oscuro', archivo: 'components/mobile-nav.tsx', clase: '"text-primary dark:text-[#E8555A]"', texto: ROJO_TEXTO_OSCURO, fondo: barraOscura },
  { nombre: 'barra inferior, ítem activo claro', archivo: 'components/mobile-nav.tsx', clase: '"text-primary dark:text-[#E8555A]"', texto: claro('primary'), fondo: barraClara },

  // "Saltar al contenido": colores del tema.
  { nombre: 'saltar al contenido oscuro', archivo: 'components/navbar.tsx', clase: 'focus:bg-background', texto: oscuro('foreground'), fondo: oscuro('background') },
  { nombre: 'saltar al contenido claro', archivo: 'components/navbar.tsx', clase: 'focus:text-foreground', texto: claro('foreground'), fondo: claro('background') },

  // Aviso de cookies (bg-card/95).
  { nombre: 'cookies "Más info" oscuro', archivo: 'components/consent-banner.tsx', clase: 'text-primary dark:text-[#E8555A]', texto: ROJO_TEXTO_OSCURO, fondo: sobre(oscuro('card'), 0.95, oscuro('background')) },
  { nombre: 'cookies "Más info" oscuro, hover', archivo: 'components/consent-banner.tsx', clase: 'dark:hover:text-red-300', texto: tw('red-300'), fondo: sobre(oscuro('card'), 0.95, oscuro('background')) },

  // Ingreso, alta y recuperar: links sobre la tarjeta. Antes en oscuro: 4,32.
  ...['app/auth/login/page.tsx', 'app/auth/sign-up/page.tsx'].flatMap((archivo) => [
    { nombre: `${archivo}: links oscuro`, archivo, clase: 'text-primary dark:text-[#E8555A] underline', texto: ROJO_TEXTO_OSCURO, fondo: oscuro('card') },
    { nombre: `${archivo}: links claro`, archivo, clase: 'text-primary dark:text-[#E8555A] underline', texto: claro('primary'), fondo: claro('card') },
  ]),
  ...['app/auth/login/page.tsx', 'app/auth/recuperar/page.tsx'].map((archivo) => ({
    nombre: `${archivo}: "Que pinta?" oscuro`,
    archivo,
    clase: 'text-[#C12026] dark:text-[#E8555A]',
    texto: ROJO_TEXTO_OSCURO,
    fondo: oscuro('background'),
  })),

  // Errores de formulario (bg-destructive/10 sobre la tarjeta). Antes:
  // text-destructive, 4,0 en claro y 1,9 en oscuro.
  { nombre: 'error de formulario claro', archivo: 'lib/accesibilidad/formularios.ts', clase: 'text-red-700', texto: tw('red-700'), fondo: sobre(claro('destructive'), 0.1, claro('card')) },
  { nombre: 'error de formulario oscuro', archivo: 'lib/accesibilidad/formularios.ts', clase: 'dark:text-red-400', texto: tw('red-400'), fondo: sobre(oscuro('destructive'), 0.1, oscuro('card')) },
  // Cambio de contraseña: la tarjeta es bg-card/60.
  { nombre: 'contraseña: éxito claro', archivo: 'components/change-password-form.tsx', clase: 'text-green-800 dark:text-green-400', texto: tw('green-800'), fondo: sobre(tw('green-500'), 0.1, sobre(claro('card'), 0.6, claro('background'))) },
  { nombre: 'contraseña: éxito oscuro', archivo: 'components/change-password-form.tsx', clase: 'text-green-800 dark:text-green-400', texto: tw('green-400'), fondo: sobre(tw('green-500'), 0.1, sobre(oscuro('card'), 0.6, oscuro('background'))) },

  // /favoritos. Antes: WhatsApp 3,65 (los dos temas); "Plan flexible" 4,27
  // en oscuro; los días 4,41 en oscuro.
  { nombre: 'favoritos: WhatsApp', archivo: 'app/favoritos/favoritos-list.tsx', clase: 'bg-emerald-700 hover:bg-emerald-800 text-white', texto: BLANCO, fondo: tw('emerald-700') },
  { nombre: 'favoritos: WhatsApp hover', archivo: 'app/favoritos/favoritos-list.tsx', clase: 'hover:bg-emerald-800', texto: BLANCO, fondo: tw('emerald-800') },
  { nombre: 'favoritos: "Plan flexible" claro', archivo: 'app/favoritos/favoritos-list.tsx', clase: 'text-zinc-500 dark:text-zinc-400', texto: tw('zinc-500'), fondo: claro('background') },
  { nombre: 'favoritos: "Plan flexible" oscuro', archivo: 'app/favoritos/favoritos-list.tsx', clase: 'text-zinc-500 dark:text-zinc-400', texto: tw('zinc-400'), fondo: oscuro('background') },
  { nombre: 'favoritos: día oscuro', archivo: 'app/favoritos/favoritos-list.tsx', clase: 'text-primary dark:text-[#E8555A] uppercase', texto: ROJO_TEXTO_OSCURO, fondo: sobre(oscuro('primary'), 0.05, oscuro('background')) },
  { nombre: 'favoritos: día claro', archivo: 'app/favoritos/favoritos-list.tsx', clase: 'text-primary dark:text-[#E8555A] uppercase', texto: claro('primary'), fondo: sobre(claro('primary'), 0.05, claro('background')) },

  // Radar: chips de lugares e Instagram (dentro de la sección bg-card/30).
  // Antes, en claro: emerald-300 a 1,08.
  { nombre: 'radar: chip de lugar claro', archivo: 'components/radar-form.tsx', clase: 'bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300', texto: tw('emerald-800'), fondo: tw('emerald-50') },
  { nombre: 'radar: chip de lugar oscuro', archivo: 'components/radar-form.tsx', clase: 'text-emerald-800 dark:text-emerald-300', texto: tw('emerald-300'), fondo: sobre(tw('emerald-950'), 0.2, sobre(oscuro('card'), 0.3, oscuro('background'))) },
  { nombre: 'radar: chip de Instagram claro', archivo: 'components/radar-form.tsx', clase: 'bg-pink-50 dark:bg-pink-950/20 border border-pink-200 dark:border-pink-800/40 text-pink-800 dark:text-pink-300', texto: tw('pink-800'), fondo: tw('pink-50') },
  { nombre: 'radar: chip de Instagram oscuro', archivo: 'components/radar-form.tsx', clase: 'text-pink-800 dark:text-pink-300', texto: tw('pink-300'), fondo: sobre(tw('pink-950'), 0.2, sobre(oscuro('card'), 0.3, oscuro('background'))) },
  // Sugerencias del buscador (popover; hover: bg-muted).
  { nombre: 'radar: sugerencia "Lugar" claro (hover)', archivo: 'components/radar-form.tsx', clase: 'text-emerald-800 dark:text-emerald-400', texto: tw('emerald-800'), fondo: sobre(tw('emerald-500'), 0.05, claro('muted')) },
  { nombre: 'radar: sugerencia "Instagram" claro (hover)', archivo: 'components/radar-form.tsx', clase: 'text-pink-800 dark:text-pink-400', texto: tw('pink-800'), fondo: sobre(tw('pink-500'), 0.05, claro('muted')) },
  { nombre: 'radar: sugerencia "Lugar" oscuro', archivo: 'components/radar-form.tsx', clase: 'text-emerald-800 dark:text-emerald-400', texto: tw('emerald-400'), fondo: sobre(tw('emerald-500'), 0.05, oscuro('popover')) },
  { nombre: 'radar: sugerencia "Instagram" oscuro', archivo: 'components/radar-form.tsx', clase: 'text-pink-800 dark:text-pink-400', texto: tw('pink-400'), fondo: sobre(tw('pink-500'), 0.05, oscuro('popover')) },

  // Capa de hover de la tarjeta: negra (bg-black/95) en los dos temas.
  // Antes el rótulo era text-primary: en claro, #a20519 sobre negro (~2,4).
  { nombre: 'tarjeta: rótulo de la capa (sobre fondo claro)', archivo: 'components/event-card.tsx', clase: 'text-xs font-bold text-[#E8555A]', texto: ROJO_TEXTO_OSCURO, fondo: sobre(NEGRO, 0.95, BLANCO) },
  { nombre: 'tarjeta: rótulo de la capa (sobre fondo oscuro)', archivo: 'components/event-card.tsx', clase: 'text-xs font-bold text-[#E8555A]', texto: ROJO_TEXTO_OSCURO, fondo: sobre(NEGRO, 0.95, oscuro('card')) },
]

describe('la función de contraste (anclas)', () => {
  it('negro sobre blanco es 21', () => {
    expect(contraste(NEGRO, BLANCO)).toBeCloseTo(21, 5)
  })
  it('reproduce los números de axe de la auditoría B1', () => {
    // "Que pinta?" #C12026 sobre el pie oscuro: axe dio 3,32.
    expect(contraste(ROJO_MARCA, pieOscuro)).toBeCloseTo(3.32, 1)
    // WhatsApp, blanco sobre emerald-600: axe dio 3,65.
    expect(contraste(BLANCO, tw('emerald-600'))).toBeCloseTo(3.65, 1)
    // Links del ingreso, --primary oscuro sobre --card: axe dio 4,32.
    expect(contraste(oscuro('primary'), oscuro('card'))).toBeCloseTo(4.32, 1)
    // "Plan flexible", zinc-500 sobre el fondo oscuro: axe dio 4,27.
    expect(contraste(tw('zinc-500'), oscuro('background'))).toBeCloseTo(4.27, 1)
  })
  it('la composición de un fondo translúcido queda entre los dos colores', () => {
    const gris = sobre(BLANCO, 0.5, NEGRO)
    expect(gris[0]).toBeCloseTo(127.5, 5)
  })
})

describe('contraste AA (4,5:1) de cada color que cambió en B4', () => {
  for (const par of PARES) {
    it(par.nombre, () => {
      expect(leer(par.archivo)).toContain(par.clase)
      expect(contraste(par.texto, par.fondo)).toBeGreaterThanOrEqual(par.minimo ?? 4.5)
    })
  }

  it('las clases del error de formulario son las que se prueban arriba', () => {
    expect(CLASES_TEXTO_ERROR).toBe('text-red-700 dark:text-red-400')
    for (const archivo of [
      'app/auth/login/page.tsx',
      'app/auth/sign-up/page.tsx',
      'app/auth/recuperar/page.tsx',
      'components/change-password-form.tsx',
    ]) {
      const src = leer(archivo)
      expect(src).toContain('CLASES_TEXTO_ERROR')
      expect(src).not.toMatch(/text-destructive"/)
    }
  })

  it('ningún texto de los archivos tocados queda con el rojo de marca como estilo inline (no tiene variante de tema)', () => {
    for (const archivo of ['components/footer.tsx', 'components/navbar.tsx', 'app/auth/login/page.tsx', 'app/auth/recuperar/page.tsx']) {
      expect(leer(archivo)).not.toMatch(/color:\s*'#C12026'/)
    }
  })
})
