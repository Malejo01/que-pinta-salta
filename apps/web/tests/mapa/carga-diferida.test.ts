/**
 * MapLibre solo se carga diferido (R54, tarea 54-q): el grafo de imports
 * estáticos de las páginas que NO son `/mapa` (y de `/mapa` misma, hasta
 * `mapa-diferido.tsx`) no llega a `maplibre-gl` ni a
 * `components/mapa/mapa-maplibre.tsx`. Los `import()` dinámicos no se siguen:
 * son justo la forma permitida.
 *
 * Cómo trata el grafo cada forma de import (se prueba abajo, con fixtures):
 * - `import x from "y"`, `import "y"`, `import { a } from "y"` y
 *   `export { a } from "y"` / `export * from "y"`: estáticos, se siguen.
 * - `import type … from "y"` / `export type … from "y"`: NO se siguen. TypeScript
 *   y SWC los borran al compilar: no cargan nada. Es el caso real de
 *   `mapa-maplibre.tsx` -> `import type { PropsMapa } from "./mapa-diferido"`.
 *   Seguirlo armaría un ciclo falso (maplibre -> diferido -> maplibre) y marcaría
 *   a `mapa-diferido.tsx` como "llega a maplibre" aunque solo lo pida con `import()`.
 * - `import { type A, b } from "y"` y `import { type A } from "y"`: SÍ se siguen
 *   (conservador: con `verbatimModuleSyntax` el segundo queda como `import "y"`;
 *   preferimos un falso positivo ruidoso a ocultar un import real).
 * - `import("y")` y `require("y")` (sin `import` estático): no se siguen. `require` no
 *   existe en este código; si apareciera, hay que sumarlo acá.
 * - Todo se lee SIN comentarios: nombrar `maplibre-gl` en un comentario no cuenta.
 * - Los paquetes de `node_modules` no se siguen, salvo `maplibre-gl` y `maplibre-gl/…`,
 *   que cuentan como llegada.
 *
 * Sin red ni base; entorno `node`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const WEB_ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)))
const CORE_ROOT = path.resolve(WEB_ROOT, '../../packages/core/src')

const MAPLIBRE = 'maplibre-gl'
const ARCHIVO_MAPLIBRE = 'components/mapa/mapa-maplibre.tsx'
const EXTENSIONES = ['.ts', '.tsx', '.js', '.mjs']

// ---------------------------------------------------------------------------
// El detector
// ---------------------------------------------------------------------------

/** Un sistema de archivos mínimo, para poder probar el detector con fixtures en memoria. */
interface Sistema {
  webRoot: string
  coreRoot: string
  existe(absoluta: string): boolean
  leer(absoluta: string): string
}

const sistemaReal: Sistema = {
  webRoot: WEB_ROOT,
  coreRoot: CORE_ROOT,
  existe: (absoluta) => existsSync(absoluta) && statSync(absoluta).isFile(),
  leer: (absoluta) => readFileSync(absoluta, 'utf8'),
}

function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[^\S\n]*\/\/.*$/gm, '')
}

/** Los especificadores de los imports estáticos que sí cargan algo (no `import type`). */
function importsEstaticos(fuente: string): string[] {
  const codigo = sinComentarios(fuente)
  const especificadores: string[] = []

  // import x from "y" · import { a } from "y" · import * as x from "y" · import "y"
  // `(?!\s*\()` y el `\s+` obligatorio dejan afuera `import("y")`.
  const importRegex = /\bimport\s+(type\s+)?(?:[\w*${},\s]+?\s+from\s+)?["']([^"']+)["']/g
  for (const m of codigo.matchAll(importRegex)) {
    // `import type … from "y"` se borra al compilar: no carga nada.
    if (m[1]) continue
    especificadores.push(m[2])
  }

  // export { a } from "y" · export * from "y" · export * as x from "y"
  const exportRegex = /\bexport\s+(type\s+)?(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s+from\s+["']([^"']+)["']/g
  for (const m of codigo.matchAll(exportRegex)) {
    if (m[1]) continue
    especificadores.push(m[2])
  }

  return especificadores
}

function esMaplibre(especificador: string): boolean {
  return especificador === MAPLIBRE || especificador.startsWith(`${MAPLIBRE}/`)
}

/** Resuelve un especificador local a un archivo de código, o `null` si no es local. Lanza si es local y no existe. */
function resolverLocal(especificador: string, desde: string, sistema: Sistema): string | null {
  let base: string
  if (especificador.startsWith('@/')) base = path.join(sistema.webRoot, especificador.slice(2))
  else if (especificador.startsWith('@qps/core/')) base = path.join(sistema.coreRoot, especificador.slice('@qps/core/'.length))
  else if (especificador.startsWith('.')) base = path.resolve(path.dirname(desde), especificador)
  else return null // paquete de node_modules (o @qps/db): no se sigue

  const candidatos = [
    base,
    ...EXTENSIONES.map((ext) => base + ext),
    ...EXTENSIONES.map((ext) => path.join(base, `index${ext}`)),
  ]
  for (const candidato of candidatos) {
    if (sistema.existe(candidato)) return candidato
  }
  throw new Error(`No se pudo resolver "${especificador}" importado desde ${desde}`)
}

function esDeCodigo(archivo: string): boolean {
  return EXTENSIONES.includes(path.extname(archivo))
}

/**
 * Sigue los imports estáticos desde `entrada` (ruta relativa a `webRoot`). Devuelve la cadena
 * de archivos hasta la llegada a MapLibre (`[entrada, …, "maplibre-gl"]` o `[entrada, …, mapa-maplibre.tsx]`),
 * o `null` si no llega.
 */
function cadenaHastaMaplibre(entrada: string, sistema: Sistema = sistemaReal): string[] | null {
  const raiz = path.resolve(sistema.webRoot, entrada)
  const archivoMaplibre = path.resolve(sistema.webRoot, ARCHIVO_MAPLIBRE)
  const visitados = new Set<string>()

  const mostrar = (absoluta: string) => path.relative(sistema.webRoot, absoluta).split(path.sep).join('/')

  function recorrer(archivo: string, camino: string[]): string[] | null {
    if (visitados.has(archivo)) return null
    visitados.add(archivo)
    const aqui = [...camino, mostrar(archivo)]
    if (path.resolve(archivo) === archivoMaplibre) return aqui

    for (const especificador of importsEstaticos(sistema.leer(archivo))) {
      if (esMaplibre(especificador)) return [...aqui, especificador]
      const destino = resolverLocal(especificador, archivo, sistema)
      if (!destino || !esDeCodigo(destino)) continue
      const hallado = recorrer(destino, aqui)
      if (hallado) return hallado
    }
    return null
  }

  return recorrer(raiz, [])
}

/** Todos los archivos de código visitados desde `entrada` (para probar que el recorrido no es ciego). */
function archivosAlcanzados(entrada: string, sistema: Sistema = sistemaReal): Set<string> {
  const vistos = new Set<string>()
  const pendientes = [path.resolve(sistema.webRoot, entrada)]
  while (pendientes.length > 0) {
    const archivo = pendientes.pop()!
    if (vistos.has(archivo)) continue
    vistos.add(archivo)
    for (const especificador of importsEstaticos(sistema.leer(archivo))) {
      if (esMaplibre(especificador)) continue
      const destino = resolverLocal(especificador, archivo, sistema)
      if (destino && esDeCodigo(destino)) pendientes.push(destino)
    }
  }
  return new Set([...vistos].map((a) => path.relative(sistema.webRoot, a).split(path.sep).join('/')))
}

// ---------------------------------------------------------------------------
// Fixtures en memoria
// ---------------------------------------------------------------------------

function sistemaVirtual(archivos: Record<string, string>): Sistema {
  const raiz = path.resolve('/virtual/web')
  const todos = new Map(Object.entries(archivos).map(([relativa, contenido]) => [path.resolve(raiz, relativa), contenido]))
  return {
    webRoot: raiz,
    coreRoot: path.resolve('/virtual/core/src'),
    existe: (absoluta) => todos.has(path.resolve(absoluta)),
    leer: (absoluta) => {
      const contenido = todos.get(path.resolve(absoluta))
      if (contenido === undefined) throw new Error(`fixture sin ${absoluta}`)
      return contenido
    },
  }
}

describe('el detector (fixtures inventados)', () => {
  it('falla (encuentra la cadena) con un import estático de mapa-maplibre desde una página', () => {
    const sistema = sistemaVirtual({
      'app/page.tsx': 'import { Contenido } from "./contenido"\nexport default function P() { return null }',
      'app/contenido.tsx': 'import Mapa from "@/components/mapa/mapa-maplibre"\nexport const Contenido = Mapa',
      'components/mapa/mapa-maplibre.tsx': 'import { Map } from "maplibre-gl"\nexport default Map',
    })
    expect(cadenaHastaMaplibre('app/page.tsx', sistema)).toEqual([
      'app/page.tsx',
      'app/contenido.tsx',
      'components/mapa/mapa-maplibre.tsx',
    ])
  })

  it('falla con un import estático de maplibre-gl directo, o de maplibre-gl/dist/maplibre-gl.css', () => {
    expect(cadenaHastaMaplibre('app/page.tsx', sistemaVirtual({ 'app/page.tsx': 'import maplibregl from "maplibre-gl"' }))).toEqual([
      'app/page.tsx',
      'maplibre-gl',
    ])
    expect(
      cadenaHastaMaplibre('app/page.tsx', sistemaVirtual({ 'app/page.tsx': "import 'maplibre-gl/dist/maplibre-gl.css'" }))
    ).toEqual(['app/page.tsx', 'maplibre-gl/dist/maplibre-gl.css'])
  })

  it('falla con un re-export estático y con un import multilínea', () => {
    const reexport = sistemaVirtual({
      'app/page.tsx': 'export { default } from "./otro"',
      'app/otro.tsx': 'export * from "maplibre-gl"',
    })
    expect(cadenaHastaMaplibre('app/page.tsx', reexport)).not.toBeNull()

    const multilinea = sistemaVirtual({
      'app/page.tsx': 'import {\n  Map,\n  Marker,\n} from\n  "maplibre-gl"',
    })
    expect(cadenaHastaMaplibre('app/page.tsx', multilinea)).not.toBeNull()
  })

  it('falla pasando por un index y por un alias de @qps/core', () => {
    const sistema = sistemaVirtual({
      'app/page.tsx': 'import { x } from "@/lib/util"',
      'lib/util/index.ts': 'export { x } from "../mapa-directo"',
      'lib/mapa-directo.ts': 'import "maplibre-gl"\nexport const x = 1',
    })
    expect(cadenaHastaMaplibre('app/page.tsx', sistema)).toEqual(['app/page.tsx', 'lib/util/index.ts', 'lib/mapa-directo.ts', 'maplibre-gl'])
  })

  it('pasa con un import() dinámico (la forma permitida), aunque esté en un archivo alcanzable', () => {
    const sistema = sistemaVirtual({
      'app/page.tsx': 'import { Diferido } from "@/components/mapa/mapa-diferido"',
      'components/mapa/mapa-diferido.tsx': 'export function Diferido() { void import("./mapa-maplibre") }',
      'components/mapa/mapa-maplibre.tsx': 'import { Map } from "maplibre-gl"\nexport default Map',
    })
    expect(cadenaHastaMaplibre('app/page.tsx', sistema)).toBeNull()
    // Y el recorrido no es ciego: sí llegó al diferido.
    expect(archivosAlcanzados('app/page.tsx', sistema)).toContain('components/mapa/mapa-diferido.tsx')
    expect(archivosAlcanzados('app/page.tsx', sistema)).not.toContain('components/mapa/mapa-maplibre.tsx')
  })

  it('pasa con import dinámico con comillas simples, backticks o con await, y con React.lazy', () => {
    const sistema = sistemaVirtual({
      'app/page.tsx': [
        "const a = () => import('maplibre-gl')",
        'const b = async () => (await import(`maplibre-gl`)).default',
        'const c = lazy(() => import("@/components/mapa/mapa-maplibre"))',
      ].join('\n'),
      'components/mapa/mapa-maplibre.tsx': 'import "maplibre-gl"',
    })
    expect(cadenaHastaMaplibre('app/page.tsx', sistema)).toBeNull()
  })

  it('pasa con import type (se borra al compilar) y no arma un ciclo falso diferido <-> maplibre', () => {
    const sistema = sistemaVirtual({
      'components/mapa/mapa-diferido.tsx': 'export interface PropsMapa { a: string }\nvoid import("./mapa-maplibre")',
      'components/mapa/mapa-maplibre.tsx': 'import { Map } from "maplibre-gl"\nimport type { PropsMapa } from "./mapa-diferido"\nexport default Map',
    })
    expect(cadenaHastaMaplibre('components/mapa/mapa-diferido.tsx', sistema)).toBeNull()
  })

  it('un import type no oculta un import real: si el diferido además importa estático, falla', () => {
    const sistema = sistemaVirtual({
      'components/mapa/mapa-diferido.tsx': 'import Mapa from "./mapa-maplibre"\nexport default Mapa',
      'components/mapa/mapa-maplibre.tsx': 'import { Map } from "maplibre-gl"\nimport type { PropsMapa } from "./mapa-diferido"\nexport default Map',
    })
    expect(cadenaHastaMaplibre('components/mapa/mapa-diferido.tsx', sistema)).toEqual([
      'components/mapa/mapa-diferido.tsx',
      'components/mapa/mapa-maplibre.tsx',
    ])
  })

  it('un import con `type` adentro de las llaves SÍ se sigue (conservador), y export type no', () => {
    const conTipoEnLlaves = sistemaVirtual({ 'app/page.tsx': 'import { type A, Map } from "maplibre-gl"' })
    expect(cadenaHastaMaplibre('app/page.tsx', conTipoEnLlaves)).not.toBeNull()
    const soloTipoEnLlaves = sistemaVirtual({ 'app/page.tsx': 'import { type A } from "maplibre-gl"' })
    expect(cadenaHastaMaplibre('app/page.tsx', soloTipoEnLlaves)).not.toBeNull()
    expect(importsEstaticos('export type { A } from "maplibre-gl"')).toEqual([])
    expect(importsEstaticos('import type * as M from "maplibre-gl"')).toEqual([])
    expect(importsEstaticos('import type M from "maplibre-gl"')).toEqual([])
  })

  it('un comentario que nombra maplibre-gl o mapa-maplibre no cuenta', () => {
    const sistema = sistemaVirtual({
      'app/page.tsx': [
        '// import Mapa from "@/components/mapa/mapa-maplibre"',
        '/* import { Map } from "maplibre-gl" */',
        '/**',
        ' * import "maplibre-gl"',
        ' */',
        'export default function P() { return null }',
      ].join('\n'),
      'components/mapa/mapa-maplibre.tsx': 'import "maplibre-gl"',
    })
    expect(cadenaHastaMaplibre('app/page.tsx', sistema)).toBeNull()
  })

  it('un string que contiene la palabra import no se confunde con un import', () => {
    expect(importsEstaticos('const t = "para importar maplibre-gl hace falta"')).toEqual([])
    expect(importsEstaticos('const t = "import maplibre-gl"')).toEqual([])
  })

  it('los paquetes de node_modules no se siguen y no rompen (react, next/link, @qps/db)', () => {
    const sistema = sistemaVirtual({
      'app/page.tsx': 'import Link from "next/link"\nimport { useState } from "react"\nimport type { Database } from "@qps/db"',
    })
    expect(cadenaHastaMaplibre('app/page.tsx', sistema)).toBeNull()
  })

  it('un import local que no existe lanza (no queda como "no llega" por un error de resolución)', () => {
    const sistema = sistemaVirtual({ 'app/page.tsx': 'import { x } from "./no-existe"' })
    expect(() => cadenaHastaMaplibre('app/page.tsx', sistema)).toThrow(/no-existe/)
  })

  it('los ciclos de imports estáticos no cuelgan el recorrido', () => {
    const sistema = sistemaVirtual({
      'app/a.ts': 'import { b } from "./b"\nexport const a = 1',
      'app/b.ts': 'import { a } from "./a"\nexport const b = 1',
    })
    expect(cadenaHastaMaplibre('app/a.ts', sistema)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// El código real
// ---------------------------------------------------------------------------

const ENTRADAS = [
  'app/layout.tsx',
  'app/page.tsx',
  'app/buscar/page.tsx',
  'app/evento/[id]/page.tsx',
  'app/mapa/page.tsx',
]

describe('ninguna página llega a MapLibre por imports estáticos', () => {
  it.each(ENTRADAS)('%s', (entrada) => {
    expect(existsSync(path.join(WEB_ROOT, entrada)), `${entrada} tiene que existir`).toBe(true)
    expect(cadenaHastaMaplibre(entrada)).toBeNull()
  })

  it('el recorrido no es ciego: desde app/mapa/page.tsx llega a mapa-contenido, mapa-diferido y lista-lugares, pero no a mapa-maplibre', () => {
    const alcanzados = archivosAlcanzados('app/mapa/page.tsx')
    expect(alcanzados).toContain('app/mapa/mapa-contenido.tsx')
    expect(alcanzados).toContain('components/mapa/mapa-diferido.tsx')
    expect(alcanzados).toContain('components/mapa/lista-lugares.tsx')
    expect(alcanzados).not.toContain(ARCHIVO_MAPLIBRE)
  })

  it('el recorrido sigue los alias reales: desde app/layout.tsx llega a archivos de components/ y de packages/core', () => {
    const alcanzados = archivosAlcanzados('app/layout.tsx')
    expect([...alcanzados].some((archivo) => archivo.startsWith('components/'))).toBe(true)
    expect([...alcanzados].some((archivo) => archivo.startsWith('../../packages/core/src/'))).toBe(true)
  })

  it('el detector ve el archivo real de MapLibre: desde mapa-maplibre.tsx sí llega a maplibre-gl', () => {
    expect(cadenaHastaMaplibre(ARCHIVO_MAPLIBRE)).toEqual([ARCHIVO_MAPLIBRE])
    // y su CSS cuenta como llegada si fuera lo único que se importara
    expect(importsEstaticos(readFileSync(path.join(WEB_ROOT, ARCHIVO_MAPLIBRE), 'utf8'))).toEqual(
      expect.arrayContaining(['maplibre-gl', 'maplibre-gl/dist/maplibre-gl.css'])
    )
  })

  it('mapa-maplibre.tsx importa mapa-diferido solo como tipo, así que el diferido no llega por ahí', () => {
    const fuente = readFileSync(path.join(WEB_ROOT, ARCHIVO_MAPLIBRE), 'utf8')
    expect(sinComentarios(fuente)).toMatch(/import type \{ PropsMapa \} from ["']\.\/mapa-diferido["']/)
    expect(cadenaHastaMaplibre('components/mapa/mapa-diferido.tsx')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Dónde aparece maplibre en todo el código (no solo en el grafo de cinco páginas)
// ---------------------------------------------------------------------------

function archivosDeCodigo(dir: string): string[] {
  const salida: string[] = []
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (entrada.name === 'node_modules' || entrada.name === '.next') continue
    const completa = path.join(dir, entrada.name)
    if (entrada.isDirectory()) salida.push(...archivosDeCodigo(completa))
    else if (/\.(tsx?|jsx?|mjs)$/.test(entrada.name)) salida.push(completa)
  }
  return salida
}

describe('MapLibre en un solo archivo y solo con import() desde mapa-diferido', () => {
  const archivos = ['app', 'components', 'lib'].flatMap((carpeta) => archivosDeCodigo(path.join(WEB_ROOT, carpeta)))
  const relativo = (archivo: string) => path.relative(WEB_ROOT, archivo).split(path.sep).join('/')

  it('hay archivos para revisar (el barrido no está vacío)', () => {
    expect(archivos.length).toBeGreaterThan(100)
  })

  // Q3: maplibre-worker.ts también importa el paquete (solo `setWorkerUrl`),
  // y lo carga mapa-diferido con import(), igual que al mapa.
  it('solo mapa-maplibre.tsx y maplibre-worker.ts importan maplibre-gl (estático o dinámico)', () => {
    const importan = archivos
      .filter((archivo) => /(?:from\s+|import\s*\(?\s*|require\s*\(\s*)["'`]maplibre-gl(?:\/[^"'`]*)?["'`]/.test(sinComentarios(readFileSync(archivo, 'utf8'))))
      .map(relativo)
    expect(importan.sort()).toEqual([ARCHIVO_MAPLIBRE, 'components/mapa/maplibre-worker.ts'].sort())
  })

  it('maplibre-worker solo lo nombra mapa-diferido, con import()', () => {
    const nombran = archivos
      .filter((archivo) => /maplibre-worker["'`]/.test(sinComentarios(readFileSync(archivo, 'utf8'))))
      .map(relativo)
    expect(nombran).toEqual(['components/mapa/mapa-diferido.tsx'])
    const diferido = sinComentarios(readFileSync(path.join(WEB_ROOT, 'components/mapa/mapa-diferido.tsx'), 'utf8'))
    expect(diferido).toMatch(/import\(\s*["']\.\/maplibre-worker["']\s*\)/)
  })

  it('solo mapa-diferido.tsx nombra mapa-maplibre, y lo hace con import() (el import type de mapa-maplibre hacia mapa-diferido es al revés)', () => {
    const nombran = archivos
      .filter((archivo) => /mapa-maplibre["'`]/.test(sinComentarios(readFileSync(archivo, 'utf8'))))
      .map(relativo)
    expect(nombran).toEqual(['components/mapa/mapa-diferido.tsx'])

    const diferido = sinComentarios(readFileSync(path.join(WEB_ROOT, 'components/mapa/mapa-diferido.tsx'), 'utf8'))
    expect(diferido).toMatch(/import\(\s*["']\.\/mapa-maplibre["']\s*\)/)
    expect(diferido).not.toMatch(/(?:^|\n)\s*import\s+[^(\n]*["']\.\/mapa-maplibre["']/)
  })
})
