/**
 * Q5-8 · Reglas de calidad de los eventos publicados (puras: sin red ni base).
 *
 * Cada regla devuelve un hallazgo con una PROPUESTA cuando hay una corrección
 * segura, o `revisar_a_mano` cuando no. Quién aplica qué lo decide el job
 * (`apps/web/lib/calidad/`), en seco por defecto:
 *
 *   sin_imagen      → nunca se escribe una imagen de otro evento (podría mostrar
 *                     el flyer de otra fecha): la interfaz ya cae al respaldo de
 *                     marca. Se lista para cargar el flyer real.
 *   sin_categoria   → primero las palabras clave (la misma regla de la
 *                     ingesta); si no alcanza, la IA existente, con tope.
 *   sin_lugar       → se vincula SOLO con un alias exacto (normalizado) de
 *                     `venue_aliases`; si no, a mano.
 *   precio          → gratis con evidencia en el texto (`detectarGratis`, R68):
 *                     se propone `is_free = true`. Un precio de 1 a 99 pesos o
 *                     un máximo menor al mínimo es probablemente un error de
 *                     parseo («15.000» leído como 15): a mano.
 *   hora_00         → empieza a las 00:00 en Salta: suele ser «sin hora».
 *                     A mano (no se inventa una hora).
 */
import { formatSaltaClock } from '../date-format'
import { detectarGratis } from './gratis'

export const REGLAS_CALIDAD = ['sin_imagen', 'sin_categoria', 'sin_lugar', 'precio', 'hora_00'] as const
export type ReglaCalidad = (typeof REGLAS_CALIDAD)[number]

export const ETIQUETA_REGLA: Record<ReglaCalidad, string> = {
  sin_imagen: 'Sin imagen',
  sin_categoria: 'Sin categoría',
  sin_lugar: 'Sin lugar',
  precio: 'Precio dudoso',
  hora_00: 'Horario 00:00',
}

export interface FilaCalidad {
  id: string
  title: string
  description: string | null
  short_description: string | null
  start_date: string
  image_url: string | null
  category_id: string | null
  venue_id: string | null
  price_min: number | null
  price_max: number | null
  is_free: boolean | null
  scrape_source_key: string | null
  /** El nombre del lugar como vino de la fuente (ai_metadata o la ingesta), si se conoce. */
  lugar_crudo?: string | null
}

export type Propuesta =
  | { tipo: 'marcar_gratis'; frase: string }
  | { tipo: 'vincular_lugar'; venueId: string; alias: string }
  | { tipo: 'categoria_por_palabras'; slug: string }
  | { tipo: 'categoria_por_ia' }
  | { tipo: 'revisar_a_mano'; motivo: string }

export interface Hallazgo {
  eventoId: string
  regla: ReglaCalidad
  propuesta: Propuesta
}

/** Igual que `venue_aliases.alias_normalized`: minúsculas, sin tildes, solo letras y números. */
export function normalizarAlias(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export interface ContextoCalidad {
  /** alias normalizado → venue_id (solo de venues canónicos). */
  aliases: ReadonlyMap<string, string>
  /** La categoría por palabras clave (la de la ingesta), o null si no hay una clara. */
  categoriaPorPalabras: (titulo: string, descripcion: string, lugar: string) => string | null
}

export function evaluarEvento(e: FilaCalidad, ctx: ContextoCalidad): Hallazgo[] {
  const hallazgos: Hallazgo[] = []
  const agregar = (regla: ReglaCalidad, propuesta: Propuesta) => hallazgos.push({ eventoId: e.id, regla, propuesta })

  if (!e.image_url || !e.image_url.trim()) {
    agregar('sin_imagen', { tipo: 'revisar_a_mano', motivo: 'Cargar el flyer real (la web muestra el respaldo de marca).' })
  }

  if (!e.category_id) {
    const slug = ctx.categoriaPorPalabras(e.title, `${e.short_description ?? ''} ${e.description ?? ''}`, e.lugar_crudo ?? '')
    agregar('sin_categoria', slug ? { tipo: 'categoria_por_palabras', slug } : { tipo: 'categoria_por_ia' })
  }

  if (!e.venue_id) {
    const crudo = e.lugar_crudo?.trim() ?? ''
    const venueId = crudo ? ctx.aliases.get(normalizarAlias(crudo)) : undefined
    agregar(
      'sin_lugar',
      venueId
        ? { tipo: 'vincular_lugar', venueId, alias: crudo }
        : { tipo: 'revisar_a_mano', motivo: crudo ? `Sin alias para «${crudo}».` : 'La fuente no trajo el lugar.' },
    )
  }

  if (e.is_free !== true) {
    const precioMin = e.price_min
    if (precioMin === null || precioMin === 0) {
      const deteccion = detectarGratis(e.title, e.short_description, e.description)
      if (deteccion.gratis) agregar('precio', { tipo: 'marcar_gratis', frase: deteccion.frase })
      else if (precioMin === 0) {
        agregar('precio', { tipo: 'revisar_a_mano', motivo: 'Precio 0 sin marcar gratis ni evidencia en el texto: se muestra «A confirmar».' })
      }
    } else if (precioMin > 0 && precioMin < 100) {
      agregar('precio', { tipo: 'revisar_a_mano', motivo: `Precio de $${precioMin}: probablemente «${precioMin}.000» mal leído.` })
    }
    if (e.price_max !== null && e.price_min !== null && e.price_max > 0 && e.price_max < e.price_min) {
      agregar('precio', { tipo: 'revisar_a_mano', motivo: 'El precio máximo es menor que el mínimo.' })
    }
  }

  if (formatSaltaClock(e.start_date) === '00:00') {
    agregar('hora_00', { tipo: 'revisar_a_mano', motivo: 'Empieza a las 00:00: confirmar el horario real.' })
  }

  return hallazgos
}

export type ConteoCalidad = Record<ReglaCalidad, { total: number; automaticos: number }>

/** Cuántos hallazgos hay por regla y cuántos tienen una corrección automática segura. */
export function contarHallazgos(hallazgos: readonly Hallazgo[]): ConteoCalidad {
  const conteo = Object.fromEntries(REGLAS_CALIDAD.map((r) => [r, { total: 0, automaticos: 0 }])) as ConteoCalidad
  for (const h of hallazgos) {
    conteo[h.regla].total++
    if (h.propuesta.tipo !== 'revisar_a_mano' && h.propuesta.tipo !== 'categoria_por_ia') conteo[h.regla].automaticos++
  }
  return conteo
}
