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
const LIB_DIR = join(MOBILE_ROOT, 'lib')
const ICONO_RELATIVO = join('components', 'Icono.tsx')

/** `true` si `content` importa (o hace `require` de) el BARREL
 * `lucide-react-native` (el paquete entero, sin subpath), de cualquier
 * forma: `import ... from 'lucide-react-native'`,
 * `import ... from "lucide-react-native"` o `require('lucide-react-native')`.
 * No distingue `import type` de un import de valores — para eso está
 * `importaValorDelBarrelDeIconos`, más abajo. */
export function importaLibreriaDeIconos(content: string): boolean {
  return (
    /\bfrom\s+['"]lucide-react-native['"]/.test(content) ||
    /\brequire\(\s*['"]lucide-react-native['"]\s*\)/.test(content)
  )
}

/** `true` si `content` importa (o hace `require` de) un SUBPATH de
 * `lucide-react-native` (p. ej. `lucide-react-native/icons/house`). 46-f:
 * cada ícono pasa a importarse por su propio archivo bajo `lucide-react-native/icons/*`
 * — permitido solo en `components/Icono.tsx`, igual que el barrel. */
export function importaSubpathDeIconos(content: string): boolean {
  return (
    /\bfrom\s+['"]lucide-react-native\/[^'"]+['"]/.test(content) ||
    /\brequire\(\s*['"]lucide-react-native\/[^'"]+['"]\s*\)/.test(content)
  )
}

/** `true` si `content` importa el barrel `lucide-react-native` (de cualquier
 * forma: barrel bare, no subpath), SIN que sea un `import type` — es decir,
 * un import que mete valores (componentes) del paquete entero al bundle de
 * Metro (que no hace tree-shaking). `import type { LucideIcon } from
 * 'lucide-react-native'` da `false` (los tipos no entran al bundle); un
 * `import { X } from 'lucide-react-native'` (como el que suma R42-c para
 * `CalendarPlus`, si entra después de esta tarea) da `true`.
 *
 * El `(?!\n\s*import\b)` acota cada intento de match a UNA sola declaración
 * de import (no cruza a la siguiente línea que empiece con `import`), para
 * no confundir un `import type` real con un import de valores que aparezca
 * más abajo en el archivo (y viceversa). */
export function importaValorDelBarrelDeIconos(content: string): boolean {
  if (/\brequire\(\s*['"]lucide-react-native['"]\s*\)/.test(content)) return true
  const regex = /^import\s+(type\s+)?(?:(?!\n\s*import\b)[\s\S])*?from\s+['"]lucide-react-native['"]/gm
  for (const match of content.matchAll(regex)) {
    if (!match[1]) return true
  }
  return false
}

/** Mensaje de falla para cuando una clave de `ICONOS_LUCIDE` no tiene su
 * propio `import ... from 'lucide-react-native/icons/<archivo>'` en
 * `Icono.tsx` — el caso de R42-c, que suma `CalendarPlus` por el barrel. */
export function mensajeFaltaImportSubpath(nombre: string): string {
  return `sumá el ícono con \`import ${nombre} from 'lucide-react-native/icons/<archivo>'\` en \`Icono.tsx\`.`
}

/** `true` si `iconoSrc` (el contenido de `Icono.tsx`) tiene un
 * `import <nombre> from 'lucide-react-native/icons/<archivo>'` para
 * `nombre`. No valida el nombre del archivo (eso lo verificó el programador
 * a mano contra `lucide-react-native.mjs`, no hay forma mecánica de
 * derivarlo: `Home` -> `house`, `Smile` -> `face-slightly-smiling`). */
export function tieneImportPorSubpath(iconoSrc: string, nombre: string): boolean {
  const regex = new RegExp(`import\\s+${nombre}\\s+from\\s+['"]lucide-react-native/icons/[\\w-]+['"]`)
  return regex.test(iconoSrc)
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

// 46-f: cada ícono pasa a importarse por subpath (`lucide-react-native/icons/*`)
// en vez del barrel. Mismo patrón de fixtures "tiene que fallar de verdad"
// que el describe de arriba.
describe('importaSubpathDeIconos (fixtures en memoria: tiene que fallar de verdad)', () => {
  it('detecta un import de subpath con comillas simples', () => {
    expect(importaSubpathDeIconos(`import Home from 'lucide-react-native/icons/house'`)).toBe(true)
  })

  it('detecta un import de subpath con comillas dobles', () => {
    expect(importaSubpathDeIconos(`import Home from "lucide-react-native/icons/house"`)).toBe(true)
  })

  it('detecta un require de subpath', () => {
    expect(importaSubpathDeIconos(`const Home = require('lucide-react-native/icons/house')`)).toBe(true)
  })

  it('no confunde el import del barrel (eso lo cubre importaLibreriaDeIconos)', () => {
    expect(importaSubpathDeIconos(`import { Home } from 'lucide-react-native'`)).toBe(false)
  })

  it('no confunde un import de otro paquete', () => {
    expect(importaSubpathDeIconos(`import { Svg } from 'react-native-svg'`)).toBe(false)
  })

  it('sin ningún import: false', () => {
    expect(importaSubpathDeIconos(`export function Pantalla() { return null }`)).toBe(false)
  })
})

// 46-f: dentro de Icono.tsx (el único wrapper permitido), el barrel solo
// puede entrar por `import type` — nunca con valores. Este es el detector
// que tiene que agarrar el caso de R42-c (`CalendarPlus` sumado por el
// barrel): se prueba a mano acá (fixtures), y también contra el archivo
// real más abajo.
describe('importaValorDelBarrelDeIconos (fixtures en memoria: tiene que fallar de verdad, incluido el caso de R42-c)', () => {
  it('un import type del barrel: false (los tipos no entran al bundle)', () => {
    expect(importaValorDelBarrelDeIconos(`import type { LucideIcon } from 'lucide-react-native'`)).toBe(false)
  })

  it('un import de valores con llaves: true', () => {
    expect(importaValorDelBarrelDeIconos(`import { Home } from 'lucide-react-native'`)).toBe(true)
  })

  it('el caso de R42-c: CalendarPlus sumado por el barrel junto al import type que ya está: true', () => {
    const content = `import type { LucideIcon } from 'lucide-react-native'\nimport { CalendarPlus } from 'lucide-react-native'\n`
    expect(importaValorDelBarrelDeIconos(content)).toBe(true)
  })

  it('un import type seguido de puros imports por subpath (el estado post-46-f): false', () => {
    const content = `import type { LucideIcon } from 'lucide-react-native'\nimport Home from 'lucide-react-native/icons/house'\nimport Search from 'lucide-react-native/icons/search'\n`
    expect(importaValorDelBarrelDeIconos(content)).toBe(false)
  })

  it('un require del barrel: true', () => {
    expect(importaValorDelBarrelDeIconos(`const { Home } = require('lucide-react-native')`)).toBe(true)
  })

  it('sin ningún import del barrel: false', () => {
    expect(importaValorDelBarrelDeIconos(`import Home from 'lucide-react-native/icons/house'`)).toBe(false)
  })
})

// 46-f: el mensaje de falla tiene que decir exactamente cómo se arregla —
// es para quien sume un ícono nuevo por el barrel (R42-c, si entra después).
describe('tieneImportPorSubpath / mensajeFaltaImportSubpath (fixtures en memoria, el caso de R42-c)', () => {
  it('detecta el import por subpath cuando existe', () => {
    const src = `import CalendarPlus from 'lucide-react-native/icons/calendar-plus'\n`
    expect(tieneImportPorSubpath(src, 'CalendarPlus')).toBe(true)
  })

  it('no lo detecta si el ícono sigue viniendo del barrel (caso R42-c)', () => {
    const src = `import { CalendarPlus } from 'lucide-react-native'\n`
    expect(tieneImportPorSubpath(src, 'CalendarPlus')).toBe(false)
  })

  it('no confunde el import por subpath de otro ícono', () => {
    const src = `import Home from 'lucide-react-native/icons/house'\n`
    expect(tieneImportPorSubpath(src, 'CalendarPlus')).toBe(false)
  })

  it('el mensaje de falla dice cómo arreglarlo', () => {
    expect(mensajeFaltaImportSubpath('CalendarPlus')).toBe(
      "sumá el ícono con `import CalendarPlus from 'lucide-react-native/icons/<archivo>'` en `Icono.tsx`."
    )
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

describe('app/, components/ y lib/: lucide-react-native (barrel o subpath) solo se importa en components/Icono.tsx', () => {
  // 46-f: se suma lib/ al barrido (antes solo app/ y components/) y se
  // detectan también los subpaths (`lucide-react-native/icons/*`), no solo
  // el barrel bare — sin aflojar lo que ya se controlaba.
  const archivos = [...listarTsxYTs(APP_DIR), ...listarTsxYTs(COMPONENTS_DIR), ...listarTsxYTs(LIB_DIR)]

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

  it.each(
    archivos
      .map((file) => [relative(MOBILE_ROOT, file), file] as const)
      .filter(([label]) => label !== ICONO_RELATIVO)
  )('%s: no importa ningún subpath de lucide-react-native', (label, file) => {
    const content = readFileSync(file, 'utf8')
    if (importaSubpathDeIconos(content)) {
      throw new Error(`${label}: importa un subpath de lucide-react-native directo (el único wrapper aprobado es components/Icono.tsx)`)
    }
    expect(importaSubpathDeIconos(content)).toBe(false)
  })
})

// 46-f: dentro de components/Icono.tsx (el único wrapper permitido), el
// barrel solo puede entrar por `import type` — los íconos (valores) tienen
// que venir cada uno de su propio subpath. Si esto se afloja, Metro vuelve
// a meter el paquete entero al bundle (no hace tree-shaking).
describe('components/Icono.tsx: el barrel lucide-react-native solo se usa para `import type`', () => {
  const iconoSrc = readFileSync(join(MOBILE_ROOT, ICONO_RELATIVO), 'utf8')

  it('no importa valores del barrel (ningún import sin `type` desde \'lucide-react-native\')', () => {
    expect(importaValorDelBarrelDeIconos(iconoSrc)).toBe(false)
  })

  it('sigue importando el tipo LucideIcon del barrel (si no, revisar que no se perdió el import type)', () => {
    expect(importaLibreriaDeIconos(iconoSrc)).toBe(true)
  })
})

// 46-f: cada clave de ICONOS_LUCIDE tiene que tener su propio
// `import <Nombre> from 'lucide-react-native/icons/<archivo>'`. El mensaje
// de falla es para quien sume un ícono nuevo por el barrel (R42-c, si entra
// después de esta tarea).
describe('components/Icono.tsx: cada clave de ICONOS_LUCIDE tiene su import por subpath', () => {
  const iconoSrc = readFileSync(join(MOBILE_ROOT, ICONO_RELATIVO), 'utf8')
  const bloqueIconosMatch = iconoSrc.match(/const ICONOS_LUCIDE\s*=\s*\{([\s\S]*?)\n\}/)

  it('encuentra el bloque ICONOS_LUCIDE en Icono.tsx (si no, el recorte está mal)', () => {
    expect(bloqueIconosMatch).not.toBeNull()
  })

  const claves = [...(bloqueIconosMatch?.[1] ?? '').matchAll(/^\s*(\w+),?\s*$/gm)].map(([, nombre]) => nombre)

  it('sanity check: se parsearon claves (si no, el recorte está mal)', () => {
    expect(claves.length).toBeGreaterThan(0)
  })

  it.each(claves)('%s: tiene su import por subpath en Icono.tsx', (nombre) => {
    if (!tieneImportPorSubpath(iconoSrc, nombre)) {
      throw new Error(mensajeFaltaImportSubpath(nombre))
    }
    expect(tieneImportPorSubpath(iconoSrc, nombre)).toBe(true)
  })
})
