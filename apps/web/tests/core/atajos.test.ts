/**
 * `home/atajos.ts` (R25): Hoy, Esta noche, Finde y Semana del Inicio de la
 * app móvil. Fixtures inventadas y evidentes, en hora de Salta
 * (`saltaWallClockToUtcISO`/`saltaWallClockToDate`), sin red ni base.
 *
 * Bordes pedidos por Mauro (`ops/rondas/25-inicio-cines/plan.md` y
 * `tareas/25-c-tests.md`): 18:59/19:00, 05:59/06:00, boliches/peñas sin hora,
 * viernes 18:59/19:00, domingo 23:59/lunes 00:00, "finde" consultado un
 * sábado (empieza desde ahora) y el cambio de mes en los tres atajos con
 * ventana. También: "Hoy" y "Semana" dan lo mismo que `filterEvents` de la
 * web, y lo no vigente queda afuera de cualquier atajo.
 */
import { describe, expect, it } from 'vitest'
import { eventoEnAtajo, ventanaDeAtajo, type EventoParaAtajo } from '@qps/core/home/atajos'
import { saltaWallClockToDate, saltaWallClockToUtcISO } from '@qps/core/date-format'
import { isVigente } from '@qps/core/events/vigencia'
import { filterEvents } from '@qps/core/home/filters'
import type { DisplayEvent } from '@qps/core/home/types'

const salta = (wallClock: string) => saltaWallClockToDate(wallClock)

let autoId = 0
function evento(overrides: Partial<EventoParaAtajo> = {}): EventoParaAtajo & { id: string } {
  autoId += 1
  return {
    id: `evento-de-prueba-${autoId}`,
    start_date: saltaWallClockToUtcISO('2026-10-10T21:00:00'),
    category: 'recitales',
    ...overrides,
  }
}

describe('esta noche', () => {
  // Sábado 10/10/2026, 20:00 de Salta: ya en la ventana (19:00 a 05:59 del
  // día siguiente). Ninguno de estos eventos depende del día de la semana.
  const ahora = salta('2026-10-10T20:00:00')

  it('18:59 no entra, 19:00 sí', () => {
    const antes = evento({ start_date: saltaWallClockToUtcISO('2026-10-10T18:59:00') })
    const justo = evento({ start_date: saltaWallClockToUtcISO('2026-10-10T19:00:00') })
    expect(eventoEnAtajo(antes, 'esta-noche', ahora)).toBe(false)
    expect(eventoEnAtajo(justo, 'esta-noche', ahora)).toBe(true)
  })

  it('05:59 del día siguiente sí entra, 06:00 no', () => {
    const limite = evento({ start_date: saltaWallClockToUtcISO('2026-10-11T05:59:00') })
    const pasado = evento({ start_date: saltaWallClockToUtcISO('2026-10-11T06:00:00') })
    expect(eventoEnAtajo(limite, 'esta-noche', ahora)).toBe(true)
    expect(eventoEnAtajo(pasado, 'esta-noche', ahora)).toBe(false)
  })

  it('lo de hoy sin hora (00:00): sí para boliches/peñas, no para otra categoría', () => {
    const boliche = evento({ start_date: saltaWallClockToUtcISO('2026-10-10T00:00:00'), category: 'boliches' })
    const pena = evento({ start_date: saltaWallClockToUtcISO('2026-10-10T00:00:00'), category: 'penas' })
    const feria = evento({ start_date: saltaWallClockToUtcISO('2026-10-10T00:00:00'), category: 'ferias' })
    expect(eventoEnAtajo(boliche, 'esta-noche', ahora)).toBe(true)
    expect(eventoEnAtajo(pena, 'esta-noche', ahora)).toBe(true)
    expect(eventoEnAtajo(feria, 'esta-noche', ahora)).toBe(false)
  })

  it('esa misma regla de sin-hora NO aplica a "hoy sin hora" de días que no son hoy', () => {
    // Ayer sin hora, categoría de noche: no es "hoy", así que no entra por esta regla.
    const ayerBoliche = evento({ start_date: saltaWallClockToUtcISO('2026-10-09T00:00:00'), category: 'boliches' })
    expect(eventoEnAtajo(ayerBoliche, 'esta-noche', ahora)).toBe(false)
  })
})

describe('finde', () => {
  // Lunes 28/09/2026, bastante antes del finde que arranca el viernes 02/10:
  // la ventana tiene que empezar en el viernes 19:00, no "desde ahora".
  const ahora = salta('2026-09-28T10:00:00')

  it('viernes 18:59 no entra, viernes 19:00 sí', () => {
    const antes = evento({ start_date: saltaWallClockToUtcISO('2026-10-02T18:59:00') })
    const justo = evento({ start_date: saltaWallClockToUtcISO('2026-10-02T19:00:00') })
    expect(eventoEnAtajo(antes, 'finde', ahora)).toBe(false)
    expect(eventoEnAtajo(justo, 'finde', ahora)).toBe(true)
  })

  it('domingo 23:59 sí entra, lunes 00:00 no', () => {
    const domingo = evento({ start_date: saltaWallClockToUtcISO('2026-10-04T23:59:00') })
    const lunes = evento({ start_date: saltaWallClockToUtcISO('2026-10-05T00:00:00') })
    expect(eventoEnAtajo(domingo, 'finde', ahora)).toBe(true)
    expect(eventoEnAtajo(lunes, 'finde', ahora)).toBe(false)
  })

  it('consultado un sábado: la ventana empieza desde ahora (el sábado que ya pasó no está)', () => {
    // Sábado 03/10/2026, 14:00 de Salta: ya estamos en el finde.
    const ahoraSabado = salta('2026-10-03T14:00:00')
    const yaPaso = evento({
      start_date: saltaWallClockToUtcISO('2026-10-03T10:00:00'),
      // end_date explícito y futuro: vigente de sobra, para que la exclusión
      // se deba solo a la ventana (desde = ahora), no a la vigencia.
      end_date: saltaWallClockToUtcISO('2026-10-05T00:00:00'),
    })
    const porVenir = evento({ start_date: saltaWallClockToUtcISO('2026-10-03T18:00:00') })
    expect(eventoEnAtajo(yaPaso, 'finde', ahoraSabado)).toBe(false)
    expect(eventoEnAtajo(porVenir, 'finde', ahoraSabado)).toBe(true)
  })
})

describe('cambio de mes', () => {
  it('"esta noche" del 31/10 a las 22:00 llega hasta el 01/11 05:59', () => {
    const ahora = salta('2026-10-31T22:00:00')
    const { desde, hasta } = ventanaDeAtajo('esta-noche', ahora)
    expect(desde.toISOString()).toBe(saltaWallClockToUtcISO('2026-10-31T19:00:00'))
    expect(hasta.toISOString()).toBe(saltaWallClockToUtcISO('2026-11-01T05:59:59.999'))

    const limite = evento({ start_date: saltaWallClockToUtcISO('2026-11-01T05:59:00') })
    const pasado = evento({ start_date: saltaWallClockToUtcISO('2026-11-01T06:00:00') })
    expect(eventoEnAtajo(limite, 'esta-noche', ahora)).toBe(true)
    expect(eventoEnAtajo(pasado, 'esta-noche', ahora)).toBe(false)
  })

  it('"semana" del 28/10 cruza a noviembre', () => {
    const ahora = salta('2026-10-28T10:00:00')
    const { desde, hasta } = ventanaDeAtajo('semana', ahora)
    expect(desde.toISOString()).toBe(saltaWallClockToUtcISO('2026-10-28T00:00:00'))
    expect(hasta.toISOString()).toBe(saltaWallClockToUtcISO('2026-11-04T23:59:59.999'))

    const dentro = evento({ start_date: saltaWallClockToUtcISO('2026-11-02T10:00:00') })
    const fuera = evento({ start_date: saltaWallClockToUtcISO('2026-11-05T10:00:00') })
    expect(eventoEnAtajo(dentro, 'semana', ahora)).toBe(true)
    expect(eventoEnAtajo(fuera, 'semana', ahora)).toBe(false)
  })

  it('un "finde" que empieza el viernes 30/10 termina el domingo 01/11', () => {
    const ahora = salta('2026-10-28T10:00:00') // miércoles, antes de ese finde
    const { desde, hasta } = ventanaDeAtajo('finde', ahora)
    expect(desde.toISOString()).toBe(saltaWallClockToUtcISO('2026-10-30T19:00:00'))
    expect(hasta.toISOString()).toBe(saltaWallClockToUtcISO('2026-11-01T23:59:59.999'))

    const domingo = evento({ start_date: saltaWallClockToUtcISO('2026-11-01T23:59:00') })
    const lunes = evento({ start_date: saltaWallClockToUtcISO('2026-11-02T00:00:00') })
    expect(eventoEnAtajo(domingo, 'finde', ahora)).toBe(true)
    expect(eventoEnAtajo(lunes, 'finde', ahora)).toBe(false)
  })
})

describe('lo que no está vigente queda afuera, en cualquier atajo', () => {
  it('"hoy" y "semana": un evento que ya terminó hoy mismo no entra aunque su hora de inicio esté en la ventana', () => {
    const ahora = salta('2026-10-10T23:00:00')
    const yaTermino = evento({
      start_date: saltaWallClockToUtcISO('2026-10-10T10:00:00'),
      end_date: saltaWallClockToUtcISO('2026-10-10T11:00:00'),
    })
    expect(isVigente(yaTermino, ahora)).toBe(false)
    expect(eventoEnAtajo(yaTermino, 'hoy', ahora)).toBe(false)
    expect(eventoEnAtajo(yaTermino, 'semana', ahora)).toBe(false)
  })

  it('"esta noche": un evento de anoche que ya terminó no entra, aunque su inicio caiga en la ventana', () => {
    const ahora = salta('2026-10-11T02:00:00')
    const yaTermino = evento({
      start_date: saltaWallClockToUtcISO('2026-10-10T20:00:00'),
      end_date: saltaWallClockToUtcISO('2026-10-10T20:30:00'),
    })
    expect(isVigente(yaTermino, ahora)).toBe(false)
    expect(eventoEnAtajo(yaTermino, 'esta-noche', ahora)).toBe(false)
  })

  it('"finde": la vigencia manda incluso si el inicio cae dentro de la ventana del finde', () => {
    // Dato con end_date explícito anterior al inicio (inusual, pero isVigente
    // no lo valida): aísla que la exclusión es por vigencia y no por ventana.
    const ahora = salta('2026-10-03T20:00:00') // sábado, ya en el finde
    const noVigentePeroEnVentana = evento({
      start_date: saltaWallClockToUtcISO('2026-10-03T22:00:00'), // futuro, dentro de la ventana
      end_date: saltaWallClockToUtcISO('2026-10-03T19:00:00'), // ya "terminó" antes de ahora
    })
    expect(isVigente(noVigentePeroEnVentana, ahora)).toBe(false)
    expect(eventoEnAtajo(noVigentePeroEnVentana, 'finde', ahora)).toBe(false)
  })
})

describe('"hoy" y "semana" dan lo mismo que filterEvents de la web', () => {
  const ahora = salta('2027-06-15T12:00:00')
  const hoyKey = '2027-06-15'

  function toDisplay(e: EventoParaAtajo & { id: string }): DisplayEvent {
    return {
      id: e.id,
      slug: e.id,
      title: `Evento de Prueba ${e.id}`,
      venue: 'Venue de Prueba',
      date: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Salta' }).format(new Date(e.start_date)),
      time: '',
      category: e.category ?? 'recitales',
      categoryName: e.category ?? 'recitales',
      price: 'confirmar',
      image: '/placeholder.svg',
      description: '',
      address: '',
      startDateTime: e.start_date,
      isFeatured: false,
    }
  }

  const empezoHoy = evento({ start_date: saltaWallClockToUtcISO('2027-06-15T10:00:00'), category: 'recitales' })
  const nocheDeHoy = evento({ start_date: saltaWallClockToUtcISO('2027-06-15T21:00:00'), category: 'boliches' })
  const deAyerVencido = evento({
    start_date: saltaWallClockToUtcISO('2026-06-14T21:00:00'),
    end_date: saltaWallClockToUtcISO('2026-06-14T22:00:00'),
    category: 'penas',
  })
  const mañana = evento({ start_date: saltaWallClockToUtcISO('2027-06-16T10:00:00'), category: 'ferias' })
  const dentroDeLaSemana = evento({ start_date: saltaWallClockToUtcISO('2027-06-21T10:00:00'), category: 'ferias' })
  const fueraDeLaSemana = evento({ start_date: saltaWallClockToUtcISO('2027-06-23T10:00:00'), category: 'ferias' })

  const todos = [empezoHoy, nocheDeHoy, deAyerVencido, mañana, dentroDeLaSemana, fueraDeLaSemana]
  // Mismo prefiltro que usa la home antes de armar displayData: solo lo vigente.
  const vigentes = todos.filter((e) => isVigente(e, ahora))

  const allDisplayEvents = vigentes.map(toDisplay)
  const todayDisplayEvents = vigentes.filter((e) => toDisplay(e).date === hoyKey).map(toDisplay)

  it('"hoy": mismos ids que eventoEnAtajo', () => {
    const atajoIds = vigentes.filter((e) => eventoEnAtajo(e, 'hoy', ahora)).map((e) => e.id).sort()
    const webIds = filterEvents(allDisplayEvents, todayDisplayEvents, hoyKey, '', '', '', null, 'hoy', null, true)
      .map((e) => e.id)
      .sort()
    expect(webIds).toEqual(atajoIds)
    // Y no está vacío: el caso realmente ejercita algo.
    expect(atajoIds.length).toBeGreaterThan(0)
  })

  it('"semana": mismos ids que eventoEnAtajo', () => {
    const atajoIds = vigentes.filter((e) => eventoEnAtajo(e, 'semana', ahora)).map((e) => e.id).sort()
    const webIds = filterEvents(allDisplayEvents, todayDisplayEvents, hoyKey, '', '', '', null, 'semana', null, true)
      .map((e) => e.id)
      .sort()
    expect(webIds).toEqual(atajoIds)
    expect(atajoIds.length).toBeGreaterThan(0)
  })
})
