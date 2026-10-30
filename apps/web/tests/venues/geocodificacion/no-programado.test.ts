/**
 * Este archivo fija DOS reglas de la política de uso de Nominatim
 * (https://operations.osmfoundation.org/policies/nominatim/), las dos
 * "por cableado": no se cumplen por lógica de código sino por cómo está
 * armado el sistema, así que se pierden en la primera ronda que toque el
 * tema si no quedan fijadas con un detector.
 *
 * REGLA 1 — no programado. El script `apps/web/scripts/geocodificar-lugares.ts`
 * (R53) le pide datos a Nominatim. La política dice textualmente: "Scripts
 * running longer than a day and scripts that are run at regular intervals
 * are restricted to 4 requests per minute." La decisión de la ronda es más
 * simple y más segura: ese script NO SE PROGRAMA nunca. Lo corre Mauro a
 * mano, en su máquina, cuando hace falta.
 *
 * Hoy eso se cumple porque nadie lo programó. Este test es lo que lo
 * mantiene así mañana: si alguien agrega un workflow de GitHub Actions, un
 * cron de `vercel.json` o una ruta de API que dispare ese script, este test
 * se tiene que poner en rojo. Barre (solo lectura, sin red ni base):
 *   1. todos los `.yml`/`.yaml` de `<raíz>/.github/workflows/`;
 *   2. `<raíz>/vercel.json`, si existe;
 *   3. `<raíz>/apps/web/vercel.json`, si existe;
 *   4. todos los `.ts`/`.tsx` bajo `<raíz>/apps/web/app/api/` (recursivo).
 *
 * REGLA 2 — sin autocompletar. La misma política lista "Auto-complete
 * search" como uso NO aceptable: "This type of query is highly demanding of
 * resources and is therefore not permitted." Hoy se cumple porque ningún
 * componente de cliente llama a Nominatim. `crearClienteNominatim`
 * (`lib/venues/geocodificacion/nominatim.ts`) lo usan solo: el script que
 * corre Mauro a mano, y, desde la R65, la búsqueda de dirección del admin
 * en /admin/lugares (aprobada por Mauro el 23/10): es la server action
 * `buscarDireccionLugar` de `lib/admin/lugares-actions.ts`, del lado del
 * servidor, solo para ADMIN, UNA consulta por click en "Buscar" (nunca al
 * tipear, sin debounce; lo fija `tests/admin/lugar-mapa-ubicar.test.ts`),
 * con un cliente único por proceso que espacia los pedidos a 1 por segundo
 * y no reintenta. Pero el cliente es código genérico e importable: nada
 * impide que mañana alguien lo importe desde un componente `"use client"`
 * para armar un autocompletar mientras la persona tipea, que es exactamente
 * el uso prohibido. Para el resto de la interfaz el camino sigue siendo el
 * link "Buscar en OpenStreetMap" que abre la persona en su propio
 * navegador — no un fetch disparado por la app. Esta regla barre (solo
 * lectura, sin red ni base) de dos maneras:
 *   a. todos los `.ts`/`.tsx` con la directiva `"use client"` como primera
 *      sentencia bajo `<raíz>/apps/web/app/`, `<raíz>/apps/web/components/`
 *      y `<raíz>/apps/mobile/` no pueden importar el cliente;
 *   b. la lista cerrada de los archivos de `app/`, `components/` y `lib/`
 *      de la web que sí lo importan (`ARCHIVOS_QUE_IMPORTAN_NOMINATIM`):
 *      sumar uno nuevo obliga a tocar este test, o sea, a decidirlo.
 *
 * Nota: este archivo de test SÍ menciona "nominatim" y "geocodificar" (en
 * este docstring y en los mensajes de falla), pero ninguno de los lugares
 * barridos incluye `tests/`, así que el barrido nunca se lee a sí mismo.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { quitarComentarios } from '@qps/core/tests/convencion-entorno'
import path, { relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** Términos cuya presencia (en minúsculas) delata que el script se programó. */
const TERMINOS_PROHIBIDOS = ['geocodificar', 'nominatim']

/**
 * Devuelve los términos prohibidos que aparecen en `texto`, comparando en
 * minúsculas (así "Geocodificar" o "Nominatim" también caen). Lista vacía
 * si el texto está limpio.
 */
export function mencionesProhibidas(texto: string): string[] {
  const minuscula = texto.toLowerCase()
  return TERMINOS_PROHIBIDOS.filter((termino) => minuscula.includes(termino))
}

function mensajeFalla(etiqueta: string, encontradas: string[]): string {
  return (
    `${etiqueta} menciona ${encontradas.join(', ')}. La política de uso de Nominatim ` +
    '(https://operations.osmfoundation.org/policies/nominatim/) restringe a 4 pedidos por ' +
    'minuto los scripts que corren en forma periódica. Por eso `geocodificar-lugares.ts` NO ' +
    'se programa: nunca debe dispararse desde un workflow de GitHub Actions, un cron de ' +
    'vercel.json ni una ruta de app/api/. Sacá esa mención: el script lo corre Mauro a mano, ' +
    'en su máquina, cuando haga falta.'
  )
}

// ===========================================================================
// El propio detector, con fixtures en memoria (no archivos del repo).
// ===========================================================================
describe('mencionesProhibidas', () => {
  it('un YAML que dispara el script a mano detectado por su nombre: da una mención', () => {
    const fixture = `
      name: ejemplo
      on:
        schedule:
          - cron: '0 3 * * *'
      jobs:
        geocodificar:
          runs-on: ubuntu-latest
          steps:
            - run: npx tsx scripts/geocodificar-lugares.ts
    `
    expect(mencionesProhibidas(fixture)).toEqual(['geocodificar'])
  })

  it('un YAML que menciona nominatim directamente: da una mención', () => {
    const fixture = `
      jobs:
        geocodificar_lugares:
          steps:
            - run: curl https://nominatim.openstreetmap.org/search
    `
    // "geocodificar" aparece como substring de "geocodificar_lugares"
    expect(mencionesProhibidas(fixture).sort()).toEqual(['geocodificar', 'nominatim'])
  })

  it('un YAML sin ninguno de los dos términos: sin menciones', () => {
    const fixture = `
      name: ci
      on:
        push:
          branches: [main]
      jobs:
        test:
          runs-on: ubuntu-latest
          steps:
            - run: npm test
    `
    expect(mencionesProhibidas(fixture)).toEqual([])
  })

  it('la comparación es insensible a mayúsculas/minúsculas', () => {
    expect(mencionesProhibidas('Nominatim')).toEqual(['nominatim'])
    expect(mencionesProhibidas('Geocodificar')).toEqual(['geocodificar'])
  })
})

// ===========================================================================
// Barrido real del repo.
// ===========================================================================
const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url))
const WEB_ROOT = fileURLToPath(new URL('../../../', import.meta.url))

function listarArchivosRecursivo(dir: string, filtro: (nombre: string) => boolean, acumulado: string[] = []): string[] {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = `${dir}/${entrada.name}`
    if (entrada.isDirectory()) {
      listarArchivosRecursivo(ruta, filtro, acumulado)
    } else if (filtro(entrada.name)) {
      acumulado.push(ruta)
    }
  }
  return acumulado
}

const WORKFLOWS_DIR = `${REPO_ROOT}.github/workflows`
const ARCHIVOS_WORKFLOWS = existsSync(WORKFLOWS_DIR)
  ? listarArchivosRecursivo(WORKFLOWS_DIR, (nombre) => /\.(ya?ml)$/.test(nombre))
  : []

const VERCEL_JSON_RAIZ = `${REPO_ROOT}vercel.json`
const VERCEL_JSON_WEB = `${WEB_ROOT}vercel.json`

const API_DIR = `${WEB_ROOT}app/api`
const ARCHIVOS_API = existsSync(API_DIR)
  ? listarArchivosRecursivo(API_DIR, (nombre) => /\.(ts|tsx)$/.test(nombre))
  : []

describe('barrido real: cordura (el test no puede pasar en verde por no encontrar nada)', () => {
  it('encuentra al menos un workflow en .github/workflows/', () => {
    expect(ARCHIVOS_WORKFLOWS.length).toBeGreaterThanOrEqual(1)
  })

  it('al menos un vercel.json (de la raíz o de apps/web) existe', () => {
    // A la fecha de esta tarea (53-q1) el repo solo tiene apps/web/vercel.json
    // (no hay vercel.json en la raíz); por eso la aserción no exige el de la
    // raíz en particular, sino que al menos uno de los dos exista — así el
    // test no puede pasar en verde por no encontrar ningún vercel.json.
    expect(
      existsSync(VERCEL_JSON_RAIZ) || existsSync(VERCEL_JSON_WEB),
      `no se encontró ni ${VERCEL_JSON_RAIZ} ni ${VERCEL_JSON_WEB}`,
    ).toBe(true)
  })

  it('encuentra al menos una ruta bajo apps/web/app/api/', () => {
    expect(ARCHIVOS_API.length).toBeGreaterThanOrEqual(1)
  })
})

describe('ningún workflow de .github/workflows/ programa el script de geocodificación', () => {
  it.each(ARCHIVOS_WORKFLOWS.map((archivo) => [relative(REPO_ROOT, archivo).split('\\').join('/'), archivo] as const))(
    '%s',
    (etiqueta, archivo) => {
      const encontradas = mencionesProhibidas(readFileSync(archivo, 'utf8'))
      expect(encontradas, mensajeFalla(etiqueta, encontradas)).toEqual([])
    },
  )
})

describe('vercel.json (raíz y apps/web) no programa el script de geocodificación', () => {
  const candidatos: Array<readonly [string, string]> = (
    [
      [relative(REPO_ROOT, VERCEL_JSON_RAIZ).split('\\').join('/'), VERCEL_JSON_RAIZ] as const,
      [relative(REPO_ROOT, VERCEL_JSON_WEB).split('\\').join('/'), VERCEL_JSON_WEB] as const,
    ] as const
  ).filter(([, ruta]) => existsSync(ruta))

  it.each(candidatos)('%s', (etiqueta, archivo) => {
    const encontradas = mencionesProhibidas(readFileSync(archivo, 'utf8'))
    expect(encontradas, mensajeFalla(etiqueta, encontradas)).toEqual([])
  })
})

describe('ninguna ruta de apps/web/app/api/ dispara el script de geocodificación', () => {
  it.each(ARCHIVOS_API.map((archivo) => [relative(REPO_ROOT, archivo).split('\\').join('/'), archivo] as const))(
    '%s',
    (etiqueta, archivo) => {
      const encontradas = mencionesProhibidas(readFileSync(archivo, 'utf8'))
      expect(encontradas, mensajeFalla(etiqueta, encontradas)).toEqual([])
    },
  )
})

// ===========================================================================
// REGLA 2 — sin autocompletar: ningún archivo "use client" importa el
// cliente de Nominatim.
// ===========================================================================

/** Comentarios de línea y de bloque vaciados, conservando el resto del texto. */


/**
 * `true` si, ignorando comentarios y líneas en blanco del comienzo, la
 * primera sentencia del archivo es la directiva `"use client"` / `'use
 * client'` (con o sin punto y coma). Misma idea que
 * `primeraSentenciaEsUseServer` de `tests/lib/use-server.test.ts`, pero para
 * `"use client"` (no se importa de ahí: esa función es para `"use server"`).
 */
export function primeraSentenciaEsUseClient(contenido: string): boolean {
  const limpio = quitarComentarios(contenido).replace(/^\s+/, '')
  return /^(["'])use client\1\s*;?/.test(limpio)
}

/**
 * `true` si `contenido` importa (estático, `require` o dinámico) el cliente
 * de Nominatim: `lib/venues/geocodificacion/nominatim` en cualquiera de sus
 * formas (alias `@/...`, ruta relativa) o el barrel `lib/venues/geocodificacion`
 * si existiera (podría re-exportarlo).
 */
export function importaClienteNominatim(contenido: string): boolean {
  const regex = /(?:from\s+|require\(\s*|import\(\s*)["']([^"']+)["']/g
  let m: RegExpExecArray | null
  while ((m = regex.exec(contenido))) {
    const ruta = m[1].replace(/\/$/, '')
    if (/venues\/geocodificacion\/nominatim$/.test(ruta)) return true
    if (/venues\/geocodificacion$/.test(ruta)) return true
  }
  return false
}

function mensajeFallaAutocompletar(etiqueta: string): string {
  return (
    `${etiqueta} es un componente "use client" que importa el cliente de Nominatim. La política ` +
    'de uso de Nominatim (https://operations.osmfoundation.org/policies/nominatim/) lista ' +
    '"Auto-complete search" como uso NO aceptable: "This type of query is highly demanding of ' +
    'resources and is therefore not permitted." Por eso el cliente de Nominatim vive solo del ' +
    'lado del servidor (lo usa el script que corre Mauro a mano). Si hace falta buscar un lugar ' +
    'desde la interfaz, el camino es el link "Buscar en OpenStreetMap" que abre la persona en su ' +
    'propio navegador — no un fetch disparado por la app.'
  )
}

describe('primeraSentenciaEsUseClient / importaClienteNominatim: fixtures en memoria', () => {
  it('un archivo "use client" que importa el cliente por alias: se detecta', () => {
    const fixture = `
      'use client'
      import { crearClienteNominatim } from '@/lib/venues/geocodificacion/nominatim'
    `
    expect(primeraSentenciaEsUseClient(fixture)).toBe(true)
    expect(importaClienteNominatim(fixture)).toBe(true)
  })

  it('un archivo "use client" que importa el cliente por ruta relativa: se detecta', () => {
    const fixture = `
      "use client"
      import { crearClienteNominatim } from '../../lib/venues/geocodificacion/nominatim'
    `
    expect(primeraSentenciaEsUseClient(fixture)).toBe(true)
    expect(importaClienteNominatim(fixture)).toBe(true)
  })

  it('un archivo "use client" que importa el barrel de la carpeta (si existiera): se detecta', () => {
    const fixture = `
      'use client'
      import { crearClienteNominatim } from '@/lib/venues/geocodificacion'
    `
    expect(importaClienteNominatim(fixture)).toBe(true)
  })

  it('un archivo "use client" que NO importa el cliente: limpio', () => {
    const fixture = `
      'use client'
      import { useState } from 'react'
      import { guardarUbicacionManual } from '@/lib/admin/lugares-actions'
    `
    expect(primeraSentenciaEsUseClient(fixture)).toBe(true)
    expect(importaClienteNominatim(fixture)).toBe(false)
  })

  it('un archivo que importa el cliente de Nominatim pero NO es "use client": limpio (del lado del servidor está bien)', () => {
    const fixture = `
      import { crearClienteNominatim } from '@/lib/venues/geocodificacion/nominatim'
      export async function f() {}
    `
    expect(primeraSentenciaEsUseClient(fixture)).toBe(false)
    expect(importaClienteNominatim(fixture)).toBe(true) // importa el cliente, pero no es de cliente: no corresponde a esta regla
  })

  it('una mención de "use client" en un comentario no cuenta como la directiva', () => {
    expect(primeraSentenciaEsUseClient('// "use client"\nexport function F() {}')).toBe(false)
  })
})

// ===========================================================================
// Barrido real de apps/web/app/, apps/web/components/ y apps/mobile/.
// ===========================================================================
function listarArchivosDeCodigoExcluyendo(dir: string, excluir: string[], acumulado: string[] = []): string[] {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (excluir.includes(entrada.name)) continue
    const ruta = `${dir}/${entrada.name}`
    if (entrada.isDirectory()) {
      listarArchivosDeCodigoExcluyendo(ruta, excluir, acumulado)
    } else if (/\.(ts|tsx)$/.test(entrada.name)) {
      acumulado.push(ruta)
    }
  }
  return acumulado
}

const EXCLUIR_DIRS = ['node_modules', '.next', '.expo', '.git']

const APP_DIR = `${WEB_ROOT}app`
const COMPONENTS_DIR = `${WEB_ROOT}components`
const MOBILE_DIR = `${REPO_ROOT}apps/mobile`

const ARCHIVOS_TS_APP = existsSync(APP_DIR) ? listarArchivosDeCodigoExcluyendo(APP_DIR, EXCLUIR_DIRS) : []
const ARCHIVOS_TS_COMPONENTS = existsSync(COMPONENTS_DIR)
  ? listarArchivosDeCodigoExcluyendo(COMPONENTS_DIR, EXCLUIR_DIRS)
  : []
const ARCHIVOS_TS_MOBILE = existsSync(MOBILE_DIR) ? listarArchivosDeCodigoExcluyendo(MOBILE_DIR, EXCLUIR_DIRS) : []

const TODOS_LOS_ARCHIVOS_TS = [...ARCHIVOS_TS_APP, ...ARCHIVOS_TS_COMPONENTS, ...ARCHIVOS_TS_MOBILE]
const ARCHIVOS_USE_CLIENT = TODOS_LOS_ARCHIVOS_TS.filter((archivo) =>
  primeraSentenciaEsUseClient(readFileSync(archivo, 'utf8')),
)

describe('barrido real: cordura del barrido de "use client" (no puede pasar en verde por no encontrar nada)', () => {
  // El piso es 50 y no los 95 que hay hoy (53-q1) a propósito: lo que tiene
  // que agarrar es que el barrido deje de encontrar archivos (una carpeta que
  // se mueve, un filtro que se rompe), no que una ronda borre o unifique
  // componentes de cliente, que es trabajo legítimo y pondría esto en rojo
  // sin que nadie haya roto nada.
  it('encuentra al menos 50 archivos "use client" bajo app/, components/ y apps/mobile/ (hay 95 a la fecha de 53-q1)', () => {
    expect(ARCHIVOS_USE_CLIENT.length).toBeGreaterThanOrEqual(50)
  })
})

describe('ningún archivo "use client" importa el cliente de Nominatim (política: sin autocompletar)', () => {
  it.each(ARCHIVOS_USE_CLIENT.map((archivo) => [relative(REPO_ROOT, archivo).split('\\').join('/'), archivo] as const))(
    '%s',
    (etiqueta, archivo) => {
      const importa = importaClienteNominatim(readFileSync(archivo, 'utf8'))
      expect(importa, mensajeFallaAutocompletar(etiqueta)).toBe(false)
    },
  )
})

// ===========================================================================
// REGLA 2 (lista cerrada, R65): quién puede importar el cliente de Nominatim
// ===========================================================================

/**
 * Los únicos archivos de `app/`, `components/` y `lib/` de la web que importan
 * `lib/venues/geocodificacion/nominatim` (a la fecha de la R65, tarea 65-q):
 *  - `plan.ts`: usa `evaluarResultados` y el tipo del resultado (no crea un cliente);
 *  - `busqueda-admin.ts`: solo el TIPO `ResultadoNominatim` (`import type`);
 *  - `lugares-actions.ts`: la server action `buscarDireccionLugar` (crea el cliente).
 * `scripts/geocodificar-lugares.ts` también lo importa, pero está fuera de lo
 * que barre este test (no es código de la app) y lo corre Mauro a mano.
 */
export const ARCHIVOS_QUE_IMPORTAN_NOMINATIM = [
  'lib/admin/lugares-actions.ts',
  'lib/venues/geocodificacion/busqueda-admin.ts',
  'lib/venues/geocodificacion/plan.ts',
]

const MODULO_NOMINATIM = 'lib/venues/geocodificacion/nominatim'
const BARRIL_GEOCODIFICACION = 'lib/venues/geocodificacion'

/**
 * Rutas (relativas a `webRoot`, sin extensión) que `contenido` importa, ya
 * resueltas: el alias `@/` y las rutas relativas a partir de `dirDelArchivo`.
 * Cubre `from '…'`, `import '…'`, `require('…')` e `import('…')`, y deja
 * afuera los comentarios. Los paquetes (`react`, `@qps/core/…`) no se resuelven.
 * A diferencia de `importaClienteNominatim`, ve también `./nominatim` (desde
 * la misma carpeta).
 */
export function importesResueltos(contenido: string, dirDelArchivo: string, webRoot: string): string[] {
  const regex = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\(\s*)["']([^"']+)["']/g
  const limpio = quitarComentarios(contenido)
  const resueltos: string[] = []
  let m: RegExpExecArray | null
  while ((m = regex.exec(limpio))) {
    const ruta = m[1]
    let absoluta: string | null = null
    if (ruta.startsWith('@/')) absoluta = path.resolve(webRoot, ruta.slice(2))
    else if (ruta.startsWith('.')) absoluta = path.resolve(dirDelArchivo, ruta)
    if (absoluta === null) continue
    resueltos.push(path.relative(webRoot, absoluta).split(path.sep).join('/').replace(/\/index$/, ''))
  }
  return resueltos
}

/** `true` si el archivo importa el módulo del cliente (o el barril de la carpeta, que podría re-exportarlo). */
export function importaNominatimResuelto(contenido: string, dirDelArchivo: string, webRoot: string): boolean {
  return importesResueltos(contenido, dirDelArchivo, webRoot).some(
    (r) => r === MODULO_NOMINATIM || r === BARRIL_GEOCODIFICACION
  )
}

describe('importaNominatimResuelto: fixtures en memoria', () => {
  const raiz = path.resolve('/web')
  const dirLib = path.join(raiz, 'lib/venues/geocodificacion')

  it('el alias @/ se detecta', () => {
    expect(importaNominatimResuelto("import { x } from '@/lib/venues/geocodificacion/nominatim'", raiz, raiz)).toBe(true)
  })

  it('"./nominatim" desde la carpeta de geocodificación se detecta (el detector de "use client" no lo vería)', () => {
    expect(importaNominatimResuelto("import type { R } from './nominatim'", dirLib, raiz)).toBe(true)
  })

  it('una ruta relativa que sube se detecta', () => {
    const dir = path.join(raiz, 'components/admin')
    expect(importaNominatimResuelto("import { x } from '../../lib/venues/geocodificacion/nominatim'", dir, raiz)).toBe(true)
  })

  it('un import dinámico y un require se detectan', () => {
    expect(importaNominatimResuelto("const m = await import('@/lib/venues/geocodificacion/nominatim')", raiz, raiz)).toBe(true)
    expect(importaNominatimResuelto("const m = require('@/lib/venues/geocodificacion/nominatim')", raiz, raiz)).toBe(true)
  })

  it('el barril de la carpeta (podría re-exportar el cliente) se detecta', () => {
    expect(importaNominatimResuelto("import { x } from '@/lib/venues/geocodificacion'", raiz, raiz)).toBe(true)
  })

  it('otros módulos de la misma carpeta no', () => {
    expect(importaNominatimResuelto("import { x } from './consultas'", dirLib, raiz)).toBe(false)
    expect(importaNominatimResuelto("import { x } from '@/lib/venues/geocodificacion/busqueda-admin'", raiz, raiz)).toBe(false)
  })

  it('una mención en un comentario no cuenta', () => {
    expect(importaNominatimResuelto("// import { x } from '@/lib/venues/geocodificacion/nominatim'\nexport {}", raiz, raiz)).toBe(false)
  })
})

describe('REGLA 2, lista cerrada: quién importa el cliente de Nominatim', () => {
  const dirs = [APP_DIR, COMPONENTS_DIR, `${WEB_ROOT}lib`].filter((d) => existsSync(d))
  const archivos = dirs.flatMap((d) => listarArchivosDeCodigoExcluyendo(d, EXCLUIR_DIRS))
  const importan = archivos
    .filter((archivo) => importaNominatimResuelto(readFileSync(archivo, 'utf8'), path.dirname(archivo), WEB_ROOT))
    .map((archivo) => relative(WEB_ROOT, archivo).split('\\').join('/'))
    .sort()

  it('cordura: el barrido mira bastante código y no entra a tests/', () => {
    expect(archivos.length).toBeGreaterThan(100)
    expect(archivos.some((a) => relative(WEB_ROOT, a).split('\\').join('/').startsWith('tests/'))).toBe(false)
  })

  it('los únicos que lo importan son los de la lista (más lib/admin/lugares-actions.ts, R65)', () => {
    expect(importan).toEqual([...ARCHIVOS_QUE_IMPORTAN_NOMINATIM].sort())
  })

  it('lib/admin/lugares-actions.ts empieza con "use server" (la búsqueda corre del lado del servidor)', () => {
    const contenido = readFileSync(`${WEB_ROOT}lib/admin/lugares-actions.ts`, 'utf8')
    const limpio = quitarComentarios(contenido).replace(/^\s+/, '')
    expect(limpio).toMatch(/^(["'])use server\1\s*;?/)
  })

  it('ninguno de la lista es un componente "use client"', () => {
    for (const ruta of ARCHIVOS_QUE_IMPORTAN_NOMINATIM) {
      expect(primeraSentenciaEsUseClient(readFileSync(`${WEB_ROOT}${ruta}`, 'utf8')), ruta).toBe(false)
    }
  })

  it('en app/ y components/, solo el panel de ubicar nombra buscarDireccionLugar', () => {
    const nombran = [...ARCHIVOS_TS_APP, ...ARCHIVOS_TS_COMPONENTS]
      .filter((a) => quitarComentarios(readFileSync(a, 'utf8')).includes('buscarDireccionLugar'))
      .map((a) => relative(WEB_ROOT, a).split('\\').join('/'))
    expect(nombran).toEqual(['components/admin/lugar-mapa-ubicar.tsx'])
  })
})
