// 49-c (QPS-243, Ronda 49): detector sobre el texto de `app/(tabs)/_layout.tsx`
// y `components/EtiquetaPestana.tsx` — la etiqueta de las pestañas de abajo
// con tope de escala (`ESCALA_MAXIMA_COMPACTA`) y el color activo pasado a
// `colores.foreground` (QPS-241, grupo 2). Mismo patrón que
// `tests/hero.test.ts`/`tests/ficha.test.ts`: lectura estática con `fs`, sin
// montar nada de React Native, con los comentarios saneados ANTES de buscar
// — así un comentario que solo *menciona* `tabBarLabelStyle` o
// `colores.primary` (como el de cabecera de este mismo archivo, o el que
// explica por qué se sacó algo) no cuenta como si el código real todavía lo
// tuviera. Cada aserción exige la presencia de lo bueno Y la ausencia de lo
// malo, no solo una de las dos.
//
// No importa nada de otro `*.test.ts` (QPS-250): el saneado de comentarios
// es una copia local, igual que en `tests/hero.test.ts`/`tests/ficha.test.ts`.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const LAYOUT_PATH = join(MOBILE_ROOT, 'app', '(tabs)', '_layout.tsx')
const ETIQUETA_PATH = join(MOBILE_ROOT, 'components', 'EtiquetaPestana.tsx')

/** Comentarios de línea y de bloque vaciados, conservando el resto del texto
 * (mismo criterio que `quitarComentarios` de `tests/ficha.test.ts`). */
function quitarComentarios(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/.*$/gm, '$1')
}

describe('quitarComentarios (fixtures en memoria: tiene que sanear de verdad)', () => {
  it('un comentario de línea que menciona tabBarLabelStyle no cuenta como código real', () => {
    const fixture = '// antes esto era tabBarLabelStyle: estilos.etiqueta\nconst x = 1'
    expect(quitarComentarios(fixture)).not.toMatch(/tabBarLabelStyle/)
  })

  it('un comentario de bloque que menciona colores.primary no cuenta', () => {
    const fixture = '/* tabBarActiveTintColor: colores.primary, viejo */\nconst x = 1'
    expect(quitarComentarios(fixture)).not.toMatch(/colores\.primary/)
  })
})

describe('app/(tabs)/_layout.tsx: tabBarLabel con EtiquetaPestana, sin tabBarLabelStyle ni colores.primary como activo', () => {
  const content = quitarComentarios(readFileSync(LAYOUT_PATH, 'utf8'))

  it('usa tabBarLabel con EtiquetaPestana en screenOptions', () => {
    expect(content).toMatch(/tabBarLabel:\s*\(\s*\{\s*color,\s*children\s*\}\s*\)\s*=>\s*<EtiquetaPestana\b/)
  })

  it('importa EtiquetaPestana de verdad (no solo lo nombra en un comentario)', () => {
    expect(content).toMatch(/import\s*\{\s*EtiquetaPestana\s*\}\s*from\s*['"]@\/components\/EtiquetaPestana['"]/)
  })

  it('ya no tiene tabBarLabelStyle', () => {
    expect(content).not.toMatch(/tabBarLabelStyle/)
  })

  it('tabBarActiveTintColor no es colores.primary', () => {
    expect(content).not.toMatch(/tabBarActiveTintColor:\s*colores\.primary\b/)
  })

  it('tabBarActiveTintColor es colores.foreground (QPS-241, grupo 2)', () => {
    expect(content).toMatch(/tabBarActiveTintColor:\s*colores\.foreground\b/)
  })
})

describe('components/EtiquetaPestana.tsx: fontSize/fontFamily de siempre, tope de escala por identificador y numberOfLines', () => {
  const content = quitarComentarios(readFileSync(ETIQUETA_PATH, 'utf8'))

  it('conserva fontSize: 12', () => {
    expect(content).toMatch(/fontSize:\s*12\b/)
  })

  it('conserva fontFamily Montserrat_600SemiBold', () => {
    expect(content).toMatch(/fontFamily:\s*['"]Montserrat_600SemiBold['"]/)
  })

  it('usa maxFontSizeMultiplier={ESCALA_MAXIMA_COMPACTA}, importado de lib/accesibilidad', () => {
    expect(content).toMatch(/maxFontSizeMultiplier=\{\s*ESCALA_MAXIMA_COMPACTA\s*\}/)
    expect(content).toMatch(/import\s*\{\s*ESCALA_MAXIMA_COMPACTA\s*\}\s*from\s*['"]@\/lib\/accesibilidad['"]/)
  })

  it('maxFontSizeMultiplier NO es un número suelto (nunca, ni siquiera 1.4 literal)', () => {
    expect(content).not.toMatch(/maxFontSizeMultiplier\s*=\s*\{\s*-?\d+(?:\.\d+)?\s*\}/)
  })

  it('tiene numberOfLines={1}', () => {
    expect(content).toMatch(/numberOfLines=\{1\}/)
  })
})
