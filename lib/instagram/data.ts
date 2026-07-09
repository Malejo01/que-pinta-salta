import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'
import type { FlyerWithAccount, InstagramAccount } from '@/lib/instagram-config'

/**
 * Obtiene todos los flyers activos con datos de su cuenta.
 * Para uso en Server Components del frontend.
 */
export async function getActiveFlyers(): Promise<FlyerWithAccount[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('instagram_flyers')
    .select(`
      *,
      account:instagram_accounts(*)
    `)
    .eq('status', 'ACTIVE')
    .eq('ai_status', 'PENDING')
    .order('published_at', { ascending: false })

  if (error) {
    console.error('[IG Data] Error obteniendo flyers activos:', error)
    return []
  }

  return data as FlyerWithAccount[]
}

/**
 * Obtiene un flyer específico por su ID con datos de la cuenta.
 */
export async function getFlyerById(id: string): Promise<FlyerWithAccount | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('instagram_flyers')
    .select(`
      *,
      account:instagram_accounts(*)
    `)
    .eq('id', id)
    .single()

  if (error) {
    console.error('[IG Data] Error obteniendo flyer:', error)
    return null
  }

  return data as FlyerWithAccount
}

/**
 * Obtiene todas las cuentas de Instagram (para panel admin).
 * Usa el admin client porque las cuentas inactivas necesitan ser visibles.
 */
export async function getInstagramAccounts(): Promise<InstagramAccount[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('instagram_accounts')
    .select('*')
    .order('display_name')

  if (error) {
    console.error('[IG Data] Error obteniendo cuentas:', error)
    return []
  }

  return data as InstagramAccount[]
}

/**
 * Obtiene estadísticas de Instagram para el admin.
 */
export async function getInstagramStats() {
  const supabase = createAdminClient()

  const [
    { count: activeAccounts },
    { count: activeFlyers },
    { count: archivedFlyers },
  ] = await Promise.all([
    supabase
      .from('instagram_accounts')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true),
    supabase
      .from('instagram_flyers')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'ACTIVE'),
    supabase
      .from('instagram_flyers')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'ARCHIVED'),
  ])

  return {
    activeAccounts: activeAccounts ?? 0,
    activeFlyers: activeFlyers ?? 0,
    archivedFlyers: archivedFlyers ?? 0,
  }
}
