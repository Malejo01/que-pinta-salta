'use server'

/**
 * Acciones del panel /admin/duplicados (QPS-061, Ronda 19 / 19-c):
 * fusionar un par a mano (`merge_events()`), marcarlo como "no son el mismo
 * evento" (`duplicate_dismissals`) y volver a revisar un par ya marcado.
 *
 * Las tres corren con el cliente del usuario (`createClient()` de
 * lib/supabase/server.ts), no con el de service role: `merge_events()` es
 * SECURITY DEFINER y verifica `is_admin()` del usuario real (`auth.uid()`), y
 * las policies de `duplicate_dismissals` dependen de la sesión. Mismo patrón
 * de validación que `publishDraftEvent` en lib/admin-actions.ts: sesión, luego
 * rol ADMIN en `profiles`.
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { orderPair } from '@/lib/events/duplicate-candidates'
import { isUuid } from '@/lib/metricas'

type ActionError = { error: string }

type SupabaseUserClient = Awaited<ReturnType<typeof createClient>>

/** Sesión + rol ADMIN, con el cliente del usuario (para que RLS evalúe a esa persona). */
async function requireAdminSupabase(): Promise<{ supabase: SupabaseUserClient } | ActionError> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()

  if (profile?.role !== 'ADMIN') return { error: 'No tienes permisos de administrador' }

  return { supabase }
}

/**
 * Los códigos P0001 de merge_events() ya son texto legible en español (ver
 * supabase/migrations/20261011120000_merge_events.sql): se muestran tal
 * cual. El resto (42501 no admin, 22023 ids inválidos, P0002 no existe, o
 * cualquier error inesperado de Postgres/red) se traduce a un texto genérico:
 * nunca se expone el mensaje crudo de la base para esos casos.
 */
function mergeErrorMessage(error: { code?: string; message: string }): string {
  if (error.code === 'P0001') return error.message
  if (error.code === '42501') return 'No tenés permisos para fusionar eventos'
  if (error.code === '22023') return 'Los dos eventos a fusionar tienen que ser distintos'
  if (error.code === 'P0002') return 'Alguno de los dos eventos ya no existe'
  return 'No se pudo fusionar el evento. Intentá de nuevo'
}

export type MergeDuplicatePairResult = { success: true; result: unknown } | ActionError

/**
 * Fusiona dos eventos: `keepId` queda, `dropId` pasa a borrador apuntando a
 * `keepId` (ver lib/events/merged.ts). Llama a `merge_events()` con el
 * cliente del usuario a propósito: así `is_admin()` evalúa al admin real, no
 * a un cliente de service role.
 */
export async function mergeDuplicatePair(keepId: string, dropId: string): Promise<MergeDuplicatePairResult> {
  if (!isUuid(keepId) || !isUuid(dropId) || keepId === dropId) {
    return { error: 'Los ids de los eventos a fusionar no son válidos' }
  }

  const auth = await requireAdminSupabase()
  if ('error' in auth) return auth

  const { data, error } = await auth.supabase.rpc('merge_events', { keep_id: keepId, drop_id: dropId })

  if (error) {
    return { error: mergeErrorMessage(error) }
  }

  revalidatePath('/')
  revalidatePath(`/evento/${keepId}`)
  revalidatePath(`/evento/${dropId}`)
  revalidatePath('/admin/duplicados')

  return { success: true, result: data }
}

export type DismissDuplicatePairResult = { success: true } | ActionError

/** Marca un par candidato como "no son el mismo evento": no vuelve a aparecer en la lista. */
export async function dismissDuplicatePair(aId: string, bId: string): Promise<DismissDuplicatePairResult> {
  if (!isUuid(aId) || !isUuid(bId) || aId === bId) {
    return { error: 'Los ids del par no son válidos' }
  }

  const auth = await requireAdminSupabase()
  if ('error' in auth) return auth

  const [eventA, eventB] = orderPair(aId, bId)

  const { error } = await auth.supabase.from('duplicate_dismissals').insert({ event_a: eventA, event_b: eventB })

  // 23505 = unique_violation (la PRIMARY KEY es (event_a, event_b)): el par ya
  // estaba marcado, se considera éxito en vez de error.
  if (error && error.code !== '23505') {
    return { error: 'No se pudo marcar el par como distinto. Intentá de nuevo' }
  }

  revalidatePath('/admin/duplicados')
  return { success: true }
}

export type RestoreDuplicatePairResult = { success: true; warning?: string } | ActionError

/** "Volver a revisar" (decisión 3 de Mauro, 09/10): saca el par de duplicate_dismissals. */
export async function restoreDuplicatePair(aId: string, bId: string): Promise<RestoreDuplicatePairResult> {
  if (!isUuid(aId) || !isUuid(bId) || aId === bId) {
    return { error: 'Los ids del par no son válidos' }
  }

  const auth = await requireAdminSupabase()
  if ('error' in auth) return auth

  const [eventA, eventB] = orderPair(aId, bId)

  const { data, error } = await auth.supabase
    .from('duplicate_dismissals')
    .delete()
    .eq('event_a', eventA)
    .eq('event_b', eventB)
    .select('event_a')

  if (error) {
    return { error: 'No se pudo volver a revisar el par. Intentá de nuevo' }
  }

  revalidatePath('/admin/duplicados')

  if (!data || data.length === 0) {
    return { success: true, warning: 'Ese par ya no estaba marcado' }
  }

  return { success: true }
}
