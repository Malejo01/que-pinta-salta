/**
 * 52-q (QA, Ronda 52/60 — publicidad), guarda de la app.
 *
 * R60: la Fase 2 ya llegó (52-c trajo `lib/anuncios/` + `components/
 * BannerAnuncio.tsx`, con el SDK `react-native-google-mobile-ads` instalado
 * y mockeable; 52-d trajo el interruptor `EXPO_PUBLIC_ADS_ENABLED` y
 * `anunciosHabilitados` en `lib/env.ts`). Este archivo ya no es una guarda a
 * ciegas esperando esa mitad: los tres `describe` de abajo corren contra el
 * código real.
 *
 * Qué prueba: ID de AdMob escritos a mano fuera de la config (`app.config.ts`
 * es la única excepción legítima), `TestIds` filtrándose a una pantalla, y un
 * import directo del SDK esquivando `lib/anuncios/`/`components/
 * BannerAnuncio.tsx`.
 *
 * Arreglo de la R60 (52-q, el único permitido sobre este archivo — el resto
 * de los tests de anuncios de la app son archivos nuevos de 52-q):
 * `DIRS_EXCLUIDOS` suma `'tests'` al barrido del tercer test (el único que
 * recorre TODO `apps/mobile`, no solo `app/`/`components/`). Antes, ese
 * barrido entraba a su propia carpeta: cualquier test de anuncios que
 * necesitara el nombre `react-native-google-mobile-ads` en runtime (para
 * ejercer un detector de verdad con un fixture) hacía fallar ESTE archivo por
 * una razón que no tiene nada que ver con él — es la trampa que ya pisó 52-c,
 * que tuvo que armar el nombre del paquete por concatenación en sus fixtures
 * (`NOMBRE_PKG` en `tests/anuncios-ids.test.ts`) para esquivarla. Tres motivos
 * para resolverlo acá en vez de seguir agrandando esa lista de excepciones:
 * - el sentido de este detector es el CÓDIGO DE PRODUCCIÓN (que el SDK no se
 *   filtre a una pantalla real); los archivos de `tests/` no van al bundle;
 * - un test que de verdad importe el SDK se delata solo: no resuelve en el
 *   entorno `node` de Vitest y ese archivo falla por su cuenta;
 * - el detector de verdad sobre `lib/**`, `components/**` y `app/**` ya vive
 *   en `tests/anuncios-ids.test.ts` (52-c), con sus propios fixtures en
 *   memoria que prueban que no se deja engañar por un comentario.
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const MOBILE_ROOT = fileURLToPath(new URL('../', import.meta.url))

const DIRS_EXCLUIDOS = new Set([
  'node_modules',
  '.expo',
  '.turbo',
  'dist',
  // Ver el comentario de cabecera (arreglo de la R60, 52-q): el tercer test
  // de abajo es el único que recorre TODO apps/mobile (no solo app/ o
  // components/), y tests/ no es código de producción.
  'tests',
])

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

function relMobile(abs: string): string {
  return path.relative(MOBILE_ROOT, abs).replace(/\\/g, '/')
}

const ARCHIVOS_APP = listarArchivos(path.join(MOBILE_ROOT, 'app'), ['.ts', '.tsx'])
const ARCHIVOS_COMPONENTS = listarArchivos(path.join(MOBILE_ROOT, 'components'), ['.ts', '.tsx'])

describe('Guarda de anuncios (apps/mobile, código de producción — tests/ excluido a propósito)', () => {
  it('ningún archivo de apps/mobile/app/ ni de apps/mobile/components/ contiene "ca-app-pub-"', () => {
    // Sanity: estas dos carpetas existen y tienen contenido hoy.
    expect(ARCHIVOS_APP.length).toBeGreaterThan(0)
    expect(ARCHIVOS_COMPONENTS.length).toBeGreaterThan(0)

    for (const abs of [...ARCHIVOS_APP, ...ARCHIVOS_COMPONENTS]) {
      expect(readFileSync(abs, 'utf8'), relMobile(abs)).not.toContain('ca-app-pub-')
    }
  })

  // Nota: apps/mobile/app.config.ts SÍ tiene ca-app-pub- (los ID de prueba
  // oficiales de Google para el App ID del SDK, de chore/deps-etapa-2) — pero
  // ese archivo no es `apps/mobile/app/` (la carpeta de rutas de
  // expo-router), es la config de Expo en la raíz de apps/mobile/. No entra
  // en este barrido, y está bien que no entre.

  it('TestIds no aparece en ningún archivo de apps/mobile/app/', () => {
    // 52-c ya llegó: TestIds vive en components/BannerAnuncio.tsx (importado
    // de react-native-google-mobile-ads), NO en apps/mobile/app/ — así que
    // este test sigue valiendo sin ninguna excepción nueva. No hace falta
    // sumar nada acá: BannerAnuncio.tsx está en components/, una carpeta que
    // este `describe` no recorre (ARCHIVOS_APP es solo apps/mobile/app/). Un
    // detector más fino sobre `TestIds` en app/ Y components/ a la vez vive
    // en tests/anuncios-produccion.test.ts (52-q, R60).
    for (const abs of ARCHIVOS_APP) {
      expect(readFileSync(abs, 'utf8'), relMobile(abs)).not.toContain('TestIds')
    }
  })

  it('ningún archivo de apps/mobile/ importa react-native-google-mobile-ads fuera de lib/anuncios/ y components/BannerAnuncio.tsx', () => {
    const todos = listarArchivos(MOBILE_ROOT, ['.ts', '.tsx'])
    const patronImport = /from\s+['"]react-native-google-mobile-ads['"]|require\(\s*['"]react-native-google-mobile-ads['"]\s*\)/

    // 52-c ya llegó: lib/anuncios/consentimiento.ts y components/
    // BannerAnuncio.tsx importan el SDK de verdad. Este barrido ya no pasa en
    // verde "porque no hay nada" — pasa porque esos dos son, de verdad, los
    // únicos dos lugares permitidos (con tests/ excluido del recorrido, ver
    // DIRS_EXCLUIDOS arriba).
    for (const abs of todos) {
      const rel = relMobile(abs)
      const esLugarPermitido = rel.startsWith('lib/anuncios/') || rel === 'components/BannerAnuncio.tsx'
      if (esLugarPermitido) continue
      expect(readFileSync(abs, 'utf8'), rel).not.toMatch(patronImport)
    }
  })
})
