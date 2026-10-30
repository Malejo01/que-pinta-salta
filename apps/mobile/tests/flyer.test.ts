// 33-d (QPS-154): `app/flyer/[id].tsx` migrada a la base visual de la ronda
// 29 — `Texto` (components/Texto.tsx, Montserrat) en vez de `Text` de
// react-native, `useColoresQPS()` en vez de `useTheme()` crudo de
// expo-router, y sin `colors.border`/`colores.border` como color de texto
// (ese es un color de borde, los secundarios van en `mutedForeground`; ver
// tests/base-visual.test.ts). Lectura estática con `fs`, sin montar nada de
// React Native — mismo patrón que tests/estado-carga-detector.test.ts y
// tests/iconos.test.ts.
//
// La pantalla no usa ningún ícono (ni antes ni después de esta tarea: "Ver
// en Instagram" es solo texto), así que no hay nada que migrar de
// `lucide-react-native` directo acá — ese chequeo genérico ya lo cubre
// `tests/iconos.test.ts` para toda la carpeta `app/`.
//
// Búsqueda de una excepción documentada para esta pantalla en el detector de
// `tests/base-visual.test.ts` (el único archivo de tests con una lista de
// excepciones de la ronda 29 en adelante): no se encontró ninguna — la
// `EXCEPCIONES` de ese archivo está vacía a propósito desde 29-g, y
// `app/flyer/[id].tsx` ya figura en `ARCHIVOS_NUEVOS_RONDA` sin excepción.
import { readFileSync } from 'node:fs'
import { quitarComentarios } from '@qps/core/tests/convencion-entorno'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const RUTA_FLYER = join(MOBILE_ROOT, 'app', 'flyer', '[id].tsx')
const SRC_FLYER = readFileSync(RUTA_FLYER, 'utf8')

/** `true` si `content` importa (como valor) `Text` de `'react-native'`,
 * fuera de comentarios. No confunde `TextProps` (tipo) ni `TextInput`: cada
 * nombre del bloque de import se compara exacto (sin el alias de `as`, si lo
 * tuviera), no por prefijo. */
export function importaTextDeReactNative(content: string): boolean {
  const limpio = quitarComentarios(content)
  const bloquesImport = [...limpio.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]react-native['"]/g)]
  return bloquesImport.some((bloque) =>
    bloque[1]
      .split(',')
      .map((nombre) => nombre.trim().split(/\s+as\s+/)[0].trim())
      .some((nombre) => nombre === 'Text')
  )
}

/** `true` si `content` usa `<Text` como elemento JSX, fuera de comentarios
 * (cubre el caso de un alias de import que igual renderiza `Text`). */
function usaElementoTextJSX(content: string): boolean {
  const limpio = quitarComentarios(content)
  return /<Text\b/.test(limpio)
}

/** `true` si `content` usa `useTheme` (el hook crudo de expo-router), fuera
 * de comentarios: una llamada directa sin alias (`useTheme(...)`) o un
 * import de `'expo-router'` que lo incluya — comparando, igual que
 * `importaTextDeReactNative` más arriba, el nombre ORIGINAL de cada entrada
 * del bloque (antes de `as`). Así un alias como
 * `import { useTheme as useThemeOriginal } from 'expo-router'` no lo
 * esconde (antes, ni la llamada ni el import nombrado lo detectaban: el
 * nombre que aparecía en el código era `useThemeOriginal`, no `useTheme`). */
export function usaUseThemeCrudo(content: string): boolean {
  const limpio = quitarComentarios(content)

  if (/\buseTheme\s*\(/.test(limpio)) return true

  const bloquesImport = [...limpio.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]expo-router['"]/g)]
  return bloquesImport.some((bloque) =>
    bloque[1]
      .split(',')
      .map((nombre) => nombre.trim().split(/\s+as\s+/)[0].trim())
      .some((nombre) => nombre === 'useTheme')
  )
}

/** `true` si `content` usa `color: colors.border` o `color: colores.border`
 * como color de *texto* (mismo detector que `tests/base-visual.test.ts`). */
export function usaBorderComoColorDeTexto(content: string): boolean {
  const limpio = quitarComentarios(content)
  return /\bcolor:\s*color(?:es|s)\.border\b/.test(limpio)
}

describe('importaTextDeReactNative (fixtures en memoria: tiene que fallar de verdad)', () => {
  it('detecta un import de Text', () => {
    expect(importaTextDeReactNative(`import { Text, View } from 'react-native'`)).toBe(true)
  })

  it('no confunde TextInput', () => {
    expect(importaTextDeReactNative(`import { TextInput, View } from 'react-native'`)).toBe(false)
  })

  it('no confunde un comentario que menciona Text', () => {
    expect(importaTextDeReactNative(`// antes: import { Text } from 'react-native'`)).toBe(false)
  })

  it('sin import de react-native: false', () => {
    expect(importaTextDeReactNative(`import { Texto } from '@/components/Texto'`)).toBe(false)
  })
})

describe('usaUseThemeCrudo (fixtures en memoria)', () => {
  it('detecta la llamada', () => {
    expect(usaUseThemeCrudo(`const { colors } = useTheme()`)).toBe(true)
  })

  it('detecta el import nombrado, aunque no se llame en la misma línea', () => {
    expect(usaUseThemeCrudo(`import { Stack, useTheme } from 'expo-router'`)).toBe(true)
  })

  it('no confunde useColoresQPS', () => {
    expect(usaUseThemeCrudo(`const colores = useColoresQPS()`)).toBe(false)
  })

  it('no confunde un comentario que menciona useTheme', () => {
    expect(usaUseThemeCrudo(`// antes: const { colors } = useTheme()`)).toBe(false)
  })

  it('detecta un alias que evade el nombre literal "useTheme" en la llamada (vuelta 1, revisor)', () => {
    const content = [
      `import { useTheme as useThemeOriginal } from 'expo-router'`,
      `const { colors } = useThemeOriginal()`,
    ].join('\n')
    expect(usaUseThemeCrudo(content)).toBe(true)
  })

  it('detecta el alias aunque todavía no se llame (mismo criterio que el import sin alias)', () => {
    expect(usaUseThemeCrudo(`import { useTheme as useThemeOriginal } from 'expo-router'`)).toBe(true)
  })

  it('no confunde un import de useTheme de otro paquete (no expo-router)', () => {
    expect(usaUseThemeCrudo(`import { useTheme } from '@react-navigation/native'`)).toBe(false)
  })
})

describe('app/flyer/[id].tsx: migrada a la base visual de la ronda 29 (QPS-154)', () => {
  it('no importa Text de react-native', () => {
    expect(importaTextDeReactNative(SRC_FLYER)).toBe(false)
  })

  it('no renderiza ningún <Text (JSX) a mano', () => {
    expect(usaElementoTextJSX(SRC_FLYER)).toBe(false)
  })

  it('no usa useTheme() crudo de expo-router', () => {
    expect(usaUseThemeCrudo(SRC_FLYER)).toBe(false)
  })

  it('no usa colors.border/colores.border como color de texto', () => {
    expect(usaBorderComoColorDeTexto(SRC_FLYER)).toBe(false)
  })

  it('importa Texto de @/components/Texto', () => {
    expect(quitarComentarios(SRC_FLYER)).toMatch(/import\s*\{[^}]*\bTexto\b[^}]*\}\s*from\s*['"]@\/components\/Texto['"]/)
  })

  it('usa al menos un <Texto', () => {
    expect(quitarComentarios(SRC_FLYER)).toMatch(/<Texto\b/)
  })

  it('importa useColoresQPS de @/lib/colores', () => {
    expect(quitarComentarios(SRC_FLYER)).toMatch(/import\s*\{[^}]*\buseColoresQPS\b[^}]*\}\s*from\s*['"]@\/lib\/colores['"]/)
  })

  it('llama a useColoresQPS()', () => {
    expect(quitarComentarios(SRC_FLYER)).toMatch(/\buseColoresQPS\s*\(\s*\)/)
  })

  it('no importa lucide-react-native directo (el único wrapper aprobado es components/Icono.tsx)', () => {
    expect(quitarComentarios(SRC_FLYER)).not.toMatch(/\bfrom\s+['"]lucide-react-native['"]/)
  })
})
