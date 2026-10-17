// 36-q (cierre de la R36): "el Hero y los atajos" — con el filtro en memoria
// de 36-a, el Hero (`datosPortada.carrusel` en `app/(tabs)/index.tsx`,
// armado con `selectCarouselEvents` de `@qps/core/home/carousel` sobre los
// eventos del atajo elegido) muestra los eventos del atajo elegido SIN una
// carga nueva: una sola llamada a `obtenerEventosVigentesParaInicio` (una
// sola consulta a `supabase.from('events')`) alimenta los cuatro atajos,
// cada uno filtrado en memoria con `eventoEnAtajo` antes de pasar por
// `selectCarouselEvents`.
//
// A propósito, esto NO depende de nada de 36-b (`components/Hero.tsx`, en
// curso en paralelo): se prueba la lógica de datos de 36-a
// (`obtenerEventosVigentesParaInicio` + `eventoEnAtajo` +
// `selectCarouselEvents`), con las mismas funciones reales que usa
// `app/(tabs)/index.tsx` en su `useMemo` de `datosPortada` — no una
// reimplementación en el test (mismo motivo que `tests/portada-atajos.test.ts`:
// sin `@testing-library/react-native` en el repo, `index.tsx` no se puede
// `import`ar acá).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eventoEnAtajo, type Atajo } from '@qps/core/home/atajos'
import { selectCarouselEvents, sortCategories } from '@qps/core/home/carousel'
import type { Category } from '@qps/core/types'

const estado = vi.hoisted(() => ({
  resultado: { data: [] as unknown, error: null as unknown } as { data: unknown; error: unknown },
}))
const fromSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => {
      fromSpy(...args)
      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.eq = () => builder
      builder.or = () => builder
      builder.order = () => builder
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(estado.resultado).then(resolve, reject)
      return builder
    },
  },
}))

import { obtenerEventosVigentesParaInicio, type EventoVigenteParaInicio } from '../lib/datos/eventos'

interface FilaCruda {
  id: string
  slug: string
  title: string
  description: null
  short_description: null
  start_date: string
  end_date: string | null
  price_min: number
  is_free: boolean
  image_url: null
  ticket_url: null
  age_restriction: number
  is_featured: boolean
  category: { slug: string; name: string } | null
  venue: { name: string; address: string } | null
}

function filaDeEvento(over: Partial<FilaCruda> & { id: string; start_date: string }): FilaCruda {
  return {
    slug: over.id,
    title: `Evento ${over.id}`,
    description: null,
    short_description: null,
    end_date: null,
    price_min: 0,
    is_free: true,
    image_url: null,
    ticket_url: null,
    age_restriction: 0,
    is_featured: false,
    category: { slug: 'teatro', name: 'Teatro' },
    venue: { name: 'Venue de Prueba', address: 'Calle de Prueba 123' },
    ...over,
  }
}

const CATEGORIAS: Category[] = [
  { id: 'cat-teatro', slug: 'teatro', name: 'Teatro', color: null, icon: null, created_at: null },
]

// Martes 2026-10-13, 20:00 hora de Salta — mismo instante que
// tests/portada-atajos.test.ts (equivalencia de fechas ya validada ahí).
const AHORA = new Date('2026-10-13T20:00:00-03:00')

// F1: hoy a las 21:00, destacado — entra en "hoy" y "semana", no en "finde".
const F1 = filaDeEvento({ id: 'f1-hoy-destacado', start_date: '2026-10-13T21:00:00-03:00', is_featured: true })

// F2: el viernes que viene (16/10) a las 20:00, destacado — entra en "finde"
// y "semana", no en "hoy" (mismo día que E4 de portada-atajos.test.ts).
const F2 = filaDeEvento({ id: 'f2-finde-destacado', start_date: '2026-10-16T20:00:00-03:00', is_featured: true })

// Los dos únicos eventos de la categoría "teatro": al ser los dos
// destacados, `selectCarouselEvents` los toma en el primer paso (destacados
// futuros) y el "relleno por categoría" no tiene nada más para agregar (ya
// están seleccionados) — así el carrusel de cada atajo queda, a propósito,
// exactamente con los eventos de ESE atajo, sin ruido de la regla de
// relleno (que agrega un evento más por categoría aunque no esté
// destacado, y que no es lo que este test quiere cubrir).
const FILAS = [F1, F2]

/** El mismo cómputo que el `useMemo` de `datosPortada` en `app/(tabs)/index.tsx`: filtra por atajo y arma el carrusel con las funciones reales de core. */
function carruselDelAtajo(eventos: EventoVigenteParaInicio[], atajo: Atajo, ahora: Date) {
  const eventosDelAtajo = eventos.filter((item) => eventoEnAtajo(item.paraAtajo, atajo, ahora)).map((item) => item.evento)
  const categoriasOrdenadas = sortCategories(CATEGORIAS, eventosDelAtajo, ahora, [])
  return selectCarouselEvents(eventosDelAtajo, categoriasOrdenadas, ahora)
}

describe('el Hero (carrusel) muestra los eventos del atajo elegido, sin una carga nueva', () => {
  beforeEach(() => {
    estado.resultado = { data: FILAS, error: null }
    fromSpy.mockClear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('una sola llamada a obtenerEventosVigentesParaInicio (una sola consulta a supabase.from) alcanza para los 4 atajos', async () => {
    const resultado = await obtenerEventosVigentesParaInicio(AHORA)
    expect(resultado.ok).toBe(true)
    if (!resultado.ok) throw new Error('no debería fallar')

    // Los 4 atajos se recalculan EN MEMORIA, sin volver a tocar `supabase.from`.
    const atajos: Atajo[] = ['hoy', 'esta-noche', 'finde', 'semana']
    for (const atajo of atajos) {
      carruselDelAtajo(resultado.eventos, atajo, AHORA)
    }

    expect(fromSpy).toHaveBeenCalledTimes(1)
  })

  it('atajo "hoy": el carrusel es [F1] — F2 (el viernes que viene) queda afuera sin volver a consultar', async () => {
    const resultado = await obtenerEventosVigentesParaInicio(AHORA)
    if (!resultado.ok) throw new Error('no debería fallar')

    const carrusel = carruselDelAtajo(resultado.eventos, 'hoy', AHORA)
    expect(carrusel.map((e) => e.id)).toEqual([F1.id])
  })

  it('atajo "finde": el carrusel es [F2] — F1 (hoy) queda afuera, con el mismo load ya en memoria', async () => {
    const resultado = await obtenerEventosVigentesParaInicio(AHORA)
    if (!resultado.ok) throw new Error('no debería fallar')

    const carrusel = carruselDelAtajo(resultado.eventos, 'finde', AHORA)
    expect(carrusel.map((e) => e.id)).toEqual([F2.id])
  })

  it('atajo "semana": el carrusel trae F1 y F2 (los dos destacados), ordenados por fecha', async () => {
    const resultado = await obtenerEventosVigentesParaInicio(AHORA)
    if (!resultado.ok) throw new Error('no debería fallar')

    const carrusel = carruselDelAtajo(resultado.eventos, 'semana', AHORA)
    expect(carrusel.map((e) => e.id)).toEqual([F1.id, F2.id])
  })

  it('atajo "esta-noche": F2 (el finde) no entra — el carrusel es [F1]', async () => {
    const resultado = await obtenerEventosVigentesParaInicio(AHORA)
    if (!resultado.ok) throw new Error('no debería fallar')

    const carrusel = carruselDelAtajo(resultado.eventos, 'esta-noche', AHORA)
    expect(carrusel.map((e) => e.id)).toEqual([F1.id])
  })

  it('cambiar de atajo cambia lo que ve el Hero: "hoy" y "finde" no comparten ningún evento del carrusel', async () => {
    const resultado = await obtenerEventosVigentesParaInicio(AHORA)
    if (!resultado.ok) throw new Error('no debería fallar')

    const carruselHoy = carruselDelAtajo(resultado.eventos, 'hoy', AHORA).map((e) => e.id)
    const carruselFinde = carruselDelAtajo(resultado.eventos, 'finde', AHORA).map((e) => e.id)

    expect(carruselHoy.length).toBeGreaterThan(0)
    expect(carruselFinde.length).toBeGreaterThan(0)
    expect(carruselHoy.some((id) => carruselFinde.includes(id))).toBe(false)
  })
})
