import { describe, expect, it, vi } from 'vitest'
import {
  contarEventosProximos,
  filtroDeActualizacion,
  geocodificarLugares,
  lugaresAGeocodificar,
  ordenarPorEventosProximos,
  quedanParaCargarAMano,
  type FilaReporteGeocodificacion,
  type VenueParaGeocodificar,
} from '@/lib/venues/geocodificacion/plan'
import type { ResultadoBusqueda, ResultadoNominatim } from '@/lib/venues/geocodificacion/nominatim'
import { claveDeConsulta, consultasParaLugar, type ConsultaGeocodificacion } from '@/lib/venues/geocodificacion/consultas'

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
      category: 'building',
      type: 'yes',
      house_number: '123',
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
    // Sin dirección: con la misma dirección compartirían la consulta estructurada y la caché le contestaría al segundo.
    const lugares = [
      venue({ id: 'uno', name: 'Uno', address: null }),
      venue({ id: 'dos', name: 'Dos', address: null }),
      venue({ id: 'tres', name: 'Tres', address: null }),
    ]

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
    expect(cliente.buscar).toHaveBeenCalledTimes(4) // las 4 consultas (estructurada, nombre+ciudad, nombre, provincia), ninguna con resultado en zona
  })

  it('error en la primera consulta: corta el lugar ahí (no prueba las otras 3), sigue con el próximo lugar', async () => {
    const v = venue() // 'La Casona' + 'Balcarce 123': consultasParaLugar da 4 consultas
    expect(consultasParaLugar({ nombre: v.name, direccion: v.address })).toHaveLength(4)

    const cliente = { buscar: vi.fn().mockResolvedValue({ tipo: 'error', motivo: 'HTTP 503' }) }
    const filas = await geocodificarLugares({
      lugares: [v],
      cliente,
      cache: cacheEnMemoria(),
      apply: true,
      guardar: vi.fn(),
    })

    expect(cliente.buscar).toHaveBeenCalledTimes(1) // no las 4 consultas × reintentos: corta en la primera
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
    expect(cache.obtener(claveDeConsulta(primeraConsulta))).toBeUndefined()
  })

  it('un bloqueado no deja nada en la caché', async () => {
    const v = venue({ id: 'uno' })
    const cliente = { buscar: vi.fn().mockResolvedValue({ tipo: 'bloqueado' }) }
    const cache = cacheEnMemoria()

    await geocodificarLugares({ lugares: [v], cliente, cache, apply: true, guardar: vi.fn() })

    const primeraConsulta = consultasParaLugar({ nombre: v.name, direccion: v.address })[0]
    expect(cache.obtener(claveDeConsulta(primeraConsulta))).toBeUndefined()
  })

  it('solo se cachea un resultado ok: un hit evita el pedido, pero un error previo no', async () => {
    const v = venue({ id: 'uno' })
    const cache = cacheEnMemoria()
    const primeraConsulta = consultasParaLugar({ nombre: v.name, direccion: v.address })[0]
    const clave = claveDeConsulta(primeraConsulta)

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

// ===========================================================================
// R53-b: Babylon, Coco Club y el resto de los casos del reporte real.
// ===========================================================================

function resultado(overrides: Partial<ResultadoNominatim> = {}): ResultadoNominatim {
  return {
    lat: -24.7883,
    lon: -65.4106,
    display_name: 'Resultado de Prueba, Salta, Argentina',
    place_rank: 30,
    importance: 0.5,
    category: 'amenity',
    type: 'bar',
    ...overrides,
  }
}

const OK_VACIO_R: ResultadoBusqueda = { tipo: 'ok', resultados: [] }

/** Un cliente falso que responde según la consulta (no según el orden de las llamadas). */
function clienteSegun(responder: (consulta: ConsultaGeocodificacion) => ResultadoBusqueda) {
  return { buscar: vi.fn(async (consulta: ConsultaGeocodificacion) => responder(consulta)) }
}

const EN_TARTAGAL = resultado({
  lat: -22.52,
  lon: -63.8,
  display_name: 'Babylon, Tartagal, San Martín, Salta, Argentina',
  place_rank: 30,
  importance: 0.9,
})

describe('geocodificarLugares: Babylon, "Necochea 719" sin ciudad (R53-b)', () => {
  const babylon = () => venue({ id: 'babylon', name: 'Babylon', address: 'Necochea 719' })

  it('la primera consulta es estructurada, en Salta Capital y acotada', async () => {
    const cliente = clienteSegun(() => OK_VACIO_R)
    await geocodificarLugares({ lugares: [babylon()], cliente, cache: cacheEnMemoria(), apply: true, guardar: vi.fn() })

    const primera = cliente.buscar.mock.calls[0][0]
    expect(primera).toMatchObject({ tipo: 'estructurada', calle: 'Necochea', numero: '719', ciudad: 'Salta', alcance: 'ciudad', donde: 'Salta Capital' })
    expect(cliente.buscar.mock.calls.map((c) => c[0].alcance)).toEqual(['ciudad', 'ciudad', 'ciudad', 'provincia'])
  })

  it('nada en la capital y un resultado en Tartagal en la búsqueda de la provincia: NO es alta ni se guarda con apply', async () => {
    const cliente = clienteSegun((c) => (c.alcance === 'provincia' ? { tipo: 'ok', resultados: [EN_TARTAGAL] } : OK_VACIO_R))
    const guardar = vi.fn().mockResolvedValue(true)

    const filas = await geocodificarLugares({ lugares: [babylon()], cliente, cache: cacheEnMemoria(), apply: true, guardar })

    expect(guardar).not.toHaveBeenCalled()
    expect(filas).toHaveLength(1)
    expect(filas[0].confianza).toBe('revisar')
    expect(filas[0].estado).toBe('para-revisar')
    expect(filas[0].motivo).toMatch(/provincia/)
    expect(filas[0].display_name).toContain('Tartagal')
    expect(filas[0].consulta).toContain('[toda la provincia]')
  })

  it('si la búsqueda "acotada" devolviera Tartagal (no debería, pero la respuesta es dato): tampoco es alta', async () => {
    const cliente = clienteSegun(() => ({ tipo: 'ok', resultados: [{ ...EN_TARTAGAL, category: 'place', type: 'house', house_number: '719' }] }))
    const guardar = vi.fn().mockResolvedValue(true)

    const filas = await geocodificarLugares({ lugares: [babylon()], cliente, cache: cacheEnMemoria(), apply: true, guardar })

    expect(guardar).not.toHaveBeenCalled()
    expect(filas[0].confianza).toBe('revisar')
    expect(filas[0].motivo).toMatch(/fuera de Salta Capital/)
  })

  it('si la capital devuelve el número exacto (place/house, "719", dentro de la zona): alta y se guarda', async () => {
    const cliente = clienteSegun((c) =>
      c.tipo === 'estructurada'
        ? { tipo: 'ok', resultados: [resultado({ category: 'place', type: 'house', house_number: '719', place_rank: 30 })] }
        : OK_VACIO_R
    )
    const guardar = vi.fn().mockResolvedValue(true)

    const filas = await geocodificarLugares({ lugares: [babylon()], cliente, cache: cacheEnMemoria(), apply: true, guardar })

    expect(cliente.buscar).toHaveBeenCalledTimes(1)
    expect(filas[0].confianza).toBe('alta')
    expect(filas[0].estado).toBe('guardado')
    expect(filas[0].motivo).toBeNull()
    expect(guardar).toHaveBeenCalledWith('babylon', -24.7883, -65.4106)
  })

  it('la capital devuelve la calle sin el número (rank 26): para revisar, con el motivo en la fila', async () => {
    const cliente = clienteSegun((c) =>
      c.tipo === 'estructurada'
        ? { tipo: 'ok', resultados: [resultado({ category: 'highway', type: 'residential', place_rank: 26, house_number: null })] }
        : OK_VACIO_R
    )
    const guardar = vi.fn().mockResolvedValue(true)

    const filas = await geocodificarLugares({ lugares: [babylon()], cliente, cache: cacheEnMemoria(), apply: true, guardar })

    expect(guardar).not.toHaveBeenCalled()
    expect(filas[0].estado).toBe('para-revisar')
    expect(filas[0].confianza).toBe('revisar')
    expect(filas[0].motivo).toMatch(/número de puerta/)
    // Un "revisar" en la ciudad no corta: se prueban las dos consultas por
    // nombre, pero con un candidato ya no se busca en toda la provincia.
    expect(cliente.buscar.mock.calls.map((c) => c[0].alcance)).toEqual(['ciudad', 'ciudad', 'ciudad'])
    expect(filas[0].consulta).toContain('(estructurada)')
  })

  it('la calle sin el número y después el nombre da un resultado alto: gana el alto y se guarda', async () => {
    const cliente = clienteSegun((c) =>
      c.tipo === 'estructurada'
        ? { tipo: 'ok', resultados: [resultado({ category: 'highway', type: 'residential', place_rank: 26, house_number: null })] }
        : c.tipo === 'libre' && c.q === 'Babylon, Salta Capital'
          ? { tipo: 'ok', resultados: [resultado({ category: 'amenity', type: 'bar', place_rank: 30 })] }
          : OK_VACIO_R
    )
    const guardar = vi.fn().mockResolvedValue(true)

    const filas = await geocodificarLugares({ lugares: [babylon()], cliente, cache: cacheEnMemoria(), apply: true, guardar })

    expect(cliente.buscar).toHaveBeenCalledTimes(2)
    expect(filas[0].confianza).toBe('alta')
    expect(filas[0].estado).toBe('guardado')
    expect(filas[0].consulta).toBe('Babylon, Salta Capital [en Salta Capital]')
    expect(guardar).toHaveBeenCalledTimes(1)
  })

  it('un error de Nominatim después de un candidato "revisar": la fila es el candidato, no el error', async () => {
    let llamada = 0
    const cliente = clienteSegun(() =>
      ++llamada === 1
        ? { tipo: 'ok', resultados: [resultado({ category: 'highway', type: 'residential', place_rank: 26, house_number: null })] }
        : { tipo: 'error', motivo: 'HTTP 503' }
    )

    const filas = await geocodificarLugares({ lugares: [babylon()], cliente, cache: cacheEnMemoria(), apply: true, guardar: vi.fn() })

    expect(cliente.buscar).toHaveBeenCalledTimes(2)
    expect(filas[0].estado).toBe('para-revisar')
    expect(filas[0].motivo).toMatch(/número de puerta/)
  })

  it('la fila describe la consulta con la que se resolvió', async () => {
    const cliente = clienteSegun((c) => (c.tipo === 'estructurada' ? OK_VACIO_R : { tipo: 'ok', resultados: [resultado()] }))
    const filas = await geocodificarLugares({ lugares: [babylon()], cliente, cache: cacheEnMemoria(), apply: false, guardar: vi.fn() })
    expect(filas[0].consulta).toBe('Babylon, Salta Capital [en Salta Capital]')
  })
})

describe('geocodificarLugares: Coco Club, "Avenida Jhon F. Kennedy" (sin número, R53-b)', () => {
  const coco = () => venue({ id: 'coco', name: 'Coco Club', address: 'Avenida Jhon F. Kennedy' })

  it('un único resultado rank 30 de la consulta de calle sin número no es alta ni se guarda', async () => {
    const cliente = clienteSegun((c) =>
      c.tipo === 'libre' && c.soloCalle ? { tipo: 'ok', resultados: [resultado({ category: 'highway', type: 'primary', place_rank: 30 })] } : OK_VACIO_R
    )
    const guardar = vi.fn().mockResolvedValue(true)

    const filas = await geocodificarLugares({ lugares: [coco()], cliente, cache: cacheEnMemoria(), apply: true, guardar })

    expect(cliente.buscar).toHaveBeenCalledTimes(3) // nombre+ciudad, nombre, calle sin número
    expect(guardar).not.toHaveBeenCalled()
    expect(filas[0].confianza).toBe('revisar')
    expect(filas[0].estado).toBe('para-revisar')
    expect(filas[0].motivo).toBe('dirección sin número: ubicar a mano sobre la calle')
    expect(filas[0].consulta).toBe('Avenida John F. Kennedy, Salta (sin número) [en Salta Capital]')
  })
})

describe('la caché distingue dónde se busca', () => {
  it('la misma frase en la ciudad y en la provincia son entradas distintas', async () => {
    const v = venue({ id: 'solo-nombre', name: 'Lugar de Prueba', address: null })
    const cache = cacheEnMemoria()
    const cliente = clienteSegun(() => OK_VACIO_R)

    await geocodificarLugares({ lugares: [v], cliente, cache, apply: false, guardar: vi.fn() })

    const consultas = consultasParaLugar({ nombre: v.name, direccion: v.address })
    for (const c of consultas) expect(cache.obtener(claveDeConsulta(c)), claveDeConsulta(c)).toEqual(OK_VACIO_R)
    expect(new Set(consultas.map(claveDeConsulta)).size).toBe(consultas.length)
  })
})

// ===========================================================================
// R53-b: orden por eventos próximos y lo que queda para cargar a mano.
// ===========================================================================

describe('contarEventosProximos', () => {
  const venues = [
    { id: 'canonico', canonical_venue_id: null },
    { id: 'alias', canonical_venue_id: 'canonico' },
    { id: 'otro', canonical_venue_id: null },
  ]

  it('cada evento suma a su lugar', () => {
    const conteo = contarEventosProximos([{ venue_id: 'otro' }, { venue_id: 'otro' }, { venue_id: 'canonico' }], venues)
    expect(conteo.get('otro')).toBe(2)
    expect(conteo.get('canonico')).toBe(1)
  })

  it('un evento de un alias suma al canónico (y el alias no aparece)', () => {
    const conteo = contarEventosProximos([{ venue_id: 'alias' }, { venue_id: 'canonico' }, { venue_id: 'alias' }], venues)
    expect(conteo.get('canonico')).toBe(3)
    expect(conteo.has('alias')).toBe(false)
  })

  it('un evento sin lugar (venue_id null) no cuenta', () => {
    const conteo = contarEventosProximos([{ venue_id: null }, { venue_id: 'otro' }], venues)
    expect([...conteo.entries()]).toEqual([['otro', 1]])
  })

  it('un venue_id que no está en la lista de venues se cuenta tal cual', () => {
    expect(contarEventosProximos([{ venue_id: 'desconocido' }], venues).get('desconocido')).toBe(1)
  })

  it('sin eventos: mapa vacío', () => {
    expect(contarEventosProximos([], venues).size).toBe(0)
  })
})

describe('ordenarPorEventosProximos', () => {
  it('de más a menos eventos; los que no están en el conteo valen 0; el empate por nombre', () => {
    const lugares = [
      { id: 'a', name: 'Zeta' },
      { id: 'b', name: 'Alfa' },
      { id: 'c', name: 'Beta' },
      { id: 'd', name: 'Delta' },
    ]
    const conteo = new Map([
      ['a', 5],
      ['c', 1],
      ['d', 1],
    ])
    expect(ordenarPorEventosProximos(lugares, conteo).map((l) => l.id)).toEqual(['a', 'c', 'd', 'b'])
  })

  it('también ordena filas con "nombre" en vez de "name"', () => {
    const filas = [
      { id: 'a', nombre: 'Zeta' },
      { id: 'b', nombre: 'Alfa' },
    ]
    expect(ordenarPorEventosProximos(filas, new Map()).map((l) => l.id)).toEqual(['b', 'a'])
  })

  it('el empate por nombre respeta el español (Árbol antes que Bar)', () => {
    const lugares = [
      { id: 'b', name: 'Bar' },
      { id: 'a', name: 'Árbol' },
    ]
    expect(ordenarPorEventosProximos(lugares, new Map()).map((l) => l.id)).toEqual(['a', 'b'])
  })

  it('no muta la lista de entrada', () => {
    const lugares = [
      { id: 'a', name: 'Zeta' },
      { id: 'b', name: 'Alfa' },
    ]
    const copia = [...lugares]
    ordenarPorEventosProximos(lugares, new Map([['a', 1]]))
    expect(lugares).toEqual(copia)
  })
})

describe('quedanParaCargarAMano', () => {
  const fila = (confianza: FilaReporteGeocodificacion['confianza'], estado: FilaReporteGeocodificacion['estado']) => ({ confianza, estado })

  it('todas menos las de confianza alta que se guardaron', () => {
    expect(
      quedanParaCargarAMano([
        fila('alta', 'guardado'),
        fila('revisar', 'para-revisar'),
        fila(null, 'sin-resultado'),
        fila(null, 'error'),
      ])
    ).toBe(3)
  })

  it('una alta que no se pisó porque cambió mientras corría también queda', () => {
    expect(quedanParaCargarAMano([fila('alta', 'no-se-pisó'), fila('alta', 'guardado')])).toBe(1)
  })

  it('sin --apply: las altas quedan "para-revisar" y por la fórmula cuentan como guardadas', () => {
    // Documenta el comportamiento actual: la fórmula mira la confianza, no el estado.
    expect(quedanParaCargarAMano([fila('alta', 'para-revisar'), fila('revisar', 'para-revisar')])).toBe(1)
  })

  it('lista vacía: 0', () => {
    expect(quedanParaCargarAMano([])).toBe(0)
  })
})
