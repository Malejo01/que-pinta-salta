/**
 * Después de mover la lógica a `packages/core/src`, los archivos viejos de
 * `apps/web/lib/...` (13 de la R22, más `events/public-select.ts`,
 * `images/variants.ts` y `auth/mensajes.ts` de la R25, tarea 25-a) tienen
 * que quedar como simples re-exports: como
 * mucho 3 líneas de código (sin contar comentarios ni líneas vacías) y cada
 * una de esas líneas tiene que ser un `export ... from '...'` (nada de
 * funciones, constantes ni lógica). Así nadie vuelve a escribir lógica de
 * dominio en el lugar viejo por accidente.
 *
 * Nota sobre el paralelismo (ronda 22-b): la tarea 22-a es la que convierte
 * estos 13 archivos a re-exports. Mientras no termine, estos archivos
 * siguen teniendo la lógica completa (decenas o cientos de líneas) y este
 * test va a fallar de verdad — es el resultado esperado hasta que 22-a
 * termine, no un bug de este archivo. Una vez que 22-a convierta un
 * archivo, su caso empieza a pasar solo.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// apps/web/tests/core -> apps/web/tests -> apps/web -> lib
const LIB_DIR = fileURLToPath(new URL('../../lib', import.meta.url))

const MODULE_PATHS = [
  'types.ts',
  'date-format.ts',
  'event-display.ts',
  'events/vigencia.ts',
  'events/occurrences-summary.ts',
  'events/merged.ts',
  'home/types.ts',
  'home/carousel.ts',
  'home/transform.ts',
  'home/filters.ts',
  'radar/cadence.ts',
  'scraper/dedup-key.ts',
  'instagram-config.ts',
  // R25, tarea 25-a: 3 archivos más convertidos a re-export.
  'events/public-select.ts',
  'images/variants.ts',
  'auth/mensajes.ts',
] as const

const REEXPORT_LINE =
  /^export\s+(type\s+)?(\*(\s+as\s+[A-Za-z_$][\w$]*)?|\{[^}]*\})\s+from\s+(['"])[^'"]+\4;?$/

/** Saca comentarios de línea y de bloque, para contar solo líneas de código real. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/.*$/gm, '$1')
}

interface ReexportCheck {
  codeLines: string[]
  nonReexportLines: string[]
}

function analyzeReexportFile(content: string): ReexportCheck {
  const codeLines = stripComments(content)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  const nonReexportLines = codeLines.filter((l) => !REEXPORT_LINE.test(l))
  return { codeLines, nonReexportLines }
}

describe('analyzeReexportFile (fixtures en memoria)', () => {
  it('acepta un re-export simple de una sola línea', () => {
    const { codeLines, nonReexportLines } = analyzeReexportFile(`export * from '@qps/core/date-format'\n`)
    expect(codeLines).toHaveLength(1)
    expect(nonReexportLines).toEqual([])
  })

  it('acepta un comentario explicativo antes del re-export (no cuenta como código)', () => {
    const content = `// Re-export: la lógica vive en packages/core (R22).\nexport * from '@qps/core/date-format'\n`
    const { codeLines } = analyzeReexportFile(content)
    expect(codeLines).toHaveLength(1)
  })

  it('acepta re-export de tipos y de valores en líneas separadas (hasta 3)', () => {
    const content = `export type { DisplayEvent } from '@qps/core/home/types'\nexport { transformEvent } from '@qps/core/home/transform'\n`
    const { codeLines, nonReexportLines } = analyzeReexportFile(content)
    expect(codeLines).toHaveLength(2)
    expect(nonReexportLines).toEqual([])
  })

  it('rechaza una línea con lógica real (no es un export ... from)', () => {
    const content = `export function cleanDescription(text) {\n  return text\n}\n`
    const { nonReexportLines } = analyzeReexportFile(content)
    expect(nonReexportLines.length).toBeGreaterThan(0)
  })

  it('rechaza una constante calculada, aunque esté sola en el archivo', () => {
    const { nonReexportLines } = analyzeReexportFile(`export const SALTA_UTC_OFFSET = '-03:00'\n`)
    expect(nonReexportLines).toEqual([`export const SALTA_UTC_OFFSET = '-03:00'`])
  })

  it('más de 3 líneas de código, aunque todas sean re-exports válidos, se reporta aparte (no es "nonReexportLines")', () => {
    const content = `export { a } from './x'\nexport { b } from './y'\nexport { c } from './z'\nexport { d } from './w'\n`
    const { codeLines, nonReexportLines } = analyzeReexportFile(content)
    expect(codeLines.length).toBeGreaterThan(3)
    expect(nonReexportLines).toEqual([])
  })

  it('un archivo vacío (o solo comentarios) no cuenta como re-export válido: da 0 líneas de código', () => {
    const { codeLines } = analyzeReexportFile(`// todavía no se migró\n`)
    expect(codeLines).toHaveLength(0)
  })
})

describe('apps/web/lib: los módulos movidos quedan como re-export puro (13 de R22 + 3 de R25)', () => {
  it.each(MODULE_PATHS)('%s tiene a lo sumo 3 líneas de código, todas "export ... from"', (relPath) => {
    const fullPath = `${LIB_DIR}/${relPath}`
    let content: string
    try {
      content = readFileSync(fullPath, 'utf8')
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      throw new Error(`No se pudo leer "${fullPath}": ${reason}`)
    }

    const { codeLines, nonReexportLines } = analyzeReexportFile(content)

    if (nonReexportLines.length > 0) {
      throw new Error(
        `apps/web/lib/${relPath} tiene líneas que no son "export ... from" (lógica en el lugar viejo):\n` +
          nonReexportLines.map((l) => `  ${l}`).join('\n'),
      )
    }
    if (codeLines.length === 0) {
      throw new Error(`apps/web/lib/${relPath} no re-exporta nada (0 líneas de código).`)
    }
    if (codeLines.length > 3) {
      throw new Error(
        `apps/web/lib/${relPath} tiene ${codeLines.length} líneas de código (máximo 3):\n` +
          codeLines.map((l) => `  ${l}`).join('\n'),
      )
    }

    expect(nonReexportLines).toEqual([])
    expect(codeLines.length).toBeGreaterThan(0)
    expect(codeLines.length).toBeLessThanOrEqual(3)
  })
})
