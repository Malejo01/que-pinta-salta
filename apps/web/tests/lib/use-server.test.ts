/**
 * Detector de "use server" (R47, tarea 47-b, QPS-197): Next.js hace fallar
 * el `next build` si un módulo con la directiva `"use server"` (o `'use
 * server'`) como primera sentencia exporta algo que no sea una función
 * `async`, un `type` o un `interface` — aunque `tsc` y Vitest no vean nada
 * raro (le pasó al PR #62 con `lib/asistencia.ts`). Este archivo recorre
 * TODOS los `.ts`/`.tsx` de `apps/web` (sin `node_modules`, `.next` ni
 * `tests/`), encuentra los que tienen esa directiva, y verifica que no
 * tengan ninguno de los exports prohibidos.
 *
 * La lógica del detector se exporta como funciones puras
 * (`primeraSentenciaEsUseServer`, `violacionesUseServer`) para poder
 * probarlas con fixtures en memoria antes de confiar en ellas sobre el
 * código real.
 *
 * ## El punto ciego cerrado (R56, QPS-253): `export * from` / `export { x } from`
 *
 * Hasta la R54, `violacionesUseServer` evaluaba la forma del export que
 * sigue a la palabra `export`, pero cuando esa forma era un re-export con
 * módulo (`export * from '...'` o `export { x } from '...'`) el detector no
 * sabía qué hacer: en el caso de `export * from` el regex de formas
 * (`FORMA_RE`) directamente no matcheaba nada y el `continue` del loop lo
 * dejaba pasar sin evaluar — el comentario de esa rama lo decía
 * explícitamente ("forma no reconocida (p. ej. 'export * from ...'): no se
 * evalúa acá"). Esto importa porque desde ESTE archivo no hay forma de saber
 * si lo que se reexporta de otro módulo es `async` o no, y Next.js hace
 * fallar el build igual si no lo es.
 *
 * Ahora `FORMA_RE` también reconoce el `*` suelto, así que:
 *   - `export * from '...'` y `export { x } from '...'` (ESTE último ya
 *     fallaba antes del cierre de este punto ciego, porque `{` sin `type`
 *     adelante caía en la rama genérica de violación — se deja como fixture
 *     igual, para que el refactor de `FORMA_RE` no lo rompa de rebote):
 *     **violación**.
 *   - `export type * from '...'` y `export type { ... } from '...'` (ya
 *     pasaban antes: el `type` adelante los manda a la rama permitida):
 *     **permitidos**, porque `export type` nunca exporta un valor.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { quitarComentarios } from '@qps/core/tests/convencion-entorno'
import { relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * `true` si, ignorando comentarios y líneas en blanco del comienzo, la
 * primera sentencia del archivo es la directiva `"use server"` / `'use
 * server'` (con o sin punto y coma).
 */
export function primeraSentenciaEsUseServer(contenido: string): boolean {
  const limpio = quitarComentarios(contenido).replace(/^\s+/, '')
  return /^(["'])use server\1\s*;?/.test(limpio)
}

/**
 * Las formas de `export` que Next.js acepta en un módulo `"use server"`:
 * `export async function`, `export type`, `export interface` y
 * `export type { ... }`. Cualquier otra forma de export de VALOR hace
 * fallar el build.
 *
 * Devuelve la lista de violaciones encontradas (vacía si el archivo está
 * limpio). Las alternativas del regex están ordenadas de la más específica
 * a la más general a propósito (p. ej. "default async function" antes que
 * "default" + identificador suelto), porque la alternancia de un regex
 * toma la PRIMERA que matchea en esa posición.
 */
export function violacionesUseServer(contenido: string): string[] {
  const limpio = quitarComentarios(contenido)
  const violaciones: string[] = []

  const FORMA_RE =
    /^\s*(type\s*\{|type\b|interface\b|default\s+async\s+function\b|default\s+function\b|default\s+class\b|default\s+\S|async\s+function\b|function\b|const\b|let\b|var\b|class\b|enum\b|\*|\{)/

  const exportRegex = /\bexport\b/g
  let m: RegExpExecArray | null
  while ((m = exportRegex.exec(limpio))) {
    const resto = limpio.slice(m.index + 'export'.length)
    const match = FORMA_RE.exec(resto)
    if (!match) continue // forma no reconocida (siguen sin cubrirse formas exóticas que no aparecen en el repo)

    const forma = match[1]

    // Formas permitidas: type, interface, export type { ... }, export default async function, export async function.
    if (/^type(\s*\{|\b)/.test(forma)) continue
    if (/^interface\b/.test(forma)) continue
    if (/^default\s+async\s+function\b/.test(forma)) continue
    if (/^async\s+function\b/.test(forma)) continue

    violaciones.push(`export ${forma.trim()}`.slice(0, 60))
  }

  return violaciones
}

// ===========================================================================
// El propio detector, con fixtures en memoria (no archivos del repo).
// ===========================================================================
describe('primeraSentenciaEsUseServer', () => {
  it('con comillas dobles', () => {
    expect(primeraSentenciaEsUseServer('"use server"\n\nexport async function f() {}')).toBe(true)
  })

  it('con comillas simples', () => {
    expect(primeraSentenciaEsUseServer("'use server'\n\nexport async function f() {}")).toBe(true)
  })

  it('con punto y coma', () => {
    expect(primeraSentenciaEsUseServer('"use server";\n\nexport async function f() {}')).toBe(true)
  })

  it('después de comentarios y líneas en blanco de arriba, sigue contando como primera sentencia', () => {
    const fixture = `
      // un comentario
      /* otro comentario
         de varias líneas */

      "use server"
      export async function f() {}
    `
    expect(primeraSentenciaEsUseServer(fixture)).toBe(true)
  })

  it('si "use server" aparece DESPUÉS de otra sentencia, no cuenta (no es la primera)', () => {
    const fixture = `
      import { x } from "y"
      "use server"
      export async function f() {}
    `
    expect(primeraSentenciaEsUseServer(fixture)).toBe(false)
  })

  it('un archivo sin la directiva: false', () => {
    expect(primeraSentenciaEsUseServer('export async function f() {}')).toBe(false)
  })

  it('una mención en un comentario no cuenta como la directiva', () => {
    expect(primeraSentenciaEsUseServer('// "use server"\nexport async function f() {}')).toBe(false)
  })
})

describe('violacionesUseServer: pasa limpio', () => {
  it('export async function, export type, export interface y export type { ... }: sin violaciones', () => {
    const fixture = `
      "use server"
      export async function f() {}
      export type Bar = string
      export interface Baz { x: number }
      export type { Bar as BarAlias }
    `
    expect(violacionesUseServer(fixture)).toEqual([])
  })

  it('export default async function: sin violaciones', () => {
    expect(violacionesUseServer('export default async function f() {}')).toEqual([])
  })
})

describe('violacionesUseServer: cada forma prohibida se detecta', () => {
  it('export const', () => {
    expect(violacionesUseServer('export const x = 1')).not.toEqual([])
  })
  it('export let', () => {
    expect(violacionesUseServer('export let x = 1')).not.toEqual([])
  })
  it('export var', () => {
    expect(violacionesUseServer('export var x = 1')).not.toEqual([])
  })
  it('export function sin async', () => {
    expect(violacionesUseServer('export function f() {}')).not.toEqual([])
  })
  it('export class', () => {
    expect(violacionesUseServer('export class Foo {}')).not.toEqual([])
  })
  it('export enum', () => {
    expect(violacionesUseServer('export enum Foo { A, B }')).not.toEqual([])
  })
  it('export default function (sin async)', () => {
    expect(violacionesUseServer('export default function f() {}')).not.toEqual([])
  })
  it('export default class', () => {
    expect(violacionesUseServer('export default class Foo {}')).not.toEqual([])
  })
  it('export default de un identificador suelto (no una función async)', () => {
    expect(violacionesUseServer('const foo = 1\nexport default foo')).not.toEqual([])
  })
  it('export { ... } sin type', () => {
    expect(violacionesUseServer('const x = 1\nexport { x }')).not.toEqual([])
  })
})

describe('violacionesUseServer: el punto ciego cerrado (R56, QPS-253) — re-exports con módulo', () => {
  it('export * from \'...\' (sin type): violación — desde acá no se sabe si lo reexportado es async', () => {
    expect(violacionesUseServer(`"use server"\nexport * from './otro-modulo'`)).not.toEqual([])
  })

  it('export { x } from \'...\' (sin type): violación (mismo motivo)', () => {
    expect(violacionesUseServer(`"use server"\nexport { x } from './otro-modulo'`)).not.toEqual([])
  })

  it('export type * from \'...\': sin violaciones (export type nunca exporta un valor)', () => {
    expect(violacionesUseServer(`"use server"\nexport type * from './otro-modulo'`)).toEqual([])
  })

  it('export type { Bar } from \'...\': sin violaciones', () => {
    expect(violacionesUseServer(`"use server"\nexport type { Bar } from './otro-modulo'`)).toEqual([])
  })
})

describe('violacionesUseServer: los falsos positivos conocidos del repo pasan limpio', () => {
  it('export type FavoriteType = \'event\' | \'cinema\' | \'flyer\' (favorites.ts)', () => {
    expect(violacionesUseServer(`export type FavoriteType = 'event' | 'cinema' | 'flyer'`)).toEqual([])
  })
  it('export type { EmailFrequency } (radar.ts)', () => {
    expect(violacionesUseServer(`export type { EmailFrequency }`)).toEqual([])
  })
  it('export interface RadarSettingsData { ... } (radar.ts)', () => {
    expect(
      violacionesUseServer(`export interface RadarSettingsData {\n  email_frequency: string\n  email_target: string\n}`),
    ).toEqual([])
  })
  it('export type TestRadarEmailResult = { ... } (radar.ts)', () => {
    expect(
      violacionesUseServer(`export type TestRadarEmailResult = { success: boolean; message?: string; count?: number }`),
    ).toEqual([])
  })
})

// ===========================================================================
// Barrido real de apps/web.
// ===========================================================================
function listarArchivosDeCodigo(dir: string, acumulado: string[] = []): string[] {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', 'tests', '.git'].includes(entrada.name)) continue
    const ruta = `${dir}/${entrada.name}`
    if (entrada.isDirectory()) {
      listarArchivosDeCodigo(ruta, acumulado)
    } else if (/\.(ts|tsx)$/.test(entrada.name) && !entrada.name.endsWith('.d.ts')) {
      acumulado.push(ruta)
    }
  }
  return acumulado
}

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const TODOS_LOS_ARCHIVOS = listarArchivosDeCodigo(WEB_ROOT)
const ARCHIVOS_USE_SERVER = TODOS_LOS_ARCHIVOS.filter((archivo) =>
  primeraSentenciaEsUseServer(readFileSync(archivo, 'utf8')),
)

describe('barrido real de apps/web: archivos "use server" encontrados', () => {
  it(
    'encuentra al menos 10 archivos "use server" (si esto da menos, el detector dejó de mirar algo: ' +
      'no puede pasar en verde por no encontrar nada)',
    () => {
      expect(ARCHIVOS_USE_SERVER.length).toBeGreaterThanOrEqual(10)
    },
  )

  it('encuentra los 10 archivos conocidos a la fecha de esta tarea (47-b)', () => {
    const relativos = new Set(ARCHIVOS_USE_SERVER.map((a) => relative(WEB_ROOT, a).split('\\').join('/')))
    const esperados = [
      'lib/actions.ts',
      'lib/actions/favorites.ts',
      'lib/actions/radar.ts',
      'lib/admin-actions.ts',
      'lib/admin/duplicate-actions.ts',
      'lib/asistencia.ts',
      'lib/instagram/admin-actions.ts',
      'lib/instagram/process-apify-payload.ts',
      'lib/scraper-actions.ts',
      'lib/user-actions.ts',
    ]
    for (const esperado of esperados) {
      expect(relativos.has(esperado), `no se encontró ${esperado}`).toBe(true)
    }
  })

  it('lib/asistencia-lectura.ts (R56, tarea 56-a) NO es "use server": no tiene que aparecer en la lista', () => {
    const relativos = new Set(ARCHIVOS_USE_SERVER.map((a) => relative(WEB_ROOT, a).split('\\').join('/')))
    expect(relativos.has('lib/asistencia-lectura.ts')).toBe(false)
  })
})

describe('barrido real de apps/web: ningún archivo "use server" exporta algo prohibido', () => {
  it.each(ARCHIVOS_USE_SERVER.map((archivo) => [relative(WEB_ROOT, archivo).split('\\').join('/'), archivo] as const))(
    '%s',
    (etiqueta, archivo) => {
      const contenido = readFileSync(archivo, 'utf8')
      const violaciones = violacionesUseServer(contenido)
      expect(
        violaciones,
        `${etiqueta} (módulo "use server") tiene exports prohibidos: ${violaciones.join(', ')} — ` +
          `Next hace fallar el build aunque tsc y los tests pasen`,
      ).toEqual([])
    },
  )
})
