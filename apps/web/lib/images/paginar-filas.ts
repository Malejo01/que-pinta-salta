/**
 * Lee todas las filas de una consulta de Supabase, de a páginas (QPS-162).
 *
 * PostgREST corta cada `select` en 1000 filas (el `max-rows` de Supabase): sin
 * `.range()`, `scripts/imagenes-externas.ts` leía siempre las mismas ~1000 de
 * las ~1470 de `events` y el resto no se copiaba nunca.
 *
 * `traerPagina(desde, hasta)` es la consulta con `.order(...)` estable y
 * `.range(desde, hasta)`. Se avanza por la cantidad de filas que llegaron (no
 * por el tamaño pedido) y se corta con la primera página vacía: así no se
 * saltea nada aunque el servidor tenga un tope menor que `tamano`.
 */
export const TAMANO_PAGINA = 1000

export type TraerPagina<T> = (
  desde: number,
  hasta: number
) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>

export async function traerTodasLasFilas<T>(traerPagina: TraerPagina<T>, tamano = TAMANO_PAGINA): Promise<T[]> {
  const filas: T[] = []
  let desde = 0
  for (;;) {
    const { data, error } = await traerPagina(desde, desde + tamano - 1)
    if (error) throw new Error(error.message)
    const pagina = data ?? []
    if (pagina.length === 0) return filas
    filas.push(...pagina)
    desde += pagina.length
  }
}
