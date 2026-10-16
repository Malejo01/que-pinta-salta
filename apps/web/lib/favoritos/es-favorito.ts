import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * ¿El evento es favorito del usuario? Misma consulta que usaba
 * `app/evento/[id]/page.tsx` (ficha), ahora compartida con los dos modales
 * de evento (ruta interceptada y `/buscar`): sin sesión, `false` sin
 * consultar la base. El `user_id` siempre lo trae el llamador desde la
 * sesión del servidor (`supabase.auth.getUser()`), nunca de otro lado.
 */
export async function esEventoFavorito(
  supabase: SupabaseClient,
  userId: string | null | undefined,
  eventId: string
): Promise<boolean> {
  if (!userId) return false

  const { data } = await supabase
    .from('user_favorites')
    .select('id')
    .eq('user_id', userId)
    .eq('event_id', eventId)
    .maybeSingle()

  return !!data
}
