// QPS-200 (17/10): el `exports` de `packages/core/package.json` es lo que usa
// el build de Next (`transpilePackages: ['@qps/core']`), no los `paths` del
// tsconfig ni el alias de Vitest. Un `@qps/core/<x>` que el mapa no resuelve
// a un archivo pasa el typecheck y los tests, y recién rompe en el build de
// la preview (le pasó a `@qps/core/asistencia` en el #62). Este test hace la
// misma resolución que el mapa y exige que cada import de la web y de la app
// caiga en un archivo que existe.
import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = resolve(fileURLToPath(new URL('../../../../', import.meta.url)))
const CORE = join(RAIZ, 'packages', 'core')
const exportsCore = JSON.parse(readFileSync(join(CORE, 'package.json'), 'utf8')).exports as Record<string, string>

/** Resuelve `./<sub>` con el mapa: primero la entrada exacta, después los comodines. */
function resolverConExports(sub: string): string | null {
  const clave = `./${sub}`
  if (exportsCore[clave]) return join(CORE, exportsCore[clave])
  for (const [patron, destino] of Object.entries(exportsCore)) {
    if (!patron.includes('*')) continue
    const [antes, despues] = patron.split('*')
    if (clave.startsWith(antes) && clave.endsWith(despues)) {
      const medio = clave.slice(antes.length, clave.length - despues.length)
      return join(CORE, destino.replace('*', medio))
    }
  }
  return null
}

function archivosDeCodigo(dir: string, acc: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (['node_modules', '.next', 'dist', '.expo', 'coverage'].includes(nombre)) continue
    const ruta = join(dir, nombre)
    const st = statSync(ruta)
    if (st.isDirectory()) archivosDeCodigo(ruta, acc)
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(nombre)) acc.push(ruta)
  }
  return acc
}

const especificadores = new Set<string>()
for (const app of ['web', 'mobile']) {
  for (const archivo of archivosDeCodigo(join(RAIZ, 'apps', app))) {
    for (const m of readFileSync(archivo, 'utf8').matchAll(/from\s+['"]@qps\/core\/([^'"]+)['"]/g)) {
      especificadores.add(m[1])
    }
  }
}

describe('packages/core: el mapa de exports resuelve cada @qps/core/<x> que se importa (QPS-200)', () => {
  it('encontró imports para revisar (si da 0, el detector no está mirando nada)', () => {
    expect(especificadores.size).toBeGreaterThan(5)
    expect(especificadores.has('asistencia')).toBe(true)
  })

  it('@qps/core/asistencia tiene entrada explícita, antes del comodín, hacia la carpeta con index.ts', () => {
    const claves = Object.keys(exportsCore)
    expect(exportsCore['./asistencia']).toBe('./src/asistencia/index.ts')
    expect(claves.indexOf('./asistencia')).toBeLessThan(claves.indexOf('./*'))
  })

  it.each([...especificadores].sort())('@qps/core/%s resuelve a un archivo que existe', (sub) => {
    const destino = resolverConExports(sub)
    expect(destino, `el exports de core no tiene entrada para ./${sub}`).not.toBeNull()
    expect(existsSync(destino!), `./${sub} -> ${destino} no existe`).toBe(true)
  })
})
