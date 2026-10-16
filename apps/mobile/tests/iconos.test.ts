// 29-g (D2): `Icono` pasó de `expo-symbols` a `lucide-react-native`. El
// único wrapper aprobado sigue siendo `components/Icono.tsx` — nadie más
// importa `lucide-react-native` directo. Mismo patrón de barrido que
// `tests/estado-carga-detector.test.ts` y la versión anterior de este
// archivo (que probaba lo mismo para `expo-symbols`/`SymbolView`).
//
// R29-q (integración de la tanda 3, punto D): se sumaron al union los 12
// íconos por categoría que faltaban (`apps/web/lib/category-icons.ts`:
// Guitar, Wine, Theater, Store, Palette, Star, Smile, Baby, Trophy, Zap,
// Landmark, Flame — Film y Calendar ya estaban). El barrido de más abajo no
// cambia (sigue siendo genérico: nadie fuera de Icono.tsx importa
// lucide-react-native, sin que importe la lista de nombres); se agrega un
// describe aparte que compara `iconoPorCategoria` (el mapeo único que ahora
// usan `FilaCategoria.tsx` y `app/(tabs)/buscar.tsx`) contra `getCategoryIcon`
// de la web, por NOMBRE de ícono (son dos librerías distintas — `lucide-react`
// en la web, `lucide-react-native` acá — así que se compara el nombre
// exportado, no la identidad del componente).
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

// Parche de categoría → ícono, comparado por TEXTO en los dos lados (no se
// importa ninguno de los dos archivos: `category-icons.ts` importa
// `lucide-react`, y `Icono.tsx` importa `lucide-react-native` + `react-native`
// — este último rompe bajo el entorno `node` de este archivo de tests, ver
// el comentario de `vitest.config.ts`: "sin React Native"). Mismo criterio
// de "recorte de texto en vez de evaluar" que ya usa `tests/url-segura.test.ts`
// con `next.config.mjs`.
describe('ICONO_POR_CATEGORIA de Icono.tsx: el mismo mapeo que getCategoryIcon de la web (por nombre de ícono)', () => {
  const CATEGORY_ICONS_PATH = fileURLToPath(new URL('../../web/lib/category-icons.ts', import.meta.url))
  const webSrc = readFileSync(CATEGORY_ICONS_PATH, 'utf8')
  const iconoSrc = readFileSync(join(MOBILE_ROOT, ICONO_RELATIVO), 'utf8')

  // Recorte de `const categoryIcons: Record<string, LucideIcon> = { ... }`
  // (valores como identificador, p. ej. `penas: Guitar`).
  const bloqueWebMatch = webSrc.match(/const categoryIcons[^=]*=\s*\{([\s\S]*?)\n\}/)
  // Recorte de `const ICONO_POR_CATEGORIA: ... = { ... }` (valores como
  // string, p. ej. `penas: 'Guitar'`).
  const bloqueAppMatch = iconoSrc.match(/const ICONO_POR_CATEGORIA[^=]*=\s*\{([\s\S]*?)\n\}/)

  it('encuentra el mapeo categoryIcons en category-icons.ts y ICONO_POR_CATEGORIA en Icono.tsx', () => {
    expect(bloqueWebMatch).not.toBeNull()
    expect(bloqueAppMatch).not.toBeNull()
  })

  const entradasWeb = new Map(
    [...(bloqueWebMatch?.[1] ?? '').matchAll(/(\w+):\s*(\w+)/g)].map(([, slug, icono]) => [slug, icono])
  )
  const entradasApp = new Map(
    [...(bloqueAppMatch?.[1] ?? '').matchAll(/(\w+):\s*'(\w+)'/g)].map(([, slug, icono]) => [slug, icono])
  )

  it('sanity check: hay al menos una entrada parseada de cada lado (si no, el recorte está mal)', () => {
    expect(entradasWeb.size).toBeGreaterThan(0)
    expect(entradasApp.size).toBeGreaterThan(0)
  })

  it('las dos categorías con el ícono repetido (recitales -> Guitar) también están en la web', () => {
    expect(entradasWeb.get('recitales')).toBe('Guitar')
    expect(entradasApp.get('recitales')).toBe('Guitar')
  })

  it.each([...entradasWeb.entries()])('%s -> %s (igual en Icono.tsx)', (slug, iconoWeb) => {
    expect(entradasApp.get(slug)).toBe(iconoWeb)
  })

  it('Icono.tsx no tiene categorías de más que no estén en la web', () => {
    for (const slug of entradasApp.keys()) {
      expect(entradasWeb.has(slug)).toBe(true)
    }
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
