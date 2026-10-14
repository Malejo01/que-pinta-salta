// Eventos de Inicio (R25): mismo select público y misma vigencia que la web
// (`apps/web/lib/data.ts`), ahora desde `packages/core` para no copiar
// lógica. Ni una regla de fecha propia: el prefiltro y la vigencia son de
// `@qps/core/events/vigencia`, y qué evento cae en cada atajo (Hoy, Esta
// noche, Finde, Semana) es de `@qps/core/home/atajos`.
import { PUBLIC_EVENT_SELECT } from '@qps/core/events/public-select'
import { applyVigenciaPrefilter, isVigente } from '@qps/core/events/vigencia'
import { eventoEnAtajo, type Atajo } from '@qps/core/home/atajos'
import { transformEvent } from '@qps/core/home/transform'
import type { DisplayEvent, EventWithRelations } from '@qps/core/home/types'
import type { Category, Event, Venue } from '@qps/core/types'
import { supabase } from '@/lib/supabase'

export const MENSAJE_SIN_CONFIGURACION = 'La app no tiene la configuración de datos: avisá al equipo.'
export const MENSAJE_ERROR_RED = 'No pudimos cargar los eventos. Revisá tu conexión.'

export type ResultadoEventos = { ok: true; eventos: DisplayEvent[] } | { ok: false; error: string }

/**
 * Eventos vigentes que caen en la ventana de `atajo` (hora de Salta, `ahora`
 * por defecto es la actual). Mismo query que la home de la web
 * (`status = 'PUBLISHED'` + `PUBLIC_EVENT_SELECT`), con `includeToday: true`
 * en el prefiltro: la ventana de un atajo casi siempre empieza antes de
 * `ahora` (por ejemplo "Hoy" incluye lo que ya empezó), así que la base
 * necesita el superconjunto más amplio y el filtro exacto queda en
 * `isVigente` + `eventoEnAtajo`.
 */
export async function obtenerEventosDeAtajo(atajo: Atajo, ahora: Date = new Date()): Promise<ResultadoEventos> {
  if (!supabase) {
    return { ok: false, error: MENSAJE_SIN_CONFIGURACION }
  }

  try {
    let query = supabase.from('events').select(PUBLIC_EVENT_SELECT).eq('status', 'PUBLISHED')
    query = applyVigenciaPrefilter(query, ahora, { includeToday: true }).order('start_date', { ascending: true })

    const { data, error } = await query
    if (error) {
      return { ok: false, error: MENSAJE_ERROR_RED }
    }

    // PUBLIC_EVENT_SELECT es un string armado en runtime (no un literal), así
    // que supabase-js no puede inferir con él el tipo de la fila: "as unknown
    // as" en vez de "as" (mismo patrón que apps/web/lib/data.ts).
    const filas = (data ?? []) as unknown as EventWithRelations[]

    const conCategoria = filas.filter((fila) => Boolean(fila.category))
    const vigentes = conCategoria.filter((fila) => isVigente(fila, ahora))
    const delAtajo = vigentes.filter((fila) =>
      eventoEnAtajo({ start_date: fila.start_date, end_date: fila.end_date, category: fila.category?.slug ?? null }, atajo, ahora)
    )

    return { ok: true, eventos: delAtajo.map(transformEvent) }
  } catch {
    return { ok: false, error: MENSAJE_ERROR_RED }
  }
}

/**
 * Eventos vigentes sin ventana de atajo (R26, Buscar): mismo query vigente
 * que `obtenerEventosDeAtajo` (status PUBLISHED, prefiltro de vigencia +
 * `isVigente`), sin filtrar por `Atajo`. El texto, la categoría, el lugar y
 * "Solo gratis" los aplica la pantalla con `filterEvents`/`soloGratis` de
 * `@qps/core/home`, no esta función.
 */
export async function obtenerEventosVigentes(ahora: Date = new Date()): Promise<ResultadoEventos> {
  if (!supabase) {
    return { ok: false, error: MENSAJE_SIN_CONFIGURACION }
  }

  try {
    let query = supabase.from('events').select(PUBLIC_EVENT_SELECT).eq('status', 'PUBLISHED')
    query = applyVigenciaPrefilter(query, ahora, { includeToday: true }).order('start_date', { ascending: true })

    const { data, error } = await query
    if (error) {
      return { ok: false, error: MENSAJE_ERROR_RED }
    }

    const filas = (data ?? []) as unknown as EventWithRelations[]

    const conCategoria = filas.filter((fila) => Boolean(fila.category))
    const vigentes = conCategoria.filter((fila) => isVigente(fila, ahora))

    return { ok: true, eventos: vigentes.map(transformEvent) }
  } catch {
    return { ok: false, error: MENSAJE_ERROR_RED }
  }
}

/** Columnas mínimas de `categories` para los filtros de Buscar: lectura pública. */
export interface CategoriaBasica {
  id: string
  name: string
  slug: string
}

export type ResultadoCategorias = { ok: true; categorias: CategoriaBasica[] } | { ok: false; error: string }

/** Las categorías (id, name, slug), para armar los filtros de Buscar. */
export async function obtenerCategorias(): Promise<ResultadoCategorias> {
  if (!supabase) {
    return { ok: false, error: MENSAJE_SIN_CONFIGURACION }
  }

  try {
    const { data, error } = await supabase
      .from('categories')
      .select('id, name, slug')
      .order('name', { ascending: true })

    if (error) {
      return { ok: false, error: MENSAJE_ERROR_RED }
    }

    return { ok: true, categorias: (data ?? []) as unknown as CategoriaBasica[] }
  } catch {
    return { ok: false, error: MENSAJE_ERROR_RED }
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
