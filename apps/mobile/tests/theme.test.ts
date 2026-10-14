// 24-c: `lib/theme.ts` tiene que llevar el mismo texto `oklch(...)` que
// `apps/web/app/globals.css` (:root para claro, .dark para oscuro, un
// token a la vez) y el hex de cada token tiene que ser `oklchToHex` de ese
// mismo texto. Sin red: se lee el .css del repo con `fs`, no se pega el
// texto a mano.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { oklchToHex } from '../lib/color'
import {
  COLORES_CLARO,
  COLORES_OSCURO,
  construirTema,
  TOKENS_CLARO,
  TOKENS_OSCURO,
  type ColoresQPS,
} from '../lib/theme'

const RUTA_GLOBALS_CSS = fileURLToPath(new URL('../../web/app/globals.css', import.meta.url))
const CSS = readFileSync(RUTA_GLOBALS_CSS, 'utf8')

/** Extrae el contenido entre llaves del primer bloque que matchea `selector`. */
function extraerBloque(css: string, selectorRegex: string): string {
  const regex = new RegExp(`${selectorRegex}\\s*\\{([\\s\\S]*?)\\}`)
  const coincidencia = regex.exec(css)
  if (!coincidencia) {
    throw new Error(`No se encontró el bloque "${selectorRegex}" en ${RUTA_GLOBALS_CSS}`)
  }
  return coincidencia[1]
}

/** Extrae el valor de una variable CSS `--nombre: valor;` dentro de un bloque. */
function extraerVariable(bloque: string, nombre: string): string {
  const regex = new RegExp(`--${nombre}:\\s*([^;]+);`)
  const coincidencia = regex.exec(bloque)
  if (!coincidencia) {
    throw new Error(`No se encontró --${nombre} en el bloque`)
  }
  return coincidencia[1].trim()
}

const BLOQUE_CLARO = extraerBloque(CSS, ':root')
const BLOQUE_OSCURO = extraerBloque(CSS, '\\.dark')

// Cada clave de ColoresQPS (lib/theme.ts) con el nombre de la variable CSS
// correspondiente en globals.css.
const MAPA_VARIABLES: Record<keyof ColoresQPS, string> = {
  background: 'background',
  foreground: 'foreground',
  card: 'card',
  primary: 'primary',
  primaryForeground: 'primary-foreground',
  muted: 'muted',
  mutedForeground: 'muted-foreground',
  border: 'border',
}

describe('lib/theme.ts == apps/web/app/globals.css', () => {
  describe.each([
    ['claro', BLOQUE_CLARO, TOKENS_CLARO, COLORES_CLARO] as const,
    ['oscuro', BLOQUE_OSCURO, TOKENS_OSCURO, COLORES_OSCURO] as const,
  ])('tema %s', (_nombre, bloqueCss, tokens, colores) => {
    for (const [campo, nombreCss] of Object.entries(MAPA_VARIABLES) as Array<[keyof ColoresQPS, string]>) {
      it(`${campo}: mismo texto oklch(...) que --${nombreCss} en la web`, () => {
        expect(tokens[campo]).toBe(extraerVariable(bloqueCss, nombreCss))
      })

      it(`${campo}: el hex es oklchToHex del texto oklch(...)`, () => {
        expect(colores[campo]).toBe(oklchToHex(tokens[campo]))
      })
    }
  })
})

describe('construirTema', () => {
  // Doble mínimo de un tema de navegación (DarkTheme/DefaultTheme de
  // expo-router): construirTema es genérica y no importa react-native, así
  // que no hace falta ningún mock para probarla.
  const temaBase = {
    dark: false,
    colors: {
      primary: '#000000',
      background: '#ffffff',
      card: '#ffffff',
      text: '#000000',
      border: '#000000',
      notification: '#ff0000',
    },
  }

  it('reemplaza primary/background/card/text/border con los colores pasados', () => {
    const resultado = construirTema(temaBase, COLORES_CLARO)
    expect(resultado.colors.primary).toBe(COLORES_CLARO.primary)
    expect(resultado.colors.background).toBe(COLORES_CLARO.background)
    expect(resultado.colors.card).toBe(COLORES_CLARO.card)
    expect(resultado.colors.text).toBe(COLORES_CLARO.foreground)
    expect(resultado.colors.border).toBe(COLORES_CLARO.border)
  })

  it('conserva las demás propiedades del tema base (p. ej. notification, dark)', () => {
    const resultado = construirTema(temaBase, COLORES_CLARO)
    expect(resultado.colors.notification).toBe('#ff0000')
    expect(resultado.dark).toBe(false)
  })

  it('no muta el tema base recibido', () => {
    const copiaOriginal = JSON.parse(JSON.stringify(temaBase))
    construirTema(temaBase, COLORES_OSCURO)
    expect(temaBase).toEqual(copiaOriginal)
  })
})
