import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveVenueId } from '../venues/resolve'
import { upsertEventWithDeduplication } from '../scraper/deduplicate'
import { INSTAGRAM_ENGINE_CONFIG } from '../instagram-config'
import { copyExternalImage, isOwnStorageUrl } from '../images/external'
import { isThumbnail } from '../scraper/merge-events'
import {
  CATEGORIA_MUSEOS,
  CATEGORIA_PENAS,
  HORIZONTE_MUSEOS_DIAS,
  HORIZONTE_PENAS_DIAS,
  MUSEOS,
  PENAS,
  type Recurrente,
  type RecurrenteMuseo,
  type RecurrentePena,
} from './config'
import { diaSalta, fechasPendientes, horaSalta, saltaAUtc, slugMuseos, slugPenas, type FechaPendiente } from './fechas'

export type ResultadoItem = {
  titulo: string
  tipo: 'pena' | 'museo'
  insertadas: number
  yaExistian: number
  /** Filas que ya existían sin end_date y se completaron con el `cierre` de la config (QPS-136). */
  completadas: number
  error?: string
}

export type ResultadoRecurrentes = {
  items: ResultadoItem[]
  insertadas: number
  completadas: number
  conError: number
}

type Fila = Record<string, unknown>

/**
 * Clave de fuente propia. No está en SOURCE_TIERS, así que cae en el tramo más
 * bajo (100): si la dedup matchea un evento existente, el existente gana el
 * empate (instagram) o por prioridad (ticketeras, portal, manual); una fila
 * generada nunca pisa hora, venue ni descripción de algo ya cargado.
 */
export const FUENTE_RECURRENTES = 'recurrentes'

/**
 * Genera las fechas futuras que faltan de peñas y museos. Idempotente: solo
 * escribe los días que no existen todavía, y a los que ya existen sin end_date
 * les completa el cierre de la config (QPS-136; nunca pisa un end_date
 * cargado). No crea venues. El cliente llega por parámetro (service role en la
 * ruta); acá no se lee el entorno.
 */
export async function generarRecurrentes(
  supabase: SupabaseClient,
  { ahora = new Date() }: { ahora?: Date } = {},
): Promise<ResultadoRecurrentes> {
  const items: ResultadoItem[] = []
  for (const r of [...PENAS, ...MUSEOS]) {
    items.push(await generarItem(supabase, r, ahora))
  }
  return {
    items,
    insertadas: items.reduce((s, i) => s + i.insertadas, 0),
    completadas: items.reduce((s, i) => s + i.completadas, 0),
    conError: items.filter((i) => i.error).length,
  }
}

async function generarItem(supabase: SupabaseClient, r: Recurrente, ahora: Date): Promise<ResultadoItem> {
  const res: ResultadoItem = { titulo: r.titulo, tipo: r.tipo, insertadas: 0, yaExistian: 0, completadas: 0 }
  try {
    const venueId = await resolveVenueId(supabase, r.venue, { source: 'recurrentes', autocreate: false })
    if (!venueId) throw new Error(`El venue "${r.venue}" no resuelve (el job no crea venues)`)
    if (r.tipo === 'museo' && !venueId.startsWith(r.venueIdPrefijo)) {
      throw new Error(`El venue "${r.venue}" resolvió a ${venueId.slice(0, 8)}, se esperaba ${r.venueIdPrefijo}`)
    }

    // Solo filas PUBLISHED: una DRAFT/ARCHIVED/CANCELLED no es modelo válido.
    let imagenPena: string | null = null
    let plantilla: Fila | null = null
    if (r.tipo === 'pena') {
      // Peñas: de la fila anterior sale solo la imagen (la última no nula).
      const { data: conImagen, error } = await supabase
        .from('events').select('image_url')
        .eq('venue_id', venueId).eq('title', r.titulo).eq('status', 'PUBLISHED')
        .not('image_url', 'is', null)
        .order('start_date', { ascending: false }).limit(1).maybeSingle()
      if (error) throw new Error(`Imagen: ${error.message}`)
      imagenPena = (conImagen?.image_url as string | null) ?? null

      // La imagen se reusa tal cual en cada fecha nueva (ver filaPena): si es
      // externa, se copia a Storage una sola vez acá, no una vez por fecha.
      //
      // Una miniatura NO se copia (QPS-160, mismo criterio que
      // run-scrape-job.ts, 31-a): una vez copiada, la URL pasa a ser
      // `externas/<sha1 hex>.<ext>`, y un digest hexadecimal nunca puede
      // contener el texto que `isThumbnail` busca ("150x150", "thumb") —
      // quedaría atascada para siempre. Por eso la guarda se evalúa ANTES de
      // copiar, sobre la URL cruda.
      if (imagenPena && !isOwnStorageUrl(imagenPena) && !isThumbnail(imagenPena)) {
        const storageUrl = await copyExternalImage(
          imagenPena,
          supabase.storage.from(INSTAGRAM_ENGINE_CONFIG.STORAGE_BUCKET)
        )
        if (storageUrl) imagenPena = storageUrl
      }
    } else {
      // Museos: plantilla completa, la fila más reciente de ese venue y título.
      const { data, error } = await supabase
        .from('events').select('*')
        .eq('venue_id', venueId).eq('title', r.titulo).eq('status', 'PUBLISHED')
        .order('start_date', { ascending: false }).limit(1).maybeSingle()
      if (error) throw new Error(`Plantilla: ${error.message}`)
      if (!data) throw new Error(`Sin fila previa para "${r.titulo}": no se puede replicar el patrón`)
      plantilla = data as Fila

      // La imagen de la plantilla se reusa tal cual en cada fecha nueva (ver
      // filaMuseo): si es externa, se copia a Storage una sola vez acá, no
      // una vez por fecha (mismo criterio que las peñas, arriba).
      //
      // Una miniatura NO se copia (QPS-160, mismo criterio que las peñas,
      // arriba, y que run-scrape-job.ts, 31-a).
      const imagenPlantilla = plantilla.image_url as string | null
      if (imagenPlantilla && !isOwnStorageUrl(imagenPlantilla) && !isThumbnail(imagenPlantilla)) {
        const storageUrl = await copyExternalImage(
          imagenPlantilla,
          supabase.storage.from(INSTAGRAM_ENGINE_CONFIG.STORAGE_BUCKET)
        )
        if (storageUrl) plantilla.image_url = storageUrl
      }
    }

    // Días que ya existen (futuros) para ese venue y título.
    const { data: ya, error: errYa } = await supabase
      .from('events').select('id, start_date, end_date, status')
      .eq('venue_id', venueId).eq('title', r.titulo)
      .gte('start_date', ahora.toISOString())
    if (errYa) throw new Error(`Días existentes: ${errYa.message}`)
    const yaCargadas = new Set((ya ?? []).map((e) => diaSalta(new Date(e.start_date as string))))

    const horizonteDias = r.tipo === 'pena' ? HORIZONTE_PENAS_DIAS : HORIZONTE_MUSEOS_DIAS
    const base = { ahora, dias: r.dias, hora: r.hora, horizonteDias }
    const enVentana = fechasPendientes({ ...base, yaCargadas: [] })
    const nuevas = fechasPendientes({ ...base, yaCargadas })
    res.yaExistian = enVentana.length - nuevas.length

    const errores: string[] = []

    // QPS-136: las filas que ya existen sin end_date (las generadas antes de que la config
    // tuviera `cierre`) se completan con el mismo cálculo que una fila nueva. Solo PUBLISHED y
    // solo si la fila abre a la hora de la config: si alguien la movió a mano, no se adivina
    // su cierre. El `.is('end_date', null)` del UPDATE asegura que nunca se pisa uno cargado,
    // aunque otro proceso lo haya escrito entre la lectura y la escritura.
    for (const e of ya ?? []) {
      if (!r.cierre || e.end_date != null || e.status !== 'PUBLISHED') continue
      const inicio = new Date(e.start_date as string)
      if (horaSalta(inicio) !== r.hora) continue
      const f: FechaPendiente = { dia: diaSalta(inicio), startUtc: inicio.toISOString() }
      const { data: tocadas, error: errFin } = await supabase
        .from('events').update({ end_date: endDateUtc(f, r.hora, r.cierre) })
        .eq('id', e.id as string).is('end_date', null)
        .select('id')
      if (errFin) errores.push(`${f.dia} (cierre): ${errFin.message}`)
      else res.completadas += (tocadas ?? []).length
    }

    for (const f of nuevas) {
      try {
        const fila = r.tipo === 'pena'
          ? filaPena(r, venueId, f, imagenPena)
          : filaMuseo(r, venueId, f, plantilla ?? {})
        const out = await upsertEventWithDeduplication(fila, FUENTE_RECURRENTES, supabase)
        if (out.action === 'insert') res.insertadas++
        else res.yaExistian++ // la dedup lo fusionó con una fila que ya estaba
      } catch (err) {
        errores.push(`${f.dia}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    if (errores.length) res.error = errores.slice(0, 3).join('; ')
  } catch (err) {
    res.error = err instanceof Error ? err.message : String(err)
  }
  return res
}

/** Próximo día calendario ("YYYY-MM-DD") después de `dia`. */
function diaSiguiente(dia: string): string {
  const d = new Date(`${dia}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Hora de cierre en UTC del día de apertura `f`, o null sin `cierre` definido
 * (como hoy). Si el cierre es menor o igual que la apertura (`hora`), es del
 * día siguiente: cruza la medianoche (abre 22:00, cierra 02:00).
 */
function endDateUtc(f: FechaPendiente, hora: string, cierre: string | undefined): string | null {
  if (!cierre) return null
  const diaCierre = cierre <= hora ? diaSiguiente(f.dia) : f.dia
  return saltaAUtc(diaCierre, cierre)
}

function filaPena(r: RecurrentePena, venueId: string, f: FechaPendiente, imagen: string | null): Fila {
  return {
    title: r.titulo,
    slug: `${slugPenas(r.titulo)}-${f.dia}`,
    description: r.descripcion,
    short_description: r.resumen,
    category_id: CATEGORIA_PENAS,
    venue_id: venueId,
    image_url: imagen,
    gallery_urls: [],
    start_date: f.startUtc,
    end_date: endDateUtc(f, r.hora, r.cierre),
    is_recurring: false,
    recurrence_rule: null,
    price_min: 0, // con is_free=false la UI lo muestra como "confirmar"
    price_max: null,
    is_free: false,
    ticket_url: r.ticketUrl,
    age_restriction: 0,
    tags: [],
    status: 'PUBLISHED',
    is_featured: false,
    view_count: 0,
    created_by: null,
    classification_source: null,
    ticket_sources: r.ticketUrl ? [{ url: r.ticketUrl, source: FUENTE_RECURRENTES, price_min: 0 }] : [],
    is_commercial: true,
  }
}

function filaMuseo(r: RecurrenteMuseo, venueId: string, f: FechaPendiente, p: Fila): Fila {
  return {
    title: r.titulo,
    slug: `${slugMuseos(r.titulo)}-${f.dia}`,
    description: p.description,
    short_description: p.short_description,
    category_id: CATEGORIA_MUSEOS,
    venue_id: venueId,
    image_url: p.image_url,
    gallery_urls: p.gallery_urls ?? [],
    start_date: f.startUtc,
    end_date: endDateUtc(f, r.hora, r.cierre),
    is_recurring: false,
    recurrence_rule: null,
    price_min: p.price_min,
    price_max: p.price_max,
    is_free: p.is_free,
    ticket_url: p.ticket_url,
    age_restriction: 0,
    tags: p.tags ?? [],
    status: 'PUBLISHED',
    is_featured: false,
    view_count: 0,
    created_by: null,
    classification_source: p.classification_source,
    ticket_sources: p.ticket_sources ?? [],
    is_commercial: p.is_commercial,
  }
}
