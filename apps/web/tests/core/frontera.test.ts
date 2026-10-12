/**
 * `packages/core` tiene que poder correr en cualquier runtime JS (web, app,
 * tests de Vitest sin red ni base): nada de Next, React, el cliente de
 * Supabase, el alias `@/` de la app, módulos `node:` ni rutas que salgan de
 * la carpeta del paquete. `@qps/db` se permite, pero solo como `import type`
 * (son los tipos generados por Supabase, no runtime).
 *
 * Este archivo hace dos cosas:
 *  1. Prueba el detector (`findForbiddenImports`) con fixtures en memoria
 *     (ninguno de estos casos toca el filesystem real: son strings armados a
 *     mano para cada tipo de import prohibido y permitido).
 *  2. Recorre de verdad `packages/core/src` y corre el detector sobre cada
 *     archivo `.ts`.
 *
 * Nota sobre el paralelismo (ronda 22-b): la tarea 22-a está escribiendo
 * `packages/core/src` en paralelo. Mientras no termine, `packages/core/src`
 * puede tener solo el `index.ts` de stub (o estar a medio llenar), así que la
 * parte 2 de este archivo puede encontrar pocos o ningún archivo con imports
 * reales. Eso no es una falla de este test: cuando 22-a termine y el lead
 * corra la suite, va a recorrer los 13 módulos de verdad.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// apps/web/tests/core -> apps/web/tests -> apps/web -> apps -> raíz del worktree
const CORE_SRC = fileURLToPath(new URL('../../../../packages/core/src', import.meta.url))

interface Violation {
  line: number
  message: string
}

/**
 * Detecta, en el texto de un archivo, los imports/exports `from '...'`
 * (estáticos o re-exports), los imports dinámicos `import('...')` y los
 * imports de efecto (`import '...'`), y devuelve una violación por cada uno
 * que esté prohibido para `packages/core`.
 *
 * No es un parser de TypeScript: es una heurística basada en regex, pensada
 * para el estilo de código que usa este repo (un import/export por
 * declaración, aunque pueda ocupar varias líneas). Es intencionalmente
 * simple: esto es tooling de test, no código de producción.
 *
 * Tres regex separadas (una por forma de import) en vez de una sola con
 * grupos nombrados: el `target` del tsconfig de la app es anterior a
 * ES2018, que es desde donde TS permite `(?<nombre>...)` y `\k<nombre>` en
 * un literal de regex (TS1503), así que acá todo es grupos posicionales
 * (`match[1]`, `match[2]`, ...) y, para el par de comillas, dos ramas
 * alternativas (comilla simple / doble) en vez de un backreference.
 */
function lineAt(content: string, index: number): number {
  return content.slice(0, index).split('\n').length
}

// import/export ... from '...' (o "..."): estáticos y re-exports. El medio
// puede ocupar varias líneas (import multilínea), por eso [\s\S]*? no para
// en saltos de línea.
const FROM_RE = /\b(?:import|export)\s+(type\s+)?[\s\S]*?\bfrom\s+(?:'([^']+)'|"([^"]+)")/g
// import('...') / import("..."): dinámico.
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*(?:'([^']+)'|"([^"]+)")\s*\)/g
// import '...' / import "...": de efecto, sin "from".
const SIDE_EFFECT_IMPORT_RE = /^[ \t]*import\s+(?:'([^']+)'|"([^"]+)")/gm

export function findForbiddenImports(fileDir: string, content: string, packageRoot: string): Violation[] {
  const violations: Violation[] = []

  let match: RegExpExecArray | null
  FROM_RE.lastIndex = 0
  while ((match = FROM_RE.exec(content))) {
    const specifier = match[2] ?? match[3]
    if (!specifier) continue
    const isTypeOnly = Boolean(match[1])
    const message = classifySpecifier(specifier, isTypeOnly, fileDir, packageRoot)
    if (message) violations.push({ line: lineAt(content, match.index), message })
  }

  DYNAMIC_IMPORT_RE.lastIndex = 0
  while ((match = DYNAMIC_IMPORT_RE.exec(content))) {
    const specifier = match[1] ?? match[2]
    if (!specifier) continue
    const message = classifySpecifier(specifier, false, fileDir, packageRoot)
    if (message) violations.push({ line: lineAt(content, match.index), message })
  }

  SIDE_EFFECT_IMPORT_RE.lastIndex = 0
  while ((match = SIDE_EFFECT_IMPORT_RE.exec(content))) {
    const specifier = match[1] ?? match[2]
    if (!specifier) continue
    const message = classifySpecifier(specifier, false, fileDir, packageRoot)
    if (message) violations.push({ line: lineAt(content, match.index), message })
  }

  // Orden estable por línea: las tres regex corren por turno, no entreveradas.
  return violations.sort((a, b) => a.line - b.line)
}

function classifySpecifier(specifier: string, isTypeOnly: boolean, fileDir: string, packageRoot: string): string | null {
  if (specifier === 'next' || specifier.startsWith('next/')) {
    return `import de "${specifier}": next no puede importarse desde packages/core`
  }
  if (specifier === 'react' || specifier.startsWith('react/')) {
    return `import de "${specifier}": react no puede importarse desde packages/core`
  }
  if (specifier.startsWith('@supabase/')) {
    return `import de "${specifier}": @supabase/* no puede importarse desde packages/core`
  }
  if (specifier.startsWith('@/')) {
    return `import de "${specifier}": el alias @/ de la app no puede importarse desde packages/core`
  }
  if (specifier.startsWith('node:')) {
    return `import de "${specifier}": node:* no puede importarse desde packages/core`
  }
  if (specifier === '@qps/db' || specifier.startsWith('@qps/db/')) {
    return isTypeOnly ? null : `import de "${specifier}" sin "import type": @qps/db solo se permite para tipos`
  }
  if (specifier.startsWith('.')) {
    const resolved = resolve(fileDir, specifier)
    const rel = relative(packageRoot, resolved)
    if (rel.startsWith('..')) {
      return `import relativo "${specifier}" sale de packages/core (resuelve a "${resolved}")`
    }
  }
  return null
}

function listTsFiles(root: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(root)) {
    const full = join(root, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      out.push(...listTsFiles(full))
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      out.push(full)
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// 1. El detector, probado con fixtures en memoria (sin tocar el repo).
// ---------------------------------------------------------------------------
describe('findForbiddenImports (fixtures en memoria)', () => {
  const ROOT = resolve('fixture-root', 'packages', 'core', 'src')
  const EVENTS_DIR = join(ROOT, 'events')

  it('prohíbe next (default y subpath)', () => {
    expect(findForbiddenImports(ROOT, `import Image from 'next/image'\n`, ROOT)).toHaveLength(1)
    expect(findForbiddenImports(ROOT, `import next from 'next'\n`, ROOT)).toHaveLength(1)
  })

  it('prohíbe react', () => {
    const v = findForbiddenImports(ROOT, `import { useState } from 'react'\n`, ROOT)
    expect(v).toHaveLength(1)
    expect(v[0].line).toBe(1)
  })

  it('prohíbe react como import de efecto (sin "from")', () => {
    expect(findForbiddenImports(ROOT, `import 'react'\n`, ROOT)).toHaveLength(1)
  })

  it('prohíbe @supabase/*', () => {
    expect(
      findForbiddenImports(ROOT, `import { createClient } from '@supabase/supabase-js'\n`, ROOT),
    ).toHaveLength(1)
  })

  it('prohíbe el alias @/ de la app', () => {
    expect(findForbiddenImports(ROOT, `import { Event } from '@/lib/types'\n`, ROOT)).toHaveLength(1)
  })

  it('prohíbe node:*', () => {
    expect(findForbiddenImports(ROOT, `import { readFileSync } from 'node:fs'\n`, ROOT)).toHaveLength(1)
  })

  it('prohíbe import dinámico de un módulo prohibido', () => {
    expect(findForbiddenImports(ROOT, `const m = await import('next/dynamic')\n`, ROOT)).toHaveLength(1)
  })

  it('prohíbe @qps/db sin "import type"', () => {
    expect(findForbiddenImports(ROOT, `import { Database } from '@qps/db'\n`, ROOT)).toHaveLength(1)
  })

  it('permite @qps/db con "import type", incluso en varias líneas', () => {
    const content = `import type {\n  Database,\n  Tables,\n} from '@qps/db'\n`
    expect(findForbiddenImports(ROOT, content, ROOT)).toEqual([])
  })

  it('prohíbe un import relativo que sale del paquete', () => {
    const v = findForbiddenImports(EVENTS_DIR, `import { x } from '../../apps/web/lib/foo'\n`, ROOT)
    expect(v).toHaveLength(1)
    expect(v[0].message).toMatch(/sale de packages\/core/)
  })

  it('permite un import relativo que se queda adentro del paquete', () => {
    expect(findForbiddenImports(EVENTS_DIR, `import { formatSaltaDayKey } from '../date-format'\n`, ROOT)).toEqual([])
    expect(findForbiddenImports(ROOT, `import { foo } from './helpers'\n`, ROOT)).toEqual([])
  })

  it('permite dependencias externas sin alias ni ruta (no están en la lista prohibida)', () => {
    expect(findForbiddenImports(ROOT, `import { z } from 'zod'\n`, ROOT)).toEqual([])
  })

  it('reporta la línea correcta cuando el import no está en la primera línea', () => {
    const content = `// comentario\n// otro comentario\nimport { useState } from 'react'\n`
    const v = findForbiddenImports(ROOT, content, ROOT)
    expect(v).toHaveLength(1)
    expect(v[0].line).toBe(3)
  })

  it('detecta varias violaciones en el mismo archivo, cada una con su línea', () => {
    const content = `import { useState } from 'react'\nimport { createClient } from '@supabase/supabase-js'\n`
    const v = findForbiddenImports(ROOT, content, ROOT)
    expect(v.map((x) => x.line)).toEqual([1, 2])
  })

  it('no confunde "export type { X } from \'@qps/db\'" (permitido) con un export normal', () => {
    expect(findForbiddenImports(ROOT, `export type { Database } from '@qps/db'\n`, ROOT)).toEqual([])
  })

  it('un re-export normal (sin "type") de @qps/db sigue prohibido', () => {
    expect(findForbiddenImports(ROOT, `export { Database } from '@qps/db'\n`, ROOT)).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// 2. El barrido real de packages/core/src.
// ---------------------------------------------------------------------------
describe('packages/core/src no tiene imports prohibidos', () => {
  const files = listTsFiles(CORE_SRC)

  it('encuentra al menos un archivo .ts para analizar', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files.map((file) => [relative(CORE_SRC, file), file] as const))(
    '%s no importa next, react, @supabase/*, @/, node:, ni sale del paquete',
    (_label, file) => {
      const content = readFileSync(file, 'utf8')
      const violations = findForbiddenImports(dirname(file), content, CORE_SRC)
      if (violations.length > 0) {
        const detail = violations
          .map((v) => `  ${relative(CORE_SRC, file)}:${v.line} — ${v.message}`)
          .join('\n')
        throw new Error(`Imports prohibidos:\n${detail}`)
      }
      expect(violations).toEqual([])
    },
  )
})
