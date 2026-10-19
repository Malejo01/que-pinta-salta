/**
 * Plan de geocodificación: qué lugares le tocan a esta corrida y cómo se
 * recorre cada uno (consultas, caché, guardado).
 *
 * Puro: no importa `@supabase/*`. `cliente` (Nominatim), `cache` y `guardar`
 * (cómo se persiste una coordenada) se inyectan.
 */

import { claveDeConsulta, consultasParaLugar, describirConsulta, type ConsultaGeocodificacion } from './consultas'
import { evaluarResultados, type ResultadoBusqueda } from './nominatim'
import { urlOpenStreetMap } from './reporte'

/** Lo mínimo de una fila de `venues` que necesita el plan (subconjunto de `database.types.ts`). */
export interface VenueParaGeocodificar {
  id: string
  name: string
  address: string | null
  canonical_venue_id: string | null
  merged_at: string | null
  is_placeholder: boolean
  latitude: number | null
  longitude: number | null
  geocode_source: string | null
}

export type EstadoFilaGeocodificacion = 'guardado' | 'para-revisar' | 'sin-resultado' | 'error' | 'no-se-pisó'

export interface FilaReporteGeocodificacion {
  id: string
  nombre: string
  direccion: string | null
  consulta: string
  display_name: string | null
  lat: number | null
  lon: number | null
  category: string | null
  type: string | null
  place_rank: number | null
  importance: number | null
  confianza: 'alta' | 'revisar' | null
  estado: EstadoFilaGeocodificacion
  motivo: string | null
  openStreetMapUrl: string | null
}

interface CacheGeocodificacion {
  obtener<T>(clave: string): T | undefined
  guardar<T>(clave: string, valor: T): void
}

/** Lo que devuelve `evaluarResultados` cuando hay algo que ofrecer. */
type ResultadoEvaluado = NonNullable<ReturnType<typeof evaluarResultados>>

interface ClienteGeocodificacion {
  buscar(consulta: ConsultaGeocodificacion): Promise<ResultadoBusqueda>
}

/**
 * `true` si el venue es canónico (no es un alias ya fusionado) y no es un
 * placeholder. No alcanza por sí solo para ser elegible: ver
 * `lugaresAGeocodificar`.
 */
function esCanonico(v: VenueParaGeocodificar): boolean {
  return v.canonical_venue_id === null && v.merged_at === null && !v.is_placeholder
}

/**
 * Separa los venues de esta corrida en dos listas:
 *
 *   - `elegibles`: los que hay que (volver a) geocodificar. Canónicos, no
 *     placeholder, sin `merged_at`, y sin coordenadas (`latitude == null`) o
 *     —si `rehacerNominatim`— con coordenadas que vinieron de Nominatim
 *     (nunca uno cargado a mano: un `geocode_source === 'manual'` no entra
 *     acá ni con `rehacerNominatim`).
 *   - `paraRevisarPrevios`: los que ya tienen coordenadas pero sin
 *     `geocode_source` (cargadas antes de que existiera esa columna): no se
 *     tocan solas, solo se señalan para revisión.
 */
export function lugaresAGeocodificar(
  venues: VenueParaGeocodificar[],
  { rehacerNominatim }: { rehacerNominatim: boolean }
): { elegibles: VenueParaGeocodificar[]; paraRevisarPrevios: VenueParaGeocodificar[] } {
  const elegibles = venues.filter((v) => {
    if (!esCanonico(v)) return false
    if (v.geocode_source === 'manual') return false
    if (v.latitude === null) return true
    return rehacerNominatim && v.geocode_source === 'nominatim'
  })

  const paraRevisarPrevios = venues.filter((v) => esCanonico(v) && v.latitude !== null && v.geocode_source === null)

  return { elegibles, paraRevisarPrevios }
}

/**
 * El filtro que el script le pasa a supabase-js para traer de la base los
 * mismos venues que `lugaresAGeocodificar` consideraría elegibles (el script
 * lo traduce a `.is()`/`.eq()`/`.or()`; acá no se construye ningún query de
 * supabase-js para no importar `@supabase/*`).
 */
export function filtroDeActualizacion({
  rehacerNominatim,
}: {
  rehacerNominatim: boolean
}): { or: string; latitudNula: boolean } {
  return {
    or: 'geocode_source.is.null,geocode_source.eq.nominatim',
    latitudNula: !rehacerNominatim,
  }
}

/**
 * Geocodifica una lista de lugares. Por lugar, prueba las consultas de
 * `consultasParaLugar` en orden; para cada una mira la caché primero (por
 * `claveDeConsulta`: el texto y dónde se busca) y solo si no está ahí llama a `cliente.buscar`.
 * Solo se guarda en la caché un resultado `{ tipo: 'ok' }`: un `'error'` o
 * un `'bloqueado'` no se persisten (la caché es un archivo en disco entre
 * corridas; cachear un 403 lo deja "bloqueado" para siempre sin volver a
 * pedir nada, y un 503 transitorio quedaría cacheado como error eterno
 * para ese lugar).
 *
 * Corta en la primera consulta con confianza alta. Un resultado "revisar"
 * queda como candidato (el primero) y se siguen probando las consultas de la
 * ciudad; si ninguna da alta, la fila es ese candidato, y con un candidato no
 * se hace la búsqueda en toda la provincia (R53-b). Si una consulta da `'error'` (los
 * reintentos de Nominatim ya se agotaron), el lugar corta ahí mismo con
 * `estado: 'error'` y no prueba las consultas que le quedaban, así que con
 * Nominatim caído un lugar gasta como mucho `1 + maxReintentos` pedidos y no
 * `3 × (1 + maxReintentos)`: insistir con las otras dos consultas cuando el
 * servicio ya falló es justo lo que su política de uso pide no hacer.
 * Si ninguna consulta tiene un resultado aceptable (pero ninguna fue
 * `'error'`), el lugar queda en `'sin-resultado'`.
 *
 * Si `apply` es `true` y la confianza es `'alta'`, se llama a `guardar(id,
 * lat, lng)`. Si `guardar` devuelve `false` (la fila cambió mientras corría
 * la geocodificación), el estado queda en `'no-se-pisó'` en vez de
 * `'guardado'`. Con confianza `'revisar'`, o con `apply: false`, nunca se
 * llama a `guardar`: el estado queda en `'para-revisar'`.
 *
 * Un `{ tipo: 'bloqueado' }` de Nominatim corta toda la corrida ahí mismo:
 * ni el lugar que estaba en curso ni los que faltaban se agregan al reporte.
 */
export async function geocodificarLugares({
  lugares,
  cliente,
  cache,
  apply,
  guardar,
}: {
  lugares: VenueParaGeocodificar[]
  cliente: ClienteGeocodificacion
  cache: CacheGeocodificacion
  apply: boolean
  guardar: (id: string, lat: number, lng: number) => boolean | Promise<boolean>
}): Promise<FilaReporteGeocodificacion[]> {
  const filas: FilaReporteGeocodificacion[] = []

  /** La fila de un lugar con resultado: guarda si corresponde (apply + alta) y arma el reporte. */
  async function filaConResultado(
    lugar: VenueParaGeocodificar,
    consulta: string,
    { elegido, confianza, motivo: motivoEvaluacion }: ResultadoEvaluado
  ): Promise<FilaReporteGeocodificacion> {
    let estado: EstadoFilaGeocodificacion
    let motivo: string | null = motivoEvaluacion

    if (apply && confianza === 'alta') {
      const actualizado = await guardar(lugar.id, elegido.lat, elegido.lon)
      if (actualizado) {
        estado = 'guardado'
      } else {
        estado = 'no-se-pisó'
        motivo = 'cambió mientras corría'
      }
    } else {
      estado = 'para-revisar'
    }

    return {
      id: lugar.id,
      nombre: lugar.name,
      direccion: lugar.address,
      consulta,
      display_name: elegido.display_name,
      lat: elegido.lat,
      lon: elegido.lon,
      category: elegido.category,
      type: elegido.type,
      place_rank: elegido.place_rank,
      importance: elegido.importance,
      confianza,
      estado,
      motivo,
      openStreetMapUrl: urlOpenStreetMap(elegido.lat, elegido.lon),
    }
  }

  for (const lugar of lugares) {
    const consultas = consultasParaLugar({ nombre: lugar.name, direccion: lugar.address })
    let consultaUsada = consultas[0] ? describirConsulta(consultas[0]) : ''
    let filaDelLugar: FilaReporteGeocodificacion | null = null
    let candidatoRevisar: { consulta: string; evaluado: ResultadoEvaluado } | null = null

    for (const consulta of consultas) {
      if (candidatoRevisar && consulta.alcance === 'provincia') break
      consultaUsada = describirConsulta(consulta)
      const clave = claveDeConsulta(consulta)

      let resultadoBusqueda = cache.obtener<ResultadoBusqueda>(clave)
      if (resultadoBusqueda === undefined) {
        resultadoBusqueda = await cliente.buscar(consulta)
        if (resultadoBusqueda.tipo === 'ok') {
          cache.guardar(clave, resultadoBusqueda)
        }
      }

      if (resultadoBusqueda.tipo === 'bloqueado') {
        return filas
      }

      if (resultadoBusqueda.tipo === 'error') {
        // Corta el lugar acá: no prueba las consultas que le quedaban (ver el docstring).
        // Si ya había un candidato "revisar", la fila es ese candidato (abajo).
        if (candidatoRevisar) break
        filaDelLugar = {
          id: lugar.id,
          nombre: lugar.name,
          direccion: lugar.address,
          consulta: consultaUsada,
          display_name: null,
          lat: null,
          lon: null,
          category: null,
          type: null,
          place_rank: null,
          importance: null,
          confianza: null,
          estado: 'error',
          motivo: resultadoBusqueda.motivo,
          openStreetMapUrl: null,
        }
        break
      }

      const evaluado = evaluarResultados(resultadoBusqueda.resultados, consulta)
      if (evaluado === null) continue

      if (evaluado.confianza === 'revisar') {
        // R53-b: un "revisar" en la ciudad (p. ej. la calle sin el número exacto)
        // no corta: las consultas por nombre que siguen pueden dar uno alto.
        // Se guarda el primero como candidato, y con un candidato ya no se
        // busca en toda la provincia.
        candidatoRevisar ??= { consulta: consultaUsada, evaluado }
        continue
      }

      filaDelLugar = await filaConResultado(lugar, consultaUsada, evaluado)
      break
    }

    if (!filaDelLugar && candidatoRevisar) {
      filaDelLugar = await filaConResultado(lugar, candidatoRevisar.consulta, candidatoRevisar.evaluado)
    }

    if (!filaDelLugar) {
      filaDelLugar = {
        id: lugar.id,
        nombre: lugar.name,
        direccion: lugar.address,
        consulta: consultaUsada,
        display_name: null,
        lat: null,
        lon: null,
        category: null,
        type: null,
        place_rank: null,
        importance: null,
        confianza: null,
        estado: 'sin-resultado',
        motivo: null,
        openStreetMapUrl: null,
      }
    }

    filas.push(filaDelLugar)
  }

  return filas
}

/**
 * Eventos próximos por lugar canónico (R53-b): cada evento suma a su
 * `venue_id` o, si ese venue es un alias ya fusionado, a su canónico
 * (`canonical_venue_id`). Los eventos sin lugar no cuentan.
 */
export function contarEventosProximos(
  eventos: Array<{ venue_id: string | null }>,
  venues: Array<Pick<VenueParaGeocodificar, 'id' | 'canonical_venue_id'>>
): Map<string, number> {
  const canonicoDe = new Map(venues.map((v) => [v.id, v.canonical_venue_id ?? v.id]))
  const conteo = new Map<string, number>()
  for (const evento of eventos) {
    if (!evento.venue_id) continue
    const id = canonicoDe.get(evento.venue_id) ?? evento.venue_id
    conteo.set(id, (conteo.get(id) ?? 0) + 1)
  }
  return conteo
}

/**
 * Los lugares de más a menos eventos próximos (los que no están en `conteo`
 * cuentan 0); a igual cantidad, por nombre. Así `--limite 20` mira primero
 * los que más importan, y el reporte sale en el orden en que conviene
 * cargarlos a mano. No modifica `lugares`.
 */
export function ordenarPorEventosProximos<T extends { id: string; nombre?: string; name?: string }>(
  lugares: T[],
  conteo: Map<string, number>
): T[] {
  const nombreDe = (l: T) => l.nombre ?? l.name ?? ''
  return [...lugares].sort(
    (a, b) => (conteo.get(b.id) ?? 0) - (conteo.get(a.id) ?? 0) || nombreDe(a).localeCompare(nombreDe(b), 'es')
  )
}

/**
 * Cuántas filas de la corrida quedan para cargar a mano: todas menos las que
 * `--apply` guarda (o guardó) solas, que son las de confianza alta. Una de
 * confianza alta que no se pisó porque cambió mientras corría también queda.
 */
export function quedanParaCargarAMano(filas: Array<Pick<FilaReporteGeocodificacion, 'confianza' | 'estado'>>): number {
  return filas.filter((f) => f.confianza !== 'alta' || f.estado === 'no-se-pisó').length
}
