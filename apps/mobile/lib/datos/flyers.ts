// Ficha mínima de un flyer de Instagram (R29, 29-a: F13, decisión 1 del
// plan). Por `id` (uuid, `instagram_flyers.id`, el mismo que `flyerId` de
// `DisplayEvent`), con el mismo filtro `ACTIVE` que usa `/favoritos` de la
// web (y `armarFavoritos`). Sin id uuid, "no encontrado" sin consultar
// (mismo criterio que `obtenerPeliculaPorId`/`obtenerEventoPorId`).
import * as Linking from 'expo-linking'
import { esUuid } from '@/lib/links'
import { MENSAJE_SIN_CONFIGURACION } from '@/lib/mensajes'
import { supabase } from '@/lib/supabase'

export { MENSAJE_SIN_CONFIGURACION }
export const MENSAJE_ERROR_RED = 'No pudimos cargar el flyer. Revisá tu conexión.'

/**
 * Las columnas de la ficha mínima (imagen, cuenta, fecha y el link de
 * Instagram): no son `InstagramFlyer`/`InstagramAccount` completas (mismo
 * patrón que `Pelicula` en `lib/datos/cines.ts`) — el select de abajo no
 * pide `ai_metadata`/`ai_processed_at`/`ai_status` (metadata interna del
 * clasificador) ni el resto de las columnas que esta ficha no usa.
 */
export interface FlyerFicha {
  id: string
  ig_post_url: string
  caption: string | null
  published_at: string
  original_image_url: string | null
  storage_image_url: string | null
  venue_name: string | null
  category: string
  price_min: number
  is_free: boolean
  account: {
    id: string
    username: string
    display_name: string
    default_venue_name: string | null
    default_category: string
  }
}

export type ResultadoFlyer =
  | { tipo: 'ok'; flyer: FlyerFicha }
  | { tipo: 'no-encontrado' }
  | { tipo: 'error'; error: string }

/** El flyer de Instagram (`status = 'ACTIVE'`) por `id`, con la cuenta. */
export async function obtenerFlyerPorId(id: string): Promise<ResultadoFlyer> {
  if (!esUuid(id)) {
    return { tipo: 'no-encontrado' }
  }

  if (!supabase) {
    return { tipo: 'error', error: MENSAJE_SIN_CONFIGURACION }
  }

  try {
    // Columnas explícitas (nunca "*"), igual que lib/datos/eventos.ts y
    // lib/datos/cines.ts: solo lo que pide la ficha mínima.
    const { data, error } = await supabase
      .from('instagram_flyers')
      .select(
        'id, ig_post_url, caption, published_at, original_image_url, storage_image_url, venue_name, category, price_min, is_free, account:instagram_accounts(id, username, display_name, default_venue_name, default_category)',
      )
      .eq('id', id)
      .eq('status', 'ACTIVE')
      .maybeSingle()

    if (error) {
      return { tipo: 'error', error: MENSAJE_ERROR_RED }
    }
    if (!data) {
      return { tipo: 'no-encontrado' }
    }

    return { tipo: 'ok', flyer: data as unknown as FlyerFicha }
  } catch {
    return { tipo: 'error', error: MENSAJE_ERROR_RED }
  }
}

/**
 * Solo devuelve `url` si su esquema es `https` (mismo criterio que
 * `urlCompraCineSegura` en `lib/datos/cines.ts`): nunca otro esquema.
 */
export function urlInstagramSegura(url: string | null | undefined): string | null {
  if (!url) return null

  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

/**
 * Abre el post de Instagram del flyer ("Ver en Instagram"). La apertura
 * vive acá (no en `app/flyer/[id].tsx`) para que la validación https quede
 * en un único lugar: nunca se llama a `Linking.openURL` con una URL que no
 * pasó por `urlInstagramSegura`.
 */
export async function abrirPostDeInstagram(url: string | null | undefined): Promise<void> {
  const segura = urlInstagramSegura(url)
  if (!segura) return
  await Linking.openURL(segura).catch(() => {})
}
