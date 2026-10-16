// R29, tarea 29-i (§3.7): el layout de "Mi Agenda de Eventos" en
// app/(tabs)/favoritos.tsx, copiado de apps/web/app/favoritos/favoritos-list.tsx.
//
// Dos partes, mismo patrón que tests/pull-to-refresh.test.ts y
// tests/favoritos-armar.test.ts (lectura estática con `fs`, sin montar nada
// de React Native — no se importa `app/(tabs)/favoritos.tsx` como módulo:
// arrastra `react-native`, que Vitest no puede transformar en este entorno,
// mismo motivo por el que esos otros tests tampoco lo importan):
//   1. Los textos de la web están, literal, en la pantalla de la app (y
//      siguen estando en la web, para que el test note si alguien cambia el
//      texto de un lado y no del otro).
//   2. `armarMensajeWhatsApp` (@qps/core/favoritos/armar, movida a core en
//      esta tarea porque 29-a ya estaba commiteada) con fixtures inventadas:
//      ningún id, nombre ni dato real.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { armarMensajeWhatsApp } from '@qps/core/favoritos/armar'
import type { DisplayEvent } from '@qps/core/home/types'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const PANTALLA = readFileSync(`${MOBILE_ROOT}/app/(tabs)/favoritos.tsx`, 'utf8')
const WEB_FAVORITOS_LIST = readFileSync(
  fileURLToPath(new URL('../../web/app/favoritos/favoritos-list.tsx', import.meta.url)),
  'utf8',
)

// ---------------------------------------------------------------------------
// 1. Textos copiados literal de la web.
// ---------------------------------------------------------------------------
describe('app/(tabs)/favoritos.tsx: textos copiados literal de favoritos-list.tsx (la web)', () => {
  it.each(['Mi Agenda de Eventos', 'Compartir agenda por WhatsApp', 'Plan flexible'])(
    '"%s" está en la pantalla de la app y en la web',
    (texto) => {
      expect(PANTALLA).toContain(texto)
      expect(WEB_FAVORITOS_LIST).toContain(texto)
    },
  )

  it('"Ingresar" (sin sesión, logo al 30%) está en la pantalla', () => {
    expect(PANTALLA).toContain('Ingresar')
  })

  it('el logo (assets/logo-circular.png) se usa con opacity: 0.3 en el estado sin sesión', () => {
    expect(PANTALLA).toMatch(/LOGO_MARCA/)
    expect(PANTALLA).toMatch(/opacity:\s*0\.3/)
  })
})

// ---------------------------------------------------------------------------
// 2. armarMensajeWhatsApp: función pura, fixtures inventadas.
// ---------------------------------------------------------------------------
function makeItem(overrides: Partial<DisplayEvent> = {}): DisplayEvent {
  return {
    id: 'evento-de-prueba-1',
    slug: 'evento-de-prueba-1',
    title: 'Evento de Prueba',
    venue: 'Lugar de Prueba',
    date: '2030-12-31',
    time: '21:00',
    category: 'musica',
    categoryName: 'Música',
    price: 'gratis',
    image: '',
    description: '',
    address: '',
    startDateTime: '2030-12-31T21:00:00-03:00',
    isFeatured: false,
    ...overrides,
  }
}

describe('armarMensajeWhatsApp (fixtures inventadas, función pura)', () => {
  it('arma el mensaje con las tres secciones (eventos, cine y boliches), en ese orden', () => {
    const evento = makeItem({
      id: 'id-evento-ficticio',
      title: 'Recital Ficticio',
      venue: 'Club Ficticio',
      date: '2030-11-05',
    })
    const pelicula = makeItem({ id: 'movie-id-ficticio', title: 'Película Ficticia', isCinemaMovie: true })
    const flyer = makeItem({
      id: 'ig-id-ficticio',
      title: 'Boliche Ficticio',
      venue: 'Boliche de Prueba',
      isInstagramFlyer: true,
      flyerId: 'flyer-ficticio-1',
    })

    const mensaje = armarMensajeWhatsApp([evento, pelicula, flyer], 'https://app.test')

    const esperado = [
      '¡Che! Este es mi plan para el finde en Salta:',
      '',
      '📅 *Eventos:*',
      '- *Recital Ficticio* (05/11 en Club Ficticio)',
      '  🔗 https://app.test/evento/id-evento-ficticio',
      '',
      '🎬 *Cine:*',
      '- *Película Ficticia*',
      '  🔗 https://app.test/cines',
      '',
      '🍻 *Boliches / Salidas:*',
      '- *Boliche Ficticio* (en Boliche de Prueba)',
      '  🔗 https://app.test/flyer/flyer-ficticio-1',
      '',
      'Organizá tu salida en quepintasalta.com.ar 🎸',
    ].join('\n')

    expect(mensaje).toBe(esperado)
  })

  it('sin favoritos: solo el saludo y el cierre', () => {
    expect(armarMensajeWhatsApp([], 'https://app.test')).toBe(
      ['¡Che! Este es mi plan para el finde en Salta:', '', 'Organizá tu salida en quepintasalta.com.ar 🎸'].join('\n'),
    )
  })

  it('sin pasar "sitio", usa el dominio de producción (SITIO de @qps/core/metricas/links)', () => {
    const evento = makeItem({ id: 'id-evento-default', date: '2030-01-01' })
    const mensaje = armarMensajeWhatsApp([evento])
    expect(mensaje).toContain('https://www.quepintasalta.com.ar/evento/id-evento-default')
  })

  it('una película ignora el id (siempre linkea a /cines, no a /pelicula/<id>)', () => {
    const pelicula = makeItem({ id: 'movie-otra-pelicula-ficticia', title: 'Otra Película', isCinemaMovie: true })
    const mensaje = armarMensajeWhatsApp([pelicula], 'https://app.test')
    expect(mensaje).toContain('https://app.test/cines')
    expect(mensaje).not.toContain('movie-otra-pelicula-ficticia')
  })
})

