import { describe, expect, it, vi } from 'vitest'
import { filtroDeActualizacion, geocodificarLugares, lugaresAGeocodificar, type VenueParaGeocodificar } from '@/lib/venues/geocodificacion/plan'
import type { ResultadoBusqueda } from '@/lib/venues/geocodificacion/nominatim'
import { consultasParaLugar, normalizarConsulta } from '@/lib/venues/geocodificacion/consultas'

function venue(overrides: Partial<VenueParaGeocodificar> = {}): VenueParaGeocodificar {
  return {
    id: 'id-1',
    name: 'La Casona',
    address: 'Balcarce 123',
    canonical_venue_id: null,
    merged_at: null,
    is_placeholder: false,
    latitude: null,
    longitude: null,
    geocode_source: null,
    ...overrides,
  }
}

function cacheEnMemoria() {
  const datos = new Map<string, unknown>()
  return {
    obtener: <T>(clave: string) => datos.get(clave) as T | undefined,
    guardar: <T>(clave: string, valor: T) => {
      datos.set(clave, valor)
    },
  }
}

const OK_EN_SALTA: ResultadoBusqueda = {
  tipo: 'ok',
  resultados: [
    {
      lat: -24.7883,
      lon: -65.4106,
      display_name: 'La Casona, Balcarce, Salta, Argentina',
      place_rank: 30,
      importance: 0.7,
      category: 'amenity',
      type: 'bar',
    },
  ],
}

const OK_SIN_RESULTADOS: ResultadoBusqueda = { tipo: 'ok', resultados: [] }

describe('lugaresAGeocodificar', () => {
  it('un manual nunca aparece como elegible, ni con rehacerNominatim', () => {
    const manualSinCoords = venue({ id: 'manual-raro', geocode_source: 'manual', latitude: null, longitude: null })
    const manualConCoords = venue({ id: 'manual', geocode_source: 'manual', latitude: -24.7, longitude: -65.4 })

    for (const rehacerNominatim of [false, true]) {
      const { elegibles } = lugaresAGeocodificar([manualSinCoords, manualConCoords], { rehacerNominatim })
      expect(elegibles.find((v) => v.id === 'manual')).toBeUndefined()
      expect(elegibles.find((v) => v.id === 'manual-raro')).toBeUndefined()
    }
  })

  it('sin coordenadas: elegible siempre', () => {
    const v = venue({ latitude: null, longitude: null, geocode_source: null })
    const { elegibles } = lugaresAGeocodificar([v], { rehacerNominatim: false })
    expect(elegibles).toEqual([v])
  })

  it('con coordenadas de nominatim: elegible solo con rehacerNominatim', () => {
    const v = venue({ latitude: -24.7, longitude: -65.4, geocode_source: 'nominatim' })
    expect(lugaresAGeocodificar([v], { rehacerNominatim: false }).elegibles).toEqual([])
    expect(lugaresAGeocodificar([v], { rehacerNominatim: true }).elegibles).toEqual([v])
  })

  it('no canónico (alias ya fusionado), is_placeholder: nunca elegible', () => {
    const alias = venue({ id: 'alias', canonical_venue_id: 'otro-id' })
    const fusionado = venue({ id: 'fusionado', merged_at: '2026-01-01T00:00:00Z' })
    const placeholder = venue({ id: 'placeholder', is_placeholder: true })
    const { elegibles } = lugaresAGeocodificar([alias, fusionado, placeholder], { rehacerNominatim: true })
    expect(elegibles).toEqual([])
  })

  it('con coordenadas pero sin geocode_source: va a paraRevisarPrevios, no a elegibles', () => {
    const v = venue({ latitude: -24.7, longitude: -65.4, geocode_source: null })
    const { elegibles, paraRevisarPrevios } = lugaresAGeocodificar([v], { rehacerNominatim: false })
    expect(elegibles).toEqual([])
    expect(paraRevisarPrevios).toEqual([v])
  })

  it('un is_placeholder y un alias ya fusionado (merged_at), con coordenadas y sin origen, no van a paraRevisarPrevios', () => {
    const placeholder = venue({ id: 'placeholder', is_placeholder: true, latitude: -24.7, longitude: -65.4, geocode_source: null })
    const fusionado = venue({
      id: 'fusionado',
      merged_at: '2026-01-01T00:00:00Z',
      latitude: -24.7,
      longitude: -65.4,
      geocode_source: null,
    })
    const { paraRevisarPrevios } = lugaresAGeocodificar([placeholder, fusionado], { rehacerNominatim: false })
    expect(paraRevisarPrevios).toEqual([])
  })
})

describe('filtroDeActualizacion', () => {
  it('sin rehacerNominatim: latitudNula true', () => {
    expect(filtroDeActualizacion({ rehacerNominatim: false })).toEqual({
      or: 'geocode_source.is.null,geocode_source.eq.nominatim',
      latitudNula: true,
    })
  })

  it('con rehacerNominatim: latitudNula false', () => {
    expect(filtroDeActualizacion({ rehacerNominatim: true })).toEqual({
      or: 'geocode_source.is.null,geocode_source.eq.nominatim',
      latitudNula: false,
    })
  })
})

describe('geocodificarLugares', () => {
  it('apply: false nunca llama a guardar, aunque la confianza sea alta', async () => {
    const cliente = { buscar: vi.fn().mockResolvedValue(OK_EN_SALTA) }
    const guardar = vi.fn()
    const filas = await geocodificarLugares({
      lugares: [venue()],
      cliente,
      cache: cacheEnMemoria(),
      apply: false,
      guardar,
    })

    expect(guardar).not.toHaveBeenCalled()
    expect(filas).toHaveLength(1)
    expect(filas[0].estado).toBe('para-revisar')
    expect(filas[0].confianza).toBe('alta')
  })

  it('apply: true y confianza alta: llama a guardar y el estado queda guardado', async () => {
    const cliente = { buscar: vi.fn().mockResolvedValue(OK_EN_SALTA) }
    const guardar = vi.fn().mockResolvedValue(true)
    const filas = await geocodificarLugares({
      lugares: [venue()],
      cliente,
      cache: cacheEnMemoria(),
      apply: true,
      guardar,
    })

    expect(guardar).toHaveBeenCalledWith('id-1', -24.7883, -65.4106)
    expect(filas[0].estado).toBe('guardado')
  })

  it('guardar devuelve false: no-se-pisó, con el motivo', async () => {
    const cliente = { buscar: vi.fn().mockResolvedValue(OK_EN_SALTA) }
    const guardar = vi.fn().mockResolvedValue(false)
    const filas = await geocodificarLugares({
      lugares: [venue()],
      cliente,
      cache: cacheEnMemoria(),
      apply: true,
      guardar,
    })

    expect(filas[0].estado).toBe('no-se-pisó')
    expect(filas[0].motivo).toBe('cambió mientras corría')
  })

  it('bloqueado corta toda la corrida: los lugares que faltaban no se consultan', async () => {
    const cliente = {
      buscar: vi.fn().mockResolvedValueOnce(OK_EN_SALTA).mockResolvedValueOnce({ tipo: 'bloqueado' }),
    }
    const guardar = vi.fn()
    const lugares = [venue({ id: 'uno', name: 'Uno' }), venue({ id: 'dos', name: 'Dos' }), venue({ id: 'tres', name: 'Tres' })]

    const filas = await geocodificarLugares({ lugares, cliente, cache: cacheEnMemoria(), apply: true, guardar })

    // El primer lugar se resolvió antes del bloqueo; "dos" se bloquea y corta; "tres" nunca se consulta.
    expect(filas).toHaveLength(1)
    expect(filas[0].id).toBe('uno')
    expect(cliente.buscar).toHaveBeenCalledTimes(2)
  })

  it('cache hit: no llama a cliente.buscar de nuevo para la misma consulta normalizada', async () => {
    const cliente = { buscar: vi.fn().mockResolvedValue(OK_EN_SALTA) }
    const cache = cacheEnMemoria()
    const guardar = vi.fn().mockResolvedValue(true)

    await geocodificarLugares({ lugares: [venue({ id: 'uno' })], cliente, cache, apply: true, guardar })
    await geocodificarLugares({ lugares: [venue({ id: 'uno' })], cliente, cache, apply: true, guardar })

    // La primera consulta ("nombre, dirección, Salta, Argentina") ya quedó en caché.
    expect(cliente.buscar).toHaveBeenCalledTimes(1)
  })

  it('sin resultado en ninguna consulta: sin-resultado', async () => {
    const cliente = { buscar: vi.fn().mockResolvedValue(OK_SIN_RESULTADOS) }
    const filas = await geocodificarLugares({
      lugares: [venue()],
      cliente,
      cache: cacheEnMemoria(),
      apply: true,
      guardar: vi.fn(),
    })

    expect(filas[0].estado).toBe('sin-resultado')
    expect(cliente.buscar).toHaveBeenCalledTimes(3) // las 3 consultas, ninguna con resultado en zona
  })

  it('error en la primera consulta: corta el lugar ahí (no prueba las otras 2), sigue con el próximo lugar', async () => {
    const v = venue() // 'La Casona' + 'Balcarce 123': consultasParaLugar da 3 consultas
    expect(consultasParaLugar({ nombre: v.name, direccion: v.address })).toHaveLength(3)

    const cliente = { buscar: vi.fn().mockResolvedValue({ tipo: 'error', motivo: 'HTTP 503' }) }
    const filas = await geocodificarLugares({
      lugares: [v],
      cliente,
      cache: cacheEnMemoria(),
      apply: true,
      guardar: vi.fn(),
    })

    expect(cliente.buscar).toHaveBeenCalledTimes(1) // no las 3 consultas × reintentos: corta en la primera
    expect(filas).toHaveLength(1)
    expect(filas[0].estado).toBe('error')
    expect(filas[0].motivo).toBe('HTTP 503')
  })

  it('un error no deja nada en la caché: una segunda corrida vuelve a pedir', async () => {
    const v = venue({ id: 'uno' })
    const cliente = { buscar: vi.fn().mockResolvedValue({ tipo: 'error', motivo: 'HTTP 503' }) }
    const cache = cacheEnMemoria()

    await geocodificarLugares({ lugares: [v], cliente, cache, apply: true, guardar: vi.fn() })
    await geocodificarLugares({ lugares: [v], cliente, cache, apply: true, guardar: vi.fn() })

    expect(cliente.buscar).toHaveBeenCalledTimes(2) // cada corrida vuelve a pedir: nada quedó cacheado

    const primeraConsulta = consultasParaLugar({ nombre: v.name, direccion: v.address })[0]
    expect(cache.obtener(normalizarConsulta(primeraConsulta))).toBeUndefined()
  })

  it('un bloqueado no deja nada en la caché', async () => {
    const v = venue({ id: 'uno' })
    const cliente = { buscar: vi.fn().mockResolvedValue({ tipo: 'bloqueado' }) }
    const cache = cacheEnMemoria()

    await geocodificarLugares({ lugares: [v], cliente, cache, apply: true, guardar: vi.fn() })

    const primeraConsulta = consultasParaLugar({ nombre: v.name, direccion: v.address })[0]
    expect(cache.obtener(normalizarConsulta(primeraConsulta))).toBeUndefined()
  })

  it('solo se cachea un resultado ok: un hit evita el pedido, pero un error previo no', async () => {
    const v = venue({ id: 'uno' })
    const cache = cacheEnMemoria()
    const primeraConsulta = consultasParaLugar({ nombre: v.name, direccion: v.address })[0]
    const clave = normalizarConsulta(primeraConsulta)

    const clienteConError = { buscar: vi.fn().mockResolvedValue({ tipo: 'error', motivo: 'HTTP 503' }) }
    await geocodificarLugares({ lugares: [v], cliente: clienteConError, cache, apply: true, guardar: vi.fn() })
    expect(cache.obtener(clave)).toBeUndefined()

    const clienteConOk = { buscar: vi.fn().mockResolvedValue(OK_EN_SALTA) }
    await geocodificarLugares({ lugares: [v], cliente: clienteConOk, cache, apply: true, guardar: vi.fn() })
    expect(cache.obtener(clave)).toEqual(OK_EN_SALTA)

    // Ahora sí: con el ok ya en caché, una tercera corrida no vuelve a pedir.
    const clienteQueNoDeberiaLlamarse = { buscar: vi.fn() }
    await geocodificarLugares({ lugares: [v], cliente: clienteQueNoDeberiaLlamarse, cache, apply: true, guardar: vi.fn() })
    expect(clienteQueNoDeberiaLlamarse.buscar).not.toHaveBeenCalled()
  })
})
