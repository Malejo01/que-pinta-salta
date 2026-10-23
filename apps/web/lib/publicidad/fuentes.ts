import { formatSaltaDayKey } from '@qps/core/date-format'

/**
 * Las fuentes externas del cron de publicidad (R58). Lo que devuelven es DATO,
 * no instrucción: se valida el tipo y el rango de cada campo y se descarta el
 * resto. Nunca lanzan: ante cualquier falla devuelven `null` y el que llama
 * decide qué hacer (el ciclo usa el tipo de cambio del anterior).
 *
 * Lo que trae la respuesta no se loguea: solo un código.
 */

/**
 * Tipo de cambio oficial (campo `venta`).
 * [COMPLETAR: el lead verifica de día que este endpoint responde y que es el
 * BNA vendedor; si no, otra fuente. Decisión 2 de la R58, default: dolarapi.]
 */
export const URL_DOLAR_OFICIAL = 'https://dolarapi.com/v1/dolares/oficial'

/** Rango de cordura del dólar en pesos: fuera de esto la respuesta se descarta. */
export const TIPO_CAMBIO_MIN = 500
export const TIPO_CAMBIO_MAX = 5_000

export type CodigoFuente = 'TC_TIMEOUT' | 'TC_RED' | 'TC_HTTP' | 'TC_INVALIDO'

export interface TipoCambio {
  valor: number
  /** Día de Salta de `fechaActualizacion`, `'AAAA-MM-DD'`. */
  fecha: string
}

export interface OpcionesTipoCambio {
  fetch: typeof fetch
  ahora: Date
  timeoutMs?: number
  /** Para loguear solo el código; por defecto no loguea nada. */
  alFallar?: (codigo: CodigoFuente) => void
}

export async function obtenerTipoCambio(opciones: OpcionesTipoCambio): Promise<TipoCambio | null> {
  const { ahora, timeoutMs = 10_000 } = opciones
  const fallar = (codigo: CodigoFuente): null => {
    try {
      opciones.alFallar?.(codigo)
    } catch {
      // el aviso nunca rompe la fuente
    }
    return null
  }

  let json: unknown
  try {
    const res = await opciones.fetch(URL_DOLAR_OFICIAL, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (res.status !== 200) return fallar('TC_HTTP')
    json = await res.json()
  } catch (err) {
    const nombre = err instanceof Error ? err.name : ''
    if (nombre === 'TimeoutError' || nombre === 'AbortError') return fallar('TC_TIMEOUT')
    // Un JSON roto también cae acá (SyntaxError): es una respuesta inválida.
    if (nombre === 'SyntaxError') return fallar('TC_INVALIDO')
    return fallar('TC_RED')
  }

  if (typeof json !== 'object' || json === null || Array.isArray(json)) return fallar('TC_INVALIDO')
  const { venta, fechaActualizacion } = json as Record<string, unknown>
  if (typeof venta !== 'number' || !Number.isFinite(venta)) return fallar('TC_INVALIDO')
  if (venta < TIPO_CAMBIO_MIN || venta > TIPO_CAMBIO_MAX) return fallar('TC_INVALIDO')
  if (typeof fechaActualizacion !== 'string') return fallar('TC_INVALIDO')
  const instante = new Date(fechaActualizacion)
  if (Number.isNaN(instante.getTime())) return fallar('TC_INVALIDO')

  const fecha = formatSaltaDayKey(instante)
  const hoy = formatSaltaDayKey(ahora)
  const ayer = formatSaltaDayKey(new Date(ahora.getTime() - 24 * 3_600_000))
  if (fecha !== hoy && fecha !== ayer) return fallar('TC_INVALIDO')

  return { valor: venta, fecha }
}

// La audiencia web: con la decisión 1 en su default (manual) no hay adaptador.
// [COMPLETAR: endpoint verificado de Vercel Web Analytics y VERCEL_ANALYTICS_TOKEN,
// o "queda manual". Cuando exista, `obtenerAudienciaWeb` va acá con las mismas
// reglas: fetch inyectado, timeout, entero >= 0 y `null` ante cualquier falla.]
