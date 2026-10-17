// Ronda 41, tarea 41-d: `lib/push/tap.ts` (puro) y un detector de solo
// lectura sobre `components/ManejadorTapPush.tsx`, mismo estilo que
// `tests/aperturas-url.test.ts` y `tests/cines-navegacion.test.ts` (fixtures
// en memoria primero, para probar que el detector falla de verdad; después
// se aplica al archivo real).
//
// El formato de `data.url` que manda el backend (R39) sale de
// `urlEvento(id, 'app')` de `@qps/core/metricas/links` — no se escribe a
// mano para no divergir del valor real que arma `armarTanda`.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { urlEvento } from '@qps/core/metricas/links'
import { claveRespuesta, eventoIdDesdeDatosPush, type RespuestaPushMinima } from '../lib/push/tap'

const UUID = '0b9d4f5a-6a2b-4c1e-8f3d-9a7b6c5d4e3f'
const UUID_MAYUSCULAS = UUID.toUpperCase()

function respuesta(identifier: string): RespuestaPushMinima {
  return { notification: { request: { identifier } } }
}

// ---------------------------------------------------------------------------
// eventoIdDesdeDatosPush
// ---------------------------------------------------------------------------
describe('eventoIdDesdeDatosPush', () => {
  it('con { url: urlEvento(id, "app") } (el formato exacto que manda la R39), da el id', () => {
    const url = urlEvento(UUID, 'app')
    expect(url).not.toBeNull()
    expect(eventoIdDesdeDatosPush({ url })).toBe(UUID)
  })

  it('con { eventId: "<UUID EN MAYÚSCULAS>" } (la prueba a mano de ops/push-firebase-pasos.md), da el id en minúsculas', () => {
    expect(eventoIdDesdeDatosPush({ eventId: UUID_MAYUSCULAS })).toBe(UUID)
  })

  it('{ url: "https://evil.example/evento/<uuid>" }: null (otro host)', () => {
    expect(eventoIdDesdeDatosPush({ url: `https://evil.example/evento/${UUID}` })).toBeNull()
  })

  it('{ url: "http://www.quepintasalta.com.ar/evento/<uuid>" }: null (http, sin "s")', () => {
    expect(eventoIdDesdeDatosPush({ url: `http://www.quepintasalta.com.ar/evento/${UUID}` })).toBeNull()
  })

  it('{ url: "javascript:alert(1)" }: null', () => {
    expect(eventoIdDesdeDatosPush({ url: 'javascript:alert(1)' })).toBeNull()
  })

  it('{ eventId: "../../admin" }: null (no es uuid)', () => {
    expect(eventoIdDesdeDatosPush({ eventId: '../../admin' })).toBeNull()
  })

  it('{ eventId: 123 }: null (no es un string)', () => {
    expect(eventoIdDesdeDatosPush({ eventId: 123 })).toBeNull()
  })

  it('null: null', () => {
    expect(eventoIdDesdeDatosPush(null)).toBeNull()
  })

  it('un string suelto: null', () => {
    expect(eventoIdDesdeDatosPush('no soy un objeto')).toBeNull()
  })

  it('un número: null', () => {
    expect(eventoIdDesdeDatosPush(42)).toBeNull()
  })

  it('un array: null (typeof [] === "object" no alcanza, hace falta Array.isArray)', () => {
    expect(eventoIdDesdeDatosPush([{ url: urlEvento(UUID, 'app') }])).toBeNull()
    expect(eventoIdDesdeDatosPush([])).toBeNull()
  })

  it('undefined: null', () => {
    expect(eventoIdDesdeDatosPush(undefined)).toBeNull()
  })

  it(
    'un url de más de 2048 caracteres: null, aunque matchee la regex si se la deja correr ' +
      '(el tope de largo va ANTES de aplicar la expresión regular, no después)',
    () => {
      // Sin el tope de largo, esto SÍ matchearía LINK_HTTPS_RE: el host, el
      // path y el uuid son válidos, y el query (`?...`) acepta cualquier
      // cantidad de caracteres no-espacio. El tope de largo es lo único que
      // puede evitar que esto devuelva el id.
      const urlLarguisima = `https://www.quepintasalta.com.ar/evento/${UUID}?o=app&relleno=${'a'.repeat(10000)}`
      expect(urlLarguisima.length).toBeGreaterThan(10000)
      expect(eventoIdDesdeDatosPush({ url: urlLarguisima })).toBeNull()
    }
  )

  it('si url y eventId están los dos, y url es válido, gana url', () => {
    const urlValido = urlEvento(UUID, 'app')
    const OTRO_UUID = '11111111-2222-3333-4444-555555555555'
    expect(eventoIdDesdeDatosPush({ url: urlValido, eventId: OTRO_UUID })).toBe(UUID)
  })

  it('si url es inválido y eventId es válido, gana eventId (un url inválido no corta la evaluación)', () => {
    expect(eventoIdDesdeDatosPush({ url: 'javascript:alert(1)', eventId: UUID_MAYUSCULAS })).toBe(UUID)
  })

  it('si los dos son inválidos, null', () => {
    expect(eventoIdDesdeDatosPush({ url: 'javascript:alert(1)', eventId: '123' })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// claveRespuesta
// ---------------------------------------------------------------------------
describe('claveRespuesta', () => {
  it('la misma respuesta (mismo identifier) da la misma clave', () => {
    const r1 = respuesta('notif-1')
    const r2 = respuesta('notif-1')
    expect(claveRespuesta(r1)).toBe(claveRespuesta(r2))
  })

  it('respuestas con distinto identifier dan distinta clave', () => {
    expect(claveRespuesta(respuesta('notif-1'))).not.toBe(claveRespuesta(respuesta('notif-2')))
  })
})

// ---------------------------------------------------------------------------
// Detector de solo lectura sobre components/ManejadorTapPush.tsx.
//
// Dos reglas, pensadas para que no las evada un cambio chico:
// 1. Nada llamado `openURL`, en ninguna forma de acceso: ni `Linking.openURL(`,
//    ni `Linking['openURL'](` (bracket, para evadir un regex que solo busca
//    el punto), ni un `openURL` suelto alcanzado por un import local
//    (`import { openURL } from 'react-native'`).
// 2. Todo `router.push(...)` (o `router['push'](...)`) tiene que llevar,
//    literalmente, el objeto `{ pathname: '/evento/[id]', ... }` — ya sea
//    inline o a través de una variable cuyo ÚNICO valor declarado (objeto
//    balanceado, con llaves anidadas) sea ese objeto. Ni un template string
//    (`router.push(\`/evento/${id}\`)`), ni una variable armada con un
//    string (`const ruta = '/evento/' + id`), ni un objeto con otro
//    `pathname`.
//
// Límite conocido (no cerrado por este detector, documentado para 41-q/seguridad):
// una variable reasignada más de una vez, o el `pathname` pasado como
// shorthand desde otra variable (`const pathname = '/evento/[id]'; ...
// router.push({ pathname, params: { id } })`), queda marcada como
// violación aunque sea segura en los hechos — el detector es deliberadamente
// conservador (prefiere un falso positivo a dejar pasar una evasión), y
// `ManejadorTapPush.tsx` no usa ninguna de esas dos formas.
export interface Violacion {
  line: number
  message: string
}

function lineAt(content: string, index: number): number {
  return content.slice(0, index).split('\n').length
}

/** El argumento de una llamada `fn(...)`, balanceando paréntesis, desde justo después del "(" de apertura. */
function leerArgumentoBalanceado(content: string, desdeIndex: number): string {
  let profundidad = 1
  let j = desdeIndex
  for (; j < content.length; j++) {
    if (content[j] === '(') profundidad++
    else if (content[j] === ')') {
      profundidad--
      if (profundidad === 0) break
    }
  }
  return content.slice(desdeIndex, j)
}

/** El objeto `{...}` balanceado (llaves anidadas incluidas) desde el índice de su "{" de apertura. */
function leerObjetoBalanceado(content: string, indiceLlaveApertura: number): string {
  let profundidad = 1
  let j = indiceLlaveApertura + 1
  for (; j < content.length; j++) {
    if (content[j] === '{') profundidad++
    else if (content[j] === '}') {
      profundidad--
      if (profundidad === 0) break
    }
  }
  return content.slice(indiceLlaveApertura, j + 1)
}

const PATHNAME_SEGURO_RE = /pathname\s*:\s*['"]\/evento\/\[id\]['"]/

/** `true` si `arg` (el texto completo del argumento de un `router.push(...)`) es, literalmente, `{ pathname: '/evento/[id]', ... }`. */
function esObjetoSeguro(arg: string): boolean {
  const t = arg.trim()
  if (!(t.startsWith('{') && t.endsWith('}'))) return false
  return PATHNAME_SEGURO_RE.test(t)
}

/** Variables (`const`/`let`) cuyo valor declarado es, literalmente, el objeto `{ pathname: '/evento/[id]', ... }`. */
function variablesConPathnameSeguro(content: string): Set<string> {
  const vars = new Set<string>()
  const re = /\b(?:const|let)\s+(\w+)\s*=\s*(\{)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content))) {
    const indiceLlave = m.index + m[0].length - 1
    const objeto = leerObjetoBalanceado(content, indiceLlave)
    if (PATHNAME_SEGURO_RE.test(objeto)) vars.add(m[1])
  }
  return vars
}

/**
 * Violaciones de `components/ManejadorTapPush.tsx` (o de cualquier fixture
 * con la misma forma): algo llamado `openURL` en cualquier forma de acceso,
 * o un `router.push`/`router['push']` cuyo argumento no sea, literal o
 * trazablemente, `{ pathname: '/evento/[id]', ... }`.
 */
export function encontrarEvasionesTapPush(content: string): Violacion[] {
  const violaciones: Violacion[] = []

  // `.openURL(`, `['openURL'](`/`["openURL"](`, o un `openURL(` suelto (sin
  // un "." ni un carácter de palabra justo antes — eso descarta que sea la
  // cola de otro identificador, pero sigue atrapando un `openURL` importado
  // directo de `react-native` y llamado sin receptor).
  const reOpenUrl = /(?:\.\s*openURL|\[\s*['"]openURL['"]\s*\]|(?<![.\w])openURL)\s*\(/g
  let m: RegExpExecArray | null
  while ((m = reOpenUrl.exec(content))) {
    violaciones.push({
      line: lineAt(content, m.index),
      message: 'openURL: nunca con algo que venga del push (la navegación es siempre router.push con el objeto tipado)',
    })
  }

  const variablesSeguras = variablesConPathnameSeguro(content)
  const reRouterPush = /\brouter\s*(?:\.\s*push|\[\s*['"]push['"]\s*\])\s*\(/g
  while ((m = reRouterPush.exec(content))) {
    const inicioArg = m.index + m[0].length
    const arg = leerArgumentoBalanceado(content, inicioArg).trim()
    const esIdentificadorSeguro = /^\w+$/.test(arg) && variablesSeguras.has(arg)
    if (!esObjetoSeguro(arg) && !esIdentificadorSeguro) {
      violaciones.push({
        line: lineAt(content, m.index),
        message: `router.push(${arg.slice(0, 80)}): el argumento no es { pathname: '/evento/[id]', ... }`,
      })
    }
  }

  return violaciones
}

describe('encontrarEvasionesTapPush (fixtures en memoria: tiene que fallar de verdad)', () => {
  it('acepta router.push({ pathname: "/evento/[id]", params: { id } }) inline', () => {
    const content = `router.push({ pathname: '/evento/[id]', params: { id } })`
    expect(encontrarEvasionesTapPush(content)).toEqual([])
  })

  it('acepta router.push(variable) cuando la variable es, literalmente, ese objeto', () => {
    const content = `const destino = { pathname: '/evento/[id]', params: { id } }\nrouter.push(destino)`
    expect(encontrarEvasionesTapPush(content)).toEqual([])
  })

  it('detecta Linking.openURL(...)', () => {
    const content = `Linking.openURL(url)`
    expect(encontrarEvasionesTapPush(content)).toHaveLength(1)
  })

  it('detecta Linking[\'openURL\'](...) (bracket, para evadir un regex solo con punto)', () => {
    const content = `Linking['openURL'](url)`
    expect(encontrarEvasionesTapPush(content)).toHaveLength(1)
  })

  it('detecta un openURL suelto, importado localmente de react-native', () => {
    const content = `import { openURL } from 'react-native'\nfunction f() { openURL(url) }`
    expect(encontrarEvasionesTapPush(content)).toHaveLength(1)
  })

  it('detecta router.push con un template string', () => {
    const content = 'router.push(`/evento/${id}`)'
    expect(encontrarEvasionesTapPush(content)).toHaveLength(1)
  })

  it('detecta router.push con una variable armada como string (no un objeto)', () => {
    const content = `const ruta = '/evento/' + id\nrouter.push(ruta)`
    expect(encontrarEvasionesTapPush(content)).toHaveLength(1)
  })

  it('detecta router.push con un objeto inline que tiene otro pathname', () => {
    const content = `router.push({ pathname: '/otra-ruta', params: { id } })`
    expect(encontrarEvasionesTapPush(content)).toHaveLength(1)
  })

  it('detecta router.push con una variable que es un objeto, pero con otro pathname', () => {
    const content = `const destino = { pathname: '/otra-ruta', params: { id } }\nrouter.push(destino)`
    expect(encontrarEvasionesTapPush(content)).toHaveLength(1)
  })

  it('detecta router["push"](...) (bracket)', () => {
    const content = `router['push']({ pathname: '/otra-ruta', params: { id } })`
    expect(encontrarEvasionesTapPush(content)).toHaveLength(1)
  })

  it('un archivo sin openURL ni router.push: sin violaciones', () => {
    expect(encontrarEvasionesTapPush('export function Foo() { return null }')).toEqual([])
  })

  it('reporta varias violaciones, cada una con su línea', () => {
    const content = `Linking.openURL(url)\nrouter.push(\`/evento/\${id}\`)\n`
    const v = encontrarEvasionesTapPush(content)
    expect(v.map((x) => x.line)).toEqual([1, 2])
  })
})

describe('components/ManejadorTapPush.tsx: sin evasiones conocidas', () => {
  const RUTA = fileURLToPath(new URL('../components/ManejadorTapPush.tsx', import.meta.url))
  const src = readFileSync(RUTA, 'utf8')

  it('no tiene ninguna violación', () => {
    const violaciones = encontrarEvasionesTapPush(src)
    if (violaciones.length > 0) {
      const detalle = violaciones.map((v) => `  :${v.line} — ${v.message}`).join('\n')
      throw new Error(`ManejadorTapPush.tsx tiene aperturas inseguras:\n${detalle}`)
    }
    expect(violaciones).toEqual([])
  })

  it('navega con router.push (al menos una vez: la función no se vació)', () => {
    expect(src).toMatch(/\brouter\.push\s*\(/)
  })

  it('usa setNotificationHandler a nivel de módulo (no dentro de ManejadorTapPush ni de un useEffect)', () => {
    const indiceHandler = src.indexOf('setNotificationHandler(')
    const indiceComponente = src.indexOf('export function ManejadorTapPush')
    expect(indiceHandler).toBeGreaterThan(-1)
    expect(indiceComponente).toBeGreaterThan(-1)
    expect(indiceHandler).toBeLessThan(indiceComponente)
  })

  it('el handler no muestra alerta con shouldShowAlert (deprecado): usa shouldShowBanner/shouldShowList', () => {
    expect(src).toMatch(/shouldShowBanner\s*:\s*true/)
    expect(src).toMatch(/shouldShowList\s*:\s*true/)
    expect(src).not.toMatch(/shouldShowAlert/)
  })

  it('sin sonido y sin badge', () => {
    expect(src).toMatch(/shouldPlaySound\s*:\s*false/)
    expect(src).toMatch(/shouldSetBadge\s*:\s*false/)
  })

  it('limpia la suscripción del listener (sub.remove()) al desmontar', () => {
    expect(src).toMatch(/\.remove\(\)/)
  })

  it('sin ningún console.* (el data del push no se loguea)', () => {
    expect(src).not.toMatch(/console\.(log|warn|error|info|debug)\s*\(/)
  })
})
