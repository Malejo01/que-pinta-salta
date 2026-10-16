// 26-c, punto 3: "Comprar" y "Cómo llegar" solo abren URLs de core
// (`urlGo`/`urlComoLlegar` de `@qps/core/metricas/links`): nunca
// `Linking.openURL(evento.ticket_url)` ni ningún otro link armado a mano,
// porque ese link no cuenta el clic ni valida el destino (ver el comentario
// de `app/evento/[id].tsx`).
//
// R28 (28-g, F3): la ficha de película abre la URL de compra de entradas de
// un cine, que no tiene `id` de evento ni cuenta clic — no puede pasar por
// `urlGo`/`urlComoLlegar`. Para esa, y solo esa, el tercer origen válido es
// `urlCompraCineSegura` (`lib/datos/cines.ts`): una función pura que devuelve
// la URL solo si su esquema es `https`, y `null` en cualquier otro caso. La
// intención del detector sigue intacta: ninguna URL externa cruda se abre
// sin pasar por un helper validado, y este es el helper para cines.
//
// R29 (29-h, F6: "¿Olvidaste tu contraseña?" en la app): el cuarto y último
// origen válido es `urlSitio` (`lib/links.ts`), para abrir una ruta propia
// del sitio (hoy, `/auth/recuperar`) sin link armado a mano. A diferencia de
// `urlGo`/`urlComoLlegar`/`urlCompraCineSegura`, no valida un dato externo
// sino una ruta contra una lista cerrada — el mismo motivo por el que sigue
// sin alcanzar con llamarla "urlSitio": una ruta fuera de la lista, o una
// URL absoluta en vez de una ruta, también tiene que dar `null` (ver el
// describe de más abajo, "urlSitio").
//
// Primero el detector, probado con fixtures en memoria (mismo estilo que
// `encontrarViolacionesDeIconos` en `tests/iconos.test.ts`); después se
// aplica a los archivos reales de `app/` y `components/` con un `it.each`
// por archivo, para que el test siga valiendo cuando se agregue otro
// componente con `Linking.openURL`.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { urlSitio } from '../lib/links'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const APP_DIR = join(MOBILE_ROOT, 'app')
const COMPONENTS_DIR = join(MOBILE_ROOT, 'components')
const FICHA_RELATIVA = join('app', 'evento', '[id].tsx')

interface Violation {
  line: number
  message: string
}

function lineAt(content: string, index: number): number {
  return content.slice(0, index).split('\n').length
}

/** El argumento de una llamada `fn(...)`, balanceando paréntesis, a partir del índice justo después del "(" de apertura. */
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

/** Variables (`const`/`let`) asignadas directamente desde `urlGo(...)`, `urlComoLlegar(...)`, `urlCompraCineSegura(...)` o `urlSitio(...)`. */
function variablesSeguras(content: string): Set<string> {
  const vars = new Set<string>()
  const re = /\b(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:urlGo|urlComoLlegar|urlCompraCineSegura|urlSitio)\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content))) vars.add(m[1])
  return vars
}

/**
 * Violaciones de `openURL(...)` (incluye `Linking.openURL(...)`) cuyo
 * argumento no venga de `urlGo`, `urlComoLlegar`, `urlCompraCineSegura` o
 * `urlSitio`: ni una llamada directa (`openURL(urlGo(...))`) ni una
 * variable asignada desde esas funciones
 * (`const urlCompra = urlGo(...); openURL(urlCompra)`). Cualquier otra
 * forma — `openURL(evento.ticket_url)`, un `booking_url` crudo, una URL del
 * sitio escrita a mano (`openURL('https://www.quepintasalta.com.ar/...')`),
 * una variable que no se pueda rastrear a ninguno de los cuatro, etc. — es
 * una violación.
 */
export function encontrarAperturasInseguras(content: string): Violation[] {
  const seguras = variablesSeguras(content)
  const violaciones: Violation[] = []
  const re = /\bopenURL\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content))) {
    const inicioArg = m.index + m[0].length
    const arg = leerArgumentoBalanceado(content, inicioArg).trim()
    const esVariableSegura = /^\w+$/.test(arg) && seguras.has(arg)
    const esLlamadaDirecta = /^(?:urlGo|urlComoLlegar|urlCompraCineSegura|urlSitio)\s*\(/.test(arg)
    if (!esVariableSegura && !esLlamadaDirecta) {
      violaciones.push({
        line: lineAt(content, m.index),
        message: `openURL(${arg}): el argumento no viene de urlGo/urlComoLlegar/urlCompraCineSegura/urlSitio`,
      })
    }
  }
  return violaciones
}

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

describe('encontrarAperturasInseguras (fixtures en memoria: tiene que fallar de verdad)', () => {
  it('acepta openURL(variable) cuando la variable viene de urlGo(...)', () => {
    const content = `const urlCompra = urlGo(evento.id, 'app')\nLinking.openURL(urlCompra).catch(() => {})`
    expect(encontrarAperturasInseguras(content)).toEqual([])
  })

  it('acepta openURL(variable) cuando la variable viene de urlComoLlegar(...)', () => {
    const content = `const urlLlegar = urlComoLlegar({ address, venue })\nLinking.openURL(urlLlegar).catch(() => {})`
    expect(encontrarAperturasInseguras(content)).toEqual([])
  })

  it('acepta la llamada directa openURL(urlGo(...))', () => {
    const content = `Linking.openURL(urlGo(evento.id, 'app')).catch(() => {})`
    expect(encontrarAperturasInseguras(content)).toEqual([])
  })

  it('acepta la llamada directa openURL(urlComoLlegar(...))', () => {
    const content = `Linking.openURL(urlComoLlegar({ address: evento.venue?.address })).catch(() => {})`
    expect(encontrarAperturasInseguras(content)).toEqual([])
  })

  it('acepta openURL(variable) cuando la variable viene de urlCompraCineSegura(...) (la URL de compra de cines, R28)', () => {
    const content = `const urlCompra = urlCompraCineSegura(cine.urlCompra)\nLinking.openURL(urlCompra).catch(() => {})`
    expect(encontrarAperturasInseguras(content)).toEqual([])
  })

  it('acepta la llamada directa openURL(urlCompraCineSegura(...))', () => {
    const content = `Linking.openURL(urlCompraCineSegura(cine.urlCompra)).catch(() => {})`
    expect(encontrarAperturasInseguras(content)).toEqual([])
  })

  it('acepta openURL(variable) cuando la variable viene de urlSitio(...) (R29, "olvidaste tu contraseña")', () => {
    const content = `const urlRecuperar = urlSitio('/auth/recuperar')\nLinking.openURL(urlRecuperar).catch(() => {})`
    expect(encontrarAperturasInseguras(content)).toEqual([])
  })

  it('acepta la llamada directa openURL(urlSitio(...))', () => {
    const content = `Linking.openURL(urlSitio('/auth/recuperar')).catch(() => {})`
    expect(encontrarAperturasInseguras(content)).toEqual([])
  })

  it('detecta openURL(evento.ticket_url): el link crudo, sin contador ni validación', () => {
    const content = `function comprar() {\n  Linking.openURL(evento.ticket_url).catch(() => {})\n}`
    const v = encontrarAperturasInseguras(content)
    expect(v).toHaveLength(1)
    expect(v[0].line).toBe(2)
    expect(v[0].message).toMatch(/evento\.ticket_url/)
  })

  it('detecta openURL(url) cuando "url" viene de otra fuente, no de urlGo/urlComoLlegar', () => {
    const content = `const url = evento.ticket_url\nLinking.openURL(url).catch(() => {})`
    expect(encontrarAperturasInseguras(content)).toHaveLength(1)
  })

  it('no confunde una variable homónima que no viene de urlGo/urlComoLlegar', () => {
    // Mismo nombre que usa la ficha real, pero asignada mal: tiene que
    // seguir detectándose (no alcanza con el nombre, hace falta el origen).
    const content = `const urlCompra = evento.ticket_url\nLinking.openURL(urlCompra).catch(() => {})`
    expect(encontrarAperturasInseguras(content)).toHaveLength(1)
  })

  it('detecta openURL(cine.urlCompra): el booking_url crudo de un cine, sin pasar por urlCompraCineSegura', () => {
    const content = `function comprarEnCine() {\n  Linking.openURL(cine.urlCompra).catch(() => {})\n}`
    const v = encontrarAperturasInseguras(content)
    expect(v).toHaveLength(1)
    expect(v[0].line).toBe(2)
    expect(v[0].message).toMatch(/cine\.urlCompra/)
  })

  it('detecta una URL del sitio armada a mano, sin pasar por urlSitio', () => {
    const content = `Linking.openURL('https://www.quepintasalta.com.ar/auth/recuperar').catch(() => {})`
    const v = encontrarAperturasInseguras(content)
    expect(v).toHaveLength(1)
    expect(v[0].message).toMatch(/quepintasalta\.com\.ar\/auth\/recuperar/)
  })

  it('detecta varias violaciones, cada una con su línea', () => {
    const content = `Linking.openURL(a.b)\nLinking.openURL(evento.ticket_url)\n`
    const v = encontrarAperturasInseguras(content)
    expect(v.map((x) => x.line)).toEqual([1, 2])
  })

  it('un archivo sin ningún openURL: sin violaciones', () => {
    expect(encontrarAperturasInseguras('export function Foo() { return null }')).toEqual([])
  })
})

// urlSitio en sí (no el detector de arriba): valida contra la lista cerrada
// de rutas propias, no solo que "parezca" la llamada correcta. El detector
// solo mira el nombre de la función en el código fuente — la validación de
// la ruta la hace urlSitio en runtime, así que se prueba acá directo.
describe('urlSitio: solo abre rutas propias conocidas', () => {
  it('la ruta conocida (/auth/recuperar) da la URL absoluta con SITIO', () => {
    expect(urlSitio('/auth/recuperar')).toBe('https://www.quepintasalta.com.ar/auth/recuperar')
  })

  it('una ruta fuera de la lista: null', () => {
    expect(urlSitio('/auth/otra-cosa')).toBeNull()
    expect(urlSitio('/admin')).toBeNull()
  })

  it('una URL absoluta armada a mano en vez de una ruta relativa: null', () => {
    expect(urlSitio('https://www.quepintasalta.com.ar/auth/recuperar')).toBeNull()
  })

  it('otro host disfrazado de ruta: null', () => {
    expect(urlSitio('https://www.otro-sitio.com.ar/auth/recuperar')).toBeNull()
  })

  it('vacío: null', () => {
    expect(urlSitio('')).toBeNull()
  })
})

describe('app/ y components/: todo openURL viene de urlGo/urlComoLlegar/urlCompraCineSegura/urlSitio', () => {
  const archivos = [...listarTsxYTs(APP_DIR), ...listarTsxYTs(COMPONENTS_DIR)]

  it('encuentra al menos un archivo para analizar, incluida la ficha', () => {
    expect(archivos.length).toBeGreaterThan(0)
    expect(archivos.some((f) => relative(MOBILE_ROOT, f) === FICHA_RELATIVA)).toBe(true)
  })

  it.each(archivos.map((file) => [relative(MOBILE_ROOT, file), file] as const))('%s', (label, file) => {
    const content = readFileSync(file, 'utf8')
    const violaciones = encontrarAperturasInseguras(content)
    if (violaciones.length > 0) {
      const detalle = violaciones.map((v) => `  ${label}:${v.line} — ${v.message}`).join('\n')
      throw new Error(`openURL sin pasar por urlGo/urlComoLlegar:\n${detalle}`)
    }
    expect(violaciones).toEqual([])
  })
})
