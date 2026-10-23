/**
 * 52-q (QA, Ronda 52 — publicidad): los nombres de las variables que Mauro
 * va a cargar en Vercel/EAS tienen que coincidir EXACTO con los que lee el
 * código — un error de tipeo acá se ve en este test, no en producción con
 * el espacio de anuncios vacío.
 *
 * Fase 1 (hoy, 19/10): solo existe la mitad de Web (52-a/52-b). La mitad de
 * app (52-c/52-d, `EXPO_PUBLIC_ADS_ENABLED` y el resto de `apps/mobile/lib/
 * anuncios/`) no se hizo esta noche — ver nota en la regla (e), más abajo.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))

function leerDesdeRepo(relPath: string): string {
  return readFileSync(path.join(REPO_ROOT, relPath), 'utf8')
}

const DIRS_EXCLUIDOS = new Set(['node_modules', '.next', '.turbo', '.git', '.expo', 'dist'])

/**
 * Las entradas de un directorio con sus tipos (archivo/carpeta), o un arreglo
 * vacío si no se puede leer. Ojo: no se tipa con `ReturnType<typeof
 * readdirSync>` — por ser una función con sobrecargas, ese tipo resuelve a
 * la ÚLTIMA firma (`Dirent<Buffer>`), no a la que realmente devuelve esta
 * llamada (`Dirent<string>`, por `withFileTypes: true` sin `encoding`).
 */
function leerEntradas(dirAbsoluto: string) {
  try {
    return readdirSync(dirAbsoluto, { withFileTypes: true })
  } catch {
    return []
  }
}

function listarArchivos(dirAbsoluto: string, extensiones: string[]): string[] {
  const resultado: string[] = []
  for (const entrada of leerEntradas(dirAbsoluto)) {
    if (entrada.isDirectory()) {
      if (DIRS_EXCLUIDOS.has(entrada.name)) continue
      resultado.push(...listarArchivos(path.join(dirAbsoluto, entrada.name), extensiones))
    } else if (entrada.isFile() && extensiones.some((ext) => entrada.name.endsWith(ext))) {
      resultado.push(path.join(dirAbsoluto, entrada.name))
    }
  }
  return resultado
}

// ---------------------------------------------------------------------------
// Los nombres exactos: lib/config/monetization.ts y app/app-ads.txt/route.ts
// son los dos únicos lugares que leen estas variables (carga.test.ts, de
// 52-a, ya probó el comportamiento de ADSENSE_SLOTS con cada valor; acá solo
// miramos que el NOMBRE de la variable sea el que va a cargar Mauro).
// ---------------------------------------------------------------------------
describe('Nombres exactos de las variables en el código', () => {
  const monetizationSrc = readFileSync(path.join(WEB_ROOT, 'lib/config/monetization.ts'), 'utf8')
  const appAdsSrc = readFileSync(path.join(WEB_ROOT, 'app/app-ads.txt/route.ts'), 'utf8')

  it.each([
    'NEXT_PUBLIC_ADS_ENABLED',
    'NEXT_PUBLIC_ADSENSE_CLIENT_ID',
    'NEXT_PUBLIC_ADSENSE_SLOT_PORTADA',
    'NEXT_PUBLIC_ADSENSE_SLOT_FICHA',
    'NEXT_PUBLIC_ADSENSE_SLOT_BUSCAR',
  ])('lib/config/monetization.ts lee process.env.%s', (nombre) => {
    expect(monetizationSrc).toContain(`process.env.${nombre}`)
  })

  it('app/app-ads.txt/route.ts lee process.env.ADMOB_PUBLISHER_ID', () => {
    expect(appAdsSrc).toContain('process.env.ADMOB_PUBLISHER_ID')
  })

  // Negativo: variantes parecidas que un error de tipeo podría colar (sin la
  // S de ADS, sin la D final de ENABLED, sin guion bajo entre palabras).
  it('monetization.ts no tiene variantes mal tipeadas del interruptor', () => {
    const variantesMalas = [
      'NEXT_PUBLIC_AD_ENABLED',
      'NEXT_PUBLIC_ADS_ENABLE"',
      "NEXT_PUBLIC_ADS_ENABLE'",
      'NEXT_PUBLIC_ADSENABLED',
    ]
    for (const variante of variantesMalas) {
      expect(monetizationSrc).not.toContain(variante)
    }
  })
})

// ---------------------------------------------------------------------------
// Regla (f): ningún archivo de configuración VERSIONADO deja el interruptor
// en "true" — eso lo carga Mauro a mano en Vercel/EAS, nunca en un archivo
// que se commitea. No leemos ningún .env real (serían secretos locales, y
// está prohibido); solo .env.example (si existe) y los JSON/TS de config que
// sí viven en el repo.
// ---------------------------------------------------------------------------
describe('Regla (f): ningún archivo versionado fija el interruptor en "true"', () => {
  const candidatos = ['.env.example', 'apps/web/.env.example', 'apps/web/vercel.json', 'apps/mobile/eas.json', 'apps/mobile/app.config.ts']
  const existentes = candidatos.filter((rel) => existsSync(path.join(REPO_ROOT, rel)))

  it('encuentra al menos los archivos de config versionados que existen hoy (sanity del barrido)', () => {
    // Si esto da 0, el barrido está apuntando mal (vercel.json, eas.json y
    // app.config.ts existen en el repo al 19/10).
    expect(existentes.length).toBeGreaterThan(0)
  })

  it.each(existentes)('%s no fija NEXT_PUBLIC_ADS_ENABLED="true" ni EXPO_PUBLIC_ADS_ENABLED="true"', (rel) => {
    const contenido = leerDesdeRepo(rel)
    expect(contenido).not.toMatch(/NEXT_PUBLIC_ADS_ENABLED\s*[=:]\s*["']?true["']?/)
    expect(contenido).not.toMatch(/EXPO_PUBLIC_ADS_ENABLED\s*[=:]\s*["']?true["']?/)
  })

  it('anota cuáles de los candidatos todavía no existen (nada que leer ahí hoy)', () => {
    const faltantes = candidatos.filter((rel) => !existsSync(path.join(REPO_ROOT, rel)))
    // Al 19/10 no hay ningún .env.example versionado en el repo (ni en la
    // raíz ni en apps/web). Si este test falla con una lista distinta, es
    // porque alguien agregó o sacó uno de estos archivos: no hace falta
    // tocar la lógica de arriba, el barrido ya los va a leer solo — pero
    // conviene que quien lo vea confirme que el contenido nuevo tampoco fija
    // el interruptor en "true".
    expect(faltantes).toEqual(['.env.example', 'apps/web/.env.example'])
  })
})

// ---------------------------------------------------------------------------
// Regla (e): la Web y la app tienen interruptores DISTINTOS. Las dos mitades,
// desde la R60 (la Fase 2 de la R52 trajo `EXPO_PUBLIC_ADS_ENABLED`).
//
// R60 (lead): este barrido era `not.toContain('NEXT_PUBLIC_ADS_ENABLED')`
// sobre el texto crudo, y se puso en rojo cuando la R60 escribió, en un
// COMENTARIO de `apps/mobile/lib/env.ts`, "el interruptor es
// EXPO_PUBLIC_ADS_ENABLED, separado del de la web (NEXT_PUBLIC_ADS_ENABLED)".
// O sea: la regla (e) estaba intacta —nadie LEE la variable de la otra
// plataforma— y el detector igual fallaba, porque mide la mención y no la
// lectura. Peor: con ese criterio, la forma de dejarlo en verde era borrar la
// explicación que dice por qué los interruptores están separados. Ahora las
// dos mitades miden `process.env.<NOMBRE>`, que es lo que de verdad prendería
// la plataforma equivocada, y los fixtures de abajo exigen que la diferencia
// entre comentario y lectura esté cubierta.
// ---------------------------------------------------------------------------

/** `true` si `contenido` LEE `process.env.<nombre>` (no si solo lo nombra en un comentario o en un string). */
export function leeVariableDeEntorno(contenido: string, nombre: string): boolean {
  return new RegExp(`process\\s*\\.\\s*env\\s*(?:\\.\\s*${nombre}\\b|\\[\\s*['"\`]${nombre}['"\`]\\s*\\])`).test(contenido)
}

describe('leeVariableDeEntorno (fixtures en memoria: tiene que fallar de verdad)', () => {
  it('detecta la lectura por punto', () => {
    expect(leeVariableDeEntorno(`const x = process.env.NEXT_PUBLIC_ADS_ENABLED === 'true'`, 'NEXT_PUBLIC_ADS_ENABLED')).toBe(true)
  })

  it('detecta la lectura por corchetes', () => {
    expect(leeVariableDeEntorno(`process.env['NEXT_PUBLIC_ADS_ENABLED']`, 'NEXT_PUBLIC_ADS_ENABLED')).toBe(true)
  })

  it('NO cuenta una mención en un comentario (el falso positivo que puso este test en rojo en la R60)', () => {
    const fixture = '// separado del de la web (NEXT_PUBLIC_ADS_ENABLED, R52)\nconst x = 1'
    expect(leeVariableDeEntorno(fixture, 'NEXT_PUBLIC_ADS_ENABLED')).toBe(false)
  })

  it('no confunde un nombre que empieza igual', () => {
    expect(leeVariableDeEntorno(`process.env.NEXT_PUBLIC_ADS_ENABLED_VIEJO`, 'NEXT_PUBLIC_ADS_ENABLED')).toBe(false)
  })
})

describe('Regla (e): cada plataforma lee solo su propio interruptor', () => {
  const EXTENSIONES = ['.ts', '.tsx', '.js', '.json']

  /**
   * Los archivos de test quedan afuera de los dos barridos: un test de la
   * regla (e) necesita, por definición, un fixture con `process.env.<la
   * variable de la otra plataforma>` para probar que su propio detector
   * funciona (`apps/mobile/tests/anuncios-variables.test.ts` tiene
   * exactamente eso). Lo que la regla protege es el código que se empaqueta
   * y corre; los tests no van ni al bundle de la app ni al build de la web.
   */
  function soloCodigo(archivos: string[]): string[] {
    return archivos.filter((abs) => !/[\\/]tests?[\\/]/.test(abs))
  }

  it('ningún archivo de apps/mobile/ lee NEXT_PUBLIC_ADS_ENABLED', () => {
    const archivos = soloCodigo(listarArchivos(path.join(REPO_ROOT, 'apps', 'mobile'), EXTENSIONES))

    // Sanity: apps/mobile/ tiene muchísimos archivos de código; si esto da 0
    // el barrido está mal apuntado.
    expect(archivos.length).toBeGreaterThan(50)

    for (const abs of archivos) {
      const etiqueta = path.relative(REPO_ROOT, abs).replace(/\\/g, '/')
      expect(leeVariableDeEntorno(readFileSync(abs, 'utf8'), 'NEXT_PUBLIC_ADS_ENABLED'), etiqueta).toBe(false)
    }
  })

  it('ningún archivo de apps/web/ lee EXPO_PUBLIC_ADS_ENABLED', () => {
    const archivos = soloCodigo(listarArchivos(WEB_ROOT, EXTENSIONES))

    expect(archivos.length).toBeGreaterThan(50)

    for (const abs of archivos) {
      const etiqueta = path.relative(REPO_ROOT, abs).replace(/\\/g, '/')
      expect(leeVariableDeEntorno(readFileSync(abs, 'utf8'), 'EXPO_PUBLIC_ADS_ENABLED'), etiqueta).toBe(false)
    }
  })

  it('el barrido sirve de algo: cada plataforma SÍ lee su propio interruptor', () => {
    // Sin esto, los dos tests de arriba quedarían en verde el día que nadie
    // leyera ninguna de las dos variables (o que el barrido apuntara mal), y
    // afirmarían que la regla (e) se cumple sin probar nada.
    const mobile = soloCodigo(listarArchivos(path.join(REPO_ROOT, 'apps', 'mobile'), EXTENSIONES))
    const web = soloCodigo(listarArchivos(WEB_ROOT, EXTENSIONES))

    expect(mobile.some((abs) => leeVariableDeEntorno(readFileSync(abs, 'utf8'), 'EXPO_PUBLIC_ADS_ENABLED'))).toBe(true)
    expect(web.some((abs) => leeVariableDeEntorno(readFileSync(abs, 'utf8'), 'NEXT_PUBLIC_ADS_ENABLED'))).toBe(true)
  })
})
