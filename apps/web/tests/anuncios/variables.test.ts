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
// Regla (e), la mitad de hoy: el interruptor de la Web no prende la app.
//
// La otra mitad —que EXPO_PUBLIC_ADS_ENABLED no prenda la Web— TODAVÍA NO SE
// PUEDE PROBAR: esa variable no existe en ningún lado del repo porque 52-c y
// 52-d (apps/mobile/lib/anuncios/, components/BannerAnuncio.tsx) quedaron
// para la Fase 2. Cuando se agregue esa mitad, sumar acá el barrido
// simétrico: ningún archivo de apps/web/ debería nombrar
// EXPO_PUBLIC_ADS_ENABLED.
// ---------------------------------------------------------------------------
describe('Regla (e) (parcial): NEXT_PUBLIC_ADS_ENABLED no aparece en apps/mobile/', () => {
  it('ningún archivo de apps/mobile/ nombra NEXT_PUBLIC_ADS_ENABLED', () => {
    const archivos = listarArchivos(path.join(REPO_ROOT, 'apps', 'mobile'), ['.ts', '.tsx', '.js', '.json'])

    // Sanity: apps/mobile/ tiene muchísimos archivos de código; si esto da 0
    // el barrido está mal apuntado.
    expect(archivos.length).toBeGreaterThan(50)

    for (const abs of archivos) {
      expect(readFileSync(abs, 'utf8'), path.relative(REPO_ROOT, abs).replace(/\\/g, '/')).not.toContain(
        'NEXT_PUBLIC_ADS_ENABLED',
      )
    }
  })
})
