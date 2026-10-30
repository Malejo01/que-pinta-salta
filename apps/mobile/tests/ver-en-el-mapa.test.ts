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
//      Links de Android en `app.config.ts` no agarran `/mapa` (si lo
//      hicieran, el link volvería a la app en vez de abrir el navegador).
//
// Correcciones de A4: el texto pasa a "Ver en el mapa de eventos", el botón
// va tercero (después de "Comprar tickets") y se oculta si el evento terminó
// o si su día cae fuera de la ventana de `/mapa` (2b, con `ahora` fijo).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { formatSaltaDayKey, saltaWallClockToDate } from '@qps/core/date-format'
import { isVigente } from '@qps/core/events/vigencia'
import {
  armarPinesDelMapa,
  DIAS_MAXIMOS_FECHA_MAPA,
  parsearFiltroMapa,
  type EventoParaMapa,
} from '@qps/core/mapa/pines'
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

// `ahora` fijo para todo lo que sigue: martes 27/10/2026, 10:00 de Salta.
const AHORA = saltaWallClockToDate('2026-10-27T10:00:00')
const HOY = '2026-10-27'

/** Inicio a las `hora` de Salta del día `dia`, como lo guarda la base (ISO UTC). */
function inicioSalta(dia: string, hora = '21:00:00'): string {
  return saltaWallClockToDate(`${dia}T${hora}`).toISOString()
}

describe('urlMapaDelEvento: el link del botón de la ficha', () => {
  const inicio = inicioSalta('2026-11-07')

  it('lugar con pin: /mapa con el día de Salta del evento y el lugar', () => {
    expect(urlMapaDelEvento({ start_date: inicio, venue: { id: UUID, ...SALTA } }, AHORA)).toBe(
      `${SITIO}/mapa?cuando=fecha&dia=2026-11-07&lugar=${UUID}`,
    )
  })

  it('coordenadas como string: igual', () => {
    expect(
      urlMapaDelEvento(
        { start_date: inicio, venue: { id: UUID, latitude: '-24.7883', longitude: '-65.4106' } },
        AHORA,
      ),
    ).toBe(`${SITIO}/mapa?cuando=fecha&dia=2026-11-07&lugar=${UUID}`)
  })

  it('el día es el de SALTA, no el día UTC crudo (23:30 de Salta ya es el día siguiente en UTC)', () => {
    const deNoche = saltaWallClockToDate('2026-11-07T23:30:00')
    expect(deNoche.toISOString().slice(0, 10)).toBe('2026-11-08')
    expect(formatSaltaDayKey(deNoche)).toBe('2026-11-07')
    expect(urlMapaDelEvento({ start_date: deNoche.toISOString(), venue: { id: UUID, ...SALTA } }, AHORA)).toBe(
      `${SITIO}/mapa?cuando=fecha&dia=2026-11-07&lugar=${UUID}`,
    )
  })

  it('id del lugar en mayúsculas: en minúsculas', () => {
    expect(urlMapaDelEvento({ start_date: inicio, venue: { id: UUID_MAYUSCULAS, ...SALTA } }, AHORA)).toBe(
      `${SITIO}/mapa?cuando=fecha&dia=2026-11-07&lugar=${UUID}`,
    )
  })

  it('sin ahora: usa el reloj (la ficha no lo pasa) — un evento de dentro de una semana tiene link', () => {
    const enUnaSemana = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    expect(urlMapaDelEvento({ start_date: enUnaSemana, venue: { id: UUID, ...SALTA } })).toMatch(
      new RegExp(`^${SITIO}/mapa\\?cuando=fecha&dia=\\d{4}-\\d{2}-\\d{2}&lugar=${UUID}$`),
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
    ['inicio inválido', { start_date: 'no-es-fecha', venue: { id: UUID, ...SALTA } }],
    ['sin inicio', { start_date: null, venue: { id: UUID, ...SALTA } }],
  ])('%s: null (no hay botón)', (_caso, evento) => {
    expect(urlMapaDelEvento(evento, AHORA)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 2b. Correcciones de A4: ocultar el botón cuando el link no serviría (evento
// terminado o día fuera de la ventana de `/mapa`), y la paridad punta a punta
// con lo que hace la web al recibir el link: `parsearFiltroMapa` (los mismos
// `cuando`/`dia`) + `armarPinesDelMapa` + la validación de `?lugar=` de
// `apps/web/app/mapa/page.tsx` (reproducida acá: es una línea, y la app no
// importa código de la web).
// ---------------------------------------------------------------------------

type EventoDePrueba = { start_date: string; end_date?: string | null }

/** El lugar que la web elegiría al abrir `url` (o `null`), con `evento` como único evento de la base. */
function lugarQueEligeLaWeb(url: string, evento: EventoDePrueba, ahora: Date): string | null {
  const params = new URL(url).searchParams
  const filtro = parsearFiltroMapa({ cuando: params.get('cuando'), dia: params.get('dia') }, ahora)
  const eventoMapa: EventoParaMapa = {
    id: 'e1',
    title: 'Evento de prueba',
    ...evento,
    venue: { id: UUID, name: 'Lugar', address: 'Calle 1', ...SALTA },
  }
  const { pines } = armarPinesDelMapa([eventoMapa], filtro, ahora)
  const lugar = params.get('lugar')
  const UUID_WEB = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return lugar && UUID_WEB.test(lugar) && pines.some((pin) => pin.venueId === lugar) ? lugar : null
}

/** El link "como la web" (`VerEnElMapa`: siempre con el día de Salta del inicio), para mostrar que en los casos ocultos no serviría. */
function linkComoLaWeb(evento: EventoDePrueba): string {
  return `${SITIO}/mapa?cuando=fecha&dia=${formatSaltaDayKey(new Date(evento.start_date))}&lugar=${UUID}`
}

describe('urlMapaDelEvento: vigencia y ventana de días (con ahora inyectado)', () => {
  const dia60 = '2026-12-26' // hoy + 60
  const dia61 = '2026-12-27' // hoy + 61

  it('premisa: DIAS_MAXIMOS_FECHA_MAPA es 60 y parsearFiltroMapa acepta el día 60 y rechaza el 61', () => {
    expect(DIAS_MAXIMOS_FECHA_MAPA).toBe(60)
    expect(parsearFiltroMapa({ cuando: 'fecha', dia: dia60 }, AHORA)).toEqual({ tipo: 'fecha', dia: dia60 })
    expect(parsearFiltroMapa({ cuando: 'fecha', dia: dia61 }, AHORA)).toEqual({ tipo: 'hoy' })
  })

  const casosConBoton: [string, EventoDePrueba, string][] = [
    ['hoy, más tarde', { start_date: inicioSalta(HOY) }, `${SITIO}/mapa?cuando=fecha&dia=${HOY}&lugar=${UUID}`],
    [
      'hoy, empezó hace una hora (sigue en las 4 h estimadas)',
      { start_date: inicioSalta(HOY, '09:00:00') },
      `${SITIO}/mapa?cuando=fecha&dia=${HOY}&lugar=${UUID}`,
    ],
    ['día 60', { start_date: inicioSalta(dia60) }, `${SITIO}/mapa?cuando=fecha&dia=${dia60}&lugar=${UUID}`],
    [
      'día 60 a las 23:30 de Salta (día 61 en UTC)',
      { start_date: inicioSalta(dia60, '23:30:00') },
      `${SITIO}/mapa?cuando=fecha&dia=${dia60}&lugar=${UUID}`,
    ],
    [
      'en curso: empezó ayer y termina mañana (sin dia: la web cae en "hoy" y el pin aparece)',
      { start_date: inicioSalta('2026-10-26', '18:00:00'), end_date: inicioSalta('2026-10-28', '02:00:00') },
      `${SITIO}/mapa?lugar=${UUID}`,
    ],
    [
      'en curso: festival que empezó hace 3 días y sigue hasta el finde',
      { start_date: inicioSalta('2026-10-24', '12:00:00'), end_date: inicioSalta('2026-11-01', '23:00:00') },
      `${SITIO}/mapa?lugar=${UUID}`,
    ],
    [
      'empezó ayer a las 23:00 y termina hoy a las 11:00 (en curso, sin dia)',
      { start_date: inicioSalta('2026-10-26', '23:00:00'), end_date: inicioSalta(HOY, '11:00:00') },
      `${SITIO}/mapa?lugar=${UUID}`,
    ],
    [
      'hoy, sin hora (00:00 de Salta: vigente hasta el fin del día)',
      { start_date: inicioSalta(HOY, '00:00:00') },
      `${SITIO}/mapa?cuando=fecha&dia=${HOY}&lugar=${UUID}`,
    ],
  ]

  it.each(casosConBoton)('%s: hay botón, y la web elige el lugar', (_caso, evento, esperado) => {
    const url = urlMapaDelEvento({ ...evento, venue: { id: UUID, ...SALTA } }, AHORA)
    expect(url).toBe(esperado)
    expect(lugarQueEligeLaWeb(url!, evento, AHORA)).toBe(UUID)
  })

  const casosSinBoton: [string, EventoDePrueba][] = [
    ['terminado: ayer, sin end_date', { start_date: inicioSalta('2026-10-26') }],
    ['terminado: hoy a la mañana temprano (fin estimado 09:00, ahora 10:00)', { start_date: inicioSalta(HOY, '05:00:00') }],
    [
      'terminado: con end_date de hace un minuto',
      { start_date: inicioSalta(HOY, '08:00:00'), end_date: inicioSalta(HOY, '09:59:00') },
    ],
    ['día 61', { start_date: inicioSalta(dia61) }],
    ['dentro de 90 días', { start_date: inicioSalta('2027-01-25') }],
  ]

  it.each(casosSinBoton)('%s: no hay botón, y el link de la web tampoco elegiría el lugar', (_caso, evento) => {
    expect(urlMapaDelEvento({ ...evento, venue: { id: UUID, ...SALTA } }, AHORA)).toBeNull()
    expect(lugarQueEligeLaWeb(linkComoLaWeb(evento), evento, AHORA)).toBeNull()
  })

  it('el mismo criterio de vigencia que BotonCalendario (isVigente de core)', () => {
    // Todos los que tienen botón están vigentes; los tres "terminado", no.
    for (const [, evento] of casosConBoton) expect(isVigente(evento, AHORA)).toBe(true)
    for (const [, evento] of casosSinBoton.slice(0, 3)) expect(isVigente(evento, AHORA)).toBe(false)
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

  it('accessibilityRole="link" (abre el navegador, como "Cómo llegar" y "Comprar tickets"), ícono MapPin y el texto "Ver en el mapa de eventos"', () => {
    const idxBoton = content.indexOf('onPress={verEnElMapa}')
    const inicio = content.lastIndexOf('<Pressable', idxBoton)
    const fin = content.indexOf('</Pressable>', idxBoton)
    const boton = content.slice(inicio, fin)
    expect(boton).toMatch(/accessibilityRole="link"/)
    expect(boton).toMatch(/estilos\.ctaOutline/)
    expect(boton).toMatch(/estilos\.ctaMapa/)
    expect(boton).toMatch(/<Icono nombre="MapPin"/)
    expect(boton).toMatch(/<Texto peso="semibold" style=\{estilos\.textoCtaMapa\}>\s*Ver en el mapa de eventos\s*<\/Texto>/)
  })

  it('el texto salta de línea con fuente grande: textoCtaMapa con flexShrink: 1 y textAlign: center', () => {
    expect(content).toMatch(/textoCtaMapa:\s*\{\s*flexShrink:\s*1,\s*textAlign:\s*'center'\s*\}/)
  })

  it('no queda el texto viejo "Ver en el mapa" a secas (se confundía con "Cómo llegar", que abre Google Maps)', () => {
    expect(content.match(/Ver en el mapa/g)).toHaveLength(1)
    expect(content).toContain('Ver en el mapa de eventos')
  })

  it('el piso de 48 dp sale de AREA_TACTIL_MINIMA', () => {
    expect(content).toMatch(/ctaMapa:\s*\{\s*minHeight:\s*AREA_TACTIL_MINIMA\s*\}/)
  })

  // Diferencia deliberada con la web (que lo pone entre los dos): tercero,
  // para que la compra no baje y las dos acciones de mapa no queden pegadas.
  it('orden: "Cómo llegar" → "Comprar tickets" → "Ver en el mapa de eventos" → BotonCalendario', () => {
    const idxComoLlegar = content.indexOf('onPress={comoLlegar}')
    const idxComprar = content.indexOf('onPress={comprar}')
    const idxMapa = content.indexOf('onPress={verEnElMapa}')
    const idxCalendario = content.indexOf('<BotonCalendario')
    expect(idxComoLlegar).toBeGreaterThan(-1)
    expect(idxComprar).toBeGreaterThan(idxComoLlegar)
    expect(idxMapa).toBeGreaterThan(idxComprar)
    expect(idxCalendario).toBeGreaterThan(idxMapa)
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

  // `pathSuffix` y `pathAdvancedPattern` (Android 12+) no están en el tipo
  // de `data` de `ExpoConfig`, pero Expo los pasa tal cual al manifiesto: se
  // leen sin tipar para que un filtro nuevo con esos atributos no se escape.
  it('ningún intentFilter del sitio cubre /mapa (sin path, pathPrefix que lo incluya, path, pathPattern, pathSuffix ni pathAdvancedPattern)', () => {
    for (const d of delSitio) {
      const dato = (d ?? {}) as Record<string, unknown>
      const tienePath = Boolean(dato.path || dato.pathPrefix || dato.pathPattern || dato.pathSuffix || dato.pathAdvancedPattern)
      expect(tienePath).toBe(true) // sin path, agarraría todo el host
      expect(dato.path === '/mapa').toBe(false)
      expect(typeof dato.pathPrefix === 'string' ? '/mapa'.startsWith(dato.pathPrefix) : false).toBe(false)
      expect(dato.pathPattern).toBeUndefined()
      expect(dato.pathAdvancedPattern).toBeUndefined()
      expect(typeof dato.pathSuffix === 'string' ? '/mapa'.endsWith(dato.pathSuffix) : false).toBe(false)
    }
  })

  // iOS no se prueba acá: en iPhone, qué rutas abren la app lo decide el
  // `apple-app-site-association` que sirve la web (sus `paths`/`components`),
  // no `app.config.ts` (que solo declararía el dominio en `associatedDomains`).
})
