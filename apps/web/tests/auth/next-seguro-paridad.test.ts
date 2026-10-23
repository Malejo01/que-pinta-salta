// Tarea 48-q (qa): compara `rutaSiguienteSegura` (packages/core/src/auth/cuenta.ts)
// contra el saneo de `next` que hace apps/web/app/auth/callback/route.ts:9-13
// (leído el 2026-10-19 para escribir este archivo — las líneas exactas de
// hoy son:
//
//   9    const rawNext = searchParams.get('next') ?? '/'
//   10   const next =
//   11     rawNext.startsWith('/') && !rawNext.startsWith('//') && !rawNext.startsWith('/\\')
//   12       ? rawNext
//   13       : '/'
//
// Esta ronda NO toca ese archivo (ver el docstring de `rutaSiguienteSegura`),
// así que acá se REIMPLEMENTA esa lógica a mano, sin importarla (no se puede
// invocar el GET de un route handler de Next sin un Request real, y mockear
// eso para solo tres líneas de lógica pura sería más código que esto). Si
// alguien cambia esas líneas, esta función queda desactualizada A PROPÓSITO,
// para que el día que alguien lo note, lo note por este comentario.
//
// CLAVE DEL ENCARGO: core es MÁS ESTRICTA que el callback (rechaza cualquier
// `\`, caracteres de control y más de 512 caracteres; el callback solo
// rechaza no empezar con `/`, empezar con `//` o empezar con `/\`). No son
// equivalentes y NO TIENEN QUE SERLO. Lo que este archivo fija es la
// relación verdadera:
//   1. todo lo que core acepta, el callback también lo acepta (core ⊆ callback).
//   2. los casos concretos en los que el callback acepta algo que core
//      rechaza quedan листados uno por uno (la "carga útil" del archivo).
//   3. ninguno de los dos deja escapar un destino fuera del sitio.
//   4. el login y /auth/confirm usan rutaSiguienteSegura siempre.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { rutaSiguienteSegura } from '@qps/core/auth/cuenta'

const ROOT_WEB = join(__dirname, '..', '..')

/** Reimplementación EXACTA de apps/web/app/auth/callback/route.ts:9-13. */
function sanearComoElCallback(rawNextParam: string | null): string {
  const rawNext = rawNextParam ?? '/'
  return rawNext.startsWith('/') && !rawNext.startsWith('//') && !rawNext.startsWith('/\\') ? rawNext : '/'
}

const PORDEFECTO = '/'

interface Fila {
  entrada: string
  nota: string
  coreAcepta: boolean
  callbackAcepta: boolean
}

// Tabla de >= 15 casos. "Acepta" = devuelve la entrada tal cual (no el
// default). Para cada fila se verifica el resultado real de las dos
// funciones; el campo coreAcepta/callbackAcepta documenta lo que SE ESPERA,
// no se infiere del resultado (para que una fila mal pensada se note como
// fallo, no como "ambigüedad").
const TABLA: Fila[] = [
  { entrada: '/', nota: 'raíz', coreAcepta: true, callbackAcepta: true },
  { entrada: '/perfil', nota: 'ruta simple', coreAcepta: true, callbackAcepta: true },
  { entrada: '/eventos/123', nota: 'ruta con segmento', coreAcepta: true, callbackAcepta: true },
  { entrada: '/a/b/c?x=1#y', nota: 'con query y hash', coreAcepta: true, callbackAcepta: true },
  { entrada: '/' + 'a'.repeat(511), nota: 'largo exacto 512 (límite de core, debe ACEPTAR)', coreAcepta: true, callbackAcepta: true },
  { entrada: '', nota: 'vacío: no empieza con /', coreAcepta: false, callbackAcepta: false },
  { entrada: '//evil.com', nota: 'open redirect clásico', coreAcepta: false, callbackAcepta: false },
  { entrada: '/\\evil.com', nota: 'empieza con /\\', coreAcepta: false, callbackAcepta: false },
  { entrada: 'https://evil.com', nota: 'esquema absoluto', coreAcepta: false, callbackAcepta: false },
  { entrada: 'HTTPS://evil.com', nota: 'esquema absoluto en mayúsculas', coreAcepta: false, callbackAcepta: false },
  { entrada: 'javascript:alert(1)', nota: 'esquema javascript:', coreAcepta: false, callbackAcepta: false },
  {
    entrada: '%2F%2Fevil.com',
    nota: 'forma percent-encoded de //evil.com — no empieza con "/" como TEXTO LITERAL (en la práctica, searchParams.get ya lo decodifica antes de llegar acá, y ahí sí lo agarra la regla de "no //")',
    coreAcepta: false,
    callbackAcepta: false,
  },
  { entrada: '\\\\evil.com', nota: 'dos backslashes: no empieza con /', coreAcepta: false, callbackAcepta: false },
  { entrada: '@evil.com', nota: 'forma userinfo-like: no empieza con /', coreAcepta: false, callbackAcepta: false },
  {
    entrada: '/%09/evil',
    nota: 'tab percent-encoded COMO TEXTO (no es un carácter de control real): sigue siendo una ruta relativa al propio sitio, los dos ACEPTAN',
    coreAcepta: true,
    callbackAcepta: true,
  },
  // --- Las diferencias reales (callback acepta, core rechaza) ---------------
  {
    entrada: '/a\\b',
    nota: 'DIFERENCIA: un \\ que no está al principio — el callback solo mira el PREFIJO (/\\), core prohíbe \\ en cualquier posición',
    coreAcepta: false,
    callbackAcepta: true,
  },
  {
    entrada: '/\t',
    nota: 'DIFERENCIA: un "/" seguido de un TAB real (carácter de control 0x09, no el texto "%09") — el callback no mira caracteres de control, core sí',
    coreAcepta: false,
    callbackAcepta: true,
  },
  {
    entrada: '/' + 'a'.repeat(512),
    nota: 'DIFERENCIA: largo 513 (uno más del límite de core) — el callback no tiene límite de largo, core sí',
    coreAcepta: false,
    callbackAcepta: true,
  },
]

describe('tabla de paridad (>= 15 casos)', () => {
  it('la tabla tiene al menos 15 filas', () => {
    expect(TABLA.length).toBeGreaterThanOrEqual(15)
  })

  for (const fila of TABLA) {
    it(`"${fila.entrada}" (${fila.nota})`, () => {
      const resultadoCore = rutaSiguienteSegura(fila.entrada)
      const resultadoCallback = sanearComoElCallback(fila.entrada)

      expect(resultadoCore, 'core: resultado esperado').toBe(fila.coreAcepta ? fila.entrada : PORDEFECTO)
      expect(resultadoCallback, 'callback: resultado esperado').toBe(fila.callbackAcepta ? fila.entrada : PORDEFECTO)

      // La relación verdadera: si core acepta, el callback TAMBIÉN tiene que
      // aceptar (core ⊆ callback). Si esto fallara, habría una ruta que el
      // login considera segura y el callback manda al default (o peor).
      if (fila.coreAcepta) {
        expect(fila.callbackAcepta, `core aceptó "${fila.entrada}" pero la fila dice que el callback no — core ⊆ callback roto`).toBe(true)
        expect(resultadoCallback).toBe(resultadoCore)
      }
    })
  }

  it('subset real, calculado sobre toda la tabla (no solo declarado por fila): todo lo que core acepta, el callback también lo acepta', () => {
    for (const fila of TABLA) {
      const resultadoCore = rutaSiguienteSegura(fila.entrada)
      const coreAceptoDeVerdad = resultadoCore === fila.entrada && fila.entrada !== PORDEFECTO
      if (!coreAceptoDeVerdad) continue
      const resultadoCallback = sanearComoElCallback(fila.entrada)
      expect(resultadoCallback, `"${fila.entrada}": core aceptó, el callback tiene que aceptar lo mismo`).toBe(fila.entrada)
    }
  })

  it('ninguna de las dos funciones deja escapar un destino fuera del sitio, para ningún caso de la tabla', () => {
    function escapaDelSitio(resultado: string): boolean {
      if (resultado.startsWith('//')) return true
      if (resultado.startsWith('\\')) return true
      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(resultado)) return true // esquema (http:, javascript:, etc.)
      return false
    }
    for (const fila of TABLA) {
      expect(escapaDelSitio(rutaSiguienteSegura(fila.entrada)), `core escapó con "${fila.entrada}"`).toBe(false)
      expect(escapaDelSitio(sanearComoElCallback(fila.entrada)), `callback escapó con "${fila.entrada}"`).toBe(false)
    }
  })
})

describe('las diferencias documentadas, una por una (la carga útil del encargo)', () => {
  it('"/a\\\\b": un backslash que no está al principio — callback acepta, core rechaza', () => {
    expect(sanearComoElCallback('/a\\b')).toBe('/a\\b')
    expect(rutaSiguienteSegura('/a\\b')).toBe('/')
  })

  it('un "/" seguido de un tab real (0x09): callback acepta, core rechaza (carácter de control)', () => {
    expect(sanearComoElCallback('/\t')).toBe('/\t')
    expect(rutaSiguienteSegura('/\t')).toBe('/')
  })

  it('un string de 513 caracteres: callback acepta, core rechaza (pasa el largo máximo)', () => {
    const largo = '/' + 'a'.repeat(512)
    expect(largo.length).toBe(513)
    expect(sanearComoElCallback(largo)).toBe(largo)
    expect(rutaSiguienteSegura(largo)).toBe('/')
  })
})

describe('cableado: el login y /auth/confirm usan rutaSiguienteSegura SIEMPRE, en todos sus caminos de redirect', () => {
  it('app/auth/login/page.tsx: importa rutaSiguienteSegura y la única variable que llega a router.push es la saneada (ya fijado en tests/auth/login-next.test.ts; se repite acá, liviano, para que viva junto a la comparación de arriba)', () => {
    const src = readFileSync(join(ROOT_WEB, 'app', 'auth', 'login', 'page.tsx'), 'utf8')
    expect(src).toMatch(/import\s*\{[^}]*rutaSiguienteSegura[^}]*\}\s*from\s*['"]@qps\/core\/auth\/cuenta['"]/)
    expect(src).toMatch(/const next = rutaSiguienteSegura\(/)
    expect(src).toMatch(/router\.push\(next\)/)
    // Nunca un router.push('/') fijo que esquive el saneo en el camino de éxito.
    expect(src).not.toMatch(/router\.push\(\s*['"]\/['"]\s*\)/)
  })

  it('app/auth/confirm/route.ts: importa rutaSiguienteSegura y TODOS sus redirects de éxito pasan por ella (no hay un NextResponse.redirect con `next` crudo)', () => {
    const src = readFileSync(join(ROOT_WEB, 'app', 'auth', 'confirm', 'route.ts'), 'utf8')
    expect(src).toMatch(/import\s*\{[^}]*rutaSiguienteSegura[^}]*\}\s*from\s*['"]@qps\/core\/auth\/cuenta['"]/)
    expect(src).toMatch(/rutaSiguienteSegura\(\s*next\s*,/)

    // Los dos únicos redirects de la ruta son el de error (fijo, sin `next`)
    // y el de éxito, que usa `destino` — el resultado de rutaSiguienteSegura
    // — nunca `next` crudo interpolado directo en un NextResponse.redirect.
    expect(src).not.toMatch(/NextResponse\.redirect\(`\$\{origin\}\$\{next\}`\)/)
    expect(src).toMatch(/NextResponse\.redirect\(`\$\{origin\}\$\{destino\}`\)/)
  })
})
