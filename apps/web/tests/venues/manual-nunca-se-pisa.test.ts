/**
 * La regla más cara de la Ronda 53: una ubicación que un admin cargó A MANO
 * (`venues.geocode_source === 'manual'`) no la pisa nada, ni el script de
 * geocodificación automática ni una carrera entre los dos.
 *
 * Hay dos caminos de escritura sobre `venues` y los dos tienen que
 * respetarla:
 *   - el del script (`lugaresAGeocodificar` + el `update` con el filtro de
 *     `filtroDeActualizacion`, igual que hace `scripts/geocodificar-lugares.ts`);
 *   - el del admin (`guardarUbicacionManual` de `lib/admin/lugares-actions.ts`,
 *     que SÍ puede pisar un `nominatim`).
 *
 * El corazón de este archivo es `crearTablaVenuesFalsa`: un doble de la tabla
 * `venues` en memoria que aplica los filtros DE VERDAD (`.eq()`, `.is()`,
 * `.or()` parseado como un OR real), no uno que solo mire el id. Si el doble
 * solo devolviera la fila pedida sin filtrar, todos los tests de este archivo
 * pasarían igual con el filtro borrado del código de producción — por eso el
 * primer describe prueba el propio doble antes de confiar en él.
 *
 * Sin red ni base: nada de esto toca Supabase de verdad. El archivo del admin
 * (`lib/admin/lugares-actions.ts`) lo está escribiendo otro teammate en este
 * mismo momento y sus mensajes de error están cambiando: por eso el test del
 * admin no afirma ningún texto de error, solo el estado final de la fila y
 * que el update filtra por `.eq('id', ...)`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ResultadoBusqueda } from '@/lib/venues/geocodificacion/nominatim'
import { filtroDeActualizacion, geocodificarLugares, lugaresAGeocodificar, type VenueParaGeocodificar } from '@/lib/venues/geocodificacion/plan'

const createClient = vi.fn()
const revalidatePath = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: (...a: unknown[]) => createClient(...a),
}))
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))

import { guardarUbicacionManual } from '@/lib/admin/lugares-actions'

// ===========================================================================
// El doble de la tabla `venues`, con los filtros reales.
// ===========================================================================
interface FilaVenue {
  id: string
  latitude: number | null
  longitude: number | null
  geocode_source: string | null
  [clave: string]: unknown
}

type FiltroRegistrado = { tipo: 'eq' | 'is'; columna: string; valor: unknown } | { tipo: 'or'; clausula: string }

/** Una condición de `.or('col.op.val,col.op.val')` ya parseada, aplicable a una fila. */
function parsearCondicionOr(condicion: string): (fila: FilaVenue) => boolean {
  const [columna, operador, valorCrudo] = condicion.split('.')
  return (fila) => {
    const valorFila = fila[columna]
    if (operador === 'is') return valorCrudo === 'null' ? valorFila === null : valorFila === valorCrudo
    if (operador === 'eq') return valorFila === valorCrudo
    throw new Error(`crearTablaVenuesFalsa: operador de OR no soportado en el doble: "${operador}"`)
  }
}

/**
 * Doble en memoria de `supabase.from('venues')`: soporta la cadena
 * `.update(...).eq(...).or(...).is(...).select('id')` (en cualquier orden de
 * eq/or/is, los dos caminos de escritura de esta ronda no las combinan
 * igual) y aplica los filtros DE VERDAD contra las filas. `select('id')`
 * devuelve solo las filas que pasaron todos los filtros, y son las únicas
 * que `update` modifica.
 */
function crearTablaVenuesFalsa(filasIniciales: FilaVenue[]) {
  const filas: FilaVenue[] = filasIniciales.map((f) => ({ ...f }))
  const filtrosUsados: FiltroRegistrado[] = []

  function buscar(id: string): FilaVenue | undefined {
    return filas.find((f) => f.id === id)
  }

  function update(valores: Record<string, unknown>) {
    const eqFiltros: Array<[string, unknown]> = []
    let condicionesOr: Array<(fila: FilaVenue) => boolean> | null = null
    let columnaIsNull: string | null = null

    const builder = {
      eq(columna: string, valor: unknown) {
        filtrosUsados.push({ tipo: 'eq', columna, valor })
        eqFiltros.push([columna, valor])
        return builder
      },
      or(clausula: string) {
        filtrosUsados.push({ tipo: 'or', clausula })
        condicionesOr = clausula.split(',').map(parsearCondicionOr)
        return builder
      },
      is(columna: string, valor: null) {
        if (valor !== null) throw new Error('crearTablaVenuesFalsa: el doble solo soporta .is(columna, null)')
        filtrosUsados.push({ tipo: 'is', columna, valor })
        columnaIsNull = columna
        return builder
      },
      async select(_columnas: string) {
        const coinciden = filas.filter((fila) => {
          if (!eqFiltros.every(([c, v]) => fila[c] === v)) return false
          if (columnaIsNull !== null && fila[columnaIsNull] !== null) return false
          if (condicionesOr !== null && !condicionesOr.some((cond) => cond(fila))) return false
          return true
        })
        for (const fila of coinciden) Object.assign(fila, valores)
        return { data: coinciden.map((f) => ({ id: f.id })), error: null }
      },
    }
    return builder
  }

  return { filas, buscar, update, filtrosUsados }
}

/** El `guardar` que usaría el script de verdad: `.eq('id', id).or(filtro.or)[.is('latitude', null)]`. */
function construirGuardarDelScript(tabla: ReturnType<typeof crearTablaVenuesFalsa>, rehacerNominatim: boolean) {
  const filtro = filtroDeActualizacion({ rehacerNominatim })
  return async function guardar(id: string, lat: number, lng: number): Promise<boolean> {
    let query = tabla.update({ latitude: lat, longitude: lng, geocode_source: 'nominatim' }).eq('id', id).or(filtro.or)
    if (filtro.latitudNula) query = query.is('latitude', null)
    const { data } = await query.select('id')
    return (data?.length ?? 0) > 0
  }
}

/** Caché que siempre es miss (no hace falta para estos tests: no hay dos consultas iguales). */
function cacheSinOp() {
  return { obtener: () => undefined, guardar: () => {} }
}

const OK_EN_SALTA: ResultadoBusqueda = {
  tipo: 'ok',
  resultados: [
    {
      lat: -24.79,
      lon: -65.42,
      display_name: 'Lugar de Fantasía, Salta, Argentina',
      place_rank: 30,
      importance: 0.7,
      category: 'amenity',
      type: 'bar',
    },
  ],
}

const VENUE_ID = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  createClient.mockReset()
  revalidatePath.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

// ===========================================================================
// El doble, puesto a prueba primero: si no filtrara de verdad, nada de lo
// que sigue en este archivo probaría nada.
// ===========================================================================
describe('crearTablaVenuesFalsa: el doble tiene que descartar filas de verdad', () => {
  it('un geocode_source "manual" no matchea el OR del filtro, aunque latitude sea null', async () => {
    const tabla = crearTablaVenuesFalsa([
      { id: 'manual-sin-lat', latitude: null, longitude: null, geocode_source: 'manual' },
      { id: 'null-sin-lat', latitude: null, longitude: null, geocode_source: null },
    ])
    const filtro = filtroDeActualizacion({ rehacerNominatim: false })

    // El filtro completo (igual que el guardar() del script): .is('latitude', null) pasaría
    // para las dos filas (ambas con latitude null); lo que tiene que descartar a la manual es el OR.
    let queryManual = tabla.update({ latitude: -1, longitude: -1 }).eq('id', 'manual-sin-lat').or(filtro.or)
    if (filtro.latitudNula) queryManual = queryManual.is('latitude', null)
    const { data: dataManual } = await queryManual.select('id')

    let queryNull = tabla.update({ latitude: -1, longitude: -1 }).eq('id', 'null-sin-lat').or(filtro.or)
    if (filtro.latitudNula) queryNull = queryNull.is('latitude', null)
    const { data: dataNull } = await queryNull.select('id')

    // Si el doble no aplicara el OR de verdad (por ejemplo, si `select()` devolviera
    // siempre la fila del id pedido sin mirar los filtros), `dataManual` tendría 1
    // elemento en vez de 0, y el resto de este archivo no estaría probando nada.
    expect(dataManual).toEqual([])
    expect(tabla.buscar('manual-sin-lat')?.latitude).toBeNull()
    expect(dataNull).toEqual([{ id: 'null-sin-lat' }])
    expect(tabla.buscar('null-sin-lat')?.latitude).toBe(-1)
  })
})

// ===========================================================================
// El camino del script.
// ===========================================================================
describe('un lugar "manual" no cambia aunque el script lo reciba', () => {
  function venueManual(): VenueParaGeocodificar {
    return {
      id: 'venue-manual',
      name: 'Lugar Cargado a Mano',
      address: 'Calle Manual 1',
      canonical_venue_id: null,
      merged_at: null,
      is_placeholder: false,
      latitude: -24.75,
      longitude: -65.45,
      geocode_source: 'manual',
    }
  }

  it('lugaresAGeocodificar nunca lo elige, ni con rehacerNominatim', () => {
    // Si alguien borrara el `if (v.geocode_source === 'manual') return false`
    // de lugaresAGeocodificar, este lugar aparecería en elegibles y este test caería.
    for (const rehacerNominatim of [false, true]) {
      const { elegibles } = lugaresAGeocodificar([venueManual()], { rehacerNominatim })
      expect(elegibles).toEqual([])
    }
  })

  it('si alguien lo metiera a mano en la lista del update, el filtro lo descarta igual (con y sin rehacerNominatim)', async () => {
    for (const rehacerNominatim of [false, true]) {
      const filaOriginal: FilaVenue = { id: 'venue-manual', latitude: -24.75, longitude: -65.45, geocode_source: 'manual' }
      const tabla = crearTablaVenuesFalsa([filaOriginal])
      const guardar = construirGuardarDelScript(tabla, rehacerNominatim)

      // Esto simula que alguien, a mano o por un bug, metió el venue manual en la
      // lista de "a geocodificar" y el script intenta guardarle coordenadas de Nominatim.
      const actualizo = await guardar('venue-manual', -24.1, -65.1)

      expect(actualizo).toBe(false)
      expect(tabla.buscar('venue-manual')).toEqual(filaOriginal) // nada cambió
    }
  })
})

describe('carrera real: un lugar pasa a "manual" entre el plan y el update', () => {
  it('el update no devuelve filas, la fila a mano queda como estaba, y geocodificarLugares lo reporta como "no-se-pisó"', async () => {
    const filaOriginal: FilaVenue = { id: 'venue-en-carrera', latitude: null, longitude: null, geocode_source: null }
    const tabla = crearTablaVenuesFalsa([filaOriginal])
    const guardar = construirGuardarDelScript(tabla, false)

    const venueDelPlan: VenueParaGeocodificar = {
      id: 'venue-en-carrera',
      name: 'Lugar en Carrera',
      address: null,
      canonical_venue_id: null,
      merged_at: null,
      is_placeholder: false,
      latitude: null,
      longitude: null,
      geocode_source: null,
    }
    // Sanity: al momento del plan, SÍ era elegible — si no, la "carrera" no probaría nada.
    expect(lugaresAGeocodificar([venueDelPlan], { rehacerNominatim: false }).elegibles).toEqual([venueDelPlan])

    const cliente = {
      buscar: vi.fn(async (): Promise<ResultadoBusqueda> => {
        // Mauro corrige el pin a mano MIENTRAS el script está esperando la
        // respuesta de Nominatim para este mismo lugar (la carrera real).
        const fila = tabla.buscar('venue-en-carrera')!
        fila.geocode_source = 'manual'
        fila.latitude = -24.9
        fila.longitude = -65.5
        return OK_EN_SALTA
      }),
    }

    const filas = await geocodificarLugares({
      lugares: [venueDelPlan],
      cliente,
      cache: cacheSinOp(),
      apply: true,
      guardar,
    })

    expect(filas).toHaveLength(1)
    // Si guardar() no devolviera `false` cuando el update no tocó filas (o si
    // geocodificarLugares no distinguiera ese caso de un guardado normal),
    // el estado sería "guardado" en vez de "no-se-pisó".
    expect(filas[0].estado).toBe('no-se-pisó')

    // La corrección a mano del admin queda: nunca se pisa con las coordenadas de Nominatim.
    expect(tabla.buscar('venue-en-carrera')).toEqual({
      id: 'venue-en-carrera',
      latitude: -24.9,
      longitude: -65.5,
      geocode_source: 'manual',
    })
  })
})

// ===========================================================================
// El camino del admin: éste SÍ puede pisar un 'nominatim'.
// ===========================================================================
describe('el admin sí puede pisar un "nominatim" (no es la misma regla que protege lo manual)', () => {
  it('la fila queda con geocode_source "manual" y las coordenadas nuevas, con un update filtrado por .eq("id", venueId)', async () => {
    const filaNominatim: FilaVenue = { id: VENUE_ID, latitude: -24.7, longitude: -65.4, geocode_source: 'nominatim' }
    const tabla = crearTablaVenuesFalsa([filaNominatim])

    createClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } }, error: null }) },
      from: (nombreTabla: string) => {
        if (nombreTabla === 'profiles') {
          return { select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'ADMIN' }, error: null }) }) }) }
        }
        if (nombreTabla === 'venues') {
          return { update: (valores: Record<string, unknown>) => tabla.update(valores) }
        }
        throw new Error(`tabla inesperada en el doble del test del admin: "${nombreTabla}"`)
      },
    })

    const resultado = await guardarUbicacionManual(VENUE_ID, '-24.79, -65.42')

    // No se afirma ningún mensaje de error literal (lugares-actions.ts lo está
    // escribiendo otro teammate ahora mismo): solo que terminó en éxito.
    expect(resultado.ok).toBe(true)

    const filaFinal = tabla.buscar(VENUE_ID)
    expect(filaFinal?.geocode_source).toBe('manual')
    expect(filaFinal?.latitude).toBe(-24.79)
    expect(filaFinal?.longitude).toBe(-65.42)

    // Si guardarUbicacionManual dejara de filtrar por .eq('id', venueId) (por
    // ejemplo, un update sin ningún filtro), esto no aparecería en el registro.
    expect(tabla.filtrosUsados).toContainEqual({ tipo: 'eq', columna: 'id', valor: VENUE_ID })
  })
})
