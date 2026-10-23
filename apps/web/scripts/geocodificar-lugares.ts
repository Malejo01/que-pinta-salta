/**
 * Geocodificación de `venues` contra Nominatim (geocodificador de
 * OpenStreetMap), Ronda 53.
 *
 * Escribe `latitude`/`longitude` en la base de PRODUCCIÓN con `--apply`: lo
 * corre Mauro de día, nunca programado (ver
 * `tests/venues/geocodificacion/no-programado.test.ts`). De noche no se
 * ejecuta.
 *
 *   npx tsx scripts/geocodificar-lugares.ts                      # consulta y arma el reporte; NO escribe en la base
 *   npx tsx scripts/geocodificar-lugares.ts --limite 20
 *   npx tsx scripts/geocodificar-lugares.ts --apply               # además guarda los de confianza alta
 *   npx tsx scripts/geocodificar-lugares.ts --rehacer-nominatim
 *
 * Sin `--apply` es modo consulta: no guarda nada, solo arma el reporte (JSON
 * y CSV en `ops/geocodificacion/`) para revisar a mano. Con `--apply`,
 * además guarda los lugares de confianza alta (ver
 * `lib/venues/geocodificacion/nominatim.ts#evaluarResultados`); los de
 * confianza `'revisar'` nunca se guardan solos, quedan en el reporte.
 *
 * Toda la lógica de la política de uso de Nominatim (ritmo de 1
 * pedido/segundo, reintentos, qué consultas probar, caché, cuándo confiar en
 * un resultado) vive en `lib/venues/geocodificacion/` (53-a): este script
 * solo lee `venues`, orquesta esa lógica y guarda el resultado. No reimplementa
 * nada de eso acá.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { crearCache } from '../lib/venues/geocodificacion/cache'
import { URL_POLITICA, USER_AGENT } from '../lib/venues/geocodificacion/consultas'
import { crearClienteNominatim } from '../lib/venues/geocodificacion/nominatim'
import { leerOpciones } from '../lib/venues/geocodificacion/opciones'
import {
  contarEventosProximos,
  filtroDeActualizacion,
  geocodificarLugares,
  lugaresAGeocodificar,
  ordenarPorEventosProximos,
  quedanParaCargarAMano,
  type FilaReporteGeocodificacion,
  type VenueParaGeocodificar,
} from '../lib/venues/geocodificacion/plan'
import { aCsv, resumen, urlOpenStreetMap, type FilaCsv } from '../lib/venues/geocodificacion/reporte'
import { traerTodasLasFilas } from '../lib/images/paginar-filas'

/**
 * Carga .env.local sin dependencias, igual que scripts/imagenes-externas.ts
 * (y scripts/dedup-events.ts). Sólo completa lo que no esté ya en el
 * entorno, para que las variables de CI o del shell tengan precedencia. No
 * se imprime ningún valor cargado.
 */
function loadEnvLocal() {
  for (const file of ['.env.local', '.env']) {
    let raw: string
    try {
      raw = readFileSync(join(process.cwd(), file), 'utf8')
    } catch {
      continue
    }

    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i)
      if (!match) continue
      const [, key, rawValue] = match
      if (process.env[key] !== undefined) continue
      process.env[key] = rawValue.trim().replace(/^["']|["']$/g, '')
    }
  }
}

/** `ops/geocodificacion/` de la raíz del repo, resuelta desde la ubicación de este archivo (no `process.cwd()`). */
const OPS_DIR = fileURLToPath(new URL('../../../ops/geocodificacion/', import.meta.url))

function marcaDeTiempo(fecha: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}-${pad(fecha.getHours())}${pad(fecha.getMinutes())}`
}

/**
 * Convierte un venue de `paraRevisarPrevios` (ya tiene coordenadas, pero sin
 * `geocode_source`: nadie sabe si vinieron de Nominatim o de una carga a
 * mano de antes de que existiera esa columna) a una fila con las MISMAS
 * claves que las de `geocodificarLugares` — `aCsv` toma las columnas de la
 * primera fila del array, así que si las claves no coincidieran el CSV
 * saldría con columnas vacías o de menos para uno de los dos grupos.
 */
function filaParaRevisarPrevio(v: VenueParaGeocodificar): FilaReporteGeocodificacion {
  const openStreetMapUrl = v.latitude !== null && v.longitude !== null ? urlOpenStreetMap(v.latitude, v.longitude) : null
  return {
    id: v.id,
    nombre: v.name,
    direccion: v.address,
    consulta: '',
    display_name: null,
    lat: v.latitude,
    lon: v.longitude,
    category: null,
    type: null,
    place_rank: null,
    importance: null,
    confianza: null,
    estado: 'para-revisar',
    motivo: 'ya tenía coordenadas sin geocode_source: revisar a mano',
    openStreetMapUrl,
  }
}

async function main() {
  loadEnvLocal()

  let opciones
  try {
    opciones = leerOpciones(process.argv.slice(2))
  } catch (error) {
    console.error(`[geocodificar-lugares] ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
    return
  }

  const { apply, limite, rehacerNominatim, sinCache, salida, cache: archivoCacheOpcion } = opciones

  console.log(
    apply
      ? '[geocodificar-lugares] APPLY: escribe latitude/longitude en venues de producción.'
      : '[geocodificar-lugares] CONSULTA: no se escribe nada en la base.'
  )
  console.log(`[geocodificar-lugares] Política de uso de Nominatim: ${URL_POLITICA}`)
  console.log(`[geocodificar-lugares] User-Agent: ${USER_AGENT}`)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    const faltantes = [
      !supabaseUrl ? 'NEXT_PUBLIC_SUPABASE_URL' : null,
      !supabaseKey ? 'SUPABASE_SERVICE_ROLE_KEY' : null,
    ].filter((v): v is string => v !== null)
    console.error(
      `[geocodificar-lugares] Faltan las variables de entorno: ${faltantes.join(', ')}.\n` +
        'Definilas en .env.local o exportalas antes de correr el script.'
    )
    process.exit(1)
    return
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })

  let venues: VenueParaGeocodificar[]
  try {
    venues = await traerTodasLasFilas<VenueParaGeocodificar>((desde, hasta) =>
      supabase
        .from('venues')
        .select('id, name, address, latitude, longitude, canonical_venue_id, merged_at, is_placeholder, geocode_source, geocoded_at')
        .order('id')
        .range(desde, hasta)
    )
  } catch (error) {
    console.error(`[geocodificar-lugares] Error consultando venues: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
    return
  }

  // Eventos publicados que todavía no empezaron, por lugar: ordenan la corrida
  // (con --limite se miran primero los que más importan) y el reporte.
  let eventosProximos: Array<{ venue_id: string | null }>
  try {
    const ahoraISO = new Date().toISOString()
    eventosProximos = await traerTodasLasFilas<{ venue_id: string | null }>((desde, hasta) =>
      supabase
        .from('events')
        .select('venue_id')
        .eq('status', 'PUBLISHED')
        .gte('start_date', ahoraISO)
        .not('venue_id', 'is', null)
        .order('id')
        .range(desde, hasta)
    )
  } catch (error) {
    console.error(`[geocodificar-lugares] Error consultando eventos próximos: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
    return
  }
  const conteoEventos = contarEventosProximos(eventosProximos, venues)

  const { elegibles, paraRevisarPrevios: previosSinOrden } = lugaresAGeocodificar(venues, { rehacerNominatim })
  const paraRevisarPrevios = ordenarPorEventosProximos(previosSinOrden, conteoEventos)
  const recortados = ordenarPorEventosProximos(elegibles, conteoEventos).slice(0, limite)
  const descartadosPorTope = elegibles.length - recortados.length

  const tiempoEstimadoSeg = Math.ceil(recortados.length * 4 * 1.1)
  console.log(
    `[geocodificar-lugares] lugares a mirar: ${recortados.length} de ${elegibles.length} elegibles, de más a menos eventos próximos` +
      (descartadosPorTope > 0 ? ` (${descartadosPorTope} quedaron afuera por --limite ${limite})` : '') +
      `. Tiempo estimado: hasta ${tiempoEstimadoSeg}s (hasta 4 consultas por lugar, 1,1s entre pedidos).`
  )

  const cliente = crearClienteNominatim({
    fetch: globalThis.fetch,
    ahora: () => Date.now(),
    esperar: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  })

  const archivoCache = archivoCacheOpcion ?? join(OPS_DIR, 'cache-nominatim.json')
  const cache = sinCache
    ? crearCache({ leer: () => null, escribir: () => {} })
    : crearCache({
        leer: () => {
          try {
            return readFileSync(archivoCache, 'utf8')
          } catch {
            return null
          }
        },
        escribir: (texto) => {
          mkdirSync(dirname(archivoCache), { recursive: true })
          writeFileSync(archivoCache, texto, 'utf8')
        },
      })

  if (cache.aviso !== null) {
    console.warn(`[geocodificar-lugares] ${cache.aviso}`)
  }

  // El filtro va en el propio update (no antes de leer `venues`): si Mauro
  // marcó un pin a mano mientras el script corría, no se pisa. Cubre
  // `geocode_source` null o 'nominatim' (nunca 'manual').
  const filtro = filtroDeActualizacion({ rehacerNominatim })

  async function guardar(id: string, lat: number, lng: number): Promise<boolean> {
    let query = supabase
      .from('venues')
      .update({
        latitude: lat,
        longitude: lng,
        geocoded_at: new Date().toISOString(),
        geocode_source: 'nominatim',
      })
      .eq('id', id)
      .or(filtro.or)

    if (filtro.latitudNula) {
      query = query.is('latitude', null)
    }

    const { data, error } = await query.select('id')
    if (error) {
      console.error(`[geocodificar-lugares] No se pudo guardar ${id}: ${error.message}`)
      return false
    }
    return (data?.length ?? 0) > 0
  }

  const filas = await geocodificarLugares({ lugares: recortados, cliente, cache, apply, guardar })

  // El corte por bloqueado se calcula con `filas` tal como las devolvió
  // `geocodificarLugares`, ANTES de agregarle `previosSinOrigen`: esos
  // previos no dependen de Nominatim, así que concatenarlos antes de esta
  // comparación "completaría" la cuenta y escondería el 403 en silencio.
  const bloqueado = filas.length < recortados.length

  // `paraRevisarPrevios` (venues con coordenadas pero sin `geocode_source`,
  // de `lugaresAGeocodificar`) no se tocan: van al reporte como
  // 'para-revisar', con las mismas claves que las filas de la corrida.
  const previosSinOrigen: FilaReporteGeocodificacion[] = paraRevisarPrevios.map(filaParaRevisarPrevio)
  const todasLasFilas = [...filas, ...previosSinOrigen]

  const carpetaSalida = salida ?? OPS_DIR
  mkdirSync(carpetaSalida, { recursive: true })
  const marca = marcaDeTiempo(new Date())
  const rutaJson = join(carpetaSalida, `${marca}.json`)
  const rutaCsv = join(carpetaSalida, `${marca}.csv`)

  const reporte = {
    generado: new Date().toISOString(),
    modo: apply ? ('apply' as const) : ('consulta' as const),
    rehacerNominatim,
    limite,
    elegibles: elegibles.length,
    mirados: recortados.length,
    descartadosPorTope,
    resumen: resumen(filas),
    quedanParaCargarAMano: quedanParaCargarAMano(filas),
    filas,
    previosSinOrigen,
  }
  writeFileSync(rutaJson, JSON.stringify(reporte, null, 2), 'utf8')

  // `aCsv` toma cualquier objeto plano (FilaCsv = Record<string, ...>). Lleva
  // primero las filas de la corrida y después los previos sin geocode_source
  // (mismas claves en ambos: ver filaParaRevisarPrevio), cada grupo de más a
  // menos eventos próximos, con esa cantidad en la primera columna,
  // `eventos_proximos`: Mauro carga a mano empezando por los que más importan.
  const filasCsv: FilaCsv[] = todasLasFilas.map((fila) => ({ eventos_proximos: conteoEventos.get(fila.id) ?? 0, ...fila }))
  writeFileSync(rutaCsv, aCsv(filasCsv), 'utf8')

  console.log('[geocodificar-lugares] resumen de esta corrida:', resumen(filas))
  console.log(
    `[geocodificar-lugares] para revisar a mano por no tener geocode_source (coordenadas cargadas antes de esa ` +
      `columna, no se tocan solas): ${previosSinOrigen.length} — van al reporte como 'para-revisar'`
  )
  console.log(
    `[geocodificar-lugares] ${quedanParaCargarAMano(filas)} quedan para cargar a mano` +
      (apply ? '' : ' (modo consulta: con --apply se guardarían solo los de confianza alta)')
  )
  console.log(`[geocodificar-lugares] reporte: ${rutaJson}`)
  console.log(`[geocodificar-lugares] reporte: ${rutaCsv}`)

  if (bloqueado) {
    console.error('[geocodificar-lugares] Nominatim respondió 403: pará y revisá la política antes de volver a correrlo')
    process.exit(2)
    return
  }
}

main().catch((error) => {
  console.error('[geocodificar-lugares] Falló:', error)
  process.exit(1)
})
