/**
 * `mapa/pines.ts` (R54): el filtro de `/mapa` (`parsearFiltroMapa`,
 * `ventanaDeFiltroMapa`, `eventoEnFiltroMapa`), `aCoordenada` y
 * `armarPinesDelMapa`/`pinesAGeoJson`. Fixtures inventadas, `ahora` fijo en
 * hora de Salta (`saltaWallClockToDate`/`saltaWallClockToUtcISO`), sin red ni
 * base.
 *
 * Referencia de días: 2026-10-08 es jueves, 2026-10-09 viernes, 2026-10-10
 * sábado y 2026-10-11 domingo (mismo finde que usa `atajos.test.ts`, que fija
 * el 10/10/2026 como sábado).
 */
import { describe, expect, it } from 'vitest'
import { saltaWallClockToDate, saltaWallClockToUtcISO } from '@qps/core/date-format'
import { ventanaDeAtajo } from '@qps/core/home/atajos'
import {
  aCoordenada,
  armarPinesDelMapa,
  DIAS_MAXIMOS_FECHA_MAPA,
  eventoEnFiltroMapa,
  parsearFiltroMapa,
  pinesAGeoJson,
  ventanaDeFiltroMapa,
  type EventoParaMapa,
  type PinLugar,
  type VenueParaMapa,
} from '@qps/core/mapa/pines'

const salta = (wallClock: string) => saltaWallClockToDate(wallClock)

let autoVenueId = 0
function venue(overrides: Partial<VenueParaMapa> = {}): VenueParaMapa {
  autoVenueId += 1
  return {
    id: `venue-de-prueba-${autoVenueId}`,
    name: `Lugar de Prueba ${autoVenueId}`,
    address: `Dirección de Prueba ${autoVenueId}`,
    latitude: -24.78, // adentro de ZONA_SALTA
    longitude: -65.41,
    ...overrides,
  }
}

let autoEventoId = 0
function evento(overrides: Partial<EventoParaMapa> = {}): EventoParaMapa {
  autoEventoId += 1
  return {
    id: `evento-de-prueba-${autoEventoId}`,
    title: `Evento de Prueba ${autoEventoId}`,
    start_date: saltaWallClockToUtcISO('2026-10-08T21:00:00'),
    category: { slug: 'recitales' },
    venue: venue(),
    ...overrides,
  }
}

describe('parsearFiltroMapa', () => {
  const ahora = salta('2026-10-08T15:00:00') // jueves 15:00 de Salta

  it('sin parámetros: hoy (el valor por defecto)', () => {
    expect(parsearFiltroMapa({}, ahora)).toEqual({ tipo: 'hoy' })
  })

  it('cuando=hoy explícito: hoy', () => {
    expect(parsearFiltroMapa({ cuando: 'hoy' }, ahora)).toEqual({ tipo: 'hoy' })
  })

  it('cuando=finde', () => {
    expect(parsearFiltroMapa({ cuando: 'finde' }, ahora)).toEqual({ tipo: 'finde' })
  })

  it('cuando=fecha con un día real dentro del rango', () => {
    expect(parsearFiltroMapa({ cuando: 'fecha', dia: '2026-10-20' }, ahora)).toEqual({
      tipo: 'fecha',
      dia: '2026-10-20',
    })
  })

  it('cuando=fecha sin día: hoy', () => {
    expect(parsearFiltroMapa({ cuando: 'fecha' }, ahora)).toEqual({ tipo: 'hoy' })
  })

  it('2026-02-31 no es una fecha real del calendario (febrero no tiene 31 días): hoy', () => {
    expect(parsearFiltroMapa({ cuando: 'fecha', dia: '2026-02-31' }, ahora)).toEqual({ tipo: 'hoy' })
  })

  it('2026-13-01 no tiene un mes real: hoy', () => {
    expect(parsearFiltroMapa({ cuando: 'fecha', dia: '2026-13-01' }, ahora)).toEqual({ tipo: 'hoy' })
  })

  it('"ayer" (no tiene la forma AAAA-MM-DD): hoy', () => {
    expect(parsearFiltroMapa({ cuando: 'fecha', dia: 'ayer' }, ahora)).toEqual({ tipo: 'hoy' })
  })

  it(`hoy + ${DIAS_MAXIMOS_FECHA_MAPA} días (el borde, inclusive): fecha`, () => {
    expect(parsearFiltroMapa({ cuando: 'fecha', dia: '2026-12-07' }, ahora)).toEqual({
      tipo: 'fecha',
      dia: '2026-12-07',
    })
  })

  it(`hoy + ${DIAS_MAXIMOS_FECHA_MAPA + 1} días (un día pasado del borde): hoy`, () => {
    expect(parsearFiltroMapa({ cuando: 'fecha', dia: '2026-12-08' }, ahora)).toEqual({ tipo: 'hoy' })
  })

  it('texto suelto en "cuando" (ni finde ni fecha): hoy', () => {
    expect(parsearFiltroMapa({ cuando: 'mañana' }, ahora)).toEqual({ tipo: 'hoy' })
  })
})

describe('ventanaDeFiltroMapa', () => {
  const ahora = salta('2026-10-08T15:00:00') // jueves 15:00 de Salta, antes del finde

  it('"finde": la ventana es la misma que ventanaDeAtajo, arranca el viernes 19:00 de Salta', () => {
    const { desde, hasta } = ventanaDeFiltroMapa({ tipo: 'finde' }, ahora)
    const esperado = ventanaDeAtajo('finde', ahora)
    expect(desde.toISOString()).toBe(esperado.desde.toISOString())
    expect(hasta.toISOString()).toBe(esperado.hasta.toISOString())
    expect(desde.toISOString()).toBe(saltaWallClockToUtcISO('2026-10-09T19:00:00'))
    expect(hasta.toISOString()).toBe(saltaWallClockToUtcISO('2026-10-11T23:59:59.999'))
  })

  it('"fecha": cubre el día entero de Salta (00:00 a 23:59:59.999)', () => {
    const { desde, hasta } = ventanaDeFiltroMapa({ tipo: 'fecha', dia: '2026-10-10' }, ahora)
    expect(desde.toISOString()).toBe(saltaWallClockToUtcISO('2026-10-10T00:00:00'))
    expect(hasta.toISOString()).toBe(saltaWallClockToUtcISO('2026-10-10T23:59:59.999'))
  })

  it('un evento a las 23:30 de Salta (día siguiente en UTC) cae en el día de Salta, no en el de UTC', () => {
    const filtro = { tipo: 'fecha' as const, dia: '2026-10-10' }
    const nocturno = evento({ start_date: saltaWallClockToUtcISO('2026-10-10T23:30:00') })
    // En UTC esto es 2026-10-11T02:30:00Z: si el filtro usara el día UTC, no caería en "2026-10-10".
    expect(nocturno.start_date.startsWith('2026-10-11')).toBe(true)
    expect(eventoEnFiltroMapa(nocturno, filtro, ahora)).toBe(true)
  })
})

describe("eventoEnFiltroMapa con tipo: 'fecha' y eventos de varios días", () => {
  const ahora = salta('2026-10-08T15:00:00') // jueves 15:00 de Salta

  it('un evento de varios días que empezó antes del día consultado aparece ese día', () => {
    const filtro = { tipo: 'fecha' as const, dia: '2026-10-20' }
    const deVariosDias = evento({
      start_date: saltaWallClockToUtcISO('2026-10-19T20:00:00'),
      end_date: saltaWallClockToUtcISO('2026-10-21T02:00:00'),
    })
    expect(eventoEnFiltroMapa(deVariosDias, filtro, ahora)).toBe(true)
  })

  it('el mismo evento, pero que terminó antes de ese día: no aparece', () => {
    const filtro = { tipo: 'fecha' as const, dia: '2026-10-20' }
    const queYaTermino = evento({
      start_date: saltaWallClockToUtcISO('2026-10-18T20:00:00'),
      end_date: saltaWallClockToUtcISO('2026-10-19T23:00:00'),
    })
    // Sigue vigente respecto de "ahora" (su fin es futuro para el jueves
    // 08/10): lo único que lo saca es la comparación contra el principio de
    // la ventana del día pedido, no isVigente.
    expect(eventoEnFiltroMapa(queYaTermino, filtro, ahora)).toBe(false)
  })

  it('un evento que ya terminó hoy no aparece en el "hoy" por fecha, aunque su inicio caiga adentro de la ventana del día', () => {
    const filtro = { tipo: 'fecha' as const, dia: '2026-10-08' }
    // Hora explícita: su fin estimado es a las 13:00, antes de "ahora" (15:00).
    const yaTerminoHoy = evento({ start_date: saltaWallClockToUtcISO('2026-10-08T09:00:00') })
    expect(eventoEnFiltroMapa(yaTerminoHoy, filtro, ahora)).toBe(false)
  })
})

describe("eventoEnFiltroMapa con 'hoy' y 'finde': lo que empezó antes y sigue en curso", () => {
  const ahora = salta('2026-10-10T15:00:00') // sábado 15:00 de Salta
  const hoy = { tipo: 'hoy' as const }
  const finde = { tipo: 'finde' as const }
  const deHoy = { tipo: 'fecha' as const, dia: '2026-10-10' }

  it('un festival que empezó anteayer y termina mañana está en "Hoy" y en "fecha de hoy"', () => {
    const festival = evento({
      start_date: saltaWallClockToUtcISO('2026-10-08T20:00:00'),
      end_date: saltaWallClockToUtcISO('2026-10-11T02:00:00'),
    })
    expect(eventoEnFiltroMapa(festival, hoy, ahora)).toBe(true)
    expect(eventoEnFiltroMapa(festival, deHoy, ahora)).toBe(true)
  })

  it('uno que empezó el jueves y termina el domingo está en "Este finde" (con ahora un sábado)', () => {
    const festival = evento({
      start_date: saltaWallClockToUtcISO('2026-10-08T20:00:00'),
      end_date: saltaWallClockToUtcISO('2026-10-11T23:00:00'),
    })
    expect(eventoEnFiltroMapa(festival, finde, ahora)).toBe(true)
  })

  it('uno que terminó ayer no está en "Hoy" ni en "Este finde"', () => {
    const terminado = evento({
      start_date: saltaWallClockToUtcISO('2026-10-08T20:00:00'),
      end_date: saltaWallClockToUtcISO('2026-10-09T23:00:00'),
    })
    expect(eventoEnFiltroMapa(terminado, hoy, ahora)).toBe(false)
    expect(eventoEnFiltroMapa(terminado, finde, ahora)).toBe(false)
  })

  it('uno de mañana no está en "Hoy"', () => {
    const manana = evento({ start_date: saltaWallClockToUtcISO('2026-10-11T21:00:00') })
    expect(eventoEnFiltroMapa(manana, hoy, ahora)).toBe(false)
  })

  it('uno sin end_date de ayer a la noche, ya vencido, no está en "Hoy"', () => {
    const deAyer = evento({ start_date: saltaWallClockToUtcISO('2026-10-09T22:00:00') })
    expect(eventoEnFiltroMapa(deAyer, hoy, ahora)).toBe(false)
  })
})

describe('aCoordenada', () => {
  it('número finito: se devuelve tal cual', () => {
    expect(aCoordenada(-24.78)).toBe(-24.78)
  })

  it('string numérico: se convierte', () => {
    expect(aCoordenada('-24.78')).toBe(-24.78)
  })

  it('null, undefined, string vacío, "abc", NaN e Infinity: null', () => {
    expect(aCoordenada(null)).toBeNull()
    expect(aCoordenada(undefined)).toBeNull()
    expect(aCoordenada('')).toBeNull()
    expect(aCoordenada('abc')).toBeNull()
    expect(aCoordenada(Number.NaN)).toBeNull()
    expect(aCoordenada(Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('un string vacío no es la coordenada 0 (Number(\'\') da 0, pero acá tiene que dar null)', () => {
    expect(aCoordenada('')).not.toBe(0)
    expect(aCoordenada('')).toBeNull()
  })
})

describe('armarPinesDelMapa', () => {
  const ahora = salta('2026-10-08T15:00:00') // jueves 15:00 de Salta

  it('dos eventos del mismo lugar: un pin con los dos eventos, ordenados por inicio', () => {
    const lugar = venue()
    const tarde = evento({ venue: lugar, start_date: saltaWallClockToUtcISO('2026-10-08T22:00:00') })
    const temprano = evento({ venue: lugar, start_date: saltaWallClockToUtcISO('2026-10-08T18:00:00') })

    const { pines, sinUbicacion } = armarPinesDelMapa([tarde, temprano], { tipo: 'hoy' }, ahora)

    expect(pines).toHaveLength(1)
    expect(pines[0].venueId).toBe(lugar.id)
    expect(pines[0].eventos.map((e) => e.id)).toEqual([temprano.id, tarde.id])
    expect(sinUbicacion).toBe(0)
  })

  it('un lugar sin coordenadas, uno en (0, 0), uno en Buenos Aires y uno con las coordenadas invertidas: sin pin, todos suman a sinUbicacion', () => {
    const sinCoordenadas = evento({ venue: venue({ latitude: null, longitude: -65.41 }) })
    const enElOrigen = evento({ venue: venue({ latitude: 0, longitude: 0 }) })
    const buenosAires = evento({ venue: venue({ latitude: -34.6037, longitude: -58.3816 }) })
    // Las coordenadas de Salta capital, pero lat/lng invertidas: cae lejísimos de la zona.
    const invertidas = evento({ venue: venue({ latitude: -65.41, longitude: -24.78 }) })

    const { pines, sinUbicacion } = armarPinesDelMapa(
      [sinCoordenadas, enElOrigen, buenosAires, invertidas],
      { tipo: 'hoy' },
      ahora
    )

    expect(pines).toHaveLength(0)
    expect(sinUbicacion).toBe(4)
  })

  it('latitude/longitude como texto ("-24.78"/"-65.41"): tiene pin', () => {
    const conTexto = evento({ venue: venue({ latitude: '-24.78', longitude: '-65.41' }) })

    const { pines, sinUbicacion } = armarPinesDelMapa([conTexto], { tipo: 'hoy' }, ahora)

    expect(pines).toHaveLength(1)
    expect(pines[0].lat).toBe(-24.78)
    expect(pines[0].lng).toBe(-65.41)
    expect(sinUbicacion).toBe(0)
  })

  it('un evento de mañana (viernes) no entra en "hoy" (jueves)', () => {
    const deManana = evento({ start_date: saltaWallClockToUtcISO('2026-10-09T21:00:00') })

    const { pines, sinUbicacion } = armarPinesDelMapa([deManana], { tipo: 'hoy' }, ahora)

    expect(pines).toHaveLength(0)
    // No entra en el filtro: no cuenta como "sin ubicación" (su lugar sí tiene coordenadas).
    expect(sinUbicacion).toBe(0)
  })

  it('un evento del sábado entra en "finde"', () => {
    const delSabado = evento({ start_date: saltaWallClockToUtcISO('2026-10-10T21:00:00') })

    const { pines } = armarPinesDelMapa([delSabado], { tipo: 'finde' }, ahora)

    expect(pines).toHaveLength(1)
    expect(pines[0].eventos[0].id).toBe(delSabado.id)
  })

  it('un evento sin venue: suma a sinUbicacion', () => {
    const sinLugar = evento({ venue: null })

    const { pines, sinUbicacion } = armarPinesDelMapa([sinLugar], { tipo: 'hoy' }, ahora)

    expect(pines).toHaveLength(0)
    expect(sinUbicacion).toBe(1)
  })

  it('el mismo id dos veces: cuenta una sola vez', () => {
    const lugar = venue()
    const original = evento({ venue: lugar })
    const repetido: EventoParaMapa = { ...original }

    const { pines } = armarPinesDelMapa([original, repetido], { tipo: 'hoy' }, ahora)

    expect(pines).toHaveLength(1)
    expect(pines[0].eventos).toHaveLength(1)
  })

  it('orden estable: los pines salen por el inicio de su primer evento y, si empatan, por nombre (no importa el orden de entrada)', () => {
    const lugarBeta = venue({ name: 'Bar Beta' })
    const lugarAlfa = venue({ name: 'Auditorio Alfa' })
    const lugarGamma = venue({ name: 'Club Gamma' })
    const eventoBeta = evento({ venue: lugarBeta, start_date: saltaWallClockToUtcISO('2026-10-08T19:00:00') })
    const eventoAlfa = evento({ venue: lugarAlfa, start_date: saltaWallClockToUtcISO('2026-10-08T17:00:00') })
    const eventoGamma = evento({ venue: lugarGamma, start_date: saltaWallClockToUtcISO('2026-10-08T17:00:00') })

    // A propósito en un orden que no es el esperado en la salida.
    const { pines } = armarPinesDelMapa([eventoBeta, eventoGamma, eventoAlfa], { tipo: 'hoy' }, ahora)

    expect(pines.map((p) => p.venueId)).toEqual([lugarAlfa.id, lugarGamma.id, lugarBeta.id])
  })

  it('un evento de varios días que empezó antes del día consultado tiene pin en el filtro de esa fecha', () => {
    const deVariosDias = evento({
      start_date: saltaWallClockToUtcISO('2026-10-19T20:00:00'),
      end_date: saltaWallClockToUtcISO('2026-10-21T02:00:00'),
    })

    const { pines, sinUbicacion } = armarPinesDelMapa(
      [deVariosDias],
      { tipo: 'fecha', dia: '2026-10-20' },
      ahora
    )

    expect(pines).toHaveLength(1)
    expect(pines[0].eventos[0].id).toBe(deVariosDias.id)
    expect(sinUbicacion).toBe(0)
  })

  it('orden estable: si dos pines empatan en el primer inicio y en el nombre, desempata por venueId', () => {
    const lugar1 = venue({ id: 'venue-z-mismo-nombre', name: 'Mismo Nombre' })
    const lugar2 = venue({ id: 'venue-a-mismo-nombre', name: 'Mismo Nombre' })
    const evento1 = evento({ venue: lugar1, start_date: saltaWallClockToUtcISO('2026-10-08T18:00:00') })
    const evento2 = evento({ venue: lugar2, start_date: saltaWallClockToUtcISO('2026-10-08T18:00:00') })

    const { pines } = armarPinesDelMapa([evento1, evento2], { tipo: 'hoy' }, ahora)

    expect(pines.map((p) => p.venueId)).toEqual(['venue-a-mismo-nombre', 'venue-z-mismo-nombre'])
  })
})

describe('pinesAGeoJson', () => {
  it('coordenadas en el orden de GeoJSON ([lng, lat]) y properties sin títulos ni nombres de lugares', () => {
    const pin: PinLugar = {
      venueId: 'venue-del-pin',
      nombre: 'Lugar Que No Debe Aparecer',
      direccion: 'Calle Falsa 123',
      lat: -24.78,
      lng: -65.41,
      eventos: [
        {
          id: 'evento-del-pin',
          titulo: 'Título Que Tampoco Debe Aparecer',
          inicio: saltaWallClockToUtcISO('2026-10-08T21:00:00'),
          categoria: 'recitales',
        },
      ],
    }

    const geojson = pinesAGeoJson([pin])

    expect(geojson.type).toBe('FeatureCollection')
    expect(geojson.features).toHaveLength(1)
    const [feature] = geojson.features
    expect(feature.type).toBe('Feature')
    expect(feature.geometry).toEqual({ type: 'Point', coordinates: [-65.41, -24.78] })
    expect(feature.properties).toEqual({ venueId: 'venue-del-pin', cantidad: 1 })

    const comoTexto = JSON.stringify(feature.properties)
    expect(comoTexto).not.toContain('Lugar Que No Debe Aparecer')
    expect(comoTexto).not.toContain('Título Que Tampoco Debe Aparecer')
  })

  it('un pin vacío (sin pines): FeatureCollection con cero features', () => {
    expect(pinesAGeoJson([])).toEqual({ type: 'FeatureCollection', features: [] })
  })
})
