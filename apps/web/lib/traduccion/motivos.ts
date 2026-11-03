/**
 * Q6-10: por qué falló la llamada al modelo en la traducción, en códigos fijos
 * que van a `job_runs` (nunca el mensaje del proveedor: puede repetir el texto
 * del evento o datos de la cuenta).
 *
 * Antes, `traducirEvento` tragaba cualquier excepción y devolvía `null`, y la
 * corrida la contaba como «descartada» y marcaba el evento como intentado: el
 * 3/11 los 100 intentos fallaron en la llamada (sin crédito de Gemini, 402) y
 * quedaron como 100 «descartados» que no se reintentan.
 *
 * Los códigos son los mismos que `CodigoErrorIA` de la capa `lib/ia` (Q6-3,
 * #187), más `desconocido`. Se reconocen por forma (sin importar clases):
 *  - `codigo` (texto): el `ErrorIA` de `lib/ia` después de #187.
 *  - `status` o `estado` (número): el `ApiError` de `@google/genai`, que es
 *    lo que tira `lib/ai/gemini.ts` hoy.
 *  - el aviso de clave faltante de `lib/ai/gemini.ts`, la respuesta vacía y
 *    el JSON roto (`SyntaxError`).
 */
export type CodigoFalloTraduccion =
  | 'sin_clave'
  | 'no_autorizado'
  | 'sin_credito'
  | 'limite'
  | 'timeout'
  | 'respuesta_invalida'
  | 'solicitud_invalida'
  | 'error_proveedor'
  | 'red'
  | 'desconocido'

const CODIGOS: readonly CodigoFalloTraduccion[] = [
  'sin_clave',
  'no_autorizado',
  'sin_credito',
  'limite',
  'timeout',
  'respuesta_invalida',
  'solicitud_invalida',
  'error_proveedor',
  'red',
  'desconocido',
]

/** Texto fijo para `job_runs.errors` y el chequeo de salud. */
export const DESCRIPCION_FALLO: Record<CodigoFalloTraduccion, string> = {
  sin_clave: 'falta la clave de IA',
  no_autorizado: 'clave de IA inválida o sin permiso (401/403)',
  sin_credito: 'créditos de IA agotados o problema de facturación (402)',
  limite: 'límite de uso de la IA alcanzado (429)',
  timeout: 'la IA no respondió a tiempo',
  respuesta_invalida: 'respuesta vacía o fuera del formato pedido',
  solicitud_invalida: 'el proveedor de IA rechazó el pedido (4xx)',
  error_proveedor: 'error del proveedor de IA (5xx)',
  red: 'no se pudo conectar con la IA',
  desconocido: 'error desconocido al llamar a la IA',
}

/** Igual que `codigoPorEstado` de `lib/ia/errores.ts` (#187). */
function codigoPorEstado(estado: number): CodigoFalloTraduccion {
  if (estado === 401 || estado === 403) return 'no_autorizado'
  if (estado === 402) return 'sin_credito'
  if (estado === 429) return 'limite'
  if (estado === 408 || estado === 504) return 'timeout'
  if (estado >= 500) return 'error_proveedor'
  return 'solicitud_invalida'
}

export function codigoDelFallo(error: unknown): CodigoFalloTraduccion {
  if (!error || typeof error !== 'object') return 'desconocido'
  const e = error as { codigo?: unknown; status?: unknown; estado?: unknown; name?: unknown; message?: unknown }
  if (typeof e.codigo === 'string' && (CODIGOS as readonly string[]).includes(e.codigo)) return e.codigo as CodigoFalloTraduccion
  const estado = typeof e.status === 'number' ? e.status : typeof e.estado === 'number' ? e.estado : null
  if (estado !== null && estado >= 400) return codigoPorEstado(estado)
  if (e.name === 'TimeoutError' || e.name === 'AbortError') return 'timeout'
  if (e.name === 'SyntaxError') return 'respuesta_invalida'
  const mensaje = typeof e.message === 'string' ? e.message : ''
  if (mensaje.includes('GEMINI_API_KEY')) return 'sin_clave'
  if (/respuesta vac[ií]a/i.test(mensaje)) return 'respuesta_invalida'
  if (e.name === 'TypeError' && /fetch failed/i.test(mensaje)) return 'red'
  return 'desconocido'
}

/**
 * El modelo contestó, pero mal: cuenta como descarte (el evento queda marcado
 * y no se reintenta, porque la llamada ya se pagó). Cualquier otro fallo es del
 * proveedor: el evento NO se marca (se reintenta otro día) y la corrida se corta.
 */
export function esRespuestaDelModelo(codigo: CodigoFalloTraduccion): boolean {
  return codigo === 'respuesta_invalida'
}
