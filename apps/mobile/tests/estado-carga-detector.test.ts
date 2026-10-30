// 28-q, parte B, punto 19 (28-c): ninguna de las 8 pantallas que ahora usan
// `components/EstadoCarga` volvió a escribir su propio "Reintentar" a mano
// (un `<Text>Reintentar</Text>` literal), y todas importan `ErrorCarga` de
// ahí. Dos barridos, mismo estilo que `tests/iconos.test.ts` y
// `tests/dimensions.test.ts`:
//
// 1. Ningún archivo de `app/` o `components/` tiene un `<Text>Reintentar</Text>`
//    escrito a mano, salvo dos excepciones documentadas (ver ARCHIVOS_EXCLUIDOS):
//    `components/EstadoCarga.tsx` (es la definición canónica: tiene que
//    escribirlo una vez, para que todos los demás lo importen) y
//    `app/_layout.tsx` (el `ErrorBoundary` de 28-a: se renderiza fuera del
//    árbol normal — puede montarse antes de que exista `SessionProvider`/
//    `ThemeProvider` — así que no puede depender de `EstadoCarga`; tiene su
//    propio botón "Reintentar" a propósito, ya probado por su cuenta en
//    28-a).
// 2. Las 8 pantallas de 28-c importan `ErrorCarga` de `@/components/EstadoCarga`.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { quitarComentarios } from '@qps/core/tests/convencion-entorno'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const APP_DIR = join(MOBILE_ROOT, 'app')
const COMPONENTS_DIR = join(MOBILE_ROOT, 'components')

// Las dos excepciones documentadas (ver cabecera del archivo).
const ARCHIVOS_EXCLUIDOS = new Set([
  join('components', 'EstadoCarga.tsx'),
  join('app', '_layout.tsx'),
])

const PANTALLAS_CON_ERROR_CARGA = [
  join('app', '(tabs)', 'index.tsx'),
  join('app', '(tabs)', 'buscar.tsx'),
  join('app', '(tabs)', 'favoritos.tsx'),
  join('app', 'cines.tsx'),
  join('app', 'evento', '[id].tsx'),
  join('app', 'pelicula', '[id].tsx'),
  join('components', 'PantallaRadar.tsx'), // reemplazó a SeccionRadar.tsx (29-d), que se borró el 16/10
  join('components', 'SeccionNotificaciones.tsx'),
] as const

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

function lineAt(content: string, index: number): number {
  return content.slice(0, index).split('\n').length
}



/** Las líneas (1-based) donde aparece un `<Text ...>Reintentar</Text>` literal, fuera de comentarios. */
export function lineasConReintentarEscritoAMano(content: string): number[] {
  const limpio = quitarComentarios(content)
  const regex = /<Text\b[^>]*>\s*Reintentar\s*<\/Text>/g
  const resultado: number[] = []
  let m: RegExpExecArray | null
  while ((m = regex.exec(limpio))) {
    resultado.push(lineAt(limpio, m.index))
  }
  return resultado
}

/** `true` si `content` importa `ErrorCarga` de `@/components/EstadoCarga`. */
export function importaErrorCarga(content: string): boolean {
  return /import\s*\{[^}]*\bErrorCarga\b[^}]*\}\s*from\s*['"]@\/components\/EstadoCarga['"]/.test(content)
}

describe('lineasConReintentarEscritoAMano (fixtures en memoria: tiene que fallar de verdad)', () => {
  it('detecta <Text>Reintentar</Text> literal', () => {
    expect(lineasConReintentarEscritoAMano('<Text>Reintentar</Text>')).toEqual([1])
  })

  it('detecta con atributos de estilo', () => {
    const content = `<Text style={[estilos.textoBoton, { color: colors.text }]}>Reintentar</Text>`
    expect(lineasConReintentarEscritoAMano(content)).toEqual([1])
  })

  it('no confunde onReintentar (prop) con un Text escrito a mano', () => {
    const content = `<ErrorCarga mensaje={estado.error} onReintentar={cargar} />`
    expect(lineasConReintentarEscritoAMano(content)).toEqual([])
  })

  it('no confunde un Text con una variable (mensaje real: viene de ErrorCarga, dinámico)', () => {
    const content = `<Text style={estilos.textoBoton}>{textoBoton}</Text>`
    expect(lineasConReintentarEscritoAMano(content)).toEqual([])
  })

  it('no confunde un comentario que menciona "Reintentar" con un uso real', () => {
    const content = [
      '// El botón "Reintentar" vive en components/EstadoCarga.tsx, no acá.',
      'export function Pantalla() { return null }',
    ].join('\n')
    expect(lineasConReintentarEscritoAMano(content)).toEqual([])
  })

  it('no confunde un bloque /* ... */ que menciona Reintentar con un uso real', () => {
    const content = ['/**', ' * Ver EstadoCarga para el botón Reintentar.', ' */', 'function f() {}'].join('\n')
    expect(lineasConReintentarEscritoAMano(content)).toEqual([])
  })

  it('reporta varias líneas', () => {
    const content = ['<Text>Reintentar</Text>', 'const x = 1', "<Text>Reintentar</Text>"].join('\n')
    expect(lineasConReintentarEscritoAMano(content)).toEqual([1, 3])
  })
})

describe('importaErrorCarga (fixtures en memoria)', () => {
  it('detecta el import real', () => {
    expect(importaErrorCarga(`import { Cargando, ErrorCarga, Vacio } from '@/components/EstadoCarga'`)).toBe(true)
  })

  it('detecta el import con comillas simples', () => {
    expect(importaErrorCarga(`import { ErrorCarga } from '@/components/EstadoCarga'`)).toBe(true)
  })

  it('sin ErrorCarga en las llaves: false', () => {
    expect(importaErrorCarga(`import { Cargando } from '@/components/EstadoCarga'`)).toBe(false)
  })

  it('sin import de EstadoCarga en absoluto: false', () => {
    expect(importaErrorCarga(`import { ErrorCarga } from './otro-lugar'`)).toBe(false)
  })
})

describe('app/ y components/: ningún "Reintentar" escrito a mano, salvo las excepciones documentadas', () => {
  const archivos = [...listarTsxYTs(APP_DIR), ...listarTsxYTs(COMPONENTS_DIR)]

  it('encuentra archivos para analizar, incluidas las dos excepciones', () => {
    expect(archivos.length).toBeGreaterThan(0)
    const relativos = archivos.map((f) => relative(MOBILE_ROOT, f))
    for (const excluido of ARCHIVOS_EXCLUIDOS) {
      expect(relativos).toContain(excluido)
    }
  })

  it.each(archivos.map((file) => [relative(MOBILE_ROOT, file), file] as const))('%s', (label, file) => {
    if (ARCHIVOS_EXCLUIDOS.has(label)) {
      // components/EstadoCarga.tsx: la definición canónica.
      // app/_layout.tsx: el ErrorBoundary, fuera del árbol normal (ver cabecera).
      return
    }
    const content = readFileSync(file, 'utf8')
    const lineas = lineasConReintentarEscritoAMano(content)
    if (lineas.length > 0) {
      throw new Error(`${label}: "Reintentar" escrito a mano en la(s) línea(s) ${lineas.join(', ')} (usar components/EstadoCarga)`)
    }
    expect(lineas).toEqual([])
  })
})

describe.each(PANTALLAS_CON_ERROR_CARGA)('%s: importa ErrorCarga de components/EstadoCarga', (ruta) => {
  const file = join(MOBILE_ROOT, ruta)
  const content = readFileSync(file, 'utf8')

  it('sí lo importa', () => {
    if (!importaErrorCarga(content)) {
      throw new Error(`${ruta}: no importa ErrorCarga de '@/components/EstadoCarga'`)
    }
    expect(importaErrorCarga(content)).toBe(true)
  })
})
