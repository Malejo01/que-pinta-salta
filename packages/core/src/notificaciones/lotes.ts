/**
 * Partir arrays grandes en lotes (D2/Ronda 51, tarea 51-a): tokens de Expo
 * para `enviarLote` y usuarios para consultas `.in(...)` de PostgREST. Puro,
 * sin Supabase ni `fetch`: solo la aritmética de partir el array.
 */

/**
 * QPS-201: tamaño de lote para un `.in('columna', ids)` de PostgREST. Dos
 * límites de la base/proxy, no un número arbitrario: `max_rows` del
 * `postgrest.conf` de Supabase es 1000 por página, y la URL de un `.in` con
 * muchos uuids (36 caracteres cada uno) puede superar el límite de largo de
 * URL del proxy mucho antes de llegar a esos 1000. 200 ids de 36 caracteres
 * más la coma quedan bien debajo de cualquier límite razonable de largo de
 * URL, y en la práctica no se vio ninguna consulta de esta app necesitar más
 * de un par de lotes de 200.
 */
export const TAMANIO_LOTE_IN = 200

/**
 * QPS-201: tamaño de página para leer de una tabla grande sin `.in`, por
 * ejemplo paginando `notification_sends` o tokens de Expo. 1000 porque es el
 * `max_rows` de PostgREST (`postgrest.conf` de Supabase): una página de más
 * de 1000 filas nunca llega completa, por más que se pida con `.range(...)`.
 */
export const TAMANIO_PAGINA_TOKENS = 1000

/**
 * Parte `items` en lotes de como mucho `tamanio` elementos, en el mismo
 * orden. Con 0 elementos devuelve `[]` (no `[[]]`: un lote vacío no sirve
 * para nada, ni para un `.in(...)` ni para `enviarLote`). Con `tamanio <= 0`
 * tira un error explícito en vez de colgarse en un bucle infinito (el `for`
 * de abajo nunca avanza si el paso es 0 o negativo).
 */
export function enLotes<T>(items: T[], tamanio: number = TAMANIO_LOTE_IN): T[][] {
  if (tamanio <= 0) {
    throw new Error(`enLotes: el tamaño del lote tiene que ser mayor que 0 (recibido ${tamanio}).`)
  }
  if (items.length === 0) return []

  const lotes: T[][] = []
  for (let i = 0; i < items.length; i += tamanio) {
    lotes.push(items.slice(i, i + tamanio))
  }
  return lotes
}
