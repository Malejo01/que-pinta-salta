/**
 * Q5-5 · Datos de la ficha pública de un lugar (/lugar/<slug>, /en/place/<slug>).
 *
 * - Busca el venue por slug (o por id, y la página redirige al slug). Si el
 *   venue está fusionado en otro, devuelve el canónico (la página redirige).
 * - Los eventos PUBLICADOS del lugar (y de los venues fusionados en él),
 *   próximos y de los últimos 60 días, con las columnas públicas.
 * - La ficha de lugar permanente publicada, si la tiene (Q5-1).
 *
 * Solo columnas públicas y el cliente con la sesión (RLS de anon).
 */
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { DIAS_PASADOS_RECIENTES, leerParametroLugar, separarEventosDeLugar, type EventoDeLugar } from '@qps/core/lugares/ficha'
import { armarLugaresChicos, type FilaLugarChicos, type LugarChicosMapa } from '@qps/core/mapa/lugares-chicos'
import { SELECT_LUGARES_CHICOS } from '@/lib/lugares-chicos/publicos'

export interface VenueDeFicha {
  id: string
  nombre: string
  direccion: string
  slug: string
  lat: number | null
  lng: number | null
}

export type ResultadoFichaLugar =
  | { tipo: 'no-existe' }
  | { tipo: 'redirigir'; slug: string }
  | { tipo: 'ok'; venue: VenueDeFicha; proximos: EventoDeLugar[]; pasados: EventoDeLugar[]; permanente: LugarChicosMapa | null }

type FilaVenue = {
  id: string
  name: string
  address: string
  slug: string | null
  latitude: number | string | null
  longitude: number | string | null
  canonical_venue_id: string | null
  is_placeholder: boolean
}

const COLUMNAS_VENUE = 'id, name, address, slug, latitude, longitude, canonical_venue_id, is_placeholder'

function numero(v: number | string | null): number | null {
  if (v === null) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/** `cache`: generateMetadata y la página piden lo mismo en un solo render. */
export const obtenerFichaLugar = cache(async (parametro: string): Promise<ResultadoFichaLugar> => {
  const leido = leerParametroLugar(parametro)
  if (!leido) return { tipo: 'no-existe' }
  const supabase = await createClient()

  let consulta = supabase.from('venues').select(COLUMNAS_VENUE)
  consulta = leido.tipo === 'id' ? consulta.eq('id', leido.id) : consulta.eq('slug', leido.slug)
  const { data: filas, error } = await consulta.limit(5)
  if (error) {
    console.error('[ficha-lugar] no se pudo leer el venue', error.code ?? 'sin-codigo')
    throw new Error('ficha-lugar: venue')
  }
  const candidatos = (filas ?? []) as FilaVenue[]
  // Con el mismo slug, gana el canónico.
  const venue = candidatos.find((v) => v.canonical_venue_id === null) ?? candidatos[0]
  if (!venue || venue.is_placeholder) return { tipo: 'no-existe' }

  if (venue.canonical_venue_id) {
    const { data: canonico } = await supabase.from('venues').select(COLUMNAS_VENUE).eq('id', venue.canonical_venue_id).maybeSingle()
    const c = canonico as FilaVenue | null
    if (!c?.slug || c.is_placeholder) return { tipo: 'no-existe' }
    return { tipo: 'redirigir', slug: c.slug }
  }
  if (!venue.slug) return { tipo: 'no-existe' }
  if (leido.tipo === 'id' || leido.slug !== venue.slug) return { tipo: 'redirigir', slug: venue.slug }

  // Los venues fusionados en este también cuentan (sus eventos viejos pueden apuntar a ellos).
  const { data: fusionados } = await supabase.from('venues').select('id').eq('canonical_venue_id', venue.id).limit(50)
  const ids = [venue.id, ...((fusionados ?? []) as { id: string }[]).map((f) => f.id)]
  const ahora = Date.now()
  const desde = new Date(ahora - DIAS_PASADOS_RECIENTES * 24 * 60 * 60 * 1000).toISOString()

  const [eventos, permanente] = await Promise.all([
    supabase
      .from('events')
      .select('id, title, start_date, end_date, is_free')
      .eq('status', 'PUBLISHED')
      .in('venue_id', ids)
      // R-1: también lo que empezó antes pero sigue en curso (una muestra de
      // tres meses): con solo `start_date >= desde` no aparecía en «Próximos».
      .or(`start_date.gte.${desde},end_date.gte.${new Date(ahora).toISOString()}`)
      .order('start_date', { ascending: true })
      .limit(200),
    supabase.from('lugares_permanentes').select(SELECT_LUGARES_CHICOS).eq('venue_id', venue.id).eq('estado', 'publicado').limit(1),
  ])
  if (eventos.error) console.error('[ficha-lugar] no se pudieron leer los eventos', eventos.error.code ?? 'sin-codigo')
  if (permanente.error) console.error('[ficha-lugar] no se pudo leer la ficha permanente', permanente.error.code ?? 'sin-codigo')

  const { proximos, pasados } = separarEventosDeLugar(eventos.data ?? [], new Date())
  const lugarPermanente = armarLugaresChicos((permanente.data ?? []) as unknown as FilaLugarChicos[])[0] ?? null

  return {
    tipo: 'ok',
    venue: { id: venue.id, nombre: venue.name, direccion: venue.address, slug: venue.slug, lat: numero(venue.latitude), lng: numero(venue.longitude) },
    proximos,
    pasados,
    permanente: lugarPermanente,
  }
})
