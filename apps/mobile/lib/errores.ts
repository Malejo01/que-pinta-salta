// Clasificador genérico de errores de PostgREST sobre una tabla o vista que
// puede no existir todavía en este entorno (QPS-131, R27 tarea 27-b):
// generalización de `clasificarErrorAsistencia` (R26, 26-b/26-c), con
// exactamente la misma lógica, para que `lib/favoritos.ts`, `lib/radar.ts` y
// `lib/notificaciones.ts` no la repitan. `lib/asistencia.ts` reexporta esta
// función como `clasificarErrorAsistencia` (el nombre viejo), así que sus
// tests (26-c) siguen valiendo sin cambios.
const PGRST2XX_SCHEMA_CACHE_RE = /^PGRST2\d\d$/

/**
 * `'no-disponible'`: la tabla o la vista todavía no existen en este entorno
 * (`PGRST205`, `42P01`, o un `PGRST2xx` con "schema cache" en el mensaje).
 * Cualquier otro error (por ejemplo `42501`, o un error de red sin `code`):
 * `'error'`. Pura: no toca la red ni el estado de la app.
 */
export function clasificarErrorTabla(error: unknown): 'no-disponible' | 'error' {
  if (!error || typeof error !== 'object') return 'error'

  const registro = error as Record<string, unknown>
  const code = typeof registro.code === 'string' ? registro.code : ''
  const message = typeof registro.message === 'string' ? registro.message : ''

  if (code === 'PGRST205' || code === '42P01') return 'no-disponible'
  if (PGRST2XX_SCHEMA_CACHE_RE.test(code) && /schema cache/i.test(message)) return 'no-disponible'

  return 'error'
}
