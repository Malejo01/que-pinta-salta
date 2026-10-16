// 29-g (D2): `Icono` pasó de `expo-symbols` a `lucide-react-native`. El
// único wrapper aprobado sigue siendo `components/Icono.tsx` — nadie más
// importa `lucide-react-native` directo. Mismo patrón de barrido que
// `tests/estado-carga-detector.test.ts` y la versión anterior de este
// archivo (que probaba lo mismo para `expo-symbols`/`SymbolView`).
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const APP_DIR = join(MOBILE_ROOT, 'app')
const COMPONENTS_DIR = join(MOBILE_ROOT, 'components')
const ICONO_RELATIVO = join('components', 'Icono.tsx')

/** `true` si `content` importa (o hace `require` de) `lucide-react-native`,
 * de cualquier forma: `import ... from 'lucide-react-native'`,
 * `import ... from "lucide-react-native"` o `require('lucide-react-native')`. */
export function importaLibreriaDeIconos(content: string): boolean {
  return (
    /\bfrom\s+['"]lucide-react-native['"]/.test(content) ||
    /\brequire\(\s*['"]lucide-react-native['"]\s*\)/.test(content)
  )
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

describe('importaLibreriaDeIconos (fixtures en memoria: tiene que fallar de verdad)', () => {
  it("detecta un import con comillas simples", () => {
    expect(importaLibreriaDeIconos(`import { Home } from 'lucide-react-native'`)).toBe(true)
  })

  it('detecta un import con comillas dobles', () => {
    expect(importaLibreriaDeIconos(`import { Home } from "lucide-react-native"`)).toBe(true)
  })

  it('detecta un require', () => {
    expect(importaLibreriaDeIconos(`const { Home } = require('lucide-react-native')`)).toBe(true)
  })

  it('no confunde un import de otro paquete (p. ej. react-native-svg)', () => {
    expect(importaLibreriaDeIconos(`import { Svg } from 'react-native-svg'`)).toBe(false)
  })

  it('no confunde un import de @/components/Icono', () => {
    expect(importaLibreriaDeIconos(`import { Icono } from '@/components/Icono'`)).toBe(false)
  })

  it('sin ningún import: false', () => {
    expect(importaLibreriaDeIconos(`export function Pantalla() { return null }`)).toBe(false)
  })
})

describe('app/ y components/: lucide-react-native solo se importa en components/Icono.tsx', () => {
  const archivos = [...listarTsxYTs(APP_DIR), ...listarTsxYTs(COMPONENTS_DIR)]

  it('encuentra al menos un archivo para analizar, incluido Icono.tsx', () => {
    expect(archivos.length).toBeGreaterThan(0)
    expect(archivos.some((f) => relative(MOBILE_ROOT, f) === ICONO_RELATIVO)).toBe(true)
  })

  it('components/Icono.tsx sí importa lucide-react-native (es el wrapper)', () => {
    const content = readFileSync(join(MOBILE_ROOT, ICONO_RELATIVO), 'utf8')
    expect(importaLibreriaDeIconos(content)).toBe(true)
  })

  it.each(
    archivos
      .map((file) => [relative(MOBILE_ROOT, file), file] as const)
      .filter(([label]) => label !== ICONO_RELATIVO)
  )('%s: no importa lucide-react-native directo', (label, file) => {
    const content = readFileSync(file, 'utf8')
    if (importaLibreriaDeIconos(content)) {
      throw new Error(`${label}: importa lucide-react-native directo (el único wrapper aprobado es components/Icono.tsx)`)
    }
    expect(importaLibreriaDeIconos(content)).toBe(false)
  })
})
