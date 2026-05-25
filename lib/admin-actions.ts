"use server"

import { createClient } from "@/lib/supabase/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"

function slugifyCategoryName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function getPrivilegedClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Faltan variables de entorno de Supabase para operaciones admin (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
  }

  return createSupabaseClient(url, key)
}

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
  
  revalidatePath('/admin/clasificacion')
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
  
  revalidatePath('/admin/clasificacion')
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

export async function getUncategorizedEvents() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('events')
    .select(`
      id,
      title,
      slug,
      start_date,
      scrape_source_key,
      created_at,
      venue:venues(id, name)
    `)
    .is('category_id', null)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching uncategorized events:', error)
    return []
  }

  return data || []
}

export async function categorizeEvent(eventId: string, categoryId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'ADMIN') return { error: 'No tienes permisos de administrador' }

  const adminClient = getPrivilegedClient()

  const { data, error } = await adminClient
    .from('events')
    .update({ category_id: categoryId, classification_source: 'manual' })
    .eq('id', eventId)
    .select('id')
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data?.id) return { error: 'No se pudo actualizar el evento. Verifica permisos RLS o ID del evento.' }

  revalidatePath('/admin/clasificacion')
  return { success: true }
}

export async function updateEventCategory(eventId: string, categoryId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'ADMIN') return { error: 'No tienes permisos de administrador' }

  const adminClient = getPrivilegedClient()

  const { data, error } = await adminClient
    .from('events')
    .update({ category_id: categoryId, classification_source: 'manual' })
    .eq('id', eventId)
    .select('id')
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data?.id) return { error: 'No se pudo actualizar el evento. Verifica permisos RLS o ID del evento.' }

  revalidatePath('/')
  revalidatePath(`/evento/${eventId}`)
  revalidatePath('/admin/clasificacion')
  return { success: true }
}

export async function createCategory(name: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'ADMIN') return { error: 'No tienes permisos de administrador' }

  const adminClient = getPrivilegedClient()

  const trimmedName = name.trim()
  if (trimmedName.length < 2) return { error: 'El nombre debe tener al menos 2 caracteres' }

  const { data: existingByName } = await adminClient
    .from('categories')
    .select('id, name, slug, icon, color, created_at')
    .ilike('name', trimmedName)
    .maybeSingle()

  if (existingByName) {
    return { success: true, category: existingByName }
  }

  const baseSlug = slugifyCategoryName(trimmedName)
  if (!baseSlug) return { error: 'No se pudo generar un slug válido' }

  let finalSlug = baseSlug
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? baseSlug : `${baseSlug}-${i + 1}`
    const { data: existingBySlug } = await adminClient
      .from('categories')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle()

    if (!existingBySlug) {
      finalSlug = candidate
      break
    }
  }

  const { data, error } = await adminClient
    .from('categories')
    .insert({ name: trimmedName, slug: finalSlug, icon: null, color: null })
    .select('*')
    .single()

  if (error) return { error: error.message }

  revalidatePath('/')
  revalidatePath('/admin/clasificacion')
  return { success: true, category: data }
}
