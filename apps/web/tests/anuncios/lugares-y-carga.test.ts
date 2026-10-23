/**
 * 52-q (QA, Ronda 52 — publicidad): barridos de carpetas sobre la Web, sin
 * red ni base. Leemos los archivos fuente del repo (no renderizamos nada):
 * la gracia es que un archivo nuevo mal puesto haga caer el test, no una
 * lista fija que alguien se olvide de actualizar.
 *
 * Lo que YA cubren otros archivos de esta carpeta (no se repite acá):
 * - `app-ads.test.ts` (52-a): los casos de formato de `ADMOB_PUBLISHER_ID`
 *   en `/app-ads.txt` (regla d completa).
 * - `carga.test.ts` (52-a): `renderAdsenseScript`/`configurarAnunciosNoPersonalizados`
 *   con cada valor de consentimiento — nada de `<Script>` ni de
 *   `adsbygoogle` mientras no haya respuesta (regla c completa).
 * - `espacios.test.ts` (52-b): el alto reservado, la etiqueta "Publicidad",
 *   los tres lugares exactos donde vive `<AdSenseBanner` y que no está en
 *   `event-modal*.tsx` ni en `app/@modal/**` (regla b, y parte del
 *   detector de lugares).
 *
 * Lo que agrega este archivo:
 * - que `pagead2.googlesyndication.com` y `adsbygoogle` no se usen desde
 *   ningún otro lugar de la Web (ningún atajo que se salte el loader);
 * - las zonas del detector de lugares que `espacios.test.ts` no cubre:
 *   `movie-modal*.tsx` y las carpetas `app/perfil/**`, `app/auth/**`,
 *   `app/admin/**` y `app/eliminar-cuenta/**`.
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))

// Carpetas que nunca hay que barrer: generadas, de dependencias, o binarios.
const DIRS_EXCLUIDOS = new Set(['node_modules', '.next', '.turbo', '.git'])

function relWeb(abs: string): string {
  return path.relative(WEB_ROOT, abs).replace(/\\/g, '/')
}

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

/** Barrido recursivo de archivos de texto bajo `dirAbsoluto`, filtrando por extensión. */
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

const EXTENSIONES_CODIGO_Y_TEXTO = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.txt']

// Todo apps/web, de punta a punta (incluye tests/, público/, scripts/, etc.):
// es la única forma de que el barrido "falle cuando alguien lo use mal en
// un lugar nuevo" en lugar de depender de una lista de carpetas a mano.
const TODOS_LOS_ARCHIVOS = listarArchivos(WEB_ROOT, EXTENSIONES_CODIGO_Y_TEXTO)

function archivosConString(aguja: string): string[] {
  return TODOS_LOS_ARCHIVOS.filter((abs) => readFileSync(abs, 'utf8').includes(aguja))
    .map(relWeb)
    .sort()
}

// ---------------------------------------------------------------------------
// pagead2.googlesyndication.com: solo el loader (que arma la URL del script),
// next.config.mjs (la CSP, que tiene que permitir ese dominio) y
// public/ads.txt (que lo nombra en texto plano, no en una URL) — y los
// propios tests, que lo citan en fixtures/comentarios.
// ---------------------------------------------------------------------------
describe('pagead2.googlesyndication.com: solo desde components/adsense-loader.tsx', () => {
  it('ningún archivo de apps/web/ lo nombra fuera de adsense-loader.tsx, next.config.mjs, public/ads.txt y los tests', () => {
    const conElDominio = archivosConString('pagead2.googlesyndication.com')

    // Sanity: si esto da 0, el barrido está roto (no está leyendo los archivos
    // que sabemos que sí lo tienen) y el resto del test no prueba nada.
    expect(conElDominio).toContain('components/adsense-loader.tsx')

    for (const rel of conElDominio) {
      const esPermitido =
        rel === 'components/adsense-loader.tsx' ||
        rel === 'next.config.mjs' ||
        rel === 'public/ads.txt' ||
        rel.startsWith('tests/')
      expect(esPermitido, `${rel} no debería nombrar pagead2.googlesyndication.com`).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// adsbygoogle: solo el loader (declaración de window.adsbygoogle y el array
// de comandos) y el banner (el <ins class="adsbygoogle"> y el ads.push) — y
// los tests.
// ---------------------------------------------------------------------------
describe('adsbygoogle: solo desde adsense-loader.tsx y adsense-banner.tsx', () => {
  it('ningún archivo de apps/web/ lo usa fuera de esos dos componentes y los tests', () => {
    const conAdsByGoogle = archivosConString('adsbygoogle')

    expect(conAdsByGoogle).toContain('components/adsense-loader.tsx')
    expect(conAdsByGoogle).toContain('components/adsense-banner.tsx')

    for (const rel of conAdsByGoogle) {
      const esPermitido =
        rel === 'components/adsense-loader.tsx' ||
        rel === 'components/adsense-banner.tsx' ||
        rel.startsWith('tests/')
      expect(esPermitido, `${rel} no debería usar adsbygoogle`).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Detector de lugares (lo que espacios.test.ts, de 52-b, no cubre): nunca
// <AdSenseBanner en movie-modal*.tsx, ni en app/perfil/**, app/auth/**,
// app/admin/** o app/eliminar-cuenta/**. event-modal*.tsx y app/@modal/** ya
// están cubiertos en espacios.test.ts: no se repiten acá.
// ---------------------------------------------------------------------------
describe('Detector de lugares: sin <AdSenseBanner en modales de película ni en cuenta/auth/admin', () => {
  it('ningún movie-modal*.tsx lo usa', () => {
    const componentesDir = path.join(WEB_ROOT, 'components')
    const movieModales = listarArchivos(componentesDir, ['.tsx']).filter((abs) =>
      /^movie-modal.*\.tsx$/.test(path.basename(abs)),
    )

    // Sanity: si no encontramos ningún movie-modal*.tsx, el barrido está mal
    // apuntado (sabemos que components/movie-modal.tsx existe).
    expect(movieModales.length).toBeGreaterThan(0)

    for (const abs of movieModales) {
      expect(readFileSync(abs, 'utf8')).not.toContain('<AdSenseBanner')
    }
  })

  it.each(['perfil', 'auth', 'admin', 'eliminar-cuenta'] as const)(
    'ningún archivo bajo app/%s/ usa <AdSenseBanner',
    (carpeta) => {
      const archivos = listarArchivos(path.join(WEB_ROOT, 'app', carpeta), ['.tsx'])

      // Sanity: cada una de estas carpetas existe y tiene al menos una pantalla.
      expect(archivos.length).toBeGreaterThan(0)

      for (const abs of archivos) {
        expect(readFileSync(abs, 'utf8'), relWeb(abs)).not.toContain('<AdSenseBanner')
      }
    },
  )
})
