/**
 * El script `apps/web/scripts/geocodificar-lugares.ts` (R53) le pide datos a
 * Nominatim, el geocodificador de OpenStreetMap. Su política de uso
 * (https://operations.osmfoundation.org/policies/nominatim/) dice
 * textualmente: "Scripts running longer than a day and scripts that are run
 * at regular intervals are restricted to 4 requests per minute."
 *
 * La decisión de la ronda es más simple y más segura: ese script NO SE
 * PROGRAMA nunca. Lo corre Mauro a mano, en su máquina, cuando hace falta.
 *
 * Hoy eso se cumple porque nadie lo programó. Este test es lo que lo
 * mantiene así mañana: si alguien agrega un workflow de GitHub Actions, un
 * cron de `vercel.json` o una ruta de API que dispare ese script, este test
 * se tiene que poner en rojo.
 *
 * Barre (solo lectura, sin red ni base):
 *   1. todos los `.yml`/`.yaml` de `<raíz>/.github/workflows/`;
 *   2. `<raíz>/vercel.json`, si existe;
 *   3. `<raíz>/apps/web/vercel.json`, si existe;
 *   4. todos los `.ts`/`.tsx` bajo `<raíz>/apps/web/app/api/` (recursivo).
 *
 * Nota: este archivo de test SÍ menciona "nominatim" y "geocodificar" (en
 * este docstring y en los mensajes de falla), pero esos cuatro lugares no
 * incluyen `tests/`, así que el barrido nunca se lee a sí mismo.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { relative } from 'node:path'
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
