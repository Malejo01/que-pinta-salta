// A4 (nube Q1): "Ver en el mapa" en la ficha (`app/evento/[id].tsx`). La app
// no tiene mapa: el botón abre `/mapa` de la web en el navegador con el lugar
// elegido (`?lugar=<uuid>`, más `cuando=fecha&dia=` como `VerEnElMapa` de la
// web). Tres partes, sin red ni React Native (Vitest, entorno `node`):
//   1. `urlMapaLugar` (lib/links.ts): uuid válido, mayúsculas → minúsculas,
//      basura e inyección en la query (`x&y=z`, `../`) dan `null`.
//   2. `tienePinEnElMapa`/`urlMapaDelEvento`: la decisión de mostrar el
//      botón, con la MISMA regla que la web (`aCoordenada` +
//      `coordenadasEnSalta`), contrastada contra `armarPinesDelMapa` de core.
//   3. Detectores sobre el código fuente: la ficha abre el mapa solo con
//      `urlMapaDelEvento` y solo dibuja el botón si hay link; y los App
//      Links de `app.config.ts` no agarran `/mapa` (si lo hicieran, el link
//      volvería a la app en vez de abrir el navegador).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { formatSaltaDayKey, saltaWallClockToDate } from '@qps/core/date-format'
import { armarPinesDelMapa, type EventoParaMapa } from '@qps/core/mapa/pines'
import config from '../app.config'
import { tienePinEnElMapa, urlMapaDelEvento, urlMapaLugar } from '../lib/links'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const FICHA_PATH = join(MOBILE_ROOT, 'app', 'evento', '[id].tsx')
const ICONO_PATH = join(MOBILE_ROOT, 'components', 'Icono.tsx')

const SITIO = 'https://www.quepintasalta.com.ar'
const UUID = '0b9d4f5a-6a2b-4c1e-8f3d-9a7b6c5d4e3f'
const UUID_MAYUSCULAS = UUID.toUpperCase()

// Plaza 9 de Julio (dentro de `ZONA_SALTA`), Buenos Aires y (0, 0) (fuera).
const SALTA = { latitude: -24.7883, longitude: -65.4106 }
const CABA = { latitude: -34.6037, longitude: -58.3816 }

/** Comentarios de línea y de bloque vaciados (mismo criterio que `tests/ficha.test.ts`). */
function quitarComentarios(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/.*$/gm, '$1')
}

// ---------------------------------------------------------------------------
// 1. urlMapaLugar
// ---------------------------------------------------------------------------
describe('urlMapaLugar: arma /mapa?lugar=<uuid> o null', () => {
  it('uuid válido: la URL absoluta con SITIO y ?lugar=', () => {
    expect(urlMapaLugar(UUID)).toBe(`${SITIO}/mapa?lugar=${UUID}`)
  })

  it('uuid en mayúsculas: va en minúsculas (la web compara pin.venueId === lugar tal cual)', () => {
    expect(urlMapaLugar(UUID_MAYUSCULAS)).toBe(`${SITIO}/mapa?lugar=${UUID}`)
  })

  it('con espacios alrededor: se recortan', () => {
    expect(urlMapaLugar(`  ${UUID}\n`)).toBe(`${SITIO}/mapa?lugar=${UUID}`)
  })

  it.each([
    ['vacío', ''],
    ['solo espacios', '   '],
    ['basura', 'no-es-un-uuid'],
    ['uuid sin un dígito', UUID.slice(0, -1)],
    ['uuid con un dígito de más', `${UUID}0`],
    ['uuid sin guiones', UUID.replace(/-/g, '')],
    ['inyección de parámetros', `${UUID}&cuando=finde`],
    ['inyección de parámetros (x&y=z)', 'x&y=z'],
    ['subida de directorio', '../admin'],
    ['uuid con ../ adelante', `../${UUID}`],
    ['uuid con barra y ruta', `${UUID}/../../admin`],
    ['uuid con #', `${UUID}#otra-cosa`],
    ['una URL entera', `https://otro-sitio.com/?lugar=${UUID}`],
    ['espacio en el medio', `${UUID.slice(0, 8)} ${UUID.slice(9)}`],
  ])('%s: null', (_caso, valor) => {
    expect(urlMapaLugar(valor)).toBeNull()
  })

  it('algo que no es string (dato roto de la base): null, sin tirar', () => {
    expect(urlMapaLugar(null as unknown as string)).toBeNull()
    expect(urlMapaLugar(undefined as unknown as string)).toBeNull()
    expect(urlMapaLugar(42 as unknown as string)).toBeNull()
  })

  it('con día AAAA-MM-DD: los mismos parámetros y el mismo orden que VerEnElMapa de la web', () => {
    expect(urlMapaLugar(UUID, '2026-11-07')).toBe(`${SITIO}/mapa?cuando=fecha&dia=2026-11-07&lugar=${UUID}`)
  })

  it.each([
    ['vacío', ''],
    ['null', null],
    ['otra forma de fecha', '07/11/2026'],
    ['con hora', '2026-11-07T20:00'],
    ['inyección en el día', '2026-11-07&lugar=otro'],
  ])('día %s: se ignora, queda solo ?lugar=', (_caso, dia) => {
    expect(urlMapaLugar(UUID, dia)).toBe(`${SITIO}/mapa?lugar=${UUID}`)
  })

  it('un día bien formado no salva un id inválido', () => {
    expect(urlMapaLugar('x&y=z', '2026-11-07')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 2. tienePinEnElMapa / urlMapaDelEvento
// ---------------------------------------------------------------------------
describe('tienePinEnElMapa: la regla de la web (aCoordenada + coordenadasEnSalta)', () => {
  it.each([
    ['números dentro de Salta', SALTA.latitude, SALTA.longitude, true],
    ['strings numéricos dentro de Salta (numeric de PostgREST)', '-24.7883', '-65.4106', true],
    ['strings con espacios', ' -24.7883 ', ' -65.4106 ', true],
    ['uno número y otro string', -24.7883, '-65.4106', true],
    ['null, null', null, null, false],
    ['undefined, undefined', undefined, undefined, false],
    ['solo latitud', SALTA.latitude, null, false],
    ['solo longitud', null, SALTA.longitude, false],
    ['NaN', Number.NaN, SALTA.longitude, false],
    ['Infinity', SALTA.latitude, Number.POSITIVE_INFINITY, false],
    ['string vacío (no es la coordenada 0)', '', '', false],
    ['string no numérico', 'abc', '-65.4106', false],
    ['(0, 0)', 0, 0, false],
    ['("0", "0")', '0', '0', false],
    ['Buenos Aires', CABA.latitude, CABA.longitude, false],
    ['latitud y longitud invertidas', SALTA.longitude, SALTA.latitude, false],
    ['un objeto', {}, SALTA.longitude, false],
  ])('%s → %s', (_caso, latitude, longitude, esperado) => {
    expect(tienePinEnElMapa({ latitude, longitude })).toBe(esperado)
  })

  it('venue null o undefined: false', () => {
    expect(tienePinEnElMapa(null)).toBe(false)
    expect(tienePinEnElMapa(undefined)).toBe(false)
  })

  // La decisión de la app tiene que coincidir con la de la web: para cada
  // par de coordenadas, `armarPinesDelMapa` (core, la que usa `/mapa`) arma
  // un pin si y solo si `tienePinEnElMapa` da `true`. Si alguien cambia la
  // regla de un lado y no del otro, esto falla.
  it.each([
    [SALTA.latitude, SALTA.longitude],
    ['-24.7883', '-65.4106'],
    [null, null],
    [Number.NaN, SALTA.longitude],
    ['', ''],
    [0, 0],
    [CABA.latitude, CABA.longitude],
    [-26.6, -68.7],
    [-26.61, -65.4],
  ])('coincide con armarPinesDelMapa de core (%s, %s)', (latitude, longitude) => {
    const dia = '2026-11-07'
    const ahora = saltaWallClockToDate(`${dia}T10:00:00`)
    const evento: EventoParaMapa = {
      id: 'e1',
      title: 'Peña de prueba',
      start_date: saltaWallClockToDate(`${dia}T21:00:00`).toISOString(),
      venue: { id: UUID, name: 'Lugar', address: 'Calle 1', latitude, longitude },
    }
    const { pines } = armarPinesDelMapa([evento], { tipo: 'fecha', dia }, ahora)
    expect(pines.some((pin) => pin.venueId === UUID)).toBe(tienePinEnElMapa(evento.venue))
  })
})

describe('urlMapaDelEvento: el link del botón de la ficha', () => {
  const inicio = saltaWallClockToDate('2026-11-07T21:00:00').toISOString()

  it('lugar con pin: /mapa con el día de Salta del evento y el lugar', () => {
    expect(urlMapaDelEvento({ start_date: inicio, venue: { id: UUID, ...SALTA } })).toBe(
      `${SITIO}/mapa?cuando=fecha&dia=2026-11-07&lugar=${UUID}`,
    )
  })

  it('coordenadas como string: igual', () => {
    expect(
      urlMapaDelEvento({ start_date: inicio, venue: { id: UUID, latitude: '-24.7883', longitude: '-65.4106' } }),
    ).toBe(`${SITIO}/mapa?cuando=fecha&dia=2026-11-07&lugar=${UUID}`)
  })

  it('el día es el de SALTA, no el día UTC crudo (23:30 de Salta ya es el día siguiente en UTC)', () => {
    const deNoche = saltaWallClockToDate('2026-11-07T23:30:00')
    expect(deNoche.toISOString().slice(0, 10)).toBe('2026-11-08')
    expect(formatSaltaDayKey(deNoche)).toBe('2026-11-07')
    expect(urlMapaDelEvento({ start_date: deNoche.toISOString(), venue: { id: UUID, ...SALTA } })).toBe(
      `${SITIO}/mapa?cuando=fecha&dia=2026-11-07&lugar=${UUID}`,
    )
  })

  it('inicio vacío o inválido: queda solo ?lugar= (sin tirar)', () => {
    expect(urlMapaDelEvento({ start_date: 'no-es-fecha', venue: { id: UUID, ...SALTA } })).toBe(
      `${SITIO}/mapa?lugar=${UUID}`,
    )
    expect(urlMapaDelEvento({ start_date: null, venue: { id: UUID, ...SALTA } })).toBe(`${SITIO}/mapa?lugar=${UUID}`)
  })

  it('id del lugar en mayúsculas: en minúsculas', () => {
    expect(urlMapaDelEvento({ start_date: inicio, venue: { id: UUID_MAYUSCULAS, ...SALTA } })).toBe(
      `${SITIO}/mapa?cuando=fecha&dia=2026-11-07&lugar=${UUID}`,
    )
  })

  it.each([
    ['venue null', { start_date: inicio, venue: null }],
    ['sin venue', { start_date: inicio }],
    ['sin coordenadas', { start_date: inicio, venue: { id: UUID, latitude: null, longitude: null } }],
    ['coordenadas NaN', { start_date: inicio, venue: { id: UUID, latitude: Number.NaN, longitude: Number.NaN } }],
    ['fuera de Salta', { start_date: inicio, venue: { id: UUID, ...CABA } }],
    ['(0, 0)', { start_date: inicio, venue: { id: UUID, latitude: 0, longitude: 0 } }],
    ['con pin pero id que no es uuid', { start_date: inicio, venue: { id: 'x&y=z', ...SALTA } }],
    ['con pin pero id con ../', { start_date: inicio, venue: { id: '../admin', ...SALTA } }],
  ])('%s: null (no hay botón)', (_caso, evento) => {
    expect(urlMapaDelEvento(evento)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 3. Detectores sobre el código fuente
// ---------------------------------------------------------------------------
describe('app/evento/[id].tsx: "Ver en el mapa" solo con urlMapaDelEvento y solo con link', () => {
  const crudo = readFileSync(FICHA_PATH, 'utf8')
  const content = quitarComentarios(crudo)

  it('arma el link con urlMapaDelEvento(evento), una sola vez', () => {
    expect(content.match(/\bconst\s+urlMapa\s*=\s*urlMapaDelEvento\(\s*evento\s*\)/g)).toHaveLength(1)
    expect(content.match(/\burlMapaDelEvento\s*\(/g)).toHaveLength(1)
  })

  it('no arma /mapa a mano, no usa urlMapaLugar directo ni mira las coordenadas por su cuenta', () => {
    expect(content).not.toMatch(/\/mapa/)
    expect(content).not.toMatch(/\burlMapaLugar\b/)
    expect(content).not.toMatch(/\blatitude\b|\blongitude\b/)
  })

  it('el handler abre solo urlMapa, con guarda y .catch', () => {
    const m = /function\s+verEnElMapa\s*\(\s*\)\s*\{([\s\S]*?)\n\s*\}/.exec(content)
    expect(m).not.toBeNull()
    expect(m![1].trim()).toBe('if (urlMapa) Linking.openURL(urlMapa).catch(() => {})')
  })

  it('el botón se dibuja solo dentro de {urlMapa ? ( ... ) : null}', () => {
    const idxCondicion = content.indexOf('{urlMapa ? (')
    const idxBoton = content.indexOf('onPress={verEnElMapa}')
    expect(idxCondicion).toBeGreaterThan(-1)
    expect(idxBoton).toBeGreaterThan(idxCondicion)
    // Entre la condición y el botón no se cierra la condición.
    expect(content.slice(idxCondicion, idxBoton)).not.toContain(': null}')
    // Hay un solo lugar que llama a verEnElMapa.
    expect(content.match(/\bverEnElMapa\b/g)).toHaveLength(2) // la declaración y el onPress
  })

  it('accessibilityRole="link" (abre el navegador, como "Cómo llegar" y "Comprar tickets"), ícono MapPin y el texto visible', () => {
    const idxBoton = content.indexOf('onPress={verEnElMapa}')
    const inicio = content.lastIndexOf('<Pressable', idxBoton)
    const fin = content.indexOf('</Pressable>', idxBoton)
    const boton = content.slice(inicio, fin)
    expect(boton).toMatch(/accessibilityRole="link"/)
    expect(boton).toMatch(/estilos\.ctaOutline/)
    expect(boton).toMatch(/estilos\.ctaMapa/)
    expect(boton).toMatch(/<Icono nombre="MapPin"/)
    expect(boton).toContain('Ver en el mapa')
  })

  it('el piso de 48 dp sale de AREA_TACTIL_MINIMA', () => {
    expect(content).toMatch(/ctaMapa:\s*\{\s*minHeight:\s*AREA_TACTIL_MINIMA\s*\}/)
  })

  it('va entre "Cómo llegar" y "Comprar tickets" (el orden de la ficha de la web)', () => {
    const idxComoLlegar = content.indexOf('onPress={comoLlegar}')
    const idxMapa = content.indexOf('onPress={verEnElMapa}')
    const idxComprar = content.indexOf('onPress={comprar}')
    expect(idxComoLlegar).toBeGreaterThan(-1)
    expect(idxMapa).toBeGreaterThan(idxComoLlegar)
    expect(idxComprar).toBeGreaterThan(idxMapa)
  })

  it('el ícono MapPin existe en components/Icono.tsx', () => {
    expect(readFileSync(ICONO_PATH, 'utf8')).toMatch(/import MapPin from 'lucide-react-native\/icons\/map-pin'/)
  })
})

describe('app.config.ts: los App Links no agarran /mapa (el link abre el navegador, no la app)', () => {
  const datos = config.android?.intentFilters?.flatMap((f) => (Array.isArray(f.data) ? f.data : [f.data])) ?? []
  const delSitio = datos.filter((d) => d?.host === 'www.quepintasalta.com.ar' || d?.host === 'quepintasalta.com.ar')

  it('hay App Links del sitio (si no, este test no estaría probando nada)', () => {
    expect(delSitio.length).toBeGreaterThan(0)
  })

  it('ningún intentFilter del sitio cubre /mapa (sin path, pathPrefix que lo incluya, path o pathPattern)', () => {
    for (const d of delSitio) {
      const tienePath = Boolean(d?.path || d?.pathPrefix || d?.pathPattern)
      expect(tienePath).toBe(true) // sin path, agarraría todo el host
      expect(d?.path === '/mapa').toBe(false)
      expect(d?.pathPrefix ? '/mapa'.startsWith(d.pathPrefix) : false).toBe(false)
      expect(d?.pathPattern).toBeUndefined()
    }
  })

  it('iOS no declara associatedDomains (Universal Links): /mapa tampoco vuelve a la app en iPhone', () => {
    expect(config.ios?.associatedDomains).toBeUndefined()
  })
})
