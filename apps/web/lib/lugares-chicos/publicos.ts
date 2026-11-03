/**
 * Q5-2 · Los lugares para chicos PUBLICADOS, con su venue, para la capa de
 * /mapa (y la ficha de Q5-5). Pide solo las columnas que `anon` puede leer
 * (`COLUMNAS_PUBLICAS_LUGAR`: sin `cargado_por` ni `verificado_por`). Si la
 * consulta falla, devuelve [] y la página sigue con los eventos.
 */
import { createClient } from '@/lib/supabase/server'
import { COLUMNAS_PUBLICAS_LUGAR } from '@qps/core/lugares/permanentes'
import { armarLugaresChicos, type FilaLugarChicos, type LugarChicosMapa } from '@qps/core/mapa/lugares-chicos'

export const SELECT_LUGARES_CHICOS = `${COLUMNAS_PUBLICAS_LUGAR}, venue:venues!inner(name, address, slug, latitude, longitude, canonical_venue_id)`

export async function traerLugaresChicosPublicados(opciones: { soloGratis?: boolean } = {}): Promise<LugarChicosMapa[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('lugares_permanentes')
      .select(SELECT_LUGARES_CHICOS)
      .eq('estado', 'publicado')
      .limit(500)
      .returns<FilaLugarChicos[]>()
    if (error) {
      console.error('[lugares-chicos] no se pudieron leer los publicados', error.code ?? 'sin-codigo')
      return []
    }
    return armarLugaresChicos(data ?? [], opciones)
  } catch {
    console.error('[lugares-chicos] error inesperado al leer los publicados')
    return []
  }
}
