// Favoritos de eventos, flyers de Instagram y películas (R27, tarea 27-b;
// paridad con la web, R29, tarea 29-a: F13; reescrito en la R47, tarea 47-e,
// QPS-197 para el modelo Guardar/Voy/Seguir). Con sesión: las tres columnas
// de `user_favorites` (`event_id`, `instagram_flyer_id`, `cinema_movie_id`)
// del usuario, y los detalles de cada una con el mismo select público que la
// web, pasados por `armarFavoritos` de `@qps/core/favoritos/armar` — la
// misma regla que usa `/favoritos` de la web (status, vigencia, agrupado),
// así que ni acá ni en la web se repite esa lógica. El `user_id` que recibe
// cada función es siempre el que la pantalla leyó de `useSession()`, nunca
// un parámetro de ruta. Marcar es un `insert` con `{ user_id, event_id }`;
// un `23505` (ya estaba marcado) cuenta como éxito, no como error.
//
// R47: Voy está *contenido* en Guardados (ver `@qps/core/asistencia`): sacar
// el ♥ de un evento con Voy tiene que sacar también el Voy, y como no hay
// transacción entre `event_attendance` y `user_favorites`, el ORDEN de las
// dos escrituras de `desmarcarFavorito` es la regla (ver ahí abajo). Y
// `obtenerFavoritos` separa la lista en `voy` (✓, social) y `eventos`
// (♥ Guardados) con `separarMisEventos` de `@qps/core/favoritos/mis-eventos`.
import { PUBLIC_EVENT_SELECT } from '@qps/core/events/public-select'
import { applyVigenciaPrefilter } from '@qps/core/events/vigencia'
import { armarFavoritos, idsDeFavoritos, type EventoFavorito } from '@qps/core/favoritos/armar'
import { idsDeEventosVoy, separarMisEventos } from '@qps/core/favoritos/mis-eventos'
import type { DisplayEvent } from '@qps/core/home/types'
import type { CinemaMovie } from '@qps/core/types'
import type { FlyerWithAccount } from '@qps/core/instagram-config'
import { obtenerCategorias } from '@/lib/datos/eventos'
import { estadoPermiteAgregar } from '@/lib/estado-evento'
import { MENSAJE_SIN_CONFIGURACION } from '@/lib/mensajes'
import { esErrorDeRed } from '@/lib/red'
import type { TipoFavorito } from '@/lib/rutas'
import { supabase } from '@/lib/supabase'

export { MENSAJE_SIN_CONFIGURACION }
export const MENSAJE_ERROR_RED = 'No pudimos cargar tus favoritos. Revisá tu conexión.'
export const MENSAJE_ERROR_GUARDAR = 'No pudimos guardar el favorito. Probá de nuevo.'
// QPS-195 (56-b): `marcarFavorito` de un evento (no de películas ni flyers,
// que no tienen `status` de evento; R69) chequea el estado ANTES del `insert`.
// Mismo mensaje para un borrador que para un id inventado — nunca "es un
// borrador" (ver `lib/estado-evento.ts`).
export const MENSAJE_EVENTO_NO_DISPONIBLE = 'Ese evento ya no está disponible.'

// R43, 43-b: `sinConexion` se suma cuando `esErrorDeRed` (lib/red.ts)
// reconoce alguna de las consultas (incluida `obtenerCategorias`, que ya
// trae su propia bandera) como "sin conexión", sobre la RESPUESTA COMPLETA
// de cada una, no solo su `error`. El mensaje no cambia. La caché vive en
// `lib/sin-conexion/favoritos.ts` (43-b): este archivo no toca AsyncStorage.
export type ResultadoFavoritos = { ok: true; voy: DisplayEvent[]; eventos: DisplayEvent[] } | { ok: false; error: string; sinConexion?: boolean }
export type ResultadoFavorito = { ok: true; marcado: boolean } | { ok: false; error: string }
export type ResultadoMarcarFavorito = { ok: true } | { ok: false; error: string }
/** `voyQuitado` es `true` solo si la fila propia que se borró tenía `kind === 'voy'` (ver `desmarcarFavorito`). */
export type ResultadoDesmarcarFavorito = { ok: true; voyQuitado: boolean } | { ok: false; error: string }

// R67, 67-a: `rutaDeFavorito` pasó a `rutaDeEvento` de `lib/rutas.ts`.
// R69, 69-a (QPS-353): `obtenerEsFavorito`, `marcarFavorito` y
// `desmarcarFavorito` aceptan el tipo (`TipoFavorito` de `lib/rutas.ts`) para
// poder guardar y sacar también películas y flyers.

/**
 * Los favoritos de `userId`, separados en dos listas (R47, QPS-197):
 *   - `voy`: los eventos marcados con ✓ Voy (`kind = 'voy'` en
 *     `event_attendance`), estén o no entre los favoritos de verdad — Voy
 *     está *contenido* en Guardados, pero un Voy viejo (de antes del
 *     backfill) puede no tener su fila de favorito todavía, y tiene que
 *     aparecer igual;
 *   - `eventos`: ♥ Guardados (el resto), aplanado en el mismo orden de
 *     siempre: flexibles primero, después por día (`armarFavoritos`; el
 *     layout de la web, "Mi Agenda", es 29-i). **No cambiar esa forma**: la
 *     pantalla pasa este arreglo por `agruparFavoritosParaSecciones`.
 * Sin nada de nada (ni favoritos, ni Voy, ni flyers, ni películas):
 * `{ ok: true, voy: [], eventos: [] }`, sin pedir nada más a la red.
 */
export async function obtenerFavoritos(userId: string): Promise<ResultadoFavoritos> {
  if (!supabase) return { ok: false, error: MENSAJE_SIN_CONFIGURACION }

  try {
    // La lectura de `event_attendance` (para los ids con Voy) va en el mismo
    // Promise.all que la de `user_favorites`, y ANTES del corte temprano de
    // más abajo: un Voy viejo sin favorito tiene que entrar en el cálculo de
    // "hay algo que mostrar" igual que si fuera un favorito de verdad.
    //
    // Decisión de esta tarea (no estaba en el encargo tal cual): si falla
    // SOLO la lectura de event_attendance (ya sea con un `error` en la
    // respuesta, o con una excepción de red), no tiramos abajo la pantalla
    // entera — seguimos con `idsVoy` vacío y la sección Guardados sigue
    // andando. Como mucho, un evento que solo tenía Voy (sin favorito) no
    // aparece en esta carga; es una degradación mucho menor que devolver
    // `ok: false` por un problema ajeno a Guardados. Por eso la promesa de
    // `event_attendance` tiene su propio `.then(…, …)`: así una excepción
    // en ESA consulta nunca hace que `Promise.all` rechace entero (lo que
    // tiraría también abajo la lectura de `user_favorites`, ya resuelta).
    const [resultadoFavoritos, resultadoVoy] = await Promise.all([
      supabase.from('user_favorites').select('event_id, instagram_flyer_id, cinema_movie_id').eq('user_id', userId),
      supabase.from('event_attendance').select('event_id, kind').eq('kind', 'voy').then(
        (resultado) => resultado,
        (excepcion) => ({ data: null, error: excepcion })
      ),
    ])

    const { data: filas, error: errorFavoritos } = resultadoFavoritos
    if (errorFavoritos) {
      return { ok: false, error: MENSAJE_ERROR_RED, sinConexion: esErrorDeRed(resultadoFavoritos) || undefined }
    }

    const idsVoy = resultadoVoy.error ? [] : idsDeEventosVoy(resultadoVoy.data ?? [])

    const { eventIds: eventIdsFavoritos, flyerIds, movieIds } = idsDeFavoritos(filas ?? [])
    // Los ids de Voy se unen a los de favoritos ANTES de pedir los eventos:
    // así, cuando lleguen armados, los eventos con Voy ya están adentro del
    // `armado` que separa `separarMisEventos` (ver más abajo).
    const eventIds = [...new Set([...eventIdsFavoritos, ...idsVoy])]

    if (eventIds.length === 0 && flyerIds.length === 0 && movieIds.length === 0) {
      return { ok: true, voy: [], eventos: [] }
    }

    const ahora = new Date()

    const [eventosRes, flyersRes, moviesRes, categoriasRes] = await Promise.all([
      eventIds.length > 0
        ? applyVigenciaPrefilter(
            supabase.from('events').select(PUBLIC_EVENT_SELECT).in('id', eventIds).eq('status', 'PUBLISHED'),
            ahora,
          )
        : Promise.resolve({ data: [] as unknown[], error: null }),
      flyerIds.length > 0
        ? supabase
            .from('instagram_flyers')
            .select('*, account:instagram_accounts(*)')
            .in('id', flyerIds)
            .eq('status', 'ACTIVE')
        : Promise.resolve({ data: [] as unknown[], error: null }),
      movieIds.length > 0
        ? supabase.from('cinema_movies').select('*').in('id', movieIds).eq('is_currently_showing', true)
        : Promise.resolve({ data: [] as unknown[], error: null }),
      obtenerCategorias(),
    ])

    if (eventosRes.error || flyersRes.error || moviesRes.error) {
      const sinConexion = esErrorDeRed(eventosRes) || esErrorDeRed(flyersRes) || esErrorDeRed(moviesRes)
      return { ok: false, error: MENSAJE_ERROR_RED, sinConexion: sinConexion || undefined }
    }
    // El texto es siempre el de esta pantalla (no el de `obtenerCategorias`,
    // pensado para Buscar): nunca se mezclan los mensajes de dos módulos.
    // `sinConexion` sí viaja: es la bandera que `obtenerCategorias` ya
    // propagó (trampa de la tarea — pasarle `categoriasRes` entero a
    // `esErrorDeRed` daría siempre `false`, porque no tiene la forma de una
    // respuesta de postgrest).
    if (!categoriasRes.ok) return { ok: false, error: MENSAJE_ERROR_RED, sinConexion: categoriasRes.sinConexion }

    const categoryNameBySlug = new Map(categoriasRes.categorias.map((c) => [c.slug, c.name]))

    // PUBLIC_EVENT_SELECT es un string armado en runtime (no un literal), así
    // que supabase-js no puede inferir con él el tipo de la fila: "as unknown
    // as" en vez de "as" (mismo patrón que lib/datos/eventos.ts).
    const eventos = (eventosRes.data ?? []) as unknown as EventoFavorito[]
    const flyers = (flyersRes.data ?? []) as unknown as FlyerWithAccount[]
    const peliculas = (moviesRes.data ?? []) as unknown as CinemaMovie[]

    const armado = armarFavoritos({ eventos, flyers, peliculas, categoryNameBySlug }, ahora)

    // Corrección al encargo (ver el encargo de esta tarea): NO se usa el
    // tercer parámetro `extrasVoy` de `separarMisEventos`. Como `idsVoy` ya
    // se unió a `eventIds` ANTES de pedir los eventos, cualquier evento con
    // Voy ya está dentro de `armado` (si sigue vigente y PUBLISHED): pasar
    // además `extrasVoy` sería un segundo camino para lo mismo. `extrasVoy`
    // es para el caso en que un Voy no tiene su evento en `armado` (por
    // ejemplo, un evento no vigente): acá eso simplemente no debería pasar,
    // porque la consulta de events ya incluyó esos ids.
    const { voy, guardados } = separarMisEventos(armado, idsVoy)

    // La pantalla (47-g) pasa este arreglo por `agruparFavoritosParaSecciones`:
    // tiene que seguir siendo un arreglo plano, en el orden de siempre
    // (flexibles primero, después por día).
    return {
      ok: true,
      voy,
      eventos: [...guardados.flexibles, ...guardados.porDia.flatMap((grupo) => grupo.items)],
    }
  } catch (e) {
    return { ok: false, error: MENSAJE_ERROR_RED, sinConexion: esErrorDeRed(e) || undefined }
  }
}

// R69, 69-a (QPS-353): la columna de `user_favorites` según el tipo. Las tres
// funciones de abajo reciben el tipo (por defecto `'event'`, como siempre) y
// el uuid pelado: nunca un id con prefijo.
const COLUMNA_POR_TIPO = {
  event: 'event_id',
  cinema: 'cinema_movie_id',
  flyer: 'instagram_flyer_id',
} as const satisfies Record<TipoFavorito, 'event_id' | 'cinema_movie_id' | 'instagram_flyer_id'>

/** Si `id` (del `tipo` dado) está entre los favoritos de `userId` (para el botón de la ficha). */
export async function obtenerEsFavorito(id: string, userId: string, tipo: TipoFavorito = 'event'): Promise<ResultadoFavorito> {
  if (!supabase) return { ok: false, error: MENSAJE_SIN_CONFIGURACION }

  try {
    const columna = COLUMNA_POR_TIPO[tipo]
    const { data, error } = await supabase
      .from('user_favorites')
      .select(columna)
      .eq('user_id', userId)
      .eq(columna, id)
      .maybeSingle()

    if (error) return { ok: false, error: MENSAJE_ERROR_RED }

    return { ok: true, marcado: Boolean(data) }
  } catch {
    return { ok: false, error: MENSAJE_ERROR_RED }
  }
}

/**
 * Marca `id` (del `tipo` dado) como favorito de `userId`: un `insert` con
 * `user_id` y la columna del tipo. Un `23505` (la unique de `user_favorites`
 * por `user_id` + esa columna: ya estaba marcado) cuenta como éxito.
 *
 * QPS-195 (56-b): para un EVENTO (`tipo` `'event'`, el valor por defecto)
 * antes del `insert` se consulta
 * `estadoPermiteAgregar(id)` (lib/estado-evento.ts). `'no'` (el evento
 * ya no está disponible — borrador o id inexistente, nunca se distingue uno
 * de otro) → error con `MENSAJE_EVENTO_NO_DISPONIBLE`, sin `insert`. `'error'`
 * → `MENSAJE_ERROR_GUARDAR`, sin `insert`.
 *
 * R69, 69-a: con `tipo` `'cinema'` o `'flyer'` el `insert` lleva
 * `cinema_movie_id` / `instagram_flyer_id` y NO se chequea
 * `estadoPermiteAgregar` (no tienen `status` de evento).
 */
export async function marcarFavorito(id: string, userId: string, tipo: TipoFavorito = 'event'): Promise<ResultadoMarcarFavorito> {
  if (!supabase) return { ok: false, error: MENSAJE_SIN_CONFIGURACION }

  if (tipo === 'event') {
    const estadoEvento = await estadoPermiteAgregar(id)
    if (estadoEvento === 'no') return { ok: false, error: MENSAJE_EVENTO_NO_DISPONIBLE }
    if (estadoEvento === 'error') return { ok: false, error: MENSAJE_ERROR_GUARDAR }
  }

  try {
    const fila: { user_id: string; event_id?: string; cinema_movie_id?: string; instagram_flyer_id?: string } =
      tipo === 'cinema'
        ? { user_id: userId, cinema_movie_id: id }
        : tipo === 'flyer'
          ? { user_id: userId, instagram_flyer_id: id }
          : { user_id: userId, event_id: id }
    const { error } = await supabase.from('user_favorites').insert(fila)
    if (error && error.code !== '23505') return { ok: false, error: MENSAJE_ERROR_GUARDAR }
    return { ok: true }
  } catch {
    return { ok: false, error: MENSAJE_ERROR_GUARDAR }
  }
}

/**
 * Desmarca `id` (del `tipo` dado) de los favoritos de `userId` (sacar el ♥).
 * R69, 69-a: para película o flyer es solo el `delete` de `user_favorites`,
 * con `voyQuitado: false`; lo que sigue vale para un evento. Voy está
 * *contenido* en Guardados (ver `@qps/core/asistencia`), y como no hay una
 * transacción que una las dos tablas, el ORDEN de los dos deletes es la
 * regla que mantiene el invariante "nunca un Voy sin Guardado":
 *   1) primero `event_attendance` (`.select('kind')` para saber si lo que
 *      se borró era un Voy; filtrado SOLO por `event_id` — nunca `user_id`,
 *      la RLS del dueño ya acota esto a la fila propia);
 *   2) recién si el paso 1 salió bien, el `delete` del favorito.
 * Si el primer delete falla, no se intenta el segundo: así el evento sigue
 * Guardado (y con Voy) en vez de quedar sin favorito pero todavía con una
 * fila de `event_attendance` — el único estado intermedio permitido es
 * "Guardado sin Voy", nunca al revés.
 *
 * `voyQuitado` es `true` solo si la fila borrada en el paso 1 tenía
 * `kind === 'voy'`. Una fila vieja `me_interesa` (o ninguna fila) se borra
 * igual, pero no cuenta como `voyQuitado`: el aviso de "ya no figurás como
 * que vas" no tendría sentido para una marca que nunca fue Voy.
 */
export async function desmarcarFavorito(id: string, userId: string, tipo: TipoFavorito = 'event'): Promise<ResultadoDesmarcarFavorito> {
  if (!supabase) return { ok: false, error: MENSAJE_SIN_CONFIGURACION }

  // R69, 69-a (QPS-353): película y flyer NO tocan `event_attendance` (Voy es
  // de eventos): solo el `delete` de `user_favorites` por la columna que
  // corresponde, y `voyQuitado` es siempre `false`.
  if (tipo !== 'event') {
    try {
      const { error } = await supabase.from('user_favorites').delete().eq('user_id', userId).eq(COLUMNA_POR_TIPO[tipo], id)
      if (error) return { ok: false, error: MENSAJE_ERROR_GUARDAR }
      return { ok: true, voyQuitado: false }
    } catch {
      return { ok: false, error: MENSAJE_ERROR_GUARDAR }
    }
  }

  const eventId = id
  try {
    const { data: filasBorradas, error: errorAsistencia } = await supabase
      .from('event_attendance')
      .delete()
      .eq('event_id', eventId)
      .select('kind')

    if (errorAsistencia) return { ok: false, error: MENSAJE_ERROR_GUARDAR }

    const voyQuitado = (filasBorradas ?? []).some((fila: { kind: string | null }) => fila.kind === 'voy')

    const { error } = await supabase.from('user_favorites').delete().eq('user_id', userId).eq('event_id', eventId)
    if (error) return { ok: false, error: MENSAJE_ERROR_GUARDAR }

    return { ok: true, voyQuitado }
  } catch {
    return { ok: false, error: MENSAJE_ERROR_GUARDAR }
  }
}
