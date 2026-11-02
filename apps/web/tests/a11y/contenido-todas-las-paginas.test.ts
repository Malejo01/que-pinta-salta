/**
 * Detector general del ancla del skip-link (Q4-1). `SaltarAlContenido` se monta
 * una sola vez en app/layout.tsx y apunta a `#contenido`, así que TODA página
 * pública (en castellano y en /en) tiene que terminar renderizando un elemento
 * con `id="contenido"`, sea en su page.tsx o en algún componente que importa.
 *
 * `contenido-es-en.test.ts` fija el detalle (un único <main>, tabIndex, foco) de
 * las páginas compartidas entre /x y /en/x; este recorre todas las demás para que
 * una página nueva no se olvide del ancla. Estático: sigue los imports `@/…` y
 * relativos hasta 5 niveles, sin red ni base.
 *
 * Fuera: /admin (no es pública), las rutas interceptadas del modal `@modal/(.)…`,
 * que se dibujan encima de una página que ya tiene el ancla, y el catch-all
 * `app/en/[...resto]` (Q4-6), que solo llama a `notFound()`: lo dibuja
 * `app/en/not-found.tsx`, que se revisa aparte abajo.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = resolve(__dirname, '../..')
const APP = join(RAIZ, 'app')

function resolverImport(desde: string, spec: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = join(RAIZ, spec.slice(2))
  else if (spec.startsWith('.')) base = join(dirname(desde), spec)
  else return null
  for (const c of [`${base}.tsx`, `${base}.ts`, join(base, 'index.tsx'), join(base, 'index.ts')]) {
    if (existsSync(c)) return c
  }
  return null
}

function sinComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

function llegaAlAncla(archivo: string | null, vistos = new Set<string>(), nivel = 0): boolean {
  if (!archivo || vistos.has(archivo) || nivel > 5) return false
  vistos.add(archivo)
  const codigo = sinComentarios(readFileSync(archivo, 'utf8'))
  if (/\bid=(["'])contenido\1|\bid=\{\s*["']contenido["']\s*\}/.test(codigo)) return true
  for (const m of codigo.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    if (llegaAlAncla(resolverImport(archivo, m[1]), vistos, nivel + 1)) return true
  }
  return false
}

function paginas(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name)
    if (e.isDirectory()) return paginas(ruta)
    return e.name === 'page.tsx' ? [ruta] : []
  })
}

const PUBLICAS = paginas(APP)
  .map((abs) => relative(RAIZ, abs).replaceAll('\\', '/'))
  .filter((rel) => !rel.startsWith('app/admin/') && !rel.startsWith('app/@modal/') && rel !== 'app/en/[...resto]/page.tsx')
  .sort()

describe('cada página pública llega a un elemento con id="contenido"', () => {
  it('hay páginas en castellano y en /en para revisar', () => {
    expect(PUBLICAS.length).toBeGreaterThan(20)
    expect(PUBLICAS.some((p) => p.startsWith('app/en/'))).toBe(true)
  })

  it.each([...PUBLICAS, 'app/not-found.tsx', 'app/en/not-found.tsx'])('%s', (rel) => {
    expect(
      llegaAlAncla(join(RAIZ, rel)),
      `${rel}: ni la página ni sus componentes tienen id="contenido"; el «Saltar al contenido» del layout no tiene a dónde ir`,
    ).toBe(true)
  })
})
