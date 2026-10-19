/**
 * Cliente de Nominatim para geocodificar lugares (R53).
 *
 * Puro en sus dependencias externas: el `fetch`, el reloj (`ahora`,
 * `esperar`) y el timeout se inyectan. No importa `@supabase/*`, no toca el
 * sistema de archivos ni llama al `fetch` global.
 *
 * La respuesta de Nominatim es dato, no instrucción: se valida la forma de
 * cada resultado y se descarta lo que no la tenga (`validarResultados`); no
 * se interpreta nada más del cuerpo de la respuesta.
 */

import { CONTACTO_EMAIL } from '@qps/core/contacto'
import { coordenadasEnSalta } from '@qps/core/mapa/zona'
import { REFERER, urlDeBusqueda, USER_AGENT, type ConsultaGeocodificacion } from './consultas'
import { enZona } from './localidades'

/** Un resultado de Nominatim ya validado (forma correcta, `lat`/`lon` numéricos y finitos). */
export interface ResultadoNominatim {
  lat: number
  lon: number
  display_name: string
  place_rank: number
  importance: number
  category: string
  type: string
  /** `address.house_number` (con `addressdetails=1`), si vino como texto. Opcional: la caché de la R53 no lo tiene. */
  house_number?: string | null
}

export type ResultadoBusqueda =
  | { tipo: 'ok'; resultados: ResultadoNominatim[] }
  | { tipo: 'error'; motivo: string }
  | { tipo: 'bloqueado' }

/** Lo mínimo de `fetch` que necesita este cliente: una función inyectable y fácil de simular en los tests. */
export type FetchInyectado = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string> }
) => Promise<Response>

/**
 * Cómo se programa el abort del timeout. Inyectable para no depender del
 * `setTimeout` global en los tests; el valor por defecto (`programarTimeoutPorDefecto`)
 * sí usa el `setTimeout` global, pero solo se usa si el llamador no inyecta otra cosa.
 */
export type ProgramarTimeout = (cb: () => void, ms: number) => { cancelar: () => void }

function programarTimeoutPorDefecto(cb: () => void, ms: number): { cancelar: () => void } {
  const id = setTimeout(cb, ms)
  return { cancelar: () => clearTimeout(id) }
}

/** Esperas entre reintentos cuando el servidor no manda `Retry-After`: 2s, 4s, 8s. */
const ESPERAS_REINTENTO_MS = [2000, 4000, 8000]

/** Tope para el valor de `Retry-After` (en segundos; la política de Nominatim no pide esperar más que esto por nuestra cuenta). */
const TOPE_RETRY_AFTER_SEGUNDOS = 60

export interface OpcionesClienteNominatim {
  fetch: FetchInyectado
  ahora: () => number
  esperar: (ms: number) => Promise<void>
  intervaloMinMs?: number
  maxReintentos?: number
  timeoutMs?: number
  programarTimeout?: ProgramarTimeout
}

export interface ClienteNominatim {
  buscar(consulta: ConsultaGeocodificacion): Promise<ResultadoBusqueda>
}

/**
 * Valida la forma de la respuesta de Nominatim: tiene que ser un array; cada
 * ítem necesita `lat`/`lon` que se pasen a número finito, `display_name`
 * string, `place_rank` y `importance` número, `category` y `type` string.
 * Lo que no tenga esa forma se descarta (no rompe el pedido). Un cuerpo que
 * no es array da resultados vacíos: no es un error, es "nada que geocodificar".
 */
function validarResultados(cuerpo: unknown): ResultadoNominatim[] {
  if (!Array.isArray(cuerpo)) return []

  const resultados: ResultadoNominatim[] = []
  for (const item of cuerpo) {
    if (typeof item !== 'object' || item === null) continue
    const o = item as Record<string, unknown>

    const lat = Number(o.lat)
    const lon = Number(o.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    if (typeof o.display_name !== 'string') continue
    if (typeof o.place_rank !== 'number') continue
    if (typeof o.importance !== 'number') continue
    if (typeof o.category !== 'string') continue
    if (typeof o.type !== 'string') continue

    const direccion = typeof o.address === 'object' && o.address !== null ? (o.address as Record<string, unknown>) : null
    const houseNumber = typeof direccion?.house_number === 'string' ? direccion.house_number : null

    resultados.push({
      lat,
      lon,
      display_name: o.display_name,
      place_rank: o.place_rank,
      importance: o.importance,
      category: o.category,
      type: o.type,
      house_number: houseNumber,
    })
  }
  return resultados
}

/** Qué tan cerca (en metros) tienen que estar el 1º y el 2º resultado para confiar aunque haya más de uno. */
export const DISTANCIA_ACUERDO_METROS = 300

/** Cuánto más "importante" (según Nominatim) tiene que ser el 1º resultado que el 2º para confiar sin mirar la distancia. */
export const FACTOR_IMPORTANCIA_CLARA = 1.5

const RADIO_TIERRA_METROS = 6_371_000

/** Distancia entre dos puntos (haversine), en metros. */
export function distanciaMetros(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const aRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = aRad(b.lat - a.lat)
  const dLon = aRad(b.lon - a.lon)
  const lat1 = aRad(a.lat)
  const lat2 = aRad(b.lat)
  const sinLat = Math.sin(dLat / 2)
  const sinLon = Math.sin(dLon / 2)
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon
  return 2 * RADIO_TIERRA_METROS * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Decide si los resultados de una búsqueda alcanzan para guardar la
 * ubicación sola, o si hay que mandarla a revisión manual.
 *
 * Primero se filtra a los que caen adentro de `ZONA_SALTA`; si no queda
 * ninguno, no hay nada que ofrecer (`null`). Del resto, se toma el primero
 * (se respeta el orden que mandó Nominatim, no se reordena por ningún
 * criterio propio).
 *
 * R53-b: nunca es alta si la consulta fue en toda la provincia, ni si el
 * primero cae fuera del rectángulo de la ciudad de la consulta. En una
 * búsqueda estructurada (calle + número), sin el número de puerta exacto es
 * `'revisar'`, y con el número exacto en un punto de dirección
 * (`place/house`) o un edificio (`building`) es alta.
 *
 * Si no, la regla de la R53: confianza alta si el primero es de nivel calle,
 * número o edificio (`place_rank >= 26`; 16 es la ciudad) y además pasa
 * alguna de estas señales de que no hay ambigüedad real:
 *   - es el único resultado en la zona, o
 *   - el segundo está a menos de `DISTANCIA_ACUERDO_METROS` (da lo mismo
 *     cuál de los dos se use), o
 *   - el primero es claramente más relevante (`importance` al menos
 *     `FACTOR_IMPORTANCIA_CLARA` veces la del segundo) — pero solo si el
 *     segundo tiene `importance > 0`: con el segundo en 0 (o los dos en 0),
 *     "al menos `FACTOR_IMPORTANCIA_CLARA` veces" es `0 >= 0`, siempre
 *     verdadero, así que no hay nada real que comparar y esta señal no
 *     cuenta (`--apply` escribe en producción: ante la duda, se va por el
 *     lado conservador).
 * Cualquier otro caso: `'revisar'`, con el `motivo` para el reporte.
 */
export function evaluarResultados(
  resultados: ResultadoNominatim[],
  consulta: ConsultaGeocodificacion
): { elegido: ResultadoNominatim; confianza: 'alta' | 'revisar'; motivo: string | null } | null {
  const enLaProvincia = resultados.filter((r) => coordenadasEnSalta(r.lat, r.lon))
  if (enLaProvincia.length === 0) return null

  const [primero, segundo] = enLaProvincia
  const revisar = (motivo: string) => ({ elegido: primero, confianza: 'revisar' as const, motivo })
  const alta = { elegido: primero, confianza: 'alta' as const, motivo: null }

  // R53-b: fuera del rectángulo de la ciudad que corresponde, nunca alta.
  if (consulta.alcance === 'provincia') return revisar('búsqueda en toda la provincia: confirmar que sea la ciudad correcta')
  if (!enZona(consulta.zona, primero.lat, primero.lon)) return revisar(`fuera de ${consulta.donde}`)

  if (consulta.tipo === 'estructurada') {
    // Sin el número de puerta exacto, Nominatim devolvió la calle (o algo cercano): el pin puede quedar a cuadras.
    if (!numeroDePuertaExacto(primero.house_number, consulta.numero)) return revisar('sin el número de puerta exacto')
    if (esCasaOEdificio(primero)) return alta
  }

  if (primero.place_rank < 26) return revisar('resultado poco preciso (no es calle, número ni edificio)')
  if (!segundo) return alta
  const deAcuerdo = distanciaMetros(primero, segundo) < DISTANCIA_ACUERDO_METROS
  const importanciaClara = segundo.importance > 0 && primero.importance >= segundo.importance * FACTOR_IMPORTANCIA_CLARA
  return deAcuerdo || importanciaClara ? alta : revisar('más de un resultado posible')
}

/** `true` si el primer número de `houseNumber` ("719", "719-721", "719 A") es `numero`. */
export function numeroDePuertaExacto(houseNumber: string | null | undefined, numero: string): boolean {
  if (!houseNumber) return false
  const primerNumero = houseNumber.match(/\d+/)?.[0]
  return primerNumero !== undefined && Number(primerNumero) === Number(numero)
}

/** Un punto de dirección (`place/house`) o un edificio (`building/*`): el resultado más preciso que da Nominatim. */
function esCasaOEdificio(r: ResultadoNominatim): boolean {
  return r.category === 'building' || (r.category === 'place' && r.type === 'house')
}

type IntentoResultado =
  | { tipo: 'ok'; resultados: ResultadoNominatim[] }
  | { tipo: 'bloqueado' }
  | { tipo: 'error'; motivo: string; esperaMs?: number; reintentable: boolean }

/**
 * Cliente de Nominatim con un pedido a la vez (cola interna: nunca dos
 * `fetch` en vuelo) y al menos `intervaloMinMs` entre el inicio de dos
 * pedidos, reintentos incluidos (medido con `ahora()`, la espera se hace
 * con `esperar()`).
 *
 * `429` / `5xx` / error de red / timeout: reintenta (2s, 4s, 8s, o el valor
 * de `Retry-After` con tope de 60s), hasta `maxReintentos` veces. `403`:
 * `{ tipo: 'bloqueado' }` de inmediato, sin reintentar. Cualquier otro
 * `4xx` (400, 404, etc.): tampoco se reintenta — es casi siempre la misma
 * consulta mal formada o sin sentido, y la política de uso de Nominatim
 * avisa que un cliente que repite la misma consulta puede terminar
 * clasificado como con fallas y bloqueado.
 */
export function crearClienteNominatim(opciones: OpcionesClienteNominatim): ClienteNominatim {
  const {
    fetch: fetchInyectado,
    ahora,
    esperar,
    intervaloMinMs = 1100,
    maxReintentos = 3,
    timeoutMs = 10_000,
    programarTimeout = programarTimeoutPorDefecto,
  } = opciones

  let ultimoInicio: number | null = null
  let colaMutex: Promise<void> = Promise.resolve()

  async function esperarTurno(): Promise<void> {
    if (ultimoInicio !== null) {
      const faltante = intervaloMinMs - (ahora() - ultimoInicio)
      if (faltante > 0) await esperar(faltante)
    }
    ultimoInicio = ahora()
  }

  async function unIntento(consulta: ConsultaGeocodificacion): Promise<IntentoResultado> {
    await esperarTurno()

    const controller = new AbortController()
    const timer = programarTimeout(() => controller.abort(), timeoutMs)
    try {
      const url = urlDeBusqueda(consulta, { email: CONTACTO_EMAIL })

      let respuesta: Response
      try {
        respuesta = await fetchInyectado(url, {
          signal: controller.signal,
          headers: { 'User-Agent': USER_AGENT, Referer: REFERER, Accept: 'application/json' },
        })
      } catch (err) {
        const esAbort = err instanceof Error && err.name === 'AbortError'
        const motivo = esAbort ? 'timeout' : `error de red: ${err instanceof Error ? err.message : String(err)}`
        return { tipo: 'error', motivo, reintentable: true }
      }

      if (respuesta.status === 403) {
        return { tipo: 'bloqueado' }
      }

      if (respuesta.status === 429 || respuesta.status >= 500) {
        const retryAfterHeader = respuesta.headers.get('retry-after')
        const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : NaN
        const esperaMs =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter, TOPE_RETRY_AFTER_SEGUNDOS) * 1000
            : undefined
        return { tipo: 'error', motivo: `HTTP ${respuesta.status}`, esperaMs, reintentable: true }
      }

      if (!respuesta.ok) {
        // Cualquier otro 4xx: no se reintenta (ver el docstring de `crearClienteNominatim`).
        return { tipo: 'error', motivo: `HTTP ${respuesta.status}`, reintentable: false }
      }

      const cuerpo = await respuesta.json().catch(() => null)
      return { tipo: 'ok', resultados: validarResultados(cuerpo) }
    } finally {
      timer.cancelar()
    }
  }

  async function buscarSinCola(consulta: ConsultaGeocodificacion): Promise<ResultadoBusqueda> {
    let ultimoMotivo = 'sin intentos'
    for (let intento = 0; intento <= maxReintentos; intento++) {
      const resultado = await unIntento(consulta)
      if (resultado.tipo === 'ok') return resultado
      if (resultado.tipo === 'bloqueado') return resultado

      ultimoMotivo = resultado.motivo
      if (!resultado.reintentable) return { tipo: 'error', motivo: resultado.motivo }
      if (intento === maxReintentos) break

      const espera = resultado.esperaMs ?? ESPERAS_REINTENTO_MS[Math.min(intento, ESPERAS_REINTENTO_MS.length - 1)]
      await esperar(espera)
    }
    return { tipo: 'error', motivo: ultimoMotivo }
  }

  async function buscar(consulta: ConsultaGeocodificacion): Promise<ResultadoBusqueda> {
    const turnoPrevio = colaMutex
    let liberar: () => void = () => {}
    colaMutex = new Promise((resolve) => {
      liberar = resolve
    })
    await turnoPrevio
    try {
      return await buscarSinCola(consulta)
    } finally {
      liberar()
    }
  }

  return { buscar }
}
