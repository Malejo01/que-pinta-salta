/**
 * QPS-201 (D2/Ronda 51, tarea 51-b): leer TODAS las filas de una consulta que
 * puede superar el `max_rows` de PostgREST (1000, `postgrest.conf` de
 * Supabase — ver también `TAMANIO_PAGINA_TOKENS` de
 * `@qps/core/notificaciones/lotes`, que documenta el mismo límite del lado
 * del tamaño de página). Esto es DISTINTO del problema del largo de la URL
 * de un `.in(...)` (ese lo resuelve `enLotes`, de ese mismo módulo de core):
 * acá el problema es que una sola consulta, aunque la URL le entre entera,
 * puede tener más de 1000 filas para devolver, y PostgREST nunca manda más
 * de una página aunque se pida con `.range(...)`.
 *
 * Por qué hace falta esto para la garantía de "como mucho un aviso
 * patrocinado por semana" (D2/Ronda 51): esa garantía se apoya en leer TODOS
 * los `notification_sends` de la gente de esta tanda. La clave única de la
 * base (`notification_sends_dedupe_key_key`) es la segunda barrera, pero la
 * fila se inserta DESPUÉS de que el push ya salió: si la lectura viene
 * cortada en 1000 filas por `max_rows`, el aviso patrocinado se vuelve a
 * armar como candidato y se manda de nuevo, y lo único que falla es el
 * `INSERT` final (que ya no evita nada, porque Expo ya mandó el push). Por
 * eso `leerPaginado` no es un detalle de prolijidad: sin paginar, la promesa
 * de la ronda no se cumple.
 *
 * Nada de Supabase importado acá: `pedirPagina` ya viene armado por quien
 * llama (`lib/notificaciones/novedades.ts`, `app/api/cron/notificaciones/route.ts`),
 * con su propio `.select(...)`/`.eq(...)`/`.in(...)` y el `.range(desde, hasta)`
 * puesto. Este archivo solo sabe cuándo parar y cuándo rendirse.
 */

/**
 * Tope de páginas por llamada a `leerPaginado`: nunca un bucle sin límite. Si
 * una base (o un doble de test) ignora `.range(...)` y siempre devuelve la
 * tabla entera, cada "página" tendría el mismo tamaño que la anterior y el
 * bucle de abajo correría para siempre sin este tope. 50 páginas de
 * `TAMANIO_PAGINA_TOKENS` (1000) filas son 50.000 filas: bien por encima de
 * lo que cualquier lectura real de esta app necesita hoy (ver
 * `tokensTruncados` en la ruta, para cuando igual se llega al tope).
 */
export const TOPE_PAGINAS = 50

export type ResultadoPaginado<T> =
  | { ok: true; filas: T[]; truncado: boolean }
  | { ok: false; error: string }

/** Lo mínimo que `pedirPagina` tiene que devolver: la forma de un `await` de Supabase, sin importar el tipo del cliente. */
export interface RespuestaDePagina<T> {
  data: T[] | null
  error: { message: string } | null
}

/**
 * Lee todas las páginas de una consulta, llamando a `pedirPagina(desde, hasta)`
 * una vez por página (quien llama le aplica `.range(desde, hasta)` a su
 * propia consulta, con el MISMO orden estable en cada llamada: sin un orden
 * total, dos páginas se pueden pisar o repetir filas).
 *
 * Corta en la primera página que viene con MENOS filas que `tamanioPagina`
 * (la señal de que ya no hay más: ninguna base devuelve una página de menos
 * del tamaño pedido si todavía quedan filas). Si se llega a `TOPE_PAGINAS`
 * páginas sin ver nunca una página corta, se rinde: devuelve lo que juntó
 * hasta ahí con `truncado: true`, para que quien llama decida qué hacer (la
 * ruta, para `push_tokens`, lo informa en `details.tokensTruncados` y deja la
 * corrida `PARTIAL`).
 *
 * Si cualquier página devuelve `error`, se corta ahí mismo: `{ ok: false,
 * error }`, sin la fila a medias de esa página ni las que ya se habían
 * juntado. Es la misma regla que ya usan `enviarNotificaciones` y
 * `cargarNovedades`: si falla una lectura, falla la lectura entera.
 */
export async function leerPaginado<T>(
  tamanioPagina: number,
  pedirPagina: (desde: number, hasta: number) => PromiseLike<RespuestaDePagina<T>>,
): Promise<ResultadoPaginado<T>> {
  const filas: T[] = []

  for (let pagina = 0; pagina < TOPE_PAGINAS; pagina++) {
    const desde = pagina * tamanioPagina
    const hasta = desde + tamanioPagina - 1
    const { data, error } = await pedirPagina(desde, hasta)
    if (error) return { ok: false, error: error.message }

    const filasDeLaPagina = data ?? []
    filas.push(...filasDeLaPagina)

    if (filasDeLaPagina.length < tamanioPagina) return { ok: true, filas, truncado: false }
  }

  return { ok: true, filas, truncado: true }
}
