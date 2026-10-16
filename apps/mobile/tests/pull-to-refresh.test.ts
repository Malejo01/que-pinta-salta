// 28-q, parte B, punto 20 (28-c): Inicio, Buscar, Cines y Favoritos tienen
// pull-to-refresh con el `RefreshControl` de React Native. Favoritos sin
// sesión no cuenta (no hay nada que refrescar, a propósito): el chequeo es
// sobre el archivo completo, no por rama, así que el `RefreshControl` que
// vive en la rama "con sesión" alcanza. Mismo estilo de detector con
// fixtures en memoria que `tests/iconos.test.ts`/`tests/dimensions.test.ts`.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))

const PANTALLAS_CON_REFRESH = [
  ['app/(tabs)/index.tsx', 'Inicio'],
  ['app/(tabs)/buscar.tsx', 'Buscar'],
  ['app/cines.tsx', 'Cines'],
  ['app/(tabs)/favoritos.tsx', 'Favoritos'],
] as const

/**
 * `content` con los comentarios de línea vaciados (heurística simple, sin
 * bloques de comentario, que no aparecen cerca de `RefreshControl` en estos
 * archivos): evita que un comentario que solo menciona la palabra
 * `RefreshControl` (por ejemplo, explicando por qué una rama no lo tiene)
 * cuente como un uso real.
 */
function quitarComentariosDeLinea(content: string): string {
  return content
    .split('\n')
    .map((linea) => {
      const idx = linea.search(/(^|\s)\/\//)
      return idx === -1 ? linea : linea.slice(0, idx)
    })
    .join('\n')
}

/** `true` si `content` importa `RefreshControl` de `react-native` y lo usa como JSX (no solo lo importa sin usarlo). */
export function usaRefreshControl(content: string): boolean {
  const limpio = quitarComentariosDeLinea(content)
  const importa = /import\s*\{[^}]*\bRefreshControl\b[^}]*\}\s*from\s*['"]react-native['"]/.test(limpio)
  const usaEnJsx = /<RefreshControl\b/.test(limpio)
  return importa && usaEnJsx
}

describe('usaRefreshControl (fixtures en memoria: tiene que fallar de verdad)', () => {
  it('detecta import + uso real en un FlatList', () => {
    const content = `
      import { FlatList, RefreshControl } from 'react-native'
      <FlatList refreshControl={<RefreshControl refreshing={r} onRefresh={f} />} />
    `
    expect(usaRefreshControl(content)).toBe(true)
  })

  it('importado pero nunca usado en JSX: false (import muerto, no cuenta como pull-to-refresh)', () => {
    const content = `import { FlatList, RefreshControl } from 'react-native'\n<FlatList />`
    expect(usaRefreshControl(content)).toBe(false)
  })

  it('sin import de react-native: false, aunque aparezca la etiqueta (no podría compilar, pero no confiamos solo en eso)', () => {
    const content = `<RefreshControl refreshing={r} onRefresh={f} />`
    expect(usaRefreshControl(content)).toBe(false)
  })

  it('sin RefreshControl en absoluto: false', () => {
    const content = `import { FlatList } from 'react-native'\n<FlatList />`
    expect(usaRefreshControl(content)).toBe(false)
  })

  it('no confunde un comentario que solo menciona RefreshControl con un uso real (por ejemplo, el caso de Favoritos sin sesión)', () => {
    const content = [
      "import { FlatList, RefreshControl } from 'react-native'",
      '// Sin sesión no hay nada propio que refrescar: esta rama no lleva RefreshControl.',
      'function SinSesion() { return <View /> }',
    ].join('\n')
    // El import está (se usa en otra rama del mismo archivo real), pero en
    // este fixture recortado no hay ningún <RefreshControl> real: false.
    expect(usaRefreshControl(content)).toBe(false)
  })
})

describe.each(PANTALLAS_CON_REFRESH)('%s (%s): tiene pull-to-refresh con RefreshControl', (ruta) => {
  const file = join(MOBILE_ROOT, ruta)
  const content = readFileSync(file, 'utf8')

  it('usa RefreshControl de verdad (import + JSX)', () => {
    if (!usaRefreshControl(content)) {
      throw new Error(`${ruta}: no tiene un RefreshControl real (import de 'react-native' + uso en JSX)`)
    }
    expect(usaRefreshControl(content)).toBe(true)
  })
})
