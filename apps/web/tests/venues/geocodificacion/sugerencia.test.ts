/**
 * Q5-16 (decisión nº7 de Mauro): «si Nominatim no da un match exacto, guardar
 * la mejor sugerencia y mostrarla en el admin con botón «Confirmar». Ya no se
 * reintenta a ciegas a los 30 días.»
 *
 * Acá: las columnas de la sugerencia (`lib/venues/geocodificacion/sugerencia.ts`),
 * cuándo `geocodificarLugares` la guarda (solo `'para-revisar'` y solo con
 * `apply`), y que la corrida programada (`sinIntentoReciente`) no vuelve a
 * consultar un lugar con sugerencia pendiente. Las server actions del admin
 * están en `tests/admin/lugares-sugerencia.test.ts`; que el script limpie la
 * sugerencia al guardar con confianza alta lo fija `script.test.ts`.
 *
 * Sin red ni base: cliente de Nominatim y guardados son dobles.
 */
import { describe, expect, it, vi } from 'vitest'
import type { ResultadoBusqueda, ResultadoNominatim } from '@/lib/venues/geocodificacion/nominatim'
import { geocodificarLugares, type VenueParaGeocodificar } from '@/lib/venues/geocodificacion/plan'
import { DIAS_ENTRE_INTENTOS, sinIntentoReciente } from '@/lib/venues/geocodificacion/programado'
import {
  MAX_TEXTO_SUGERENCIA,
  columnasDeSugerencia,
  sugerenciaVacia,
  textoDeSugerencia,
  tieneSugerencia,
} from '@/lib/venues/geocodificacion/sugerencia'

const AHORA = new Date('2026-11-03T09:30:00Z')

function resultado(overrides: Partial<ResultadoNominatim> = {}): ResultadoNominatim {
  return {
    lat: -24.79,
    lon: -65.42,
    display_name: 'Peña de Fantasía, Calle Inventada, Salta, Argentina',
    place_rank: 30,
    importance: 0.7,
    category: 'amenity',
    type: 'bar',
    ...overrides,
  }
}

/** Un solo resultado claro en Salta: confianza alta. */
const OK_ALTA: ResultadoBusqueda = { tipo: 'ok', resultados: [resultado()] }

/** Dos resultados a ~2 km con importancias parecidas: confianza «revisar» (mismo caso que politica.test.ts). */
const OK_REVISAR: ResultadoBusqueda = {
  tipo: 'ok',
  resultados: [
    resultado({ lat: -24.7883, lon: -65.4106, importance: 0.5, display_name: 'Primera opción, Salta, Argentina' }),
    resultado({ lat: -24.806, lon: -65.4106, importance: 0.5, display_name: 'Segunda opción, Salta, Argentina' }),
  ],
}

const OK_VACIO: ResultadoBusqueda = { tipo: 'ok', resultados: [] }

function venue(overrides: Partial<VenueParaGeocodificar> = {}): VenueParaGeocodificar {
  return {
    id: 'venue-1',
    name: 'Peña de Fantasía',
    address: null,
    canonical_venue_id: null,
    merged_at: null,
    is_placeholder: false,
    latitude: null,
    longitude: null,
    geocode_source: null,
    ...overrides,
  }
}

function cacheSinOp() {
  return { obtener: () => undefined, guardar: () => {} }
}

function clienteQueDevuelve(respuesta: ResultadoBusqueda) {
  return { buscar: vi.fn(async () => respuesta) }
}

describe('textoDeSugerencia / columnasDeSugerencia', () => {
  it('recorta el display_name a 300 caracteres (por punto de código, como char_length de Postgres)', () => {
    const largo = '🎸'.repeat(400)
    const texto = textoDeSugerencia(largo)!
    expect(Array.from(texto)).toHaveLength(MAX_TEXTO_SUGERENCIA)
    expect(MAX_TEXTO_SUGERENCIA).toBe(300)
    expect(texto.endsWith('…')).toBe(true)
  })

  it('un texto corto queda igual (sin espacios de más); vacío o ausente da null', () => {
    expect(textoDeSugerencia('  Balcarce   123,  Salta ')).toBe('Balcarce 123, Salta')
    expect(textoDeSugerencia('')).toBeNull()
    expect(textoDeSugerencia('   ')).toBeNull()
    expect(textoDeSugerencia(null)).toBeNull()
    expect(textoDeSugerencia('a'.repeat(300))).toBe('a'.repeat(300))
  })

  it('las cuatro columnas juntas: lat, lng, texto y la hora inyectada', () => {
    expect(columnasDeSugerencia({ lat: -24.7, lon: -65.4, display_name: 'Algo, Salta' }, AHORA)).toEqual({
      geocode_sugerencia_lat: -24.7,
      geocode_sugerencia_lng: -65.4,
      geocode_sugerencia_texto: 'Algo, Salta',
      geocode_sugerencia_at: '2026-11-03T09:30:00.000Z',
    })
  })

  it('sugerenciaVacia: las cuatro en null (y un objeto nuevo cada vez)', () => {
    expect(sugerenciaVacia()).toEqual({
      geocode_sugerencia_lat: null,
      geocode_sugerencia_lng: null,
      geocode_sugerencia_texto: null,
      geocode_sugerencia_at: null,
    })
    expect(sugerenciaVacia()).not.toBe(sugerenciaVacia())
  })

  it('tieneSugerencia: hacen falta lat y lng', () => {
    expect(tieneSugerencia({ geocode_sugerencia_lat: -24.7, geocode_sugerencia_lng: -65.4 })).toBe(true)
    expect(tieneSugerencia({ geocode_sugerencia_lat: null, geocode_sugerencia_lng: null })).toBe(false)
    expect(tieneSugerencia({})).toBe(false)
  })
})

describe('geocodificarLugares: la sugerencia de un «para revisar» (Q5-16)', () => {
  it('con apply y confianza «revisar»: guarda la mejor sugerencia y NO llama a guardar (latitude/longitude no se tocan)', async () => {
    const guardar = vi.fn().mockReturnValue(true)
    const guardarSugerencia = vi.fn().mockReturnValue(true)

    const filas = await geocodificarLugares({
      lugares: [venue()],
      cliente: clienteQueDevuelve(OK_REVISAR),
      cache: cacheSinOp(),
      apply: true,
      guardar,
      guardarSugerencia,
      ahora: () => AHORA,
    })

    expect(filas).toHaveLength(1)
    expect(filas[0].estado).toBe('para-revisar')
    expect(filas[0].confianza).toBe('revisar')
    expect(guardar).not.toHaveBeenCalled()
    expect(guardarSugerencia).toHaveBeenCalledTimes(1)
    const [id, columnas] = guardarSugerencia.mock.calls[0]
    expect(id).toBe('venue-1')
    // La sugerencia es el candidato de la fila (el mismo que va al reporte).
    expect(columnas).toEqual({
      geocode_sugerencia_lat: filas[0].lat,
      geocode_sugerencia_lng: filas[0].lon,
      geocode_sugerencia_texto: filas[0].display_name,
      geocode_sugerencia_at: AHORA.toISOString(),
    })
    // Nunca lleva latitude/longitude.
    expect(Object.keys(columnas).some((k) => k === 'latitude' || k === 'longitude')).toBe(false)
  })

  it('sin apply (modo consulta): no guarda nada, ni coordenadas ni sugerencia', async () => {
    const guardar = vi.fn().mockReturnValue(true)
    const guardarSugerencia = vi.fn().mockReturnValue(true)

    const filas = await geocodificarLugares({
      lugares: [venue()],
      cliente: clienteQueDevuelve(OK_REVISAR),
      cache: cacheSinOp(),
      apply: false,
      guardar,
      guardarSugerencia,
    })

    expect(filas[0].estado).toBe('para-revisar')
    expect(guardar).not.toHaveBeenCalled()
    expect(guardarSugerencia).not.toHaveBeenCalled()
  })

  it('con confianza alta: guarda las coordenadas y no guarda sugerencia', async () => {
    const guardar = vi.fn().mockReturnValue(true)
    const guardarSugerencia = vi.fn().mockReturnValue(true)

    const filas = await geocodificarLugares({
      lugares: [venue()],
      cliente: clienteQueDevuelve(OK_ALTA),
      cache: cacheSinOp(),
      apply: true,
      guardar,
      guardarSugerencia,
    })

    expect(filas[0].estado).toBe('guardado')
    expect(guardar).toHaveBeenCalledTimes(1)
    expect(guardarSugerencia).not.toHaveBeenCalled()
  })

  it('sin resultado: no hay sugerencia que guardar', async () => {
    const guardarSugerencia = vi.fn()

    const filas = await geocodificarLugares({
      lugares: [venue()],
      cliente: clienteQueDevuelve(OK_VACIO),
      cache: cacheSinOp(),
      apply: true,
      guardar: vi.fn(),
      guardarSugerencia,
    })

    expect(filas[0].estado).toBe('sin-resultado')
    expect(guardarSugerencia).not.toHaveBeenCalled()
  })

  it('un lugar que ya tiene coordenadas (--rehacer-nominatim) no recibe sugerencia: no aparecería en «Sin ubicación»', async () => {
    const guardarSugerencia = vi.fn()

    await geocodificarLugares({
      lugares: [venue({ latitude: -24.7, longitude: -65.4, geocode_source: 'nominatim' })],
      cliente: clienteQueDevuelve(OK_REVISAR),
      cache: cacheSinOp(),
      apply: true,
      guardar: vi.fn(),
      guardarSugerencia,
    })

    expect(guardarSugerencia).not.toHaveBeenCalled()
  })

  it('sin guardarSugerencia (llamadores viejos) sigue andando igual', async () => {
    const filas = await geocodificarLugares({
      lugares: [venue()],
      cliente: clienteQueDevuelve(OK_REVISAR),
      cache: cacheSinOp(),
      apply: true,
      guardar: vi.fn(),
    })
    expect(filas[0].estado).toBe('para-revisar')
  })
})

describe('corrida programada: un lugar con sugerencia pendiente no se vuelve a consultar (Q5-16)', () => {
  const HACE_31 = '2026-10-03T09:00:00Z'
  const AYER = '2026-11-02T09:30:00Z'

  it('con sugerencia queda afuera aunque hayan pasado más de 30 días (o nunca se haya intentado)', () => {
    const lugares = [
      { id: 'sugerencia-vieja', geocode_intentado_at: HACE_31, geocode_sugerencia_lat: -24.7 },
      { id: 'sugerencia-sin-intento', geocode_intentado_at: null, geocode_sugerencia_lat: -24.7 },
      { id: 'sin-resultado-viejo', geocode_intentado_at: HACE_31, geocode_sugerencia_lat: null },
      { id: 'sin-resultado-reciente', geocode_intentado_at: AYER, geocode_sugerencia_lat: null },
      { id: 'nunca', geocode_intentado_at: null, geocode_sugerencia_lat: null },
    ]
    expect(sinIntentoReciente(lugares, AHORA).map((l) => l.id)).toEqual(['sin-resultado-viejo', 'nunca'])
  })

  it('descartada la sugerencia (columnas en null), vuelve a la regla de los 30 días', () => {
    const descartadoReciente = { id: 'a', geocode_intentado_at: AYER, ...sugerenciaVacia() }
    const descartadoViejo = { id: 'b', geocode_intentado_at: HACE_31, ...sugerenciaVacia() }
    expect(DIAS_ENTRE_INTENTOS).toBe(30)
    expect(sinIntentoReciente([descartadoReciente, descartadoViejo], AHORA).map((l) => l.id)).toEqual(['b'])
  })

  it('una fila sin la columna (la corrida manual no la lee) no queda afuera por eso', () => {
    expect(sinIntentoReciente([{ id: 'x', geocode_intentado_at: null }], AHORA)).toHaveLength(1)
  })
})
