// 25-c, punto 1: único camino para los íconos de la app es `components/Icono.tsx`,
// que siempre pasa `name={{ ios, android, web }}` a `SymbolView` (nunca un
// string suelto: la doc de expo-symbols dice que en Android/web, con un
// string suelto y sin `fallback`, "nothing will be rendered").
//
// TypeScript ya impide, por tipos, pasarle a `<Icono nombre=...>` algo que no
// sea un `NombreIcono` (un objeto `{ ios, android }`) si se usa una variable
// ya tipada (`nombre={nombre}`, `nombre={ICONOS.inicio}`): eso lo cubre
// `apps/mobile run typecheck`, no este test. Lo que el type-checker NO
// atrapa es (a) un string literal metido directo (`nombre="home"`, que de
// hecho SÍ tipa mal así que tsc lo rechazaría — pero igual lo cubrimos para
// no depender solo de eso) y, sobre todo, (b) que alguien use `SymbolView`
// directo en otro archivo, sin pasar por `Icono`, con un string suelto: ahí
// no hay ningún tipo de `NombreIcono` que lo impida. Por eso el barrido real
// recorre todos los `.tsx`/`.ts` de `app/` y `components/` y falla si
// `SymbolView` aparece fuera de `components/Icono.tsx`, o si dentro de
// `Icono.tsx` el `name=` que recibe no es un objeto con `android`.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const APP_DIR = join(MOBILE_ROOT, 'app')
const COMPONENTS_DIR = join(MOBILE_ROOT, 'components')
const ICONO_RELATIVO = join('components', 'Icono.tsx')

interface Violation {
  line: number
  message: string
}

function lineAt(content: string, index: number): number {
  return content.slice(0, index).split('\n').length
}

/** El valor de un atributo JSX `attr={...}` (balanceando llaves), o `attr="..."` / `attr='...'`. */
function leerValorAtributo(content: string, desdeIndex: number): string | null {
  let i = desdeIndex
  while (i < content.length && /\s/.test(content[i])) i++
  if (content[i] === '"' || content[i] === "'") {
    const comilla = content[i]
    const fin = content.indexOf(comilla, i + 1)
    if (fin === -1) return null
    return content.slice(i, fin + 1)
  }
  if (content[i] === '{') {
    let profundidad = 0
    let j = i
    for (; j < content.length; j++) {
      if (content[j] === '{') profundidad++
      else if (content[j] === '}') {
        profundidad--
        if (profundidad === 0) {
          j++
          break
        }
      }
    }
    return content.slice(i, j)
  }
  return null
}

/**
 * Violaciones de un archivo `.tsx`/`.ts`, dado si es o no `components/Icono.tsx`:
 * - Cualquier archivo que NO sea `Icono.tsx`: no puede importar ni usar
 *   `SymbolView` (ese es el único wrapper aprobado).
 * - `Icono.tsx`: el `name=` que le pasa a `SymbolView` tiene que ser un
 *   objeto literal con la clave `android` adentro (nunca un string).
 * - Cualquier archivo: `<Icono ... nombre=` con un string literal (comillas)
 *   es siempre una violación, sin importar el archivo (eso ni compila, pero
 *   lo detectamos igual para no depender solo de `tsc`).
 */
export function encontrarViolacionesDeIconos(content: string, esArchivoIcono: boolean): Violation[] {
  const violaciones: Violation[] = []

  if (!esArchivoIcono && /\bSymbolView\b/.test(content)) {
    const idx = content.search(/\bSymbolView\b/)
    violaciones.push({
      line: lineAt(content, idx),
      message: 'usa SymbolView directo: el único wrapper aprobado es components/Icono.tsx',
    })
  }

  if (esArchivoIcono) {
    const nameAttrRe = /<SymbolView\b[^>]*?\bname\s*=/g
    let m: RegExpExecArray | null
    while ((m = nameAttrRe.exec(content))) {
      const attrStart = m.index + m[0].length
      const valor = leerValorAtributo(content, attrStart)
      const esObjetoConAndroid = Boolean(valor) && valor!.startsWith('{') && /\bandroid\s*:/.test(valor!)
      if (!esObjetoConAndroid) {
        violaciones.push({
          line: lineAt(content, m.index),
          message: `SymbolView con name=${valor ?? '?'} (no es un objeto {ios, android, ...})`,
        })
      }
    }
  }

  const nombreAttrRe = /<Icono\b[^>]*?\bnombre\s*=/g
  let m: RegExpExecArray | null
  while ((m = nombreAttrRe.exec(content))) {
    const attrStart = m.index + m[0].length
    const valor = leerValorAtributo(content, attrStart)
    const esStringLiteral = Boolean(valor) && (valor!.startsWith('"') || valor!.startsWith("'"))
    if (esStringLiteral) {
      violaciones.push({
        line: lineAt(content, m.index),
        message: `<Icono nombre=${valor}>: string suelto (no dibuja nada en Android/web sin fallback)`,
      })
    }
  }

  return violaciones.sort((a, b) => a.line - b.line)
}

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

describe('encontrarViolacionesDeIconos (fixtures en memoria: tiene que fallar de verdad)', () => {
  it('detecta SymbolView usado fuera de Icono.tsx', () => {
    const v = encontrarViolacionesDeIconos(`import { SymbolView } from 'expo-symbols'\n<SymbolView name="house.fill" />`, false)
    expect(v.length).toBeGreaterThanOrEqual(1)
    expect(v.some((x) => x.message.includes('único wrapper aprobado'))).toBe(true)
  })

  it('dentro de Icono.tsx, detecta SymbolView con name="..." (string suelto)', () => {
    const v = encontrarViolacionesDeIconos(`<SymbolView name="house.fill" size={24} />`, true)
    expect(v).toHaveLength(1)
    expect(v[0].message).toMatch(/SymbolView/)
  })

  it("dentro de Icono.tsx, detecta SymbolView con name='...' (comillas simples)", () => {
    expect(encontrarViolacionesDeIconos(`<SymbolView name='house.fill' />`, true)).toHaveLength(1)
  })

  it('dentro de Icono.tsx, acepta SymbolView con name={{ ios, android, web }}', () => {
    expect(
      encontrarViolacionesDeIconos(
        `<SymbolView name={{ ios: nombre.ios, android: nombre.android, web: nombre.android }} />`,
        true
      )
    ).toEqual([])
  })

  it('dentro de Icono.tsx, detecta un objeto incompleto (sin android)', () => {
    expect(encontrarViolacionesDeIconos(`<SymbolView name={{ ios: nombre.ios }} />`, true)).toHaveLength(1)
  })

  it('detecta <Icono nombre="home" /> (string suelto), en cualquier archivo', () => {
    const v = encontrarViolacionesDeIconos(`<Icono nombre="home" />`, false)
    expect(v).toHaveLength(1)
    expect(v[0].message).toMatch(/string suelto/)
  })

  it("acepta <Icono nombre={nombre} /> (variable ya tipada NombreIcono: lo cubre tsc)", () => {
    expect(encontrarViolacionesDeIconos(`<Icono nombre={nombre} color={color} />`, false)).toEqual([])
  })

  it('acepta <Icono nombre={{ ios: "x", android: "y" }} />', () => {
    expect(encontrarViolacionesDeIconos(`<Icono nombre={{ ios: 'x', android: 'y' }} />`, false)).toEqual([])
  })

  it('reporta varias violaciones, cada una con su línea', () => {
    const content = `<Icono nombre="a" />\n<Icono nombre='b' />\n`
    const v = encontrarViolacionesDeIconos(content, false)
    expect(v.map((x) => x.line)).toEqual([1, 2])
  })
})

describe('app/ y components/: SymbolView solo en Icono.tsx, y nadie le pasa a Icono un string suelto', () => {
  const archivos = [...listarTsxYTs(APP_DIR), ...listarTsxYTs(COMPONENTS_DIR)]

  it('encuentra al menos un archivo para analizar, incluido Icono.tsx', () => {
    expect(archivos.length).toBeGreaterThan(0)
    expect(archivos.some((f) => relative(MOBILE_ROOT, f) === ICONO_RELATIVO)).toBe(true)
  })

  it.each(archivos.map((file) => [relative(MOBILE_ROOT, file), file] as const))('%s', (label, file) => {
    const content = readFileSync(file, 'utf8')
    const violaciones = encontrarViolacionesDeIconos(content, label === ICONO_RELATIVO)
    if (violaciones.length > 0) {
      const detalle = violaciones.map((v) => `  ${label}:${v.line} — ${v.message}`).join('\n')
      throw new Error(`Ícono mal pasado:\n${detalle}`)
    }
    expect(violaciones).toEqual([])
  })
})
