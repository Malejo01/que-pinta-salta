// Eventos de Inicio (R25, en memoria desde R36/36-a): mismo select público y
// misma vigencia que la web (`apps/web/lib/data.ts`), ahora desde
// `packages/core` para no copiar lógica. Ni una regla de fecha propia: el
// prefiltro y la vigencia son de `@qps/core/events/vigencia`, y qué evento
// cae en cada atajo (Hoy, Esta noche, Finde, Semana) es de
// `@qps/core/home/atajos`.
//
// 36-a (G2 del feedback del teléfono): Inicio pedía de nuevo los eventos
// vigentes en cada cambio de atajo (`obtenerEventosDeAtajo(atajo)`, una
// consulta por atajo aunque la consulta en sí era siempre la misma). Ahora
// se pide **una sola vez** con `obtenerEventosVigentesParaInicio` (sin
// `Atajo`) y el atajo se aplica en memoria, en el llamador, con
// `eventoEnAtajo` de core — por eso cada evento viaja junto con
// `EventoParaAtajo` (start_date, end_date y el slug de la categoría: lo que
// `eventoEnAtajo` necesita y que `DisplayEvent` no tiene, en particular
// `end_date`). `obtenerEventosDeAtajo` queda borrada: no tiene más uso.
import { PUBLIC_EVENT_SELECT } from '@qps/core/events/public-select'
import { applyVigenciaPrefilter, isVigente } from '@qps/core/events/vigencia'
import type { EventoParaAtajo } from '@qps/core/home/atajos'
import { transformEvent } from '@qps/core/home/transform'
import type { DisplayEvent, EventWithRelations } from '@qps/core/home/types'
import type { Category, Event, Venue } from '@qps/core/types'
import { esErrorDeRed } from '@/lib/red'
import { MENSAJE_SIN_CONFIGURACION } from '@/lib/mensajes'
import { supabase } from '@/lib/supabase'

export { MENSAJE_SIN_CONFIGURACION }
export const MENSAJE_ERROR_RED = 'No pudimos cargar los eventos. Revisá tu conexión.'

// R43, 43-b: `sinConexion` se suma a la rama de error cuando `esErrorDeRed`
// (lib/red.ts) la reconoce como "sin conexión" — nunca a partir del `error`
// solo, sino de la RESPUESTA COMPLETA (`{ error, status }`, porque
// postgrest-js 2.106 solo distingue un `fetch` rechazado de un 4xx/5xx por
// el `status`) o, en el `catch`, de la excepción atrapada. El mensaje no
// cambia. Quien construye la caché a partir de esto es
// `lib/sin-conexion/agenda.ts` (43-b): este archivo nunca toca AsyncStorage
// ni `lib/sin-conexion/cache.ts`.
export type ResultadoEventos = { ok: true; eventos: DisplayEvent[] } | { ok: false; error: string; sinConexion?: boolean }

/**
 * La consulta que comparten `obtenerEventosVigentes` y
 * `obtenerEventosVigentesParaInicio`: todos los eventos vigentes (hora de
 * Salta, `ahora` por defecto la actual), mismo query que la home de la web
 * (`status = 'PUBLISHED'` + `PUBLIC_EVENT_SELECT`), con `includeToday: true`
 * en el prefiltro (trae también lo de hoy que ya empezó; el filtro exacto es
 * `isVigente`, acá adentro).
 */
async function filasVigentes(
  ahora: Date,
): Promise<{ ok: true; filas: EventWithRelations[] } | { ok: false; error: string; sinConexion?: boolean }> {
  if (!supabase) {
    return { ok: false, error: MENSAJE_SIN_CONFIGURACION }
  }

  try {
    let query = supabase.from('events').select(PUBLIC_EVENT_SELECT).eq('status', 'PUBLISHED')
    query = applyVigenciaPrefilter(query, ahora, { includeToday: true }).order('start_date', { ascending: true })

    const respuesta = await query
    if (respuesta.error) {
      return { ok: false, error: MENSAJE_ERROR_RED, sinConexion: esErrorDeRed(respuesta) || undefined }
    }

    // PUBLIC_EVENT_SELECT es un string armado en runtime (no un literal), así
    // que supabase-js no puede inferir con él el tipo de la fila: "as unknown
    // as" en vez de "as" (mismo patrón que apps/web/lib/data.ts).
    const filas = (respuesta.data ?? []) as unknown as EventWithRelations[]

    const conCategoria = filas.filter((fila) => Boolean(fila.category))
    const vigentes = conCategoria.filter((fila) => isVigente(fila, ahora))

    return { ok: true, filas: vigentes }
  } catch (e) {
    return { ok: false, error: MENSAJE_ERROR_RED, sinConexion: esErrorDeRed(e) || undefined }
  }
}

/**
 * Eventos vigentes sin ventana de atajo (R26, Buscar; también la base de
 * Inicio hasta 36-a): mismo query vigente de `filasVigentes`, sin filtrar
 * por `Atajo`. El texto, la categoría, el lugar y "Solo gratis" los aplica
 * la pantalla con `filterEvents`/`soloGratis` de `@qps/core/home`, no esta
 * función.
 */
export async function obtenerEventosVigentes(ahora: Date = new Date()): Promise<ResultadoEventos> {
  const resultado = await filasVigentes(ahora)
  if (!resultado.ok) return resultado

  return { ok: true, eventos: resultado.filas.map(transformEvent) }
}

/**
 * Un evento vigente, ya transformado para mostrar (`DisplayEvent`), junto
 * con `paraAtajo`: lo mínimo que `eventoEnAtajo` (core) necesita para decidir
 * si cae en un atajo — incluido `end_date`, que `DisplayEvent` no conserva
 * (`transformEvent` lo descarta). Reconstruir `paraAtajo` desde el
 * `DisplayEvent` (por ejemplo `{ start_date: evento.startDateTime }`, sin
 * `end_date`) cambiaría el resultado de `isVigente` para un evento con
 * `end_date` explícito: por eso viaja aparte, desde la fila original.
 */
export interface EventoVigenteParaInicio {
  evento: DisplayEvent
  paraAtajo: EventoParaAtajo
}

export type ResultadoEventosParaInicio =
  | { ok: true; eventos: EventoVigenteParaInicio[] }
  | { ok: false; error: string; sinConexion?: boolean }

/**
 * Eventos vigentes para Inicio (36-a): la misma consulta que
 * `obtenerEventosVigentes`, una sola vez por carga — el atajo (Hoy, Esta
 * noche, Finde, Semana) ya no se consulta: se aplica en memoria en el
 * llamador, con `eventoEnAtajo` de `@qps/core/home/atajos` y la misma
 * `ahora` de esta carga, sobre `paraAtajo` de cada elemento.
 */
export async function obtenerEventosVigentesParaInicio(ahora: Date = new Date()): Promise<ResultadoEventosParaInicio> {
  const resultado = await filasVigentes(ahora)
  if (!resultado.ok) return resultado

  const eventos = resultado.filas.map((fila) => ({
    evento: transformEvent(fila),
    paraAtajo: { start_date: fila.start_date, end_date: fila.end_date, category: fila.category?.slug ?? null },
  }))

  return { ok: true, eventos }
}

/** Columnas mínimas de `categories` para los filtros de Buscar: lectura pública. */
export interface CategoriaBasica {
  id: string
  name: string
  slug: string
}

export type ResultadoCategorias = { ok: true; categorias: CategoriaBasica[] } | { ok: false; error: string; sinConexion?: boolean }

/** Las categorías (id, name, slug), para armar los filtros de Buscar. */
export async function obtenerCategorias(): Promise<ResultadoCategorias> {
  if (!supabase) {
    return { ok: false, error: MENSAJE_SIN_CONFIGURACION }
  }

  try {
    const respuesta = await supabase
      .from('categories')
      .select('id, name, slug')
      .order('name', { ascending: true })

    if (respuesta.error) {
      return { ok: false, error: MENSAJE_ERROR_RED, sinConexion: esErrorDeRed(respuesta) || undefined }
    }

    return { ok: true, categorias: (respuesta.data ?? []) as unknown as CategoriaBasica[] }
  } catch (e) {
    return { ok: false, error: MENSAJE_ERROR_RED, sinConexion: esErrorDeRed(e) || undefined }
  }
}

/**
 * Evento de la ficha: las mismas columnas públicas (`PUBLIC_EVENT_SELECT`),
 * pero sin exigir categoría (a diferencia de `EventWithRelations`, que la
 * home sí filtra): un evento sin categoría igual tiene ficha.
 */
export type EventoDetalle = Event & { category: Category | null; venue: Venue | null }

export type ResultadoEvento =
  | { tipo: 'ok'; evento: EventoDetalle }
  | { tipo: 'no-encontrado' }
  | { tipo: 'error'; error: string }

/**
 * El evento publicado (`status = 'PUBLISHED'`) por `id`, con el mismo select
 * público que el resto de la app. `maybeSingle()`: sin fila, `'no-encontrado'`
 * (evento borrado, despublicado o fusionado en otro).
 */
export async function obtenerEventoPorId(id: string): Promise<ResultadoEvento> {
  if (!supabase) {
    return { tipo: 'error', error: MENSAJE_SIN_CONFIGURACION }
  }

  try {
    const { data, error } = await supabase
      .from('events')
      .select(PUBLIC_EVENT_SELECT)
      .eq('id', id)
      .eq('status', 'PUBLISHED')
      .maybeSingle()

    if (error) {
      return { tipo: 'error', error: MENSAJE_ERROR_RED }
    }
    if (!data) {
      return { tipo: 'no-encontrado' }
    }

    return { tipo: 'ok', evento: data as unknown as EventoDetalle }
  } catch {
    return { tipo: 'error', error: MENSAJE_ERROR_RED }
  }
}
