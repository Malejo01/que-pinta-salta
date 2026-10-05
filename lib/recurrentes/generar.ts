import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveVenueId } from '../venues/resolve'
import { upsertEventWithDeduplication } from '../scraper/deduplicate'
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
import { diaSalta, fechasPendientes, slugMuseos, slugPenas, type FechaPendiente } from './fechas'

export type ResultadoItem = {
  titulo: string
  tipo: 'pena' | 'museo'
  insertadas: number
  yaExistian: number
  error?: string
}

export type ResultadoRecurrentes = {
  items: ResultadoItem[]
  insertadas: number
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
 * escribe los días que no existen todavía. No crea venues. El cliente llega
 * por parámetro (service role en la ruta); acá no se lee el entorno.
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
    conError: items.filter((i) => i.error).length,
  }
}

async function generarItem(supabase: SupabaseClient, r: Recurrente, ahora: Date): Promise<ResultadoItem> {
  const res: ResultadoItem = { titulo: r.titulo, tipo: r.tipo, insertadas: 0, yaExistian: 0 }
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
    } else {
      // Museos: plantilla completa, la fila más reciente de ese venue y título.
      const { data, error } = await supabase
        .from('events').select('*')
        .eq('venue_id', venueId).eq('title', r.titulo).eq('status', 'PUBLISHED')
        .order('start_date', { ascending: false }).limit(1).maybeSingle()
      if (error) throw new Error(`Plantilla: ${error.message}`)
      if (!data) throw new Error(`Sin fila previa para "${r.titulo}": no se puede replicar el patrón`)
      plantilla = data as Fila
    }

    // Días que ya existen (futuros) para ese venue y título.
    const { data: ya, error: errYa } = await supabase
      .from('events').select('start_date')
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
    end_date: null,
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
    end_date: null,
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
