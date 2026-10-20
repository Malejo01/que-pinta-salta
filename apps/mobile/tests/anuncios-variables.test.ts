/**
 * R60, 52-q (QA): los nombres de las variables que Mauro va a cargar en EAS
 * tienen que coincidir EXACTO con los que lee el código de la app — un error
 * de tipeo acá se ve en este test, no en producción con el espacio de
 * anuncios vacío. Equivalente de la mitad de app al archivo del PR #89
 * (`apps/web/tests/anuncios/variables.test.ts`, 52-q de la web).
 *
 * Reglas de Mauro del 19/10 que son de app:
 * - nombres exactos de `lib/env.ts` (anuncios del banner + el interruptor) y
 *   de `app.config.ts` (los ID de app de AdMob);
 * - (f) ningún archivo VERSIONADO de la app fija `EXPO_PUBLIC_ADS_ENABLED`
 *   en `"true"` (eso lo carga Mauro a mano en EAS, nunca en un archivo que
 *   se commitea);
 * - (e) el interruptor de la app (`EXPO_PUBLIC_ADS_ENABLED`) y el de la web
 *   (`NEXT_PUBLIC_ADS_ENABLED`) son DISTINTOS: ningún archivo de
 *   `apps/mobile/` nombra el de la web, y ningún archivo de `apps/web/`
 *   nombra el de la app.
 *
 * `apps/web/tests/anuncios/variables.test.ts` (PR #89, ya en `main`) prueba
 * la mitad "ningún archivo de apps/mobile/ nombra NEXT_PUBLIC_ADS_ENABLED" y
 * deja anotado (su propio comentario, líneas ~127-136) que falta la mitad
 * simétrica "ningún archivo de apps/web/ nombra EXPO_PUBLIC_ADS_ENABLED"
 * para cuando llegara la Fase 2 de la app — pero ese archivo no es
 * `apps/mobile/tests/**`, así que esta tarea no lo puede tocar (está fuera
 * de los archivos permitidos de 52-q en la app). Esa mitad que faltaba
 * queda cubierta en el último `describe` de este archivo: es SOLO LECTURA
 * sobre `apps/web/**` (ningún archivo se escribe ahí), y el test en sí vive
 * en `apps/mobile/tests/`, como corresponde a esta tarea.
 *
 * Hallazgo de esta corrida (no se toca ninguno de los dos archivos, ver el
 * comentario de la regla (e) más abajo): `apps/mobile/lib/env.ts:22` tiene
 * un comentario que NOMBRA `NEXT_PUBLIC_ADS_ENABLED` (para explicar que es
 * el interruptor de la otra plataforma), y eso deja en rojo, ahora mismo, el
 * test ya mergeado `apps/web/tests/anuncios/variables.test.ts` ("ningún
 * archivo de apps/mobile/ nombra NEXT_PUBLIC_ADS_ENABLED"), que barre por
 * substring crudo sin distinguir un comentario de una lectura real. Por eso
 * los dos `describe` de la regla (e) de este archivo verifican la LECTURA
 * (`process.env.<NOMBRE>`), no la mención. Queda anotado para el lead/Mauro.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const MOBILE_ROOT = fileURLToPath(new URL('../', import.meta.url))

const DIRS_EXCLUIDOS = new Set([
  'node_modules',
  '.expo',
  '.turbo',
  '.next',
  '.git',
  'dist',
  // Mismo motivo que tests/anuncios-sin-sdk.test.ts (52-q, R60): los
  // barridos de más abajo son sobre CÓDIGO DE PRODUCCIÓN. Sin esto, el
  // barrido de apps/mobile/ se encuentra a SÍ MISMO (este propio archivo
  // necesita el literal `process.env.NEXT_PUBLIC_ADS_ENABLED` en sus
  // fixtures en memoria, para ejercer `leeVariableDeEntorno` de verdad) y se
  // pone en rojo por una razón ajena a una violación real. También excluye
  // tests/env.test.ts, que fija `process.env.EXPO_PUBLIC_ADS_ENABLED` a
  // propósito para probar `leerEnv()` — otro caso legítimo, no una lectura
  // de producción.
  'tests',
])

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
// Nombres exactos en lib/env.ts y app.config.ts.
// ---------------------------------------------------------------------------
describe('Nombres exactos de las variables de AdMob en el código de la app', () => {
  const envSrc = readFileSync(path.join(MOBILE_ROOT, 'lib', 'env.ts'), 'utf8')
  const appConfigSrc = readFileSync(path.join(MOBILE_ROOT, 'app.config.ts'), 'utf8')

  it.each(['EXPO_PUBLIC_ADMOB_BANNER_INICIO_ANDROID', 'EXPO_PUBLIC_ADMOB_BANNER_BUSCAR_ANDROID', 'EXPO_PUBLIC_ADS_ENABLED'])(
    'lib/env.ts lee process.env.%s',
    (nombre) => {
      expect(envSrc).toContain(`process.env.${nombre}`)
    },
  )

  it.each(['EXPO_PUBLIC_ADMOB_ANDROID_APP_ID', 'EXPO_PUBLIC_ADMOB_IOS_APP_ID'])(
    'app.config.ts lee env.%s (admobAppIds)',
    (nombre) => {
      expect(appConfigSrc).toContain(`env.${nombre}`)
    },
  )

  // Negativo: variantes parecidas que un error de tipeo podría colar (sin la
  // S de ADS, sin la D final de ENABLED, sin guion bajo entre palabras, o
  // "ANDROID"/"IOS" invertidos entre sí).
  it('lib/env.ts no tiene variantes mal tipeadas del interruptor', () => {
    const variantesMalas = [
      'EXPO_PUBLIC_AD_ENABLED',
      'EXPO_PUBLIC_ADS_ENABLE"',
      "EXPO_PUBLIC_ADS_ENABLE'",
      'EXPO_PUBLIC_ADSENABLED',
    ]
    for (const variante of variantesMalas) {
      expect(envSrc).not.toContain(variante)
    }
  })

  it('app.config.ts no confunde EXPO_PUBLIC_ADMOB_ANDROID_APP_ID con EXPO_PUBLIC_ADMOB_IOS_APP_ID (cada uno lee el suyo)', () => {
    // Nota de la primera corrida: `appConfigSrc.indexOf('androidAppId:')`
    // encuentra primero la firma del TIPO de retorno de `admobAppIds`
    // (`{ androidAppId: string; iosAppId: string }`), no la asignación real
    // de más abajo — por eso acá se matchea la asignación completa
    // (`androidAppId: env.EXPO_PUBLIC_...`) en vez de buscar el índice de la
    // clave sola.
    expect(appConfigSrc).toMatch(/androidAppId:\s*env\.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID\b/)
    expect(appConfigSrc).toMatch(/iosAppId:\s*env\.EXPO_PUBLIC_ADMOB_IOS_APP_ID\b/)
    expect(appConfigSrc).not.toMatch(/androidAppId:\s*env\.EXPO_PUBLIC_ADMOB_IOS_APP_ID\b/)
    expect(appConfigSrc).not.toMatch(/iosAppId:\s*env\.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID\b/)
  })
})

// ---------------------------------------------------------------------------
// Regla (f): ningún archivo versionado de la app fija el interruptor en
// "true". No se lee ningún .env real (serían secretos locales, prohibido):
// solo .env.example (si existe) y los JSON/TS de config que sí viven en el
// repo.
// ---------------------------------------------------------------------------
/**
 * `true` si `contenido` fija `nombreVar` en el string literal `"true"` (con
 * `=` o `:`, comillas simples, dobles o ninguna). Puro, con fixtures abajo
 * que prueban que detecta varias formas y que NO se confunde con "false" ni
 * con una mención en un comentario que no la está fijando.
 */
function fijaVariableEnTrueLiteral(contenido: string, nombreVar: string): boolean {
  // `["']?` también DESPUÉS de nombreVar: una clave de JSON va entre
  // comillas (`"EXPO_PUBLIC_ADS_ENABLED": "true"`), así que la comilla de
  // cierre del nombre tiene que poder aparecer antes del separador `:`/`=`.
  const re = new RegExp(`${nombreVar}["']?\\s*[=:]\\s*["']?true["']?`)
  return re.test(contenido)
}

describe('fijaVariableEnTrueLiteral (fixtures en memoria: tiene que fallar de verdad)', () => {
  it('detecta .env con =true sin comillas', () => {
    expect(fijaVariableEnTrueLiteral('EXPO_PUBLIC_ADS_ENABLED=true', 'EXPO_PUBLIC_ADS_ENABLED')).toBe(true)
  })

  it('detecta JSON con : "true" (comillas dobles)', () => {
    expect(fijaVariableEnTrueLiteral('"EXPO_PUBLIC_ADS_ENABLED": "true"', 'EXPO_PUBLIC_ADS_ENABLED')).toBe(true)
  })

  it('detecta TS con : \'true\' (comillas simples)', () => {
    expect(fijaVariableEnTrueLiteral("EXPO_PUBLIC_ADS_ENABLED: 'true'", 'EXPO_PUBLIC_ADS_ENABLED')).toBe(true)
  })

  it('NO confunde con =false', () => {
    expect(fijaVariableEnTrueLiteral('EXPO_PUBLIC_ADS_ENABLED=false', 'EXPO_PUBLIC_ADS_ENABLED')).toBe(false)
  })

  it('NO confunde con una mención sin asignación de "true" (ej. un comentario de ejemplo distinto)', () => {
    expect(
      fijaVariableEnTrueLiteral('// EXPO_PUBLIC_ADS_ENABLED queda apagado por defecto', 'EXPO_PUBLIC_ADS_ENABLED'),
    ).toBe(false)
  })
})

describe('Regla (f): ningún archivo versionado de la app fija EXPO_PUBLIC_ADS_ENABLED en "true"', () => {
  const candidatos = ['apps/mobile/app.config.ts', 'apps/mobile/eas.json', 'apps/mobile/.env.example']
  const existentes = candidatos.filter((rel) => existsSync(path.join(REPO_ROOT, rel)))

  it('sanity: encuentra al menos los archivos de config de la app que existen hoy', () => {
    expect(existentes.length).toBeGreaterThan(0)
  })

  it.each(existentes)('%s no fija EXPO_PUBLIC_ADS_ENABLED="true"', (rel) => {
    const contenido = readFileSync(path.join(REPO_ROOT, rel), 'utf8')
    expect(fijaVariableEnTrueLiteral(contenido, 'EXPO_PUBLIC_ADS_ENABLED')).toBe(false)
  })

  it('anota cuáles de los candidatos no existen hoy (nada que leer ahí) — no se inventa un .env.example', () => {
    const faltantes = candidatos.filter((rel) => !existsSync(path.join(REPO_ROOT, rel)))
    // Al 19-20/10 no hay ningún apps/mobile/.env.example versionado. Si este
    // test falla con una lista distinta, alguien agregó o sacó el archivo:
    // el barrido de arriba ya lo va a leer solo, pero conviene confirmar que
    // el contenido nuevo tampoco fija el interruptor en "true".
    expect(faltantes).toEqual(['apps/mobile/.env.example'])
  })
})

// ---------------------------------------------------------------------------
// Regla (e): los interruptores son distintos por plataforma.
//
// El encargo dice "lee" (no "menciona" ni "nombra"): por eso el detector de
// abajo busca `process.env.<NOMBRE>` de verdad, no cualquier aparición del
// string. Hallazgo real de esta corrida: `apps/mobile/lib/env.ts:22` tiene
// un COMENTARIO que nombra `NEXT_PUBLIC_ADS_ENABLED` para explicar, en
// prosa, que es el interruptor separado de la web ("separado del de la web
// (NEXT_PUBLIC_ADS_ENABLED, R52)") — no lo lee, no lo usa, es documentación.
// Un barrido por substring crudo (el que usa, ya mergeado, `apps/web/tests/
// anuncios/variables.test.ts`, "ningún archivo de apps/mobile/ NOMBRA
// NEXT_PUBLIC_ADS_ENABLED") SÍ se confunde con esto y queda en rojo por una
// razón que no es una violación real de la regla (e) — queda anotado para
// el lead/Mauro, no se toca ese archivo (no es de los permitidos de esta
// tarea) ni `lib/env.ts` (código de producción). Acá, en el archivo propio
// de esta tarea, se verifica la LECTURA real.
// ---------------------------------------------------------------------------
/**
 * `true` si `contenido` lee `process.env.<nombreVar>` de verdad (no solo lo
 * menciona en un comentario o un string). Puro, con fixtures abajo.
 */
function leeVariableDeEntorno(contenido: string, nombreVar: string): boolean {
  return new RegExp(`process\\.env\\.${nombreVar}\\b`).test(contenido)
}

describe('leeVariableDeEntorno (fixtures en memoria: distingue una LECTURA real de una mención en comentario)', () => {
  it('detecta process.env.NOMBRE', () => {
    expect(leeVariableDeEntorno('const x = process.env.NEXT_PUBLIC_ADS_ENABLED', 'NEXT_PUBLIC_ADS_ENABLED')).toBe(true)
  })

  it('NO confunde una mención en un comentario con una lectura real (el caso real de lib/env.ts, ver el comentario de arriba)', () => {
    const content = '// separado del de la web (NEXT_PUBLIC_ADS_ENABLED, R52) — cada plataforma apaga o enciende la suya'
    expect(leeVariableDeEntorno(content, 'NEXT_PUBLIC_ADS_ENABLED')).toBe(false)
  })

  it('NO confunde con otra variable que empieza igual (NEXT_PUBLIC_ADS_ENABLED_X)', () => {
    expect(leeVariableDeEntorno('process.env.NEXT_PUBLIC_ADS_ENABLED_X', 'NEXT_PUBLIC_ADS_ENABLED')).toBe(false)
  })
})

describe('Regla (e): el interruptor de la app y el de la web son distintos', () => {
  it('ningún archivo de apps/mobile/ LEE process.env.NEXT_PUBLIC_ADS_ENABLED (el de la web)', () => {
    const archivos = listarArchivos(MOBILE_ROOT, ['.ts', '.tsx', '.js', '.json'])

    // Sanity: apps/mobile/ tiene muchísimos archivos de código; si esto da 0
    // el barrido está mal apuntado.
    expect(archivos.length).toBeGreaterThan(50)

    for (const abs of archivos) {
      const contenido = readFileSync(abs, 'utf8')
      expect(
        leeVariableDeEntorno(contenido, 'NEXT_PUBLIC_ADS_ENABLED'),
        path.relative(REPO_ROOT, abs).replace(/\\/g, '/'),
      ).toBe(false)
    }
  })

  // La mitad simétrica que apps/web/tests/anuncios/variables.test.ts (PR #89)
  // dejó anotada como pendiente para cuando llegara esta Fase 2 (ver el
  // comentario de cabecera de este archivo): SOLO LECTURA sobre apps/web/**,
  // nada se escribe ahí. El test en sí vive acá, en apps/mobile/tests/, como
  // corresponde a los archivos permitidos de esta tarea.
  it('(la otra mitad, de solo lectura) ningún archivo de apps/web/ LEE process.env.EXPO_PUBLIC_ADS_ENABLED (el de la app)', () => {
    const archivos = listarArchivos(path.join(REPO_ROOT, 'apps', 'web'), ['.ts', '.tsx', '.js', '.json'])

    expect(archivos.length).toBeGreaterThan(50)

    for (const abs of archivos) {
      const contenido = readFileSync(abs, 'utf8')
      expect(
        leeVariableDeEntorno(contenido, 'EXPO_PUBLIC_ADS_ENABLED'),
        path.relative(REPO_ROOT, abs).replace(/\\/g, '/'),
      ).toBe(false)
    }
  })
})
