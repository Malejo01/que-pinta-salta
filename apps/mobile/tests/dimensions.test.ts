// 28-q, punto 16 (28-b, QPS-132/QPS-134): ningún `Dimensions` en `app/` ni
// en `components/` (se corría en paralelo con un programador al momento de
// escribir este test; si queda alguno, este test lo marca con archivo y
// línea, para que lo cierre la noche al terminar). Mismo estilo de barrido
// que `tests/iconos.test.ts` y `tests/compartir-ficha.test.ts`.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { quitarComentarios } from '@qps/core/tests/convencion-entorno'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const APP_DIR = join(MOBILE_ROOT, 'app')
const COMPONENTS_DIR = join(MOBILE_ROOT, 'components')

function listarTsxYTs(root: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(root)) {
    const full = join(root, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      out.push(...listarTsxYTs(full))
    } else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
      out.push(full)
    }
  }
  return out
}

/**
 * Las líneas (1-based) donde aparece `Dimensions` como palabra, fuera de
 * comentarios. Sin esto, un comentario que solo *menciona* "Dimensions"
 * (por ejemplo, explicando por qué el código usa `useWindowDimensions` en
 * vez de `Dimensions`) daría un falso positivo.
 *
 * Usa el helper compartido `quitarComentarios` que preserva los saltos de línea exactos.
 */
function lineasConDimensions(content: string): number[] {
  const lineasDeTexto = quitarComentarios(content).split('\n')
  const resultado: number[] = []

  for (let i = 0; i < lineasDeTexto.length; i++) {
    if (/\bDimensions\b/.test(lineasDeTexto[i])) resultado.push(i + 1)
  }

  return resultado
}

describe('lineasConDimensions (fixtures en memoria: tiene que fallar de verdad)', () => {
  it('detecta un import de Dimensions', () => {
    expect(lineasConDimensions(`import { Dimensions } from 'react-native'`)).toEqual([1])
  })

  it('detecta Dimensions.get("window")', () => {
    expect(lineasConDimensions(`const { width } = Dimensions.get('window')`)).toEqual([1])
  })

  it('no confunde useWindowDimensions con Dimensions (no hay límite de palabra ahí)', () => {
    expect(lineasConDimensions(`const { width } = useWindowDimensions()`)).toEqual([])
  })

  it('no confunde un comentario que solo menciona "Dimensions" con un uso real', () => {
    const content = [
      '// El ancho se lee con useWindowDimensions(), nunca con `Dimensions`',
      '// a nivel de módulo (QPS-132).',
      'const { width } = useWindowDimensions()',
    ].join('\n')
    expect(lineasConDimensions(content)).toEqual([])
  })

  it('no confunde un bloque /* ... */ que menciona Dimensions con un uso real', () => {
    const content = ['/**', ' * No usar Dimensions acá: usar useWindowDimensions().', ' */', 'function f() {}'].join('\n')
    expect(lineasConDimensions(content)).toEqual([])
  })

  it('no confunde el "//" de una URL en un comentario con el inicio de un comentario de línea', () => {
    // Si la heurística tratara cualquier "//" como comentario, acá cortaría
    // antes de tiempo; como no hay "Dimensions" de verdad, da [].
    expect(lineasConDimensions(`// ver https://reactnative.dev/docs/dimensions`)).toEqual([])
  })

  it('detecta Dimensions real que convive con un comentario con URL en la misma línea', () => {
    const content = `const d = Dimensions.get('window') // ver https://reactnative.dev/docs/dimensions`
    expect(lineasConDimensions(content)).toEqual([1])
  })

  it('reporta varias líneas', () => {
    const content = ["import { Dimensions } from 'react-native'", 'const x = 1', "Dimensions.get('window')"].join('\n')
    expect(lineasConDimensions(content)).toEqual([1, 3])
  })
})

describe('app/ y components/: ningún uso de Dimensions (QPS-132/QPS-134)', () => {
  const archivos = [...listarTsxYTs(APP_DIR), ...listarTsxYTs(COMPONENTS_DIR)]

  it('encuentra archivos para analizar', () => {
    expect(archivos.length).toBeGreaterThan(0)
  })

  it.each(archivos.map((file) => [relative(MOBILE_ROOT, file), file] as const))('%s no usa Dimensions', (label, file) => {
    const content = readFileSync(file, 'utf8')
    const lineas = lineasConDimensions(content)
    if (lineas.length > 0) {
      throw new Error(`${label}: usa Dimensions en la(s) línea(s) ${lineas.join(', ')}`)
    }
    expect(lineas).toEqual([])
  })
})
