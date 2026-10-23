/**
 * De punta a punta, con dobles (R54, tarea 54-q): eventos inventados ->
 * `app/mapa/page.tsx` con `getEvents` mockeado y la `searchParams` de cada
 * filtro -> las props de `MapaContenido`. Y el viaje completo del link de
 * "Ver en el mapa": el `href` que arma `VerEnElMapa` lleva a una `/mapa` cuya
 * página tiene ESE evento en el pin de `lugarInicial`.
 *
 * Sin red ni base; entorno `node`. Los pines esperados salen de llamar a
 * `armarPinesDelMapa` directo con el filtro escrito a mano (no el que devuelve
 * `parsearFiltroMapa`), así el test no se apoya en lo mismo que prueba.
 */
import { isValidElement, createElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getEvents = vi.hoisted(() => vi.fn())
const accesoPersonal = vi.hoisted(() => vi.fn(() => { throw new Error('/mapa no puede leer sesión ni favoritos') }))

vi.mock('@/lib/data', () => ({ getEvents }))
vi.mock('@/lib/supabase/server', () => ({ createClient: accesoPersonal }))
vi.mock('@/lib/actions/favorites', () => ({ getUserFavorites: accesoPersonal }))
vi.mock('@/components/navbar', () => ({ Navbar: () => null }))
vi.mock('@/components/mobile-nav', () => ({ MobileNav: () => null }))

import MapaPage from '@/app/mapa/page'
import { MapaContenido } from '@/app/mapa/mapa-contenido'
import { VerEnElMapa } from '@/components/ver-en-el-mapa'
import { armarPinesDelMapa, type FiltroMapa, type PinLugar } from '@qps/core/mapa/pines'
import type { Venue } from '@/lib/types'

const AHORA = new Date('2026-10-23T18:00:00Z') // viernes 15:00 en Salta

const V_PENIA = '11111111-1111-4111-8111-111111111111'
const V_TEXTO = '22222222-2222-4222-8222-222222222222'
const V_NULA = '33333333-3333-4333-8333-333333333333'
const V_INVERTIDA = '44444444-4444-4444-8444-444444444444'
const V_BASURA = '55555555-5555-4555-8555-555555555555'
const V_MANANA = '66666666-6666-4666-8666-666666666666'
const V_AFUERA = '77777777-7777-4777-8777-777777777777'

interface VenueFixture {
  id: string
  name: string
  address: string
  latitude: unknown
  longitude: unknown
}

function lugar(id: string, name: string, latitude: unknown, longitude: unknown): VenueFixture {
  return { id, name, address: `Dirección de ${name}`, latitude, longitude }
}

const PENIA = lugar(V_PENIA, 'Peña de Prueba', -24.7883, -65.4106)
const TEXTO = lugar(V_TEXTO, 'Venue de Texto', '-24.79', '-65.42') // PostgREST puede mandar numeric como texto
const NULA = lugar(V_NULA, 'Venue sin Coordenadas', null, null)
const INVERTIDA = lugar(V_INVERTIDA, 'Venue Invertido', -65.4106, -24.7883)
const BASURA = lugar(V_BASURA, 'Venue con Basura', 'abc', '')
const MANANA = lugar(V_MANANA, 'Venue de Mañana', -24.8, -65.43)
const AFUERA = lugar(V_AFUERA, 'Venue de Buenos Aires', -34.6037, -58.3816)

function evento(id: string, start: string, venue: VenueFixture | null, extra: Record<string, unknown> = {}) {
  return {
    id,
    title: `Evento ${id}`,
    description: 'DESCRIPCION-SCRAPEADA-DE-PRUEBA',
    image_url: 'https://ejemplo.invalid/flyer.jpg',
    start_date: start,
    end_date: null,
    category: { slug: 'musica', name: 'Música' },
    venue,
    ...extra,
  }
}

// Hoy 23/10 y mañana 24/10 en Salta (UTC-3).
const EVENTOS = [
  evento('hoy-funcion-16', '2026-10-23T19:00:00Z', PENIA), // 16:00
  evento('hoy-funcion-21', '2026-10-24T00:00:00Z', PENIA), // 21:00
  evento('hoy-texto', '2026-10-23T23:00:00Z', TEXTO), // 20:00, coordenadas como texto
  evento('hoy-nula', '2026-10-23T23:30:00Z', NULA),
  evento('hoy-invertida', '2026-10-23T23:30:00Z', INVERTIDA),
  evento('hoy-basura', '2026-10-23T23:30:00Z', BASURA),
  evento('hoy-afuera', '2026-10-23T23:30:00Z', AFUERA),
  evento('hoy-sin-lugar', '2026-10-23T23:30:00Z', null),
  evento('manana-solo', '2026-10-24T23:00:00Z', MANANA), // sábado 20:00
  evento('manana-penia', '2026-10-25T00:30:00Z', PENIA), // sábado 21:30 en la misma peña
  evento('varios-dias', '2026-10-24T23:00:00Z', TEXTO, { end_date: '2026-10-27T03:00:00Z' }),
  evento('en-quince-dias', '2026-11-07T23:00:00Z', MANANA),
]

const HOY_KEY = '2026-10-23'
const MANANA_KEY = '2026-10-24'

function buscar(nodo: ReactNode, tipo: unknown): ReactElement | null {
  if (Array.isArray(nodo)) {
    for (const hijo of nodo) {
      const hallado = buscar(hijo, tipo)
      if (hallado) return hallado
    }
    return null
  }
  if (!isValidElement(nodo)) return null
  if (nodo.type === tipo) return nodo
  return buscar((nodo.props as { children?: ReactNode }).children, tipo)
}

interface PropsContenido {
  pines: PinLugar[]
  sinUbicacion: number
  filtro: FiltroMapa
  lugarInicial: string | null
  ahoraISO: string
}

async function paginaCon(params: Record<string, string | string[]>): Promise<PropsContenido> {
  const arbol = await MapaPage({ searchParams: Promise.resolve(params) })
  const contenido = buscar(arbol, MapaContenido)
  expect(contenido, 'la página tiene que dibujar MapaContenido').not.toBeNull()
  return contenido!.props as unknown as PropsContenido
}

/** El `href` que arma `VerEnElMapa` para un evento, o `null` si no dibuja el link. */
function hrefDeVerEnElMapa(ev: ReturnType<typeof evento>): string | null {
  const html = renderToStaticMarkup(
    createElement(VerEnElMapa, { venue: ev.venue as unknown as Venue, startDate: new Date(ev.start_date) })
  )
  const coincidencia = /href="([^"]+)"/.exec(html)
  return coincidencia ? coincidencia[1].replace(/&amp;/g, '&') : null
}

/** La `searchParams` que Next le pasaría a la página para esa URL. */
function searchParamsDe(href: string): Record<string, string> {
  return Object.fromEntries(new URL(href, 'https://ejemplo.invalid').searchParams.entries())
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AHORA)
  getEvents.mockReset()
  getEvents.mockResolvedValue(EVENTOS)
  accesoPersonal.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('los pines y sinUbicacion de la página cuadran con armarPinesDelMapa directo', () => {
  const casos: { nombre: string; params: Record<string, string>; filtro: FiltroMapa }[] = [
    { nombre: 'sin parámetros (hoy)', params: {}, filtro: { tipo: 'hoy' } },
    { nombre: 'cuando=hoy', params: { cuando: 'hoy' }, filtro: { tipo: 'hoy' } },
    { nombre: 'cuando=finde', params: { cuando: 'finde' }, filtro: { tipo: 'finde' } },
    { nombre: 'fecha de hoy', params: { cuando: 'fecha', dia: HOY_KEY }, filtro: { tipo: 'fecha', dia: HOY_KEY } },
    { nombre: 'fecha de mañana', params: { cuando: 'fecha', dia: MANANA_KEY }, filtro: { tipo: 'fecha', dia: MANANA_KEY } },
    { nombre: 'fecha a 15 días', params: { cuando: 'fecha', dia: '2026-11-07' }, filtro: { tipo: 'fecha', dia: '2026-11-07' } },
    { nombre: 'fecha mal escrita (vuelve a hoy)', params: { cuando: 'fecha', dia: '2026-02-31' }, filtro: { tipo: 'hoy' } },
    { nombre: 'fecha pasada (vuelve a hoy)', params: { cuando: 'fecha', dia: '2026-10-01' }, filtro: { tipo: 'hoy' } },
    { nombre: 'fecha a más de 60 días (vuelve a hoy)', params: { cuando: 'fecha', dia: '2027-03-01' }, filtro: { tipo: 'hoy' } },
    { nombre: 'cuando desconocido (vuelve a hoy)', params: { cuando: '<script>' }, filtro: { tipo: 'hoy' } },
  ]

  it.each(casos)('$nombre', async ({ params, filtro }) => {
    const esperado = armarPinesDelMapa(EVENTOS as never, filtro, AHORA)
    const props = await paginaCon(params)
    expect(props.filtro).toEqual(filtro)
    expect(props.pines).toEqual(esperado.pines)
    expect(props.sinUbicacion).toBe(esperado.sinUbicacion)
    expect(props.ahoraISO).toBe(AHORA.toISOString())
  })

  it('hoy: concreto, con las dos funciones de la misma peña en un solo pin y los lugares sin coordenadas buenas contados aparte', async () => {
    const props = await paginaCon({})
    const porLugar = new Map(props.pines.map((pin) => [pin.venueId, pin]))

    // Un pin por lugar con coordenadas buenas: la peña y el de texto.
    expect([...porLugar.keys()].sort()).toEqual([V_PENIA, V_TEXTO].sort())
    // Dos funciones el mismo día (16:00 y 21:00): ordenadas por hora.
    expect(porLugar.get(V_PENIA)!.eventos.map((e) => e.id)).toEqual(['hoy-funcion-16', 'hoy-funcion-21'])
    // Las coordenadas como texto se convierten a número.
    expect(porLugar.get(V_TEXTO)!.lat).toBe(-24.79)
    expect(porLugar.get(V_TEXTO)!.lng).toBe(-65.42)
    // Nula, invertida, basura, fuera de Salta y sin lugar: sin pin, cuentan en sinUbicacion.
    expect(props.sinUbicacion).toBe(5)
    // Nada de mañana en "Hoy".
    const ids = props.pines.flatMap((pin) => pin.eventos.map((e) => e.id))
    expect(ids).not.toContain('manana-solo')
    expect(ids).not.toContain('manana-penia')
    expect(ids).not.toContain('en-quince-dias')
  })

  it('un día de mañana trae lo de mañana (y el de varios días que arranca ese día) y nada de hoy', async () => {
    const props = await paginaCon({ cuando: 'fecha', dia: MANANA_KEY })
    const ids = props.pines.flatMap((pin) => pin.eventos.map((e) => e.id))
    expect(ids).toContain('manana-solo')
    expect(ids).toContain('varios-dias')
    // La función de las 16:00 de hoy ya terminó cuando empieza mañana. (La de las 20:00 sí
    // se cuela en el principio de mañana: dura hasta las 00:00 de Salta, por la regla de 4 h
    // de `estimatedEnd`, y eso es lo que pide la regla de "varios días".)
    expect(ids).not.toContain('hoy-funcion-16')
    // Los de las 20:30 de hoy sin ubicación también duran hasta pasadas las 00:00 (4 h): cuentan.
    expect(props.sinUbicacion).toBe(5)
  })

  it('las coordenadas que llegan al cliente son números dentro de Salta', async () => {
    const variantes: Record<string, string>[] = [{}, { cuando: 'finde' }, { cuando: 'fecha', dia: MANANA_KEY }]
    for (const params of variantes) {
      const props = await paginaCon(params)
      for (const pin of props.pines) {
        expect(typeof pin.lat).toBe('number')
        expect(typeof pin.lng).toBe('number')
        expect(pin.lat).toBeLessThan(-21.8)
        expect(pin.lat).toBeGreaterThan(-26.6)
        expect(pin.lng).toBeLessThan(-62.2)
        expect(pin.lng).toBeGreaterThan(-68.7)
      }
    }
  })

  it('un evento que no está en el filtro no suma a sinUbicacion (mañana sin lugar no cuenta en hoy)', async () => {
    getEvents.mockResolvedValue([evento('manana-sin-lugar', '2026-10-24T23:00:00Z', null)])
    const props = await paginaCon({})
    expect(props.pines).toEqual([])
    expect(props.sinUbicacion).toBe(0)
  })

  it('no lee nada personal en ningún filtro', async () => {
    await paginaCon({})
    await paginaCon({ cuando: 'finde' })
    await paginaCon({ cuando: 'fecha', dia: MANANA_KEY, lugar: V_PENIA })
    expect(accesoPersonal).not.toHaveBeenCalled()
  })
})

describe('"Ver en el mapa" lleva a un /mapa que tiene ese evento en el pin de lugarInicial', () => {
  // Los eventos vigentes con un lugar de coordenadas buenas.
  const conLink = EVENTOS.filter((ev) => ev.venue && ['hoy-funcion-16', 'hoy-funcion-21', 'hoy-texto', 'manana-solo', 'manana-penia', 'en-quince-dias'].includes(ev.id))

  it.each(conLink.map((ev) => [ev.id, ev] as const))('%s', async (_id, ev) => {
    const href = hrefDeVerEnElMapa(ev)
    expect(href, 'el lugar tiene coordenadas buenas: tiene que haber link').not.toBeNull()

    const params = searchParamsDe(href!)
    expect(params.cuando).toBe('fecha')
    expect(params.lugar).toBe(ev.venue!.id)

    const props = await paginaCon(params)
    expect(props.filtro.tipo).toBe('fecha')
    expect(props.lugarInicial).toBe(ev.venue!.id)
    const pin = props.pines.find((candidato) => candidato.venueId === props.lugarInicial)
    expect(pin, 'lugarInicial tiene que ser un pin de la página').toBeDefined()
    expect(pin!.eventos.map((e) => e.id)).toContain(ev.id)
  })

  it('el día del link es el de Salta: el de las 21:30 de Salta (00:30Z del día siguiente) abre en su día y no en el UTC', async () => {
    const ev = EVENTOS.find((e) => e.id === 'manana-penia')!
    expect(ev.start_date.startsWith('2026-10-25')).toBe(true) // UTC ya es el 25
    const params = searchParamsDe(hrefDeVerEnElMapa(ev)!)
    expect(params.dia).toBe(MANANA_KEY) // pero en Salta sigue siendo el 24
  })

  it('sin coordenadas buenas no hay link (nula, invertida, basura, fuera de Salta, sin lugar)', () => {
    for (const id of ['hoy-nula', 'hoy-invertida', 'hoy-basura', 'hoy-afuera', 'hoy-sin-lugar']) {
      const ev = EVENTOS.find((e) => e.id === id)!
      expect(hrefDeVerEnElMapa(ev), id).toBeNull()
    }
  })

  it('todo evento con link tiene pin en su día, y todo evento sin link sin ubicación no tiene pin (coherencia entre la ficha y la página)', async () => {
    for (const ev of EVENTOS) {
      const href = hrefDeVerEnElMapa(ev)
      if (!href) {
        const dia = new Date(ev.start_date)
        const filtro: FiltroMapa = { tipo: 'fecha', dia: dia.getTime() >= Date.parse('2026-10-24T03:00:00Z') ? MANANA_KEY : HOY_KEY }
        const { pines } = armarPinesDelMapa(EVENTOS as never, filtro, AHORA)
        const ids = pines.flatMap((pin) => pin.eventos.map((e) => e.id))
        expect(ids, `${ev.id} no debería tener pin`).not.toContain(ev.id)
      }
    }
  })

  // Un evento de varios días que ya empezó (festival que arrancó anteayer y sigue) tiene
  // "Ver en el mapa" con `dia=<día de inicio>`, que es pasado: `parsearFiltroMapa` lo manda
  // a "hoy". Arreglado en `eventoEnFiltroMapa`: "hoy" también arrastra lo que empezó antes
  // y sigue en curso, así que el lugar está en el pin y `lugarInicial` lo encuentra.
  it('un evento de varios días que ya empezó antes de hoy: su link abre un /mapa que lo tiene en el pin', async () => {
    const ev = evento('varios-dias-empezado', '2026-10-21T23:00:00Z', PENIA, { end_date: '2026-10-26T03:00:00Z' })
    getEvents.mockResolvedValue([ev])
    const href = hrefDeVerEnElMapa(ev)
    expect(href).not.toBeNull()
    const props = await paginaCon(searchParamsDe(href!))
    expect(props.lugarInicial).toBe(V_PENIA)
  })

  it('el mismo evento de varios días: "hoy" y "fecha de hoy" coinciden', async () => {
    const ev = evento('varios-dias-empezado', '2026-10-21T23:00:00Z', PENIA, { end_date: '2026-10-26T03:00:00Z' })
    getEvents.mockResolvedValue([ev])
    const hoy = await paginaCon({})
    const fechaDeHoy = await paginaCon({ cuando: 'fecha', dia: HOY_KEY })
    expect(hoy.pines).toHaveLength(1)
    expect(fechaDeHoy.pines).toHaveLength(1)
    expect(hoy.pines).toEqual(fechaDeHoy.pines)
  })
})

describe('salidas raras de la base', () => {
  it('lista vacía: sin pines, sin ubicación y la página sigue andando', async () => {
    getEvents.mockResolvedValue([])
    const props = await paginaCon({ lugar: V_PENIA })
    expect(props.pines).toEqual([])
    expect(props.sinUbicacion).toBe(0)
    expect(props.lugarInicial).toBeNull()
  })

  it('un mismo id repetido cuenta una sola vez', async () => {
    getEvents.mockResolvedValue([EVENTOS[0], EVENTOS[0]])
    const props = await paginaCon({})
    expect(props.pines).toHaveLength(1)
    expect(props.pines[0].eventos).toHaveLength(1)
  })
})
