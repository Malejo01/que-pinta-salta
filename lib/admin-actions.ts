"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function getAliases() {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('aliases')
    .select(`
      *,
      category:categories!aliases_target_id_fkey(id, name, slug),
      venue:venues!aliases_target_id_fkey(id, name)
    `)
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('Error fetching aliases:', error)
    return []
  }
  
  return data || []
}

export async function createAlias(formData: FormData) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }
  
  // Check if user is admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  
  if (profile?.role !== 'ADMIN') {
    return { error: 'No tienes permisos de administrador' }
  }
  
  const alias = formData.get('alias') as string
  const targetType = formData.get('target_type') as string
  const targetId = formData.get('target_id') as string
  
  const { error } = await supabase
    .from('aliases')
    .insert({
      alias: alias.toLowerCase().trim(),
      target_type: targetType,
      target_id: targetId,
      created_by: user.id
    })
  
  if (error) {
    return { error: error.message }
  }
  
  revalidatePath('/admin/aliases')
  return { success: true }
}

export async function deleteAlias(id: string) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }
  
  // Check if user is admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  
  if (profile?.role !== 'ADMIN') {
    return { error: 'No tienes permisos de administrador' }
  }
  
  const { error } = await supabase
    .from('aliases')
    .delete()
    .eq('id', id)
  
  if (error) {
    return { error: error.message }
  }
  
  revalidatePath('/admin/aliases')
  return { success: true }
}

export async function resolveAlias(alias: string, type: 'category' | 'venue') {
  const supabase = await createClient()
  
  const { data } = await supabase
    .from('aliases')
    .select('target_id')
    .eq('alias', alias.toLowerCase().trim())
    .eq('target_type', type)
    .single()
  
  return data?.target_id || null
}
