// 49-q (ronda 49): el cruce web ↔ app para los legales (QPS-237). Cada ruta
// de `RUTAS_SITIO_PERMITIDAS` (`lib/links.ts`) tiene que tener su página en
// la web (`apps/web/app<ruta>/page.tsx`), con una excepción: `/terminos`
// mientras `TERMINOS_PUBLICADOS` sea `false` (hoy, el #74 sigue sin
// mergear). Si el flag pasara a `true` sin que la página exista, eso tiene
// que poner `main` en rojo. Si la página entra (#74) antes de que el flag
// suba, eso NO tiene que poner nada en rojo: la excepción dice "no es
// obligatoria", no "prohibida".
//
// Ese cruce (flag=true + página ausente) no se puede ejercitar hoy leyendo
// la constante real (está en `false`), así que la función que decide
// (`haceFaltaPagina`) es pura y recibe el flag como parámetro: así se
// prueban los cuatro cruces (flag × existe la página) sin esperar al #74.
// Un test que solo leyera `TERMINOS_PUBLICADOS` sería tautológico hoy y no
// avisaría nada el día que el flag cambie.
//
// `RUTAS_SITIO_PERMITIDAS` no se exporta de `lib/links.ts` (no es un
// archivo permitido para esta tarea), así que se extrae leyendo el archivo
// como texto con una regex puntual sobre la línea del `const`. Límite: si
// esa línea cambia de forma (otro nombre, se vuelve multilínea, se agrega
// un identificador que no sea `RUTA_TERMINOS`), la extracción deja de
// funcionar y hay que ajustar este test. `urlSitio(ruta)` sería una
// alternativa que no depende de la forma del texto, pero solo dice "sí"
// o "null" por ruta: no sirve para enumerar la lista completa sin probar
// rutas al azar, así que se usa la extracción de texto para la enumeración
// y queda como posible mejora futura combinarla con `urlSitio` para
// validar cada entrada contra la función real.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { RUTA_TERMINOS, TERMINOS_PUBLICADOS } from '../lib/legales'

const TESTS_DIR = fileURLToPath(new URL('.', import.meta.url))
// apps/mobile/tests -> apps/mobile -> apps -> raíz del monorepo.
const RAIZ_MONOREPO = resolve(TESTS_DIR, '..', '..', '..')
const RAIZ_WEB_APP = join(RAIZ_MONOREPO, 'apps', 'web', 'app')
const RUTA_LINKS = join(TESTS_DIR, '..', 'lib', 'links.ts')

describe('raíz del monorepo (sanity previa, obligatoria): apps/web/app existe y es un directorio', () => {
  it('si esto falla, un camino mal armado haría pasar los tests de abajo por el motivo equivocado ("no existe ninguna página")', () => {
    expect(existsSync(RAIZ_WEB_APP)).toBe(true)
    expect(statSync(RAIZ_WEB_APP).isDirectory()).toBe(true)
  })
})

/**
 * Extrae `RUTAS_SITIO_PERMITIDAS` de `lib/links.ts` leyendo el archivo como
 * texto (no se exporta, y ese archivo no es de esta tarea). Resuelve el
 * único identificador no-literal que usa hoy la lista (`RUTA_TERMINOS`)
 * contra la constante real importada de `lib/legales.ts`. Ver el límite en
 * el comentario de cabecera.
 */
function extraerRutasSitioPermitidas(fuenteLinks: string): string[] {
  const m = /const RUTAS_SITIO_PERMITIDAS = \[([^\]]*)\]/.exec(fuenteLinks)
  if (!m) {
    throw new Error('no se encontró "const RUTAS_SITIO_PERMITIDAS = [...]" en lib/links.ts')
  }
  const items = m[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return items.map((item) => {
    const literal = /^['"]([^'"]*)['"]$/.exec(item)
    if (literal) return literal[1]
    if (item === 'RUTA_TERMINOS') return RUTA_TERMINOS
    throw new Error(
      `RUTAS_SITIO_PERMITIDAS: no sé resolver el identificador "${item}" (extender extraerRutasSitioPermitidas)`
    )
  })
}

const FUENTE_LINKS = readFileSync(RUTA_LINKS, 'utf8')
const RUTAS_SITIO_PERMITIDAS = extraerRutasSitioPermitidas(FUENTE_LINKS)

/** La ruta esperada de la página de la web para una ruta del sitio, por
 * ejemplo `/auth/recuperar` -> `apps/web/app/auth/recuperar/page.tsx`. */
function paginaWebDe(ruta: string): string {
  const segmentos = ruta.split('/').filter(Boolean)
  return join(RAIZ_WEB_APP, ...segmentos, 'page.tsx')
}

/**
 * `true` si, dado el flag, hace falta que exista la página web de `ruta`.
 * Pura: el flag es un parámetro, no `TERMINOS_PUBLICADOS` leído directo —
 * así se puede probar con el flag invertido en memoria.
 *
 * Única excepción: `/terminos` no la necesita mientras `terminosPublicados`
 * sea `false`. Para cualquier otra ruta (y para `/terminos` con el flag en
 * `true`), siempre hace falta.
 */
function haceFaltaPagina(ruta: string, terminosPublicados: boolean): boolean {
  if (ruta === RUTA_TERMINOS && !terminosPublicados) return false
  return true
}

/**
 * El cruce completo: si la página no hace falta, cumple siempre (exista o
 * no: la excepción es "no es obligatoria", nunca "prohibida" — por eso
 * `/terminos` con el flag en `false` y la página ya presente también
 * cumple). Si hace falta, cumple solo si `paginaExiste`.
 */
function cumpleRutaLegal(ruta: string, terminosPublicados: boolean, paginaExiste: boolean): boolean {
  if (!haceFaltaPagina(ruta, terminosPublicados)) return true
  return paginaExiste
}

describe('cumpleRutaLegal: los cuatro cruces de /terminos (flag × existe la página), con el flag y la existencia en memoria', () => {
  it('flag=false, página ausente: cumple (la excepción de hoy)', () => {
    expect(cumpleRutaLegal(RUTA_TERMINOS, false, false)).toBe(true)
  })

  it('flag=false, página presente: también cumple — "no obligatoria" no es "prohibida", el #74 puede entrar antes de que suba el flag sin romper nada', () => {
    expect(cumpleRutaLegal(RUTA_TERMINOS, false, true)).toBe(true)
  })

  it('flag=true, página presente: cumple', () => {
    expect(cumpleRutaLegal(RUTA_TERMINOS, true, true)).toBe(true)
  })

  it('flag=true, página ausente: NO cumple — el cruce que tiene que fallar si el flag sube antes que la página', () => {
    expect(cumpleRutaLegal(RUTA_TERMINOS, true, false)).toBe(false)
  })
})

// Antes del #74 este bloque fijaba lo contrario: que /terminos NO existía y
// que, con el flag invertido a true, el cruce no cumplía (el centinela para no
// subir el flag antes que la página). Con el #74 la página existe; el flag
// sigue en false hasta que el #74 esté en producción (lib/legales.ts), y con
// false una página presente cumple igual (la excepción es "no obligatoria").
describe('con el #74: la página de /terminos existe en el fs real, así que el flag ya se puede subir', () => {
  it('la página de /terminos existe en el fs real', () => {
    expect(existsSync(paginaWebDe(RUTA_TERMINOS))).toBe(true)
  })

  it('con terminosPublicados=true (invertido, no se toca lib/legales.ts) y la existencia real: cumple', () => {
    const paginaExisteDeVerdad = existsSync(paginaWebDe(RUTA_TERMINOS))
    expect(cumpleRutaLegal(RUTA_TERMINOS, true, paginaExisteDeVerdad)).toBe(true)
  })
})

describe('RUTAS_SITIO_PERMITIDAS extraídas de lib/links.ts', () => {
  it('hoy son exactamente estas tres (si cambia, hay que revisar la extracción además de este número)', () => {
    expect(RUTAS_SITIO_PERMITIDAS).toEqual(['/auth/recuperar', '/privacidad', '/terminos'])
  })
})

describe('con el flag real (TERMINOS_PUBLICADOS de lib/legales.ts): cada ruta permitida cumple contra la web real', () => {
  it('TERMINOS_PUBLICADOS sigue en false (si esto cambió, el cruce de arriba con el flag real ya debería ejercitarse solo)', () => {
    expect(TERMINOS_PUBLICADOS).toBe(false)
  })

  for (const ruta of RUTAS_SITIO_PERMITIDAS) {
    it(`${ruta}: cumple (con flag real=${TERMINOS_PUBLICADOS})`, () => {
      const paginaExiste = existsSync(paginaWebDe(ruta))
      expect(cumpleRutaLegal(ruta, TERMINOS_PUBLICADOS, paginaExiste)).toBe(true)
    })
  }

  it('/privacidad y /auth/recuperar tienen página real, independiente del flag (no es el cruce exceptuado)', () => {
    expect(existsSync(paginaWebDe('/privacidad'))).toBe(true)
    expect(existsSync(paginaWebDe('/auth/recuperar'))).toBe(true)
  })
})
