/**
 * La política de uso de Nominatim (https://operations.osmfoundation.org/policies/nominatim/)
 * exige, entre otras cosas: un pedido por segundo como máximo, un solo hilo,
 * identificarse con un User-Agent propio, cachear los resultados y no repetir
 * la misma consulta. Cada pieza (`consultas.ts`, `nominatim.ts`, `cache.ts`,
 * `plan.ts`) ya tiene sus tests unitarios: acá falta la prueba de punta a
 * punta, con TODO junto en una corrida realista. Un test por pieza puede
 * pasar y el conjunto violar la política igual — por ejemplo, si cada lugar
 * armara su propio cliente de Nominatim en vez de compartir uno solo, cada
 * uno arrancaría su propio reloj de "último pedido" y el ritmo global se
 * iría al diablo aunque cada cliente, aislado, respete el suyo. Por eso esta
 * corrida usa UN SOLO `crearClienteNominatim` y UNA SOLA caché para los 30
 * lugares, igual que hace `scripts/geocodificar-lugares.ts` de verdad.
 *
 * Reloj falso y `fetch` falso con el mismo estilo que
 * `tests/venues/geocodificacion/nominatim.test.ts` y `plan.test.ts` (no se
 * repite lo que esos tests ya prueban pieza por pieza).
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { crearCache } from '@/lib/venues/geocodificacion/cache'
import { consultasParaLugar, normalizarConsulta } from '@/lib/venues/geocodificacion/consultas'
import { crearClienteNominatim, type FetchInyectado, type ResultadoNominatim } from '@/lib/venues/geocodificacion/nominatim'
import { geocodificarLugares, lugaresAGeocodificar, type VenueParaGeocodificar } from '@/lib/venues/geocodificacion/plan'

// ===========================================================================
// Reloj falso + "programarTimeout" falso (mismo patrón que nominatim.test.ts).
// ===========================================================================
function crearRelojFalso(inicio = 0) {
  let t = inicio
  const ahora = () => t
  const esperar = async (ms: number) => {
    t += ms
  }
  return { ahora, esperar }
}

function programarTimeoutFalso() {
  return () => ({ cancelar: () => {} })
}

// ===========================================================================
// Fixtures de resultados de Nominatim.
// ===========================================================================
function resultadoBueno(overrides: Partial<ResultadoNominatim> = {}): ResultadoNominatim {
  return {
    lat: -24.79,
    lon: -65.42,
    display_name: 'Resultado Bueno de Fantasía, Salta, Argentina',
    place_rank: 30,
    importance: 0.6,
    category: 'amenity',
    type: 'bar',
    ...overrides,
  }
}

// Punto bien afuera de ZONA_SALTA (algo así como Buenos Aires): lat menor al
// mínimo Y lng mayor al máximo de la zona, para que no haya dudas.
const RESULTADO_FUERA_DE_ZONA = resultadoBueno({ lat: -34.6, lon: -58.4, display_name: 'Lugar Lejano, Fantasía, Argentina' })

// Dos resultados a ~2km con importancias parecidas (copia del caso "revisar"
// de nominatim.test.ts): ni están de acuerdo ni uno es claramente mejor.
const RESULTADOS_REVISAR: ResultadoNominatim[] = [
  resultadoBueno({ lat: -24.7883, lon: -65.4106, importance: 0.5 }),
  resultadoBueno({ lat: -24.806, lon: -65.4106, importance: 0.5 }),
]

type Respuesta = { status: number; headers?: Record<string, string>; body?: unknown }

const OK_BUENO: Respuesta = { status: 200, body: [resultadoBueno()] }
const OK_VACIO: Respuesta = { status: 200, body: [] }
const OK_FUERA_DE_ZONA: Respuesta = { status: 200, body: [RESULTADO_FUERA_DE_ZONA] }
const OK_REVISAR: Respuesta = { status: 200, body: RESULTADOS_REVISAR }

/** Generador con estado: devuelve la secuencia en orden y se queda en la última para siempre. */
function generadorDeSecuencia(secuencia: Respuesta[]): () => Respuesta {
  let i = 0
  return () => {
    const r = secuencia[Math.min(i, secuencia.length - 1)]
    i++
    return r
  }
}

// ===========================================================================
// Los 30 lugares inventados.
// ===========================================================================
function venue(overrides: Partial<VenueParaGeocodificar> & { id: string }): VenueParaGeocodificar {
  return {
    name: 'Lugar de Fantasía',
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

const NOMBRE_COMPARTIDO = 'Peña Compartida'

/** Los 30 lugares de la corrida (ids fijos: los usan las aserciones de más abajo). */
function construirLugares(): VenueParaGeocodificar[] {
  const lugares: VenueParaGeocodificar[] = []

  // A (8): dirección útil, el 1er intento ("nombre, dirección, Salta, Argentina") da un resultado bueno.
  for (let i = 1; i <= 8; i++) {
    lugares.push(venue({ id: `a${i}`, name: `Bar de Fantasía ${i}`, address: `Calle Ficticia ${i}00` }))
  }

  // B (4): la dirección es igual al nombre -> direccionUtil da false -> una sola consulta.
  for (let i = 1; i <= 4; i++) {
    lugares.push(venue({ id: `b${i}`, name: `Resto Imaginario ${i}`, address: `Resto Imaginario ${i}` }))
  }

  // C (2): dirección vacía y "A confirmar" (ambas inútiles) -> una sola consulta.
  lugares.push(venue({ id: 'c1', name: 'Choperia Sin Rumbo', address: '' }))
  lugares.push(venue({ id: 'c2', name: 'Rincon a Definir', address: 'A confirmar' }))

  // D (2): comparten nombre y sin dirección -> arman EXACTAMENTE la misma consulta (dedup entre lugares distintos).
  lugares.push(venue({ id: 'd1', name: NOMBRE_COMPARTIDO, address: null }))
  lugares.push(venue({ id: 'd2', name: NOMBRE_COMPARTIDO, address: null }))

  // E (3): las 2 primeras consultas dan vacío, la 3ra (solo el nombre) da un resultado bueno.
  for (let i = 1; i <= 3; i++) {
    lugares.push(venue({ id: `e${i}`, name: `Club Escondido ${i}`, address: `Ruta Vieja ${i}` }))
  }

  // F (2): las 3 consultas dan vacío -> sin-resultado.
  for (let i = 1; i <= 2; i++) {
    lugares.push(venue({ id: `f${i}`, name: `Galpon Perdido ${i}`, address: `Camino Sin Nombre ${i}` }))
  }

  // G (1): 429 con Retry-After, después anda.
  lugares.push(venue({ id: 'g1', name: 'Boliche con Suerte', address: null }))

  // H (1): 503 dos veces y después anda.
  lugares.push(venue({ id: 'h1', name: 'Cafe Tozudo', address: null }))

  // I (1): el único resultado queda fuera de ZONA_SALTA.
  lugares.push(venue({ id: 'i1', name: 'Mirador Lejano', address: null }))

  // J (2): dos resultados en zona, lejos entre sí -> confianza "revisar".
  lugares.push(venue({ id: 'j1', name: 'Salon Dudoso 1', address: null }))
  lugares.push(venue({ id: 'j2', name: 'Salon Dudoso 2', address: null }))

  // Nunca elegibles (no entran a geocodificarLugares, ver lugaresAGeocodificar).
  lugares.push(venue({ id: 'placeholder-1', name: 'Fantasma de Catalogo', is_placeholder: true }))
  lugares.push(
    venue({
      id: 'fusionado-1',
      name: 'Alias ya Fusionado',
      merged_at: '2026-01-01T00:00:00Z',
      latitude: -24.7,
      longitude: -65.4,
    }),
  )
  lugares.push(
    venue({
      id: 'manual-1',
      name: 'Cargado a Mano',
      address: 'Calle Manual 1',
      latitude: -24.75,
      longitude: -65.45,
      geocode_source: 'manual',
    }),
  )
  // Previo con coordenadas pero sin geocode_source: va a paraRevisarPrevios, no a elegibles.
  lugares.push(
    venue({
      id: 'previo-1',
      name: 'Antiguo Salon Sin Origen',
      address: 'Calle Vieja 1',
      latitude: -24.8,
      longitude: -65.4,
      geocode_source: null,
    }),
  )

  expect(lugares).toHaveLength(30) // sanity del propio fixture: si alguien borra uno sin querer, se nota acá
  return lugares
}

/** Ids que terminan con confianza alta (los que `--apply` debería guardar). */
const IDS_CONFIANZA_ALTA = [
  'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8',
  'b1', 'b2', 'b3', 'b4',
  'c1', 'c2',
  'd1', 'd2',
  'e1', 'e2', 'e3',
  'g1', 'h1',
]

// ===========================================================================
// Construcción del guión de respuestas, lugar por lugar, con las MISMAS
// consultas que arma consultasParaLugar de verdad (no se inventa el texto a mano).
// ===========================================================================
function construirRespuestas(lugares: VenueParaGeocodificar[]) {
  const mapaRespuestas = new Map<string, () => Respuesta>()
  const claveAVenues = new Map<string, string[]>()

  function registrar(venueId: string, consulta: string, generador: () => Respuesta) {
    const clave = normalizarConsulta(consulta)
    // Si dos lugares arman la MISMA consulta (el caso D), el generador ya está:
    // no se pisa, así los dos comparten la misma respuesta cacheable una sola vez.
    if (!mapaRespuestas.has(clave)) mapaRespuestas.set(clave, generador)
    const vistos = claveAVenues.get(clave) ?? []
    vistos.push(venueId)
    claveAVenues.set(clave, vistos)
  }

  function unaSolaConsultaBuena(v: VenueParaGeocodificar) {
    const [consulta] = consultasParaLugar({ nombre: v.name, direccion: v.address })
    registrar(v.id, consulta, generadorDeSecuencia([OK_BUENO]))
  }

  for (const id of ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'b1', 'b2', 'b3', 'b4', 'c1', 'c2', 'd1', 'd2']) {
    unaSolaConsultaBuena(lugares.find((v) => v.id === id)!)
  }

  // E: las 2 primeras consultas vacías, la 3ra buena.
  for (const id of ['e1', 'e2', 'e3']) {
    const v = lugares.find((x) => x.id === id)!
    const consultas = consultasParaLugar({ nombre: v.name, direccion: v.address })
    expect(consultas).toHaveLength(3) // sanity: si direccionUtil cambiara, este fixture dejaría de probar lo que dice probar
    registrar(id, consultas[0], generadorDeSecuencia([OK_VACIO]))
    registrar(id, consultas[1], generadorDeSecuencia([OK_VACIO]))
    registrar(id, consultas[2], generadorDeSecuencia([OK_BUENO]))
  }

  // F: las 3 consultas vacías.
  for (const id of ['f1', 'f2']) {
    const v = lugares.find((x) => x.id === id)!
    const consultas = consultasParaLugar({ nombre: v.name, direccion: v.address })
    expect(consultas).toHaveLength(3)
    for (const consulta of consultas) registrar(id, consulta, generadorDeSecuencia([OK_VACIO]))
  }

  // G: 429 con Retry-After, después anda.
  {
    const v = lugares.find((x) => x.id === 'g1')!
    const [consulta] = consultasParaLugar({ nombre: v.name, direccion: v.address })
    registrar('g1', consulta, generadorDeSecuencia([{ status: 429, headers: { 'retry-after': '2' } }, OK_BUENO]))
  }

  // H: 503, 503, después anda.
  {
    const v = lugares.find((x) => x.id === 'h1')!
    const [consulta] = consultasParaLugar({ nombre: v.name, direccion: v.address })
    registrar('h1', consulta, generadorDeSecuencia([{ status: 503 }, { status: 503 }, OK_BUENO]))
  }

  // I: fuera de zona.
  {
    const v = lugares.find((x) => x.id === 'i1')!
    const [consulta] = consultasParaLugar({ nombre: v.name, direccion: v.address })
    registrar('i1', consulta, generadorDeSecuencia([OK_FUERA_DE_ZONA]))
  }

  // J: confianza "revisar".
  for (const id of ['j1', 'j2']) {
    const v = lugares.find((x) => x.id === id)!
    const [consulta] = consultasParaLugar({ nombre: v.name, direccion: v.address })
    registrar(id, consulta, generadorDeSecuencia([OK_REVISAR]))
  }

  return { mapaRespuestas, claveAVenues }
}

// ===========================================================================
// El `fetch` falso: una sola cola, mira el guión por el parámetro `q`, y
// registra cuándo empezó cada pedido y cuántos hay "en vuelo" a la vez.
// ===========================================================================
function construirFetchFalso(
  ahora: () => number,
  esperar: (ms: number) => Promise<void>,
  mapaRespuestas: Map<string, () => Respuesta>,
) {
  const llamadas: Array<{ t: number; clave: string }> = []
  let enVuelo = 0
  let maxEnVuelo = 0

  const fetch: FetchInyectado = async (url) => {
    enVuelo++
    maxEnVuelo = Math.max(maxEnVuelo, enVuelo)
    const t = ahora()
    const q = new URL(url).searchParams.get('q') ?? ''
    const clave = normalizarConsulta(q)
    llamadas.push({ t, clave })

    const generador = mapaRespuestas.get(clave)
    if (!generador) {
      enVuelo--
      // Si geocodificarLugares probara una consulta que no está en el guión
      // (por ejemplo, seguir probando después de un resultado aceptable, o
      // no cortar al primer "ok"), este fetch revienta: así se nota.
      throw new Error(`consulta no scripteada en la corrida de prueba: "${q}" (clave "${clave}")`)
    }

    // Latencia de red simulada: si el cliente dejara dos pedidos en vuelo a
    // la vez (el "un solo hilo" de la política roto), maxEnVuelo subiría a 2.
    await esperar(10)
    enVuelo--

    const resp = generador()
    const headers = new Headers(resp.headers ?? {})
    return {
      status: resp.status,
      ok: resp.status >= 200 && resp.status < 300,
      headers,
      json: async () => resp.body ?? [],
    } as unknown as Response
  }

  return { fetch, llamadas, maxEnVuelo: () => maxEnVuelo }
}

function crearCacheEnMemoria() {
  let texto: string | null = null
  return crearCache({ leer: () => texto, escribir: (t) => { texto = t } })
}

/** Arma una corrida completa e independiente: 30 lugares, guión, reloj, UN cliente y UNA caché. */
function construirEscenario() {
  const lugares = construirLugares()
  const { mapaRespuestas, claveAVenues } = construirRespuestas(lugares)
  const { ahora, esperar } = crearRelojFalso()
  const { fetch, llamadas, maxEnVuelo } = construirFetchFalso(ahora, esperar, mapaRespuestas)
  const cliente = crearClienteNominatim({ fetch, ahora, esperar, programarTimeout: programarTimeoutFalso() })
  const cache = crearCacheEnMemoria()
  const { elegibles, paraRevisarPrevios } = lugaresAGeocodificar(lugares, { rehacerNominatim: false })

  return { lugares, elegibles, paraRevisarPrevios, llamadas, maxEnVuelo, cliente, cache, claveAVenues }
}

// ===========================================================================
// La corrida principal (--apply): un solo cliente, una sola caché, 30 lugares.
// ===========================================================================
describe('política de uso de Nominatim: corrida completa con 30 lugares (--apply)', () => {
  let escenario: ReturnType<typeof construirEscenario>
  let filas: Awaited<ReturnType<typeof geocodificarLugares>>
  let guardados: string[]

  beforeAll(async () => {
    escenario = construirEscenario()
    guardados = []
    const guardar = (id: string): boolean => {
      guardados.push(id)
      return true
    }
    filas = await geocodificarLugares({
      lugares: escenario.elegibles,
      cliente: escenario.cliente,
      cache: escenario.cache,
      apply: true,
      guardar,
    })
  })

  it('nunca hay menos de 1100ms entre el inicio de dos pedidos, en todo el registro', () => {
    // Si el cliente perdiera el ritmo global (por ejemplo, un `ultimoInicio`
    // que se resetea entre lugares), algún par de la lista quedaría por
    // debajo de 1100ms y este bucle lo encuentra, no importa en qué posición.
    const { llamadas } = escenario
    expect(llamadas.length).toBeGreaterThan(20) // sanity: la corrida de verdad hizo pedidos
    for (let i = 1; i < llamadas.length; i++) {
      expect(llamadas[i].t - llamadas[i - 1].t).toBeGreaterThanOrEqual(1100)
    }
  })

  it('nunca dos pedidos en vuelo a la vez (un solo hilo)', () => {
    // Si geocodificarLugares disparara los lugares en paralelo (en vez de
    // `for...of` secuencial) o el cliente no encolara los buscar(), esto daría 2+.
    expect(escenario.maxEnVuelo()).toBe(1)
  })

  it('como mucho 3 consultas distintas por lugar', () => {
    const distintasPorVenue = new Map<string, Set<string>>()
    for (const llamada of escenario.llamadas) {
      const venues = escenario.claveAVenues.get(llamada.clave) ?? []
      for (const id of venues) {
        const set = distintasPorVenue.get(id) ?? new Set<string>()
        set.add(llamada.clave)
        distintasPorVenue.set(id, set)
      }
    }
    expect(distintasPorVenue.size).toBeGreaterThan(0) // sanity: se registró algo
    for (const [id, claves] of distintasPorVenue) {
      expect(claves.size, `el lugar "${id}" disparó ${claves.size} consultas distintas`).toBeLessThanOrEqual(3)
    }
  })

  it('dos lugares distintos que arman la misma consulta la piden una sola vez', () => {
    // d1 y d2 comparten nombre y no tienen dirección: arman EXACTAMENTE la
    // misma consulta. Si la caché no fuera compartida entre lugares (por
    // ejemplo, una caché por lugar), esto daría 2 en vez de 1.
    const [consultaCompartida] = consultasParaLugar({ nombre: NOMBRE_COMPARTIDO, direccion: null })
    const claveCompartida = normalizarConsulta(consultaCompartida)

    expect(escenario.claveAVenues.get(claveCompartida)?.sort()).toEqual(['d1', 'd2'])
    const vecesPedida = escenario.llamadas.filter((l) => l.clave === claveCompartida).length
    expect(vecesPedida).toBe(1)
  })

  it('con apply, se guarda exactamente el conjunto de ids con confianza alta (ni uno más, ni uno menos)', () => {
    expect(new Set(guardados)).toEqual(new Set(IDS_CONFIANZA_ALTA))
    expect(guardados).toHaveLength(IDS_CONFIANZA_ALTA.length)
  })

  it('el resultado fuera de Salta no se guarda ni queda como "guardado"', () => {
    expect(guardados).not.toContain('i1')
    const fila = filas.find((f) => f.id === 'i1')
    expect(fila?.estado).toBe('sin-resultado')
    expect(fila?.estado).not.toBe('guardado')
  })

  it('confianza "revisar": nunca se guarda sola, aunque apply sea true', () => {
    for (const id of ['j1', 'j2']) {
      expect(guardados).not.toContain(id)
      const fila = filas.find((f) => f.id === id)
      expect(fila?.confianza).toBe('revisar')
      expect(fila?.estado).toBe('para-revisar')
    }
  })

  it('un placeholder, un alias fusionado, un manual y un "previo sin origen" nunca entran a la corrida', () => {
    for (const id of ['placeholder-1', 'fusionado-1', 'manual-1', 'previo-1']) {
      expect(escenario.elegibles.find((v) => v.id === id), `"${id}" no debería ser elegible`).toBeUndefined()
      expect(filas.find((f) => f.id === id), `"${id}" no debería tener fila en el reporte`).toBeUndefined()
      expect(guardados).not.toContain(id)
    }
    // El "previo" va a paraRevisarPrevios (tiene coordenadas, pero sin geocode_source).
    expect(escenario.paraRevisarPrevios.map((v) => v.id)).toEqual(['previo-1'])
  })

  // Este test va al final a propósito: es el único que vuelve a llamar a
  // geocodificarLugares y agrega entradas a escenario.llamadas; si corriera
  // antes, contaminaría los conteos de los tests de arriba.
  it('una segunda corrida con la misma caché no hace ningún pedido nuevo', async () => {
    const llamadasAntes = escenario.llamadas.length
    const guardarSpy = vi.fn().mockReturnValue(true)

    const filas2 = await geocodificarLugares({
      lugares: escenario.elegibles,
      cliente: escenario.cliente,
      cache: escenario.cache,
      apply: true,
      guardar: guardarSpy,
    })

    // Si la caché no persistiera entre corridas, esto sería > 0.
    expect(escenario.llamadas.length - llamadasAntes).toBe(0)
    expect(filas2).toHaveLength(filas.length)
    expect(new Set(filas2.filter((f) => f.estado === 'guardado' || f.confianza === 'alta').map((f) => f.id))).toEqual(
      new Set(IDS_CONFIANZA_ALTA),
    )
  })
})

// ===========================================================================
// Sin --apply: ni un solo guardar(), aunque haya confianza alta de sobra.
// ===========================================================================
describe('política de uso de Nominatim: sin --apply nunca se escribe nada', () => {
  it('guardar() no se llama ni una vez en toda la corrida', async () => {
    const escenario = construirEscenario()
    const guardarSpy = vi.fn().mockReturnValue(true)

    const filas = await geocodificarLugares({
      lugares: escenario.elegibles,
      cliente: escenario.cliente,
      cache: escenario.cache,
      apply: false,
      guardar: guardarSpy,
    })

    // Sanity: si no hubiera ningún caso de confianza alta, "nunca se llamó a
    // guardar" pasaría igual con un apply:false roto que llamara a guardar
    // solo cuando hay confianza alta (porque no habría ninguno). Por eso se
    // verifica también que SÍ hay casos de alta confianza en esta corrida.
    expect(filas.filter((f) => f.confianza === 'alta').length).toBe(IDS_CONFIANZA_ALTA.length)
    expect(guardarSpy).not.toHaveBeenCalled()
  })
})
