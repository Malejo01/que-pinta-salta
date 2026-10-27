/**
 * Tramos de audiencia de la publicidad (R58).
 *
 * Fuente: `ops/estudio-precios-publicidad.md`, sección "Precios anclados al
 * dólar BNA, recalculados una vez por mes con reglas fijas". El precio no
 * sigue la audiencia mes a mes: salta por tramos, y el cambio de tramo lleva
 * histéresis (dos ciclos seguidos) y se anuncia con 30 días de anticipación.
 *
 * Todo es puro: sin fechas ni red.
 */

/**
 * Los tramos, como pares `[desde, tramo]`: la audiencia (usuarios activos en
 * 28 días) desde la que empieza cada tramo y el valor de referencia del tramo.
 *   menos de 750   -> 500
 *   750 a 2.499    -> 1.000
 *   2.500 a 9.999  -> 5.000
 *   10.000 a 34.999 -> 20.000
 *   35.000 o más   -> 50.000, y +25.000 por cada 25.000 más (60.000 -> 75.000...)
 */
export const TRAMOS: readonly (readonly [desde: number, tramo: number])[] = [
  [0, 500],
  [750, 1000],
  [2500, 5000],
  [10000, 20000],
  [35000, 50000],
]

/** Primer tramo de la serie abierta y el paso de la serie (cada 25.000 más). */
const TRAMO_ABIERTO_DESDE = 35000
const TRAMO_ABIERTO_VALOR = 50000
const PASO_TRAMO_ABIERTO = 25000

/** Porcentaje del umbral del tramo vigente por debajo del cual se baja (85%). */
export const FRACCION_BAJA_TRAMO = 0.85

function audienciaSegura(audiencia: number): number {
  return Number.isFinite(audiencia) && audiencia > 0 ? audiencia : 0
}

/** El tramo de referencia de una audiencia. Negativa o no finita cuenta como 0. */
export function tramoDeAudiencia(audiencia: number): number {
  const a = audienciaSegura(audiencia)
  if (a >= TRAMO_ABIERTO_DESDE) {
    // 35.000 -> 50.000; 60.000 -> 75.000; 85.000 -> 100.000...
    const pasos = Math.floor((a - TRAMO_ABIERTO_DESDE) / PASO_TRAMO_ABIERTO)
    return TRAMO_ABIERTO_VALOR + pasos * PASO_TRAMO_ABIERTO
  }
  let tramo = TRAMOS[0][1]
  for (const [desde, valor] of TRAMOS) {
    if (a >= desde) tramo = valor
  }
  return tramo
}

/** La audiencia desde la que empieza un tramo (0 para el de 500). */
export function umbralDeTramo(tramo: number): number {
  if (!Number.isFinite(tramo) || tramo <= TRAMOS[0][1]) return 0
  if (tramo >= TRAMO_ABIERTO_VALOR) {
    return TRAMO_ABIERTO_DESDE + Math.round((tramo - TRAMO_ABIERTO_VALOR) / PASO_TRAMO_ABIERTO) * PASO_TRAMO_ABIERTO
  }
  let desde = 0
  for (const [d, valor] of TRAMOS) {
    if (valor <= tramo) desde = d
  }
  return desde
}

export interface EntradaHisteresis {
  /** El tramo que rige hoy. */
  vigente: number
  /** El tramo que calculó el ciclo anterior (sobre su audiencia). */
  calculadoAnterior: number
  /** El tramo que calcula este ciclo. */
  calculadoActual: number
  audienciaActual: number
  /** `null` si no hay ciclo anterior: entonces nunca hay cambio. */
  audienciaAnterior: number | null
}

export interface ResultadoHisteresis {
  /** Siempre el vigente: el cambio se anuncia, no se aplica en el mismo ciclo. */
  tramo: number
  cambioAnunciado: { tramoNuevo: number } | null
}

/**
 * Histéresis del cambio de tramo.
 *
 * - Sube solo si el calculado está por encima del vigente en dos ciclos
 *   seguidos; el tramo nuevo sale de la menor de las dos audiencias.
 * - Baja solo si las dos audiencias quedan por debajo del 85% del umbral del
 *   tramo vigente; el tramo nuevo sale de la mayor de las dos. El de 500 no baja.
 * - El tramo devuelto es el vigente: el precio nuevo entra el ciclo siguiente.
 */
export function aplicarHisteresis(entrada: EntradaHisteresis): ResultadoHisteresis {
  const { vigente, calculadoAnterior, calculadoActual, audienciaActual, audienciaAnterior } = entrada
  const sinCambio: ResultadoHisteresis = { tramo: vigente, cambioAnunciado: null }
  if (audienciaAnterior === null) return sinCambio

  if (calculadoActual > vigente && calculadoAnterior > vigente) {
    const tramoNuevo = tramoDeAudiencia(Math.min(audienciaActual, audienciaAnterior))
    // La menor de las dos audiencias puede no superar al vigente: ahí no hay suba.
    if (tramoNuevo > vigente) return { tramo: vigente, cambioAnunciado: { tramoNuevo } }
    return sinCambio
  }

  if (vigente > TRAMOS[0][1]) {
    const limite = umbralDeTramo(vigente) * FRACCION_BAJA_TRAMO
    if (audienciaActual < limite && audienciaAnterior < limite) {
      const tramoNuevo = tramoDeAudiencia(Math.max(audienciaActual, audienciaAnterior))
      if (tramoNuevo < vigente) return { tramo: vigente, cambioAnunciado: { tramoNuevo } }
    }
  }
  return sinCambio
}
