/**
 * Q5-8 · El job de calidad de los eventos: lee los publicados vigentes,
 * evalúa las reglas de `@qps/core/events/calidad` y, SOLO con `aplicar`,
 * escribe las correcciones seguras, con tope y con guardas (cada update
 * vuelve a exigir el estado que leyó, así no pisa una edición del admin).
 *
 * Lo usan el script `scripts/revisar-calidad.ts` (en seco por defecto) y el
 * panel `/admin/calidad` (solo lectura). El cliente de Supabase y el
 * clasificador de IA se inyectan: los tests corren sin red ni base.
 */
import {
  contarHallazgos,
  evaluarEvento,
  normalizarAlias,
  type ConteoCalidad,
  type FilaCalidad,
  type Hallazgo,
} from '@qps/core/events/calidad'
import { inferCategorySlug } from '@/lib/scraper/categorize'

/** Lo que trae la consulta (con el lugar crudo adentro de `ai_metadata`). */
export type FilaEventoCalidad = Omit<FilaCalidad, 'lugar_crudo'> & { slug: string | null; ai_metadata: unknown }

export const COLUMNAS_CALIDAD =
  'id, slug, title, description, short_description, start_date, image_url, category_id, venue_id, price_min, price_max, is_free, scrape_source_key, ai_metadata'

/** El corte de «vigentes»: desde ayer (los de hoy temprano todavía se ven en la agenda). */
export function desdeAyerISO(ahora: Date = new Date()): string {
  return new Date(ahora.getTime() - 24 * 60 * 60 * 1000).toISOString()
}

/** Tope por corrida de clasificaciones con IA (paga): 10. */
export const TOPE_IA_POR_DEFECTO = 10
/** Tope por corrida de escrituras en la base. */
export const TOPE_ESCRITURAS_POR_DEFECTO = 200

/** El nombre del lugar como lo leyó la IA del flyer (`ai_metadata.extracted_data.venue_name`). */
export function lugarCrudo(aiMetadata: unknown): string | null {
  const extraido = (aiMetadata as { extracted_data?: { venue_name?: unknown } } | null)?.extracted_data
  return typeof extraido?.venue_name === 'string' && extraido.venue_name.trim() ? extraido.venue_name.trim() : null
}

/** Las palabras clave de la ingesta; el «espectaculos» por defecto no cuenta como categoría clara. */
export function categoriaPorPalabras(titulo: string, descripcion: string, lugar: string): string | null {
  const slug = inferCategorySlug(titulo, descripcion, lugar)
  return slug === 'espectaculos' ? null : slug
}

export function mapaDeAliases(filas: readonly { alias: string; alias_normalized: string | null; venue_id: string }[]): Map<string, string> {
  const mapa = new Map<string, string>()
  for (const f of filas) {
    const clave = f.alias_normalized?.trim() || normalizarAlias(f.alias)
    if (clave && !mapa.has(clave)) mapa.set(clave, f.venue_id)
  }
  return mapa
}

export interface ResultadoRevision {
  revisados: number
  hallazgos: Hallazgo[]
  conteo: ConteoCalidad
}

export function revisarEventos(filas: readonly FilaEventoCalidad[], aliases: ReadonlyMap<string, string>): ResultadoRevision {
  const hallazgos = filas.flatMap((f) => evaluarEvento({ ...f, lugar_crudo: lugarCrudo(f.ai_metadata) }, { aliases, categoriaPorPalabras }))
  return { revisados: filas.length, hallazgos, conteo: contarHallazgos(hallazgos) }
}

// ---------------------------------------------------------------------------
// Aplicar (solo con --aplicar)
// ---------------------------------------------------------------------------

export type Clasificador = (titulo: string, descripcion: string) => Promise<string | null>

export interface OpcionesAplicar {
  /** slug → id de `categories`. */
  categorias: ReadonlyMap<string, string>
  /** Solo con `--ia`: el clasificador del cliente de IA existente. */
  clasificar?: Clasificador
  topeIa?: number
  topeEscrituras?: number
  filas: ReadonlyMap<string, FilaEventoCalidad>
}

export interface ResumenAplicado {
  gratis: number
  lugares: number
  categorias: number
  categoriasIa: number
  errores: number
  salteadosPorTope: number
}

type Consulta = PromiseLike<{ error: { code?: string } | null; data?: unknown[] | null }>

/**
 * Escribe las correcciones seguras. No toca `classification_source` (su
 * check solo admite manual / alias / scraper). Cada update lleva la guarda del valor
 * leído (`is_free = false`, `venue_id is null`, `category_id is null`) y
 * pide `select('id')` para saber si cambió algo.
 */
export async function aplicarCorrecciones(
  cliente: unknown,
  hallazgos: readonly Hallazgo[],
  opciones: OpcionesAplicar,
): Promise<ResumenAplicado> {
  const db = cliente as {
    from(t: string): {
      update(c: Record<string, unknown>): {
        eq(c: string, v: unknown): { eq(c: string, v: unknown): Consulta & { select(c: string): Consulta }; is(c: string, v: null): { select(c: string): Consulta } }
      }
    }
  }
  const r: ResumenAplicado = { gratis: 0, lugares: 0, categorias: 0, categoriasIa: 0, errores: 0, salteadosPorTope: 0 }
  const topeEscrituras = opciones.topeEscrituras ?? TOPE_ESCRITURAS_POR_DEFECTO
  const topeIa = opciones.topeIa ?? TOPE_IA_POR_DEFECTO
  let escrituras = 0
  let llamadasIa = 0

  const contar = async (consulta: Consulta, campo: 'gratis' | 'lugares' | 'categorias' | 'categoriasIa') => {
    const { error, data } = await consulta
    if (error) {
      r.errores++
      console.error('[calidad] no se pudo aplicar', campo, error.code ?? 'sin-codigo')
      return
    }
    if (data && data.length > 0) r[campo]++
  }

  for (const h of hallazgos) {
    const p = h.propuesta
    const aplica = p.tipo === 'marcar_gratis' || p.tipo === 'vincular_lugar' || p.tipo === 'categoria_por_palabras' || (p.tipo === 'categoria_por_ia' && opciones.clasificar)
    if (!aplica) continue
    if (escrituras >= topeEscrituras) {
      r.salteadosPorTope++
      continue
    }

    if (p.tipo === 'marcar_gratis') {
      escrituras++
      await contar(db.from('events').update({ is_free: true }).eq('id', h.eventoId).eq('is_free', false).select('id'), 'gratis')
    } else if (p.tipo === 'vincular_lugar') {
      escrituras++
      await contar(db.from('events').update({ venue_id: p.venueId }).eq('id', h.eventoId).is('venue_id', null).select('id'), 'lugares')
    } else if (p.tipo === 'categoria_por_palabras') {
      const categoryId = opciones.categorias.get(p.slug)
      if (!categoryId) continue
      escrituras++
      await contar(
        db.from('events').update({ category_id: categoryId }).eq('id', h.eventoId).is('category_id', null).select('id'),
        'categorias',
      )
    } else if (p.tipo === 'categoria_por_ia' && opciones.clasificar) {
      if (llamadasIa >= topeIa) {
        r.salteadosPorTope++
        continue
      }
      const fila = opciones.filas.get(h.eventoId)
      if (!fila) continue
      llamadasIa++
      let slug: string | null = null
      try {
        slug = await opciones.clasificar(fila.title, `${fila.short_description ?? ''} ${fila.description ?? ''}`.slice(0, 1500))
      } catch {
        r.errores++
        console.error('[calidad] la IA no pudo clasificar un evento')
        continue
      }
      const categoryId = slug ? opciones.categorias.get(slug) : undefined
      if (!categoryId) continue
      escrituras++
      await contar(
        db.from('events').update({ category_id: categoryId }).eq('id', h.eventoId).is('category_id', null).select('id'),
        'categoriasIa',
      )
    }
  }
  return r
}
