// Q5-4 · Lugares para chicos PUBLICADOS (la misma tabla y el mismo armado
// que la capa de /mapa en la web: `armarLugaresChicos` de @qps/core). Pide
// solo las columnas que anon puede leer (sin `cargado_por` ni
// `verificado_por`, decisión 8 de docs/tanda-q5).
import { COLUMNAS_PUBLICAS_LUGAR } from '@qps/core/lugares/permanentes'
import { armarLugaresChicos, type FilaLugarChicos, type LugarChicosMapa } from '@qps/core/mapa/lugares-chicos'
import { MENSAJE_SIN_CONFIGURACION } from '@/lib/mensajes'
import { esErrorDeRed } from '@/lib/red'
import { supabase } from '@/lib/supabase'

export const MENSAJE_ERROR_LUGARES = 'No pudimos cargar los lugares para chicos. Revisá tu conexión.'

export const SELECT_LUGARES_CHICOS = `${COLUMNAS_PUBLICAS_LUGAR}, venue:venues!inner(name, address, slug, latitude, longitude, canonical_venue_id)`

export type ResultadoLugaresChicos =
  | { ok: true; lugares: LugarChicosMapa[] }
  | { ok: false; error: string; sinConexion?: boolean }

export async function obtenerLugaresChicos(): Promise<ResultadoLugaresChicos> {
  if (!supabase) return { ok: false, error: MENSAJE_SIN_CONFIGURACION }
  try {
    const respuesta = await supabase
      .from('lugares_permanentes')
      .select(SELECT_LUGARES_CHICOS)
      .eq('estado', 'publicado')
      .limit(500)
    if (respuesta.error) {
      return { ok: false, error: MENSAJE_ERROR_LUGARES, sinConexion: esErrorDeRed(respuesta) || undefined }
    }
    return { ok: true, lugares: armarLugaresChicos((respuesta.data ?? []) as unknown as FilaLugarChicos[]) }
  } catch (e) {
    return { ok: false, error: MENSAJE_ERROR_LUGARES, sinConexion: esErrorDeRed(e) || undefined }
  }
}
