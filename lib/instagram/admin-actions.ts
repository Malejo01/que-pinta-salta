'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function ensureAdmin() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { supabase, user: null, error: 'No autenticado' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'ADMIN') {
    return { supabase, user: null, error: 'Sin permisos de administrador' }
  }

  return { supabase, user, error: null }
}

export async function createInstagramAccount(
  username: string,
  displayName: string,
  notes?: string
) {
  const { supabase, error } = await ensureAdmin()
  if (error) return { error }

  // Limpiar username (quitar @ si lo puso)
  const cleanUsername = username.replace(/^@/, '').trim().toLowerCase()

  if (!cleanUsername || !displayName.trim()) {
    return { error: 'Username y nombre son requeridos' }
  }

  const { data, error: insertError } = await supabase
    .from('instagram_accounts')
    .insert({
      username: cleanUsername,
      display_name: displayName.trim(),
      notes: notes?.trim() || null,
    })
    .select()
    .single()

  if (insertError) {
    if (insertError.code === '23505') {
      return { error: `La cuenta @${cleanUsername} ya existe` }
    }
    return { error: insertError.message }
  }

  revalidatePath('/admin/instagram')
  return { account: data, error: null }
}

export async function updateInstagramAccount(
  id: string,
  data: {
    display_name?: string
    notes?: string | null
    is_active?: boolean
  }
) {
  const { supabase, error } = await ensureAdmin()
  if (error) return { error }

  const { error: updateError } = await supabase
    .from('instagram_accounts')
    .update(data)
    .eq('id', id)

  if (updateError) {
    return { error: updateError.message }
  }

  revalidatePath('/admin/instagram')
  revalidatePath('/')
  return { error: null }
}

export async function toggleInstagramAccount(id: string, isActive: boolean) {
  return updateInstagramAccount(id, { is_active: isActive })
}

export async function deleteInstagramAccount(id: string) {
  const { supabase, error } = await ensureAdmin()
  if (error) return { error }

  // Eliminar la cuenta (los flyers se borran en cascada por la FK)
  const { error: deleteError } = await supabase
    .from('instagram_accounts')
    .delete()
    .eq('id', id)

  if (deleteError) {
    return { error: deleteError.message }
  }

  revalidatePath('/admin/instagram')
  revalidatePath('/')
  return { error: null }
}
