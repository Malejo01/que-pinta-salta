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
// A4 (nube Q1: "Ver en el mapa" en la ficha): el quinto origen válido es
// `urlMapaDelEvento` (`lib/links.ts`), que abre `/mapa` de la web con el
// lugar elegido y da `null` si el lugar no tendría pin (`tienePinEnElMapa`)
// o si su id no es un uuid. `urlMapaLugar` (la que solo valida el uuid y
// arma la query) NO entra en la lista a propósito: abrirla directo saltearía
// el chequeo de coordenadas (ver `tests/ver-en-el-mapa.test.ts`).
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
import { urlMapaDelEvento, urlSitio } from '../lib/links'

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

/** Variables (`const`/`let`) asignadas directamente desde `urlGo(...)`, `urlComoLlegar(...)`, `urlCompraCineSegura(...)`, `urlSitio(...)` o `urlMapaDelEvento(...)`. */
function variablesSeguras(content: string): Set<string> {
  const vars = new Set<string>()
  const re = /\b(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:urlGo|urlComoLlegar|urlCompraCineSegura|urlSitio|urlMapaDelEvento)\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content))) vars.add(m[1])
  return vars
}

/**
 * Violaciones de `openURL(...)` (incluye `Linking.openURL(...)`) cuyo
 * argumento no venga de `urlGo`, `urlComoLlegar`, `urlCompraCineSegura`,
 * `urlSitio` o `urlMapaDelEvento` (A4): ni una llamada directa (`openURL(urlGo(...))`) ni una
 * variable asignada desde esas funciones
 * (`const urlCompra = urlGo(...); openURL(urlCompra)`). Cualquier otra
 * forma — `openURL(evento.ticket_url)`, un `booking_url` crudo, una URL del
 * sitio escrita a mano (`openURL('https://www.quepintasalta.com.ar/...')`),
 * una variable que no se pueda rastrear a ninguno de los cinco, etc. — es
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
    const esLlamadaDirecta = /^(?:urlGo|urlComoLlegar|urlCompraCineSegura|urlSitio|urlMapaDelEvento)\s*\(/.test(arg)
    if (!esVariableSegura && !esLlamadaDirecta) {
      violaciones.push({
        line: lineAt(content, m.index),
        message: `openURL(${arg}): el argumento no viene de urlGo/urlComoLlegar/urlCompraCineSegura/urlSitio/urlMapaDelEvento`,
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

  it('acepta openURL(variable) cuando la variable viene de urlMapaDelEvento(...) (A4, "Ver en el mapa")', () => {
    const content = `const urlMapa = urlMapaDelEvento(evento)\nLinking.openURL(urlMapa).catch(() => {})`
    expect(encontrarAperturasInseguras(content)).toEqual([])
  })

  it('acepta la llamada directa openURL(urlMapaDelEvento(...))', () => {
    const content = `Linking.openURL(urlMapaDelEvento(evento)).catch(() => {})`
    expect(encontrarAperturasInseguras(content)).toEqual([])
  })

  it('A4: detecta openURL(urlMapaLugar(...)): saltea el chequeo de coordenadas, no está en la lista', () => {
    const content = `const urlMapa = urlMapaLugar(evento.venue.id)\nLinking.openURL(urlMapa).catch(() => {})`
    expect(encontrarAperturasInseguras(content)).toHaveLength(1)
    expect(encontrarAperturasInseguras(`Linking.openURL(urlMapaLugar(id))`)).toHaveLength(1)
  })

  it('A4: detecta /mapa?lugar= armado a mano, sin pasar por urlMapaDelEvento', () => {
    const content = 'Linking.openURL(`https://www.quepintasalta.com.ar/mapa?lugar=${evento.venue.id}`).catch(() => {})'
    const v = encontrarAperturasInseguras(content)
    expect(v).toHaveLength(1)
    expect(v[0].message).toMatch(/\/mapa\?lugar=/)
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

  // 49-a (QPS-237): los dos legales. /privacidad se abre igual que
  // /auth/recuperar; /terminos está en la lista cerrada y la guarda de
  // TERMINOS_PUBLICADOS (lib/legales.ts, hoy true) lo deja pasar — ver
  // tests/legales.test.ts, que prueba lib/legales.ts en detalle.
  it('/privacidad da la URL absoluta con SITIO', () => {
    expect(urlSitio('/privacidad')).toBe('https://www.quepintasalta.com.ar/privacidad')
  })

  it('/terminos: da la URL absoluta con el flag real en true', () => {
    expect(urlSitio('/terminos')).toBe('https://www.quepintasalta.com.ar/terminos')
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

// urlMapaDelEvento en sí (A4): igual que con urlSitio, el detector solo mira
// el nombre; la validación (lugar con pin + uuid) se prueba en runtime acá, y
// en detalle en `tests/ver-en-el-mapa.test.ts`.
describe('urlMapaDelEvento: solo abre /mapa con un lugar que tendría pin', () => {
  const venueId = '0b9d4f5a-6a2b-4c1e-8f3d-9a7b6c5d4e3f'

  // `ahora` fijo (correcciones de A4: el link depende de la vigencia y de la
  // ventana de días de `/mapa`).
  const ahora = new Date('2026-10-27T13:00:00Z') // 10:00 de Salta
  const startDate = '2026-11-08T00:00:00Z' // 7/11, 21:00 de Salta

  it('lugar con coordenadas en Salta: la URL absoluta de /mapa con SITIO', () => {
    expect(
      urlMapaDelEvento({ start_date: startDate, venue: { id: venueId, latitude: -24.78, longitude: -65.41 } }, ahora),
    ).toBe(`https://www.quepintasalta.com.ar/mapa?cuando=fecha&dia=2026-11-07&lugar=${venueId}`)
  })

  it('sin coordenadas o sin lugar: null', () => {
    expect(urlMapaDelEvento({ start_date: startDate, venue: { id: venueId, latitude: null, longitude: null } }, ahora)).toBeNull()
    expect(urlMapaDelEvento({ start_date: startDate, venue: null }, ahora)).toBeNull()
  })
})

describe('app/ y components/: todo openURL viene de urlGo/urlComoLlegar/urlCompraCineSegura/urlSitio/urlMapaDelEvento', () => {
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
      throw new Error(`openURL sin pasar por urlGo/urlComoLlegar/urlCompraCineSegura/urlSitio/urlMapaDelEvento:\n${detalle}`)
    }
    expect(violaciones).toEqual([])
  })
})
