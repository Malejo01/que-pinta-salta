// 46-q (Ronda 46, calidad de la app), punto 5 del encargo: el código de
// MEDICIÓN (`scripts/pesos-bundle.mjs`, `scripts/pesos/analizar.ts`,
// `scripts/metro/inline-requires.js`, 46-e/46-g) no tiene que entrar al
// bundle de la app. Barrido estático de `app/**`, `components/**` y
// `lib/**`: ningún archivo importa (ni hace `require` de) nada bajo
// `scripts/`. Mismo estilo que `tests/dimensions.test.ts`/`tests/iconos.test.ts`
// (fixtures en memoria primero, `it.each` sobre los archivos reales después).
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const APP_DIR = join(MOBILE_ROOT, 'app')
const COMPONENTS_DIR = join(MOBILE_ROOT, 'components')
const LIB_DIR = join(MOBILE_ROOT, 'lib')

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
 * Líneas (1-based, fuera de comentarios) donde `content` importa o hace
 * `require` de algo bajo `scripts/` — ya sea relativo (`../scripts/...`,
 * `./scripts/...`) o, por si alguna vez se usara, un alias (`@/scripts/...`).
 * Recorte de comentarios línea por línea, mismo criterio que
 * `tests/dimensions.test.ts` (no confunde un comentario que solo
 * *menciona* "scripts/" con un import real).
 */
export function lineasQueImportanScripts(content: string): number[] {
  const lineasDeTexto = content.split('\n')
  const resultado: number[] = []
  let dentroDeBloqueComentario = false

  for (let i = 0; i < lineasDeTexto.length; i++) {
    let linea = lineasDeTexto[i]

    if (dentroDeBloqueComentario) {
      const finBloque = linea.indexOf('*/')
      if (finBloque === -1) continue
      linea = linea.slice(finBloque + 2)
      dentroDeBloqueComentario = false
    }

    const inicioBloque = linea.indexOf('/*')
    if (inicioBloque !== -1 && linea.indexOf('*/', inicioBloque + 2) === -1) {
      linea = linea.slice(0, inicioBloque)
      dentroDeBloqueComentario = true
    }

    const idxComentarioDeLinea = linea.search(/(^|\s)\/\//)
    const sinComentario = idxComentarioDeLinea === -1 ? linea : linea.slice(0, idxComentarioDeLinea)

    const re = /\bfrom\s+['"]([^'"]+)['"]|\brequire\(\s*['"]([^'"]+)['"]\s*\)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(sinComentario))) {
      const ruta = m[1] ?? m[2]
      if (/(^|\/)scripts\//.test(ruta)) {
        resultado.push(i + 1)
        break
      }
    }
  }

  return resultado
}

describe('lineasQueImportanScripts (fixtures en memoria: tiene que fallar de verdad)', () => {
  it('detecta un import relativo de scripts/', () => {
    expect(lineasQueImportanScripts(`import { analizar } from '../scripts/pesos/analizar'`)).toEqual([1])
  })

  it('detecta un import con alias @/scripts/', () => {
    expect(lineasQueImportanScripts(`import x from '@/scripts/pesos/analizar'`)).toEqual([1])
  })

  it('detecta un require de scripts/', () => {
    expect(lineasQueImportanScripts(`const x = require('../../scripts/metro/inline-requires')`)).toEqual([1])
  })

  it('no confunde un import que NO es de scripts/ (aunque el nombre del paquete contenga "scripts")', () => {
    expect(lineasQueImportanScripts(`import { x } from '@/lib/scripts-utiles'`)).toEqual([])
  })

  it('un comentario que menciona "scripts/" no cuenta', () => {
    const original = `// antes esto importaba de '../scripts/pesos/analizar', ya no\nimport { x } from '@/lib/formato'`
    expect(lineasQueImportanScripts(original)).toEqual([])
  })

  it('sin ningún import de scripts/: []', () => {
    expect(lineasQueImportanScripts(`import { View } from 'react-native'`)).toEqual([])
  })
})

describe('app/, components/ y lib/: ningún archivo importa nada de scripts/ (46-e/46-g: el código de medición no entra al bundle)', () => {
  const archivos = [...listarTsxYTs(APP_DIR), ...listarTsxYTs(COMPONENTS_DIR), ...listarTsxYTs(LIB_DIR)]

  it('encuentra archivos para analizar', () => {
    expect(archivos.length).toBeGreaterThan(0)
  })

  it.each(archivos.map((file) => [relative(MOBILE_ROOT, file).replace(/\\/g, '/'), file] as const))('%s', (label, file) => {
    const content = readFileSync(file, 'utf8')
    const lineas = lineasQueImportanScripts(content)
    if (lineas.length > 0) {
      throw new Error(`${label}: importa algo de scripts/ en la(s) línea(s) ${lineas.join(', ')} — el código de medición no puede entrar al bundle`)
    }
    expect(lineas).toEqual([])
  })
})
