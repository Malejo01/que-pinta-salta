/**
 * R60, 52-q (QA): "la app en producción" — AdMob nunca muestra el ID de
 * prueba a un usuario real, y nunca filtra el SDK ni sus ID a una pantalla.
 *
 * Cuatro cosas, cada una con sus propios fixtures en memoria:
 * 1. `idBloque` con entorno 'production' y SIN las variables de entorno
 *    reales: `null` para LOS DOS lugares ('inicio' y 'buscar'). El caso de
 *    un solo lugar ya está en `tests/anuncios-ids.test.ts` (52-c); acá se
 *    cubre el par completo porque el encargo lo pide explícitamente.
 * 2. Ningún archivo de `apps/mobile/app/` ni de `apps/mobile/components/`
 *    contiene el ID de prueba de AdMob escrito a mano
 *    (`ca-app-pub-3940256099942544`). OJO, a propósito: `apps/mobile/
 *    app.config.ts` SÍ lo tiene (`ADMOB_ANDROID_APP_ID_PRUEBA`/
 *    `ADMOB_IOS_APP_ID_PRUEBA`, los ID de prueba oficiales de Google para el
 *    App ID del SDK) y ESO ESTÁ BIEN: ese archivo no es `app/` ni
 *    `components/`, es la config de Expo en la raíz de `apps/mobile/`. NO
 *    toques el barrido de abajo para "incluirlo": sería arreglar el
 *    detector rompiendo lo que tiene que seguir en verde.
 * 3. `TestIds` (el export del SDK) no aparece en ningún archivo de `app/` ni
 *    de `components/`, salvo `components/BannerAnuncio.tsx` (el único lugar
 *    permitido). Más amplio que el de `tests/anuncios-sin-sdk.test.ts`
 *    (52-q, el otro archivo de esta tarea), que solo mira `app/`.
 * 4. Sin conexión, el banner de Inicio no se monta: por la DECISIÓN, no por
 *    el render — no hay `@testing-library/react-native` en el repo (mismo
 *    motivo que `tests/portada.test.ts`/`tests/buscar.test.ts`: `app/(tabs)/
 *    index.tsx` y `components/BannerAnuncio.tsx` importan React Native y no
 *    se pueden montar en Vitest). Se verifica con lectura estática: que
 *    Inicio pasa `sinConexion={estado.desdeCache !== null}` (no cualquier
 *    otra cosa que "daría lo mismo" a simple vista) y que el componente
 *    corta a `null` cuando `sinConexion` es `true`.
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { idBloque } from '../lib/anuncios/ids'
import type { Env } from '../lib/env'

const MOBILE_ROOT = fileURLToPath(new URL('../', import.meta.url))

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

// ---------------------------------------------------------------------------
// 1. idBloque en production, sin variables: null para los DOS lugares.
// ---------------------------------------------------------------------------
describe('idBloque: entorno production, sin variables reales — null para los dos lugares', () => {
  const ID_PRUEBA = 'ca-app-pub-3940256099942544/6300978111'

  it.each(['inicio', 'buscar'] as const)('lugar "%s": null', (lugar) => {
    const resultado = idBloque(lugar, {
      entorno: 'production',
      plataforma: 'android',
      env: envDe({}),
      idPrueba: ID_PRUEBA,
    })
    expect(resultado).toBeNull()
  })

  it('los dos a la vez, en la misma llamada de verificación: ninguno devuelve el ID de prueba', () => {
    const env = envDe({})
    const resultados = (['inicio', 'buscar'] as const).map((lugar) =>
      idBloque(lugar, { entorno: 'production', plataforma: 'android', env, idPrueba: ID_PRUEBA }),
    )
    expect(resultados).toEqual([null, null])
    expect(resultados).not.toContain(ID_PRUEBA)
  })
})

// ---------------------------------------------------------------------------
// Utilidades de barrido, compartidas por los puntos 2 y 3.
// ---------------------------------------------------------------------------
const DIRS_EXCLUIDOS = new Set(['node_modules', '.expo', '.turbo', 'dist'])

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
const RUTA_APP_CONFIG = path.join(MOBILE_ROOT, 'app.config.ts')

// ---------------------------------------------------------------------------
// 2. El ID de prueba escrito a mano, fuera de app.config.ts.
// ---------------------------------------------------------------------------
const ID_PRUEBA_LITERAL = 'ca-app-pub-3940256099942544'

describe('ningún archivo de apps/mobile/app/ ni de apps/mobile/components/ contiene el ID de prueba de AdMob escrito a mano', () => {
  it('sanity: encuentra archivos para analizar en las dos carpetas', () => {
    expect(ARCHIVOS_APP.length).toBeGreaterThan(0)
    expect(ARCHIVOS_COMPONENTS.length).toBeGreaterThan(0)
  })

  it('fixture: el propio literal SÍ se detecta con .includes (el detector puede ponerse en rojo)', () => {
    const contenidoMalo = `export const ID = '${ID_PRUEBA_LITERAL}~1234567890'`
    expect(contenidoMalo.includes(ID_PRUEBA_LITERAL)).toBe(true)
  })

  it.each([...ARCHIVOS_APP, ...ARCHIVOS_COMPONENTS].map((abs) => [relMobile(abs), abs] as const))(
    '%s no contiene el ID de prueba',
    (_rel, abs) => {
      expect(readFileSync(abs, 'utf8'), relMobile(abs)).not.toContain(ID_PRUEBA_LITERAL)
    },
  )

  // Comentario para el próximo que quiera "arreglar" este detector: NO.
  // apps/mobile/app.config.ts (ADMOB_ANDROID_APP_ID_PRUEBA/
  // ADMOB_IOS_APP_ID_PRUEBA, de chore/deps-etapa-2) SÍ tiene este literal, y
  // está bien que lo tenga — son los ID de prueba oficiales de Google para
  // el App ID del SDK, documentados ahí mismo. Esa ruta NO es
  // apps/mobile/app/ ni apps/mobile/components/ (es la config de Expo en la
  // raíz de apps/mobile/), así que no entra en ARCHIVOS_APP ni en
  // ARCHIVOS_COMPONENTS. Sumarla acá "para que el barrido sea más completo"
  // rompería la única excepción legítima que tiene que seguir en pie.
  it('sanity de la excepción: app.config.ts SÍ tiene el literal (fuera de este barrido, a propósito)', () => {
    const contenido = readFileSync(RUTA_APP_CONFIG, 'utf8')
    expect(contenido).toContain(ID_PRUEBA_LITERAL)
  })
})

// ---------------------------------------------------------------------------
// 3. TestIds fuera de components/BannerAnuncio.tsx, en TODO app/ + components/.
// ---------------------------------------------------------------------------
describe('TestIds no aparece fuera de components/BannerAnuncio.tsx, en app/** y components/**', () => {
  const RUTA_PERMITIDA = 'components/BannerAnuncio.tsx'
  const archivosAAnalizar = [...ARCHIVOS_APP, ...ARCHIVOS_COMPONENTS].filter(
    (abs) => relMobile(abs) !== RUTA_PERMITIDA,
  )

  it('sanity: encuentra archivos para analizar (y excluye exactamente uno, el permitido)', () => {
    expect(archivosAAnalizar.length).toBeGreaterThan(0)
    expect(archivosAAnalizar.length).toBe(ARCHIVOS_APP.length + ARCHIVOS_COMPONENTS.length - 1)
  })

  it('sanity: el archivo permitido SÍ contiene TestIds (si no, la exclusión no estaría probando nada)', () => {
    const contenido = readFileSync(path.join(MOBILE_ROOT, ...RUTA_PERMITIDA.split('/')), 'utf8')
    expect(contenido).toContain('TestIds')
  })

  it('fixture: el propio literal SÍ se detecta con .includes', () => {
    const contenidoMalo = `import { TestIds } from 'react-native-google-mobile-ads'`
    expect(contenidoMalo.includes('TestIds')).toBe(true)
  })

  it.each(archivosAAnalizar.map((abs) => [relMobile(abs), abs] as const))('%s no contiene TestIds', (_rel, abs) => {
    expect(readFileSync(abs, 'utf8'), relMobile(abs)).not.toContain('TestIds')
  })
})

// ---------------------------------------------------------------------------
// 4. Sin conexión, el banner de Inicio no se monta — por la decisión, lectura
//    estática (sin @testing-library/react-native en el repo).
// ---------------------------------------------------------------------------
const RUTA_INDEX = fileURLToPath(new URL('../app/(tabs)/index.tsx', import.meta.url))
const SRC_INDEX = readFileSync(RUTA_INDEX, 'utf8')
const RUTA_BANNER = fileURLToPath(new URL('../components/BannerAnuncio.tsx', import.meta.url))
const SRC_BANNER = readFileSync(RUTA_BANNER, 'utf8')

/**
 * El contenido de `sinConexion={...}` del `<BannerAnuncio lugar="inicio" ...>`
 * de `app/(tabs)/index.tsx`, o `null` si no se encuentra esa combinación
 * exacta (lugar="inicio" Y una prop sinConexion, en cualquier orden entre
 * sí). Puro, con fixtures abajo que demuestran que distingue el caso sano de
 * variantes parecidas pero incorrectas (sin la comparación, con un valor
 * fijo, sin la prop).
 */
function sinConexionDeBannerInicio(content: string): string | null {
  const tags = content.match(/<BannerAnuncio\b[^>]*\/>/g) ?? []
  for (const tag of tags) {
    if (!/\blugar="inicio"/.test(tag)) continue
    const m = tag.match(/sinConexion=\{([^}]*)\}/)
    return m ? m[1].trim() : null
  }
  return null
}

describe('sinConexionDeBannerInicio (fixtures en memoria: tiene que distinguir el caso sano de variantes rotas)', () => {
  it('el caso sano: sinConexion={estado.desdeCache !== null}', () => {
    const content = '<BannerAnuncio key="anuncio" lugar="inicio" sinConexion={estado.desdeCache !== null} />'
    expect(sinConexionDeBannerInicio(content)).toBe('estado.desdeCache !== null')
  })

  it('el orden de las props no importa (lugar después de sinConexion)', () => {
    const content = '<BannerAnuncio sinConexion={estado.desdeCache !== null} lugar="inicio" />'
    expect(sinConexionDeBannerInicio(content)).toBe('estado.desdeCache !== null')
  })

  it('variante rota: un valor fijo (siempre false) en vez de atarlo a desdeCache — se detecta como DISTINTO, no se confunde', () => {
    const content = '<BannerAnuncio lugar="inicio" sinConexion={false} />'
    expect(sinConexionDeBannerInicio(content)).toBe('false')
    expect(sinConexionDeBannerInicio(content)).not.toBe('estado.desdeCache !== null')
  })

  it('sin la prop sinConexion: null (no inventa un match)', () => {
    const content = '<BannerAnuncio lugar="inicio" />'
    expect(sinConexionDeBannerInicio(content)).toBeNull()
  })

  it('lugar="buscar" (otro BannerAnuncio, no el de Inicio): no lo confunde con el de inicio', () => {
    const content = '<BannerAnuncio lugar="buscar" sinConexion={estado.desdeCache !== null} />'
    expect(sinConexionDeBannerInicio(content)).toBeNull()
  })
})

describe('app/(tabs)/index.tsx: le pasa a BannerAnuncio sinConexion atado a estado.desdeCache', () => {
  it('lectura estática: sinConexion={estado.desdeCache !== null}, no otra cosa', () => {
    expect(sinConexionDeBannerInicio(SRC_INDEX)).toBe('estado.desdeCache !== null')
  })
})

describe('components/BannerAnuncio.tsx: con sinConexion, corta a null (lectura estática, sin montar el componente)', () => {
  // No se puede montar BannerAnuncio con el SDK mockeado sin pisar
  // components/BannerAnuncio.tsx ni los mocks/fixtures de 52-c
  // (tests/anuncios-ids.test.ts, tests/anuncios-consentimiento.test.ts), y no
  // hay @testing-library/react-native en este repo (mismo límite documentado
  // en tests/portada.test.ts y tests/buscar.test.ts). Esta aserción verifica
  // EXACTAMENTE lo que dice: que el código fuente tiene la guarda
  // `if (sinConexion) return null` antes del JSX del banner — no que el
  // componente, al renderizarse, de verdad devuelva null.
  it('el código tiene la guarda "if (sinConexion) return null"', () => {
    expect(SRC_BANNER).toMatch(/if\s*\(sinConexion\)\s*return null/)
  })

  it('la guarda está antes del JSX del banner (<View ... <BannerAd), no después (si no, no cortaría nada)', () => {
    const idxGuarda = SRC_BANNER.search(/if\s*\(sinConexion\)\s*return null/)
    const idxJsx = SRC_BANNER.indexOf('<BannerAd')
    expect(idxGuarda).toBeGreaterThan(-1)
    expect(idxJsx).toBeGreaterThan(-1)
    expect(idxGuarda).toBeLessThan(idxJsx)
  })

  // Fixture: demuestra que esta aserción puede ponerse en rojo (si alguien
  // moviera la guarda después del JSX, o la borrara).
  it('fixture: una variante sin la guarda, o con la guarda después del JSX, no pasaría la aserción de arriba', () => {
    const sinGuarda = 'function f() { return <BannerAd /> }'
    expect(sinGuarda).not.toMatch(/if\s*\(sinConexion\)\s*return null/)

    const guardaDespues = 'function f() { return <BannerAd />; if (sinConexion) return null; }'
    const idxGuarda = guardaDespues.search(/if\s*\(sinConexion\)\s*return null/)
    const idxJsx = guardaDespues.indexOf('<BannerAd')
    expect(idxGuarda).toBeGreaterThan(idxJsx)
  })
})
