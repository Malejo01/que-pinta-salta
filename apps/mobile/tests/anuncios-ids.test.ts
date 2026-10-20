// R60/52-c: `idBloque` (lib/anuncios/ids.ts), puro, y el detector de que
// `react-native-google-mobile-ads` se importa SOLO en
// `lib/anuncios/consentimiento.ts` y `components/BannerAnuncio.tsx` (mismo
// estilo de barrido que `tests/dimensions.test.ts`: recorte de comentarios,
// archivo + línea en cada hallazgo).
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { idBloque } from '../lib/anuncios/ids'
import type { Env } from '../lib/env'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const LIB_DIR = join(MOBILE_ROOT, 'lib')
const COMPONENTS_DIR = join(MOBILE_ROOT, 'components')
const APP_DIR = join(MOBILE_ROOT, 'app')

const ID_PRUEBA = 'ca-app-pub-3940256099942544/6300978111' // TestIds.ADAPTIVE_BANNER real del SDK
const ID_REAL_INICIO = 'ca-app-pub-1111111111111111/1111111111'
const ID_REAL_BUSCAR = 'ca-app-pub-1111111111111111/2222222222'

function envDe(parcial: Partial<Env>): Env {
  return {
    supabase: null,
    googleWebClientId: null,
    sentryDsn: null,
    admobBannerInicio: null,
    admobBannerBuscar: null,
    anunciosHabilitados: true,
    ...parcial,
  }
}

describe('idBloque', () => {
  it('con un ID real (Android, inicio): devuelve ese ID', () => {
    const resultado = idBloque('inicio', {
      entorno: 'production',
      plataforma: 'android',
      env: envDe({ admobBannerInicio: ID_REAL_INICIO }),
      idPrueba: ID_PRUEBA,
    })
    expect(resultado).toBe(ID_REAL_INICIO)
  })

  it('con un ID real (Android, buscar): devuelve ese ID', () => {
    const resultado = idBloque('buscar', {
      entorno: 'production',
      plataforma: 'android',
      env: envDe({ admobBannerBuscar: ID_REAL_BUSCAR }),
      idPrueba: ID_PRUEBA,
    })
    expect(resultado).toBe(ID_REAL_BUSCAR)
  })

  it('sin ID real, entorno preview: el ID de prueba', () => {
    const resultado = idBloque('inicio', {
      entorno: 'preview',
      plataforma: 'android',
      env: envDe({}),
      idPrueba: ID_PRUEBA,
    })
    expect(resultado).toBe(ID_PRUEBA)
  })

  it('sin ID real, entorno development o local: también el ID de prueba', () => {
    for (const entorno of ['development', 'local']) {
      const resultado = idBloque('inicio', { entorno, plataforma: 'android', env: envDe({}), idPrueba: ID_PRUEBA })
      expect(resultado).toBe(ID_PRUEBA)
    }
  })

  it('sin ID real, entorno production: null (nunca anuncios de prueba en producción)', () => {
    const resultado = idBloque('inicio', {
      entorno: 'production',
      plataforma: 'android',
      env: envDe({}),
      idPrueba: ID_PRUEBA,
    })
    expect(resultado).toBeNull()
  })

  it('un ID mal formado en production ("123456"): null, no lo devuelve', () => {
    const resultado = idBloque('inicio', {
      entorno: 'production',
      plataforma: 'android',
      env: envDe({ admobBannerInicio: '123456' }),
      idPrueba: ID_PRUEBA,
    })
    expect(resultado).toBeNull()
  })

  it('un ID mal formado en production ("ca-app-pub-xxx", sin "/"): null', () => {
    const resultado = idBloque('inicio', {
      entorno: 'production',
      plataforma: 'android',
      env: envDe({ admobBannerInicio: 'ca-app-pub-xxx' }),
      idPrueba: ID_PRUEBA,
    })
    expect(resultado).toBeNull()
  })

  it('un ID mal formado, pero fuera de production: cae al ID de prueba (no es un ID real, pero no estamos en production)', () => {
    const resultado = idBloque('inicio', {
      entorno: 'preview',
      plataforma: 'android',
      env: envDe({ admobBannerInicio: '123456' }),
      idPrueba: ID_PRUEBA,
    })
    expect(resultado).toBe(ID_PRUEBA)
  })

  it('iOS sin ID real: null', () => {
    const resultado = idBloque('inicio', {
      entorno: 'preview',
      plataforma: 'ios',
      env: envDe({}),
      idPrueba: ID_PRUEBA,
    })
    expect(resultado).toBeNull()
  })

  it('iOS CON ID real configurado: igual null (todavía no hay bloques para iOS)', () => {
    const resultado = idBloque('inicio', {
      entorno: 'production',
      plataforma: 'ios',
      env: envDe({ admobBannerInicio: ID_REAL_INICIO }),
      idPrueba: ID_PRUEBA,
    })
    expect(resultado).toBeNull()
  })

  it('"inicio" lee admobBannerInicio, no admobBannerBuscar', () => {
    const env = envDe({ admobBannerBuscar: ID_REAL_BUSCAR })
    const resultado = idBloque('inicio', { entorno: 'production', plataforma: 'android', env, idPrueba: ID_PRUEBA })
    // Sin admobBannerInicio configurado (solo buscar), y en production: null,
    // nunca el ID de buscar.
    expect(resultado).toBeNull()
  })

  it('"buscar" lee admobBannerBuscar, no admobBannerInicio', () => {
    const env = envDe({ admobBannerInicio: ID_REAL_INICIO })
    const resultado = idBloque('buscar', { entorno: 'production', plataforma: 'android', env, idPrueba: ID_PRUEBA })
    expect(resultado).toBeNull()
  })

  it('los dos lugares, cada uno con su propio ID real al mismo tiempo: no se cruzan', () => {
    const env = envDe({ admobBannerInicio: ID_REAL_INICIO, admobBannerBuscar: ID_REAL_BUSCAR })
    expect(idBloque('inicio', { entorno: 'production', plataforma: 'android', env, idPrueba: ID_PRUEBA })).toBe(
      ID_REAL_INICIO,
    )
    expect(idBloque('buscar', { entorno: 'production', plataforma: 'android', env, idPrueba: ID_PRUEBA })).toBe(
      ID_REAL_BUSCAR,
    )
  })

  // Vuelta 1 de revisión (bloqueante, seguridad): sin ID real, el ID de
  // prueba SOLO puede salir de uno de los tres valores exactos de abajo.
  // Antes, cualquier cosa que no fuera literalmente 'production' (incluido
  // el dato ausente) caía al ID de prueba — fail open. Estos 6 casos tienen
  // que dar `null`, sin excepción.
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['un número (42)', 42],
    ['"produccion" (mal escrito, sin acento ni la "t")', 'produccion'],
    ['string vacío', ''],
    ['"staging" (desconocido, no está en ENTORNOS_VALIDOS)', 'staging'],
  ] as const)('sin ID real, entorno %s: null (fail closed, nunca el ID de prueba)', (_descripcion, entorno) => {
    const resultado = idBloque('inicio', { entorno, plataforma: 'android', env: envDe({}), idPrueba: ID_PRUEBA })
    expect(resultado).toBeNull()
  })

  it.each(['preview', 'development', 'local'] as const)(
    'sin ID real, entorno %s: sigue dando el ID de prueba (no se rompió el caso sano)',
    (entorno) => {
      const resultado = idBloque('inicio', { entorno, plataforma: 'android', env: envDe({}), idPrueba: ID_PRUEBA })
      expect(resultado).toBe(ID_PRUEBA)
    },
  )
})

// ---------------------------------------------------------------------------
// Detector: `react-native-google-mobile-ads` se importa SOLO en
// `lib/anuncios/consentimiento.ts` y `components/BannerAnuncio.tsx`.
// ---------------------------------------------------------------------------

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

/**
 * Mismo recorte línea por línea que `tests/dimensions.test.ts`: un
 * comentario de bloque deja la línea en blanco mientras dura, uno de línea
 * corta desde el `//`. El NÚMERO de línea del resultado es el mismo que en
 * el original.
 *
 * Vuelta 1 de revisión (hallazgo del revisor): a diferencia de la versión
 * copiada de `tests/dimensions.test.ts`/`tests/accesibilidad-detector.test.ts`,
 * ACÁ se resuelve primero cuál de los dos aparece antes en lo que queda de
 * la línea, `//` o `/*` — si el `//` va primero (o no hay ningún `/*` en la
 * línea), se recorta ahí y NUNCA se evalúa la apertura de un bloque. Esto es
 * lo que evita que un comentario de línea que por casualidad contiene la
 * secuencia `/*` (un glob como `lib/**`, `components/*`, o un `/*` suelto
 * mencionado dentro de un `//`) se confunda con la apertura de un bloque de
 * comentario sin cierre, que blanquearía todo el resto del archivo (el bug
 * real que tuvo este mismo archivo contra `components/BannerAnuncio.tsx` en
 * la vuelta anterior). Los tres fixtures de abajo ("ver lib/** para más
 * detalle", "ver components/* para más detalle", "un /* no es un bloque
 * real acá") fallarían con la versión vieja (sin este reordenamiento).
 *
 * LÍMITE QUE SIGUE IGUAL (heredado, no es parte de este arreglo): un bloque
 * de comentario que abre Y cierra en la MISMA línea sigue sin stripearse
 * como tal (mismo límite que `tests/dimensions.test.ts`) — no es el bug de
 * este hallazgo, que es específicamente sobre una apertura sin cierre que
 * en realidad estaba dentro de un `//`.
 */
function quitarComentarios(content: string): string {
  const lineasDeTexto = content.split('\n')
  const resultado: string[] = []
  let dentroDeBloqueComentario = false

  for (let linea of lineasDeTexto) {
    if (dentroDeBloqueComentario) {
      const finBloque = linea.indexOf('*/')
      if (finBloque === -1) {
        resultado.push('')
        continue
      }
      linea = linea.slice(finBloque + 2)
      dentroDeBloqueComentario = false
    }

    const matchLineaDeTexto = linea.match(/(^|\s)\/\//)
    const idxSlashSlash = matchLineaDeTexto ? linea.indexOf('//', matchLineaDeTexto.index) : -1
    const idxBloque = linea.indexOf('/*')

    // Solo se evalúa la apertura de un bloque si el `/*` aparece ANTES que
    // el `//` (o no hay ningún `//` en la línea): si el `//` va primero, lo
    // que sigue —incluido cualquier `/*`— ya es parte del comentario de
    // línea, no la apertura de un bloque nuevo.
    if (idxBloque !== -1 && (idxSlashSlash === -1 || idxBloque < idxSlashSlash)) {
      if (linea.indexOf('*/', idxBloque + 2) === -1) {
        resultado.push(linea.slice(0, idxBloque))
        dentroDeBloqueComentario = true
        continue
      }
      // Bloque que abre y cierra en la misma línea: límite heredado, ver el
      // docstring — cae al recorte de `//` de abajo, sin stripear el bloque.
    }

    resultado.push(idxSlashSlash === -1 ? linea : linea.slice(0, idxSlashSlash))
  }

  return resultado.join('\n')
}

/**
 * Las líneas (1-based), fuera de comentarios, donde `content` importa o
 * requiere el SDK de anuncios DE VERDAD (no un comentario que solo lo
 * menciona): un `import` del paquete (default, con nombre, de tipo,
 * namespace) o un `require(...)` del paquete. No mira `app.config.ts` (ese
 * archivo nombra el paquete como plugin de Expo, y es correcto que lo haga —
 * no es un archivo de `lib/`/`components/`/`app/`, así que ni se le pasa el
 * contenido).
 */
export function lineasQueImportanElSdkDeAds(content: string): number[] {
  const limpio = quitarComentarios(content)
  const resultado: number[] = []
  const re = /\b(?:import\s[^;]*?from\s*|require\s*\(\s*)['"]react-native-google-mobile-ads['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(limpio))) {
    resultado.push(limpio.slice(0, m.index).split('\n').length)
  }
  return resultado
}

// El nombre del paquete, armado por concatenación (nunca como un literal
// único que quede pegado a un "from"/"require(" en ESTE archivo):
// `tests/anuncios-sin-sdk.test.ts` (52-q, QA; no es un archivo permitido de
// esta tarea, no se toca) barre TODO apps/mobile buscando exactamente ese
// patrón fuera de lib/anuncios/ y components/BannerAnuncio.tsx, y la
// carpeta tests/ no es una excepción. Los fixtures de abajo sí necesitan el
// nombre completo como valor en tiempo de ejecución, para ejercer el
// detector de verdad — concatenar le da ese valor en runtime sin que el
// texto crudo de este archivo contenga el patrón que busca esa guarda.
const NOMBRE_PKG = ['react-native-google', 'mobile-ads'].join('-')

describe('lineasQueImportanElSdkDeAds (fixtures en memoria: tiene que fallar de verdad)', () => {
  it('detecta un import con nombre', () => {
    expect(lineasQueImportanElSdkDeAds(`import { BannerAd } from '${NOMBRE_PKG}'`)).toEqual([1])
  })

  it('detecta el default export', () => {
    expect(lineasQueImportanElSdkDeAds(`import mobileAds from '${NOMBRE_PKG}'`)).toEqual([1])
  })

  it('detecta un require', () => {
    expect(lineasQueImportanElSdkDeAds(`const ads = require('${NOMBRE_PKG}')`)).toEqual([1])
  })

  it('detecta un import de tipo', () => {
    expect(lineasQueImportanElSdkDeAds(`import type { AdsConsentInfo } from '${NOMBRE_PKG}'`)).toEqual([1])
  })

  it('NO confunde un comentario que solo menciona el paquete (precedente del repo: no repetir un "pasa en verde por un comentario")', () => {
    const content = [
      '// antes esto importaba de react-native-google-mobile-ads, ahora no',
      'export function Foo() { return null }',
    ].join('\n')
    expect(lineasQueImportanElSdkDeAds(content)).toEqual([])
  })

  it('NO confunde un bloque /* ... */ que menciona el paquete', () => {
    const content = [
      '/**',
      ' * Ver react-native-google-mobile-ads para más detalle.',
      ' */',
      'function f() {}',
    ].join('\n')
    expect(lineasQueImportanElSdkDeAds(content)).toEqual([])
  })

  it('no confunde un string que solo nombra el paquete sin ser un import/require (ej. un mensaje de error)', () => {
    expect(lineasQueImportanElSdkDeAds(`const x = '${NOMBRE_PKG}'`)).toEqual([])
  })

  it('reporta varias líneas', () => {
    const content = [
      `import { BannerAd } from '${NOMBRE_PKG}'`,
      'const x = 1',
      `import mobileAds from '${NOMBRE_PKG}'`,
    ].join('\n')
    expect(lineasQueImportanElSdkDeAds(content)).toEqual([1, 3])
  })

  // Vuelta 1 de revisión (hallazgo del revisor): los tres fixtures de abajo
  // fallarían con la versión vieja de `quitarComentarios` — un `/*` dentro
  // de un `//` quedaba tratado como la apertura de un bloque sin cierre, y
  // blanqueaba (entre otras) la línea del import real, dejando el detector
  // ciego.
  it('un glob tipo `lib/**` dentro de un comentario de línea no abre un bloque falso (el import real, dos líneas abajo, se sigue detectando)', () => {
    const content = ['// ver lib/** para más detalle', 'const x = 1', `import { BannerAd } from '${NOMBRE_PKG}'`].join(
      '\n',
    )
    expect(lineasQueImportanElSdkDeAds(content)).toEqual([3])
  })

  it('lo mismo con `components/*` dentro del comentario', () => {
    const content = [
      '// ver components/* para más detalle',
      'const x = 1',
      `import { BannerAd } from '${NOMBRE_PKG}'`,
    ].join('\n')
    expect(lineasQueImportanElSdkDeAds(content)).toEqual([3])
  })

  it('un `/*` suelto mencionado dentro de un `//` tampoco abre un bloque falso', () => {
    const content = [
      '// nota: un /* no es un bloque real acá',
      'const x = 1',
      `import { BannerAd } from '${NOMBRE_PKG}'`,
    ].join('\n')
    expect(lineasQueImportanElSdkDeAds(content)).toEqual([3])
  })
})

describe('lib/, components/ y app/: react-native-google-mobile-ads solo se importa en lib/anuncios/consentimiento.ts y components/BannerAnuncio.tsx', () => {
  const PERMITIDOS = new Set([join('lib', 'anuncios', 'consentimiento.ts'), join('components', 'BannerAnuncio.tsx')])

  const archivos = [...listarTsxYTs(LIB_DIR), ...listarTsxYTs(COMPONENTS_DIR), ...listarTsxYTs(APP_DIR)]

  it('encuentra archivos para analizar, incluidos los dos permitidos', () => {
    expect(archivos.length).toBeGreaterThan(0)
    const relativos = archivos.map((f) => relative(MOBILE_ROOT, f))
    for (const permitido of PERMITIDOS) {
      expect(relativos).toContain(permitido)
    }
  })

  it('los dos archivos permitidos importan de verdad el SDK (si no, el detector de abajo no estaría probando nada)', () => {
    for (const permitido of PERMITIDOS) {
      const content = readFileSync(join(MOBILE_ROOT, ...permitido.split(/[\\/]/)), 'utf8')
      expect(lineasQueImportanElSdkDeAds(content).length).toBeGreaterThan(0)
    }
  })

  it.each(archivos.map((file) => [relative(MOBILE_ROOT, file), file] as const))('%s', (label, file) => {
    const content = readFileSync(file, 'utf8')
    const lineas = lineasQueImportanElSdkDeAds(content)
    if (PERMITIDOS.has(label)) return
    if (lineas.length > 0) {
      throw new Error(
        `${label}: importa react-native-google-mobile-ads en la(s) línea(s) ${lineas.join(', ')} — solo lib/anuncios/consentimiento.ts y components/BannerAnuncio.tsx pueden hacerlo`,
      )
    }
    expect(lineas).toEqual([])
  })
})
