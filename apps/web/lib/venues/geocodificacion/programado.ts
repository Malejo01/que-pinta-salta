/**
 * Geocodificación PROGRAMADA (Q4-3, pregunta 21, opción 1): el mismo script de
 * la R53/R84 (`scripts/geocodificar-lugares.ts --programado`), disparado una
 * vez por día por `.github/workflows/geocodificar-lugares.yml`.
 *
 * La política de uso de Nominatim restringe los scripts periódicos a 4
 * pedidos por minuto (https://operations.osmfoundation.org/policies/nominatim/).
 * Reglas propias, más estrictas, fijadas acá y en los tests:
 *  - Q7-2: como mucho 20 lugares por corrida (configurable con
 *    `GEOCODIFICACION_TOPE`, hasta 30), primero los que tienen eventos
 *    próximos publicados y después el resto (antes solo miraba los que
 *    tenían eventos, y por eso la cola no avanzaba);
 *  - 15,1 s entre pedidos (menos de 4 por minuto, contando reintentos: el
 *    cliente espera su turno en cada intento);
 *  - un lugar sin resultado no se repite antes de 30 días
 *    (`venues.geocode_intentado_at`);
 *  - Q5-16 (decisión nº7): un lugar con una sugerencia pendiente
 *    (`venues.geocode_sugerencia_lat` no nulo) no se vuelve a consultar NUNCA
 *    solo, aunque hayan pasado los 30 días: espera a que un admin la confirme
 *    o la descarte en /admin/lugares (al descartarla vuelve a la regla de los
 *    30 días). Ya no se reintenta a ciegas;
 *  - nunca rehace coordenadas de Nominatim ni pisa las cargadas a mano.
 * Los de confianza alta se guardan solos; los «para revisar» dejan guardada
 * la mejor sugerencia (sin tocar `latitude`/`longitude`, ver `./sugerencia`)
 * y, como los sin resultado, quedan en la pestaña «Sin ubicación» de
 * /admin/lugares, donde la sugerencia se confirma con un botón.
 *
 * Puro: sin red ni base.
 */
import type { FilaReporteGeocodificacion } from './plan'

/**
 * Q7-2: cuántos lugares mira por defecto la corrida programada (antes, 10).
 * Se cambia con la variable `GEOCODIFICACION_TOPE` del workflow, sin pasar
 * nunca de `TOPE_PROGRAMADO_MAXIMO`. Los que se resuelven por un link de
 * Google Maps de sus eventos no cuentan: no le piden nada a Nominatim.
 */
export const TOPE_PROGRAMADO_POR_DEFECTO = 20
/** Techo de `GEOCODIFICACION_TOPE`: 30 lugares × 4 consultas × 15,1 s ≈ 30 min, dentro del timeout del workflow. */
export const TOPE_PROGRAMADO_MAXIMO = 30
/**
 * Espera mínima entre pedidos de la corrida programada: menos de 4 por minuto
 * (la regla de la política para los scripts periódicos), que de paso cumple
 * con creces el «como mucho 1 pedido por segundo» de cualquier uso.
 */
export const INTERVALO_PROGRAMADO_MS = 15_100
export const DIAS_ENTRE_INTENTOS = 30
/**
 * Q7-2: la corrida programada no empieza un lugar nuevo pasados estos minutos
 * (el workflow corta a los 45): los que quedan van mañana, sin marcarse como
 * intentados.
 */
export const PRESUPUESTO_PROGRAMADO_MS = 35 * 60 * 1000

/**
 * El tope de la corrida programada a partir de `GEOCODIFICACION_TOPE` (texto
 * del entorno). Vacío o inválido: `TOPE_PROGRAMADO_POR_DEFECTO`. Nunca menos
 * de 1 ni más de `TOPE_PROGRAMADO_MAXIMO`.
 */
export function topeProgramado(valor: string | undefined | null): number {
  if (valor === undefined || valor === null || valor.trim() === '') return TOPE_PROGRAMADO_POR_DEFECTO
  const numero = Number(valor.trim())
  if (!Number.isInteger(numero) || numero < 1) return TOPE_PROGRAMADO_POR_DEFECTO
  return Math.min(numero, TOPE_PROGRAMADO_MAXIMO)
}

const MS_POR_DIA = 24 * 60 * 60 * 1000

/**
 * Los lugares que no se intentaron en los últimos `dias` días (o nunca) y que
 * no tienen una sugerencia pendiente (Q5-16: esos esperan al admin, sin
 * importar cuánto tiempo pasó).
 */
export function sinIntentoReciente<
  T extends { geocode_intentado_at?: string | null; geocode_sugerencia_lat?: number | null },
>(lugares: T[], ahora: Date, dias = DIAS_ENTRE_INTENTOS): T[] {
  const limite = ahora.getTime() - dias * MS_POR_DIA
  return lugares.filter((lugar) => {
    // Q5-16: con sugerencia pendiente (el check de la base exige lat, lng y la
    // fecha juntas, así que alcanza con la latitud) no se consulta de nuevo.
    if (lugar.geocode_sugerencia_lat !== null && lugar.geocode_sugerencia_lat !== undefined) return false
    if (!lugar.geocode_intentado_at) return true
    const cuando = Date.parse(lugar.geocode_intentado_at)
    return Number.isNaN(cuando) || cuando < limite
  })
}

export type ResultadoCorridaProgramada = {
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'SKIPPED'
  items_processed: number
  items_failed: number
  details: Record<string, number | boolean>
}

/**
 * La fila de `job_runs` de una corrida. Solo conteos: nunca nombres ni ids de
 * lugares. `bloqueado` = Nominatim respondió 403 (la corrida se cortó).
 */
export function resultadoDeCorrida(
  filas: Pick<FilaReporteGeocodificacion, 'estado'>[],
  { candidatos, bloqueado }: { candidatos: number; bloqueado: boolean },
): ResultadoCorridaProgramada {
  const cuenta = (estado: FilaReporteGeocodificacion['estado']) => filas.filter((f) => f.estado === estado).length
  const errores = cuenta('error')
  const details = {
    candidatos,
    mirados: filas.length,
    guardados: cuenta('guardado'),
    // Q7-2: los que quedaron como sugerencia por un link de Google Maps de sus eventos.
    sugeridosPorEnlace: cuenta('sugerido'),
    paraRevisar: cuenta('para-revisar'),
    sinResultado: cuenta('sin-resultado'),
    noSePiso: cuenta('no-se-pisó'),
    errores,
    ...(bloqueado ? { bloqueado: true } : {}),
  }
  let status: ResultadoCorridaProgramada['status'] = 'SUCCESS'
  if (candidatos === 0) status = 'SKIPPED'
  else if (bloqueado) status = 'FAILED'
  else if (errores > 0) status = 'PARTIAL'
  return { status, items_processed: filas.length, items_failed: errores, details }
}
