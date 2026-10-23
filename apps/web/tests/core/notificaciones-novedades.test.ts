/**
 * `notificaciones/novedades.ts` (R41, 41-a): la ventana por usuario
 * (`inicioVentanaNovedades`) y el cruce de eventos nuevos con lo que cada
 * usuario sigue (`novedadesDeUsuario`). Fixtures inventadas y evidentes, en
 * hora de Salta (`saltaWallClockToDate`/`saltaWallClockToUtcISO`), sin red
 * ni base.
 *
 * Casos pedidos por Mauro (`ops/rondas/41-push-app/tareas/41-a-novedades-core.md`):
 * sin corridas, una corrida vieja (más de 24h), la ingesta de la madrugada
 * (corridas en silencio salteadas) con y sin silencio para el usuario, una
 * corrida con `hasta` igual o posterior a `ahora`, y un `hasta` corrupto que
 * no tiene que tirar `RangeError`; para el cruce, coincidencia por
 * categoría/lugar/cuenta de Instagram, un evento que coincide por dos
 * caminos y sale una sola vez, los bordes de `desde`/`ahora`, `created_at`
 * nulo o que no parsea, un evento que no coincide con nada, y que `momento`
 * sea siempre `ahora`.
 */
import { describe, expect, it } from 'vitest'
import {
  inicioVentanaNovedades,
  novedadesDeUsuario,
  VENTANA_MAXIMA_NOVEDADES_HORAS,
  type EventoParaNovedades,
  type SigueParaNovedades,
} from '@qps/core/notificaciones/novedades'
import { saltaWallClockToDate, saltaWallClockToUtcISO } from '@qps/core/date-format'
import { PREFERENCIAS_POR_DEFECTO, type PreferenciasNotificacion } from '@qps/core/notificaciones/preferencias'

const salta = (wallClock: string) => saltaWallClockToDate(wallClock)
const hasta = (wallClock: string) => saltaWallClockToUtcISO(wallClock)

function prefs(overrides: Partial<PreferenciasNotificacion> = {}): PreferenciasNotificacion {
  return { ...PREFERENCIAS_POR_DEFECTO, ...overrides }
}

let autoId = 0
function uuid(): string {
  autoId += 1
  const hex = autoId.toString(16).padStart(12, '0')
  return `00000000-0000-0000-0000-${hex}`
}

function evento(overrides: Partial<EventoParaNovedades> = {}): EventoParaNovedades {
  return {
    id: uuid(),
    title: 'Evento de Prueba',
    created_at: saltaWallClockToUtcISO('2026-10-20T10:00:00'),
    category_id: null,
    venue_id: null,
    instagramAccountIds: [],
    ...overrides,
  }
}

function sigue(overrides: Partial<SigueParaNovedades> = {}): SigueParaNovedades {
  return { categoryIds: [], venueIds: [], instagramAccountIds: [], ...overrides }
}

describe('inicioVentanaNovedades', () => {
  it('VENTANA_MAXIMA_NOVEDADES_HORAS es 24', () => {
    expect(VENTANA_MAXIMA_NOVEDADES_HORAS).toBe(24)
  })

  it('sin corridas: devuelve ahora - 24h', () => {
    const ahora = salta('2026-10-20T15:00:00')
    const resultado = inicioVentanaNovedades({ corridasOk: [], preferencias: null, ahora })
    expect(resultado.toISOString()).toBe(new Date(ahora.getTime() - 24 * 60 * 60 * 1000).toISOString())
  })

  it('una corrida de hace 30h (más vieja que la ventana máxima): devuelve ahora - 24h', () => {
    const ahora = salta('2026-10-20T15:00:00')
    const corridasOk = [{ hasta: hasta('2026-10-19T09:00:00') }] // 30h antes de `ahora`
    const resultado = inicioVentanaNovedades({ corridasOk, preferencias: null, ahora })
    expect(resultado.toISOString()).toBe(new Date(ahora.getTime() - 24 * 60 * 60 * 1000).toISOString())
  })

  it('la ingesta de la madrugada: salta las corridas en silencio (23:00-09:00) y devuelve la última sin silencio (22:05 del día anterior)', () => {
    const ahora = salta('2026-10-20T09:05:00')
    const corridasOk = [
      { hasta: hasta('2026-10-19T22:05:00') }, // fuera de silencio (antes de las 23:00)
      { hasta: hasta('2026-10-20T04:05:00') }, // en silencio
      { hasta: hasta('2026-10-20T05:05:00') }, // en silencio
      { hasta: hasta('2026-10-20T06:05:00') }, // en silencio
      { hasta: hasta('2026-10-20T07:05:00') }, // en silencio
      { hasta: hasta('2026-10-20T08:05:00') }, // en silencio (todavía antes de las 09:00)
    ]
    const resultado = inicioVentanaNovedades({ corridasOk, preferencias: null, ahora }) // null: usa PREFERENCIAS_POR_DEFECTO (silencio 23:00-09:00)
    expect(resultado.toISOString()).toBe(hasta('2026-10-19T22:05:00'))
  })

  it('la misma lista, para un usuario sin silencio: devuelve la más reciente de todas, las 08:05', () => {
    const ahora = salta('2026-10-20T09:05:00')
    const corridasOk = [
      { hasta: hasta('2026-10-19T22:05:00') },
      { hasta: hasta('2026-10-20T04:05:00') },
      { hasta: hasta('2026-10-20T05:05:00') },
      { hasta: hasta('2026-10-20T06:05:00') },
      { hasta: hasta('2026-10-20T07:05:00') },
      { hasta: hasta('2026-10-20T08:05:00') },
    ]
    const resultado = inicioVentanaNovedades({
      corridasOk,
      preferencias: prefs({ quiet_start: '03:00', quiet_end: '03:01' }), // ventana de silencio angosta: ninguna corrida cae adentro
      ahora,
    })
    expect(resultado.toISOString()).toBe(hasta('2026-10-20T08:05:00'))
  })

  it('una corrida con `hasta` igual a `ahora`, o posterior, se ignora (cae al fallback)', () => {
    const ahora = salta('2026-10-20T15:00:00')
    const corridasOk = [
      { hasta: ahora.toISOString() }, // igual a `ahora`
      { hasta: new Date(ahora.getTime() + 60 * 60 * 1000).toISOString() }, // posterior a `ahora`
    ]
    const resultado = inicioVentanaNovedades({ corridasOk, preferencias: null, ahora })
    expect(resultado.toISOString()).toBe(new Date(ahora.getTime() - 24 * 60 * 60 * 1000).toISOString())
  })

  it('un `hasta` corrupto (no parsea como fecha) se descarta sin tirar RangeError, y no tapa a las corridas válidas', () => {
    const ahora = salta('2026-10-20T15:00:00')
    const corridasOk = [{ hasta: 'esto-no-es-una-fecha' }, { hasta: hasta('2026-10-20T10:00:00') }]
    expect(() => inicioVentanaNovedades({ corridasOk, preferencias: null, ahora })).not.toThrow()
    const resultado = inicioVentanaNovedades({ corridasOk, preferencias: null, ahora })
    expect(resultado.toISOString()).toBe(hasta('2026-10-20T10:00:00'))
  })
})

describe('novedadesDeUsuario', () => {
  const desde = salta('2026-10-20T08:00:00')
  const ahora = salta('2026-10-20T12:00:00')

  it('coincide por categoría', () => {
    const categoriaId = uuid()
    const unEvento = evento({ category_id: categoriaId })
    const resultado = novedadesDeUsuario({
      eventos: [unEvento],
      sigue: sigue({ categoryIds: [categoriaId] }),
      desde,
      ahora,
    })
    expect(resultado.map((n) => n.id)).toEqual([unEvento.id])
  })

  it('coincide por lugar', () => {
    const venueId = uuid()
    const unEvento = evento({ venue_id: venueId })
    const resultado = novedadesDeUsuario({
      eventos: [unEvento],
      sigue: sigue({ venueIds: [venueId] }),
      desde,
      ahora,
    })
    expect(resultado.map((n) => n.id)).toEqual([unEvento.id])
  })

  it('coincide por cuenta de Instagram', () => {
    const cuentaId = uuid()
    const unEvento = evento({ instagramAccountIds: [cuentaId] })
    const resultado = novedadesDeUsuario({
      eventos: [unEvento],
      sigue: sigue({ instagramAccountIds: [cuentaId] }),
      desde,
      ahora,
    })
    expect(resultado.map((n) => n.id)).toEqual([unEvento.id])
  })

  it('un evento que coincide por dos caminos (categoría Y lugar) sale una sola vez', () => {
    const categoriaId = uuid()
    const venueId = uuid()
    const unEvento = evento({ category_id: categoriaId, venue_id: venueId })
    const resultado = novedadesDeUsuario({
      eventos: [unEvento],
      sigue: sigue({ categoryIds: [categoriaId], venueIds: [venueId] }),
      desde,
      ahora,
    })
    expect(resultado).toHaveLength(1)
  })

  it('un evento que no coincide con nada no entra', () => {
    const unEvento = evento()
    const resultado = novedadesDeUsuario({
      eventos: [unEvento],
      sigue: sigue({ categoryIds: [uuid()], venueIds: [uuid()], instagramAccountIds: [uuid()] }),
      desde,
      ahora,
    })
    expect(resultado).toHaveLength(0)
  })

  it('created_at igual a `desde` no entra; created_at igual a `ahora` sí', () => {
    const categoriaId = uuid()
    const enElBordeDesde = evento({ category_id: categoriaId, created_at: desde })
    const enElBordeAhora = evento({ category_id: categoriaId, created_at: ahora })
    const resultado = novedadesDeUsuario({
      eventos: [enElBordeDesde, enElBordeAhora],
      sigue: sigue({ categoryIds: [categoriaId] }),
      desde,
      ahora,
    })
    expect(resultado.map((n) => n.id)).toEqual([enElBordeAhora.id])
  })

  it('created_at nulo no entra', () => {
    const categoriaId = uuid()
    const unEvento = evento({ category_id: categoriaId, created_at: null })
    const resultado = novedadesDeUsuario({
      eventos: [unEvento],
      sigue: sigue({ categoryIds: [categoriaId] }),
      desde,
      ahora,
    })
    expect(resultado).toHaveLength(0)
  })

  it('created_at que no parsea no entra (validado de forma explícita, no por casualidad del NaN)', () => {
    const categoriaId = uuid()
    const unEvento = evento({ category_id: categoriaId, created_at: 'esto-no-es-una-fecha' })
    const resultado = novedadesDeUsuario({
      eventos: [unEvento],
      sigue: sigue({ categoryIds: [categoriaId] }),
      desde,
      ahora,
    })
    expect(resultado).toHaveLength(0)
  })

  it('`momento` de cada novedad es `ahora`, no su `created_at`', () => {
    const categoriaId = uuid()
    const unEvento = evento({ category_id: categoriaId, created_at: salta('2026-10-20T09:00:00') })
    const resultado = novedadesDeUsuario({
      eventos: [unEvento],
      sigue: sigue({ categoryIds: [categoriaId] }),
      desde,
      ahora,
    })
    expect(resultado[0].momento).toBe(ahora)
  })

  it('devuelve en orden de created_at, más viejo primero', () => {
    const categoriaId = uuid()
    const masNuevo = evento({ category_id: categoriaId, created_at: salta('2026-10-20T11:00:00') })
    const masViejo = evento({ category_id: categoriaId, created_at: salta('2026-10-20T09:00:00') })
    const resultado = novedadesDeUsuario({
      eventos: [masNuevo, masViejo],
      sigue: sigue({ categoryIds: [categoriaId] }),
      desde,
      ahora,
    })
    expect(resultado.map((n) => n.id)).toEqual([masViejo.id, masNuevo.id])
  })

  it('`eventId` es el mismo `id` del evento', () => {
    const categoriaId = uuid()
    const unEvento = evento({ category_id: categoriaId })
    const resultado = novedadesDeUsuario({
      eventos: [unEvento],
      sigue: sigue({ categoryIds: [categoriaId] }),
      desde,
      ahora,
    })
    expect(resultado[0].eventId).toBe(unEvento.id)
    expect(resultado[0].title).toBe(unEvento.title)
  })
})
