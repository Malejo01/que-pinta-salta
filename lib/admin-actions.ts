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

export async function toggleEventFeatured(eventId: string, isFeatured: boolean) {
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
    .update({ is_featured: isFeatured })
    .eq('id', eventId)
    .select('id')
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data?.id) return { error: 'No se pudo actualizar el evento.' }

  revalidatePath('/')
  revalidatePath(`/evento/${eventId}`)
  return { success: true }
}

export async function publishDraftEvent(eventId: string, eventData: any) {
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

  // Generar slug basado en el título (o usar el existente si no cambió)
  const baseSlug = slugifyCategoryName(eventData.title)
  let slug = eventData.slug || baseSlug
  
  // Si el título cambió, generamos un nuevo slug único
  if (baseSlug && baseSlug !== eventData.slug) {
    slug = baseSlug
    // Asegurar unicidad sumando parte del ID o fecha
    const shortId = eventId.substring(0, 5)
    slug = `${baseSlug}-${shortId}`
  }

  const { error } = await adminClient
    .from('events')
    .update({
      title: eventData.title,
      slug,
      description: eventData.description || null,
      category_id: eventData.category_id || null,
      venue_id: eventData.venue_id || null,
      start_date: eventData.start_date,
      price_min: eventData.price_min ?? 0,
      is_free: eventData.is_free ?? false,
      ticket_url: eventData.ticket_url || null,
      image_url: eventData.image_url || null,
      status: 'PUBLISHED', // Publicar!
      updated_at: new Date().toISOString()
    })
    .eq('id', eventId)

  if (error) {
    console.error('Error publicando evento:', error)
    return { error: error.message }
  }

  // Si tiene un flyer asociado, marcarlo como PROCESSED en la tabla instagram_flyers
  if (eventData.ai_metadata?.flyer_id) {
    await adminClient
      .from('instagram_flyers')
      .update({
        ai_status: 'PROCESSED',
        ai_processed_at: new Date().toISOString()
      })
      .eq('id', eventData.ai_metadata.flyer_id)
  }

  revalidatePath('/')
  revalidatePath('/admin/revision')
  return { success: true }
}

export async function deleteDraftEvent(eventId: string, flyerId?: string) {
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

  // 1. Si hay un flyerId asociado, cambiar su estado de procesamiento a SKIPPED para no volver a intentar procesarlo
  if (flyerId) {
    await adminClient
      .from('instagram_flyers')
      .update({
        ai_status: 'SKIPPED',
        ai_processed_at: new Date().toISOString()
      })
      .eq('id', flyerId)
  }

  // 2. Eliminar el evento en borrador
  const { error } = await adminClient
    .from('events')
    .delete()
    .eq('id', eventId)

  if (error) {
    console.error('Error eliminando evento borrador:', error)
    return { error: error.message }
  }

  revalidatePath('/')
  revalidatePath('/admin/revision')
  return { success: true }
}

export async function triggerAIProcessing(limit: number = 3) {
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

  // Buscar flyers pendientes que estén activos
  const { data: pendingFlyers, error: fetchError } = await adminClient
    .from('instagram_flyers')
    .select('id, ig_post_id')
    .eq('ai_status', 'PENDING')
    .eq('status', 'ACTIVE')
    .order('published_at', { ascending: false })
    .limit(limit)

  if (fetchError) {
    console.error('Error fetching pending flyers:', fetchError)
    return { error: `Error en base de datos: ${fetchError.message}` }
  }

  if (!pendingFlyers || pendingFlyers.length === 0) {
    return { message: 'No hay flyers activos con procesamiento de IA pendiente.', processedCount: 0, success: true }
  }

  // Importar dinámicamente para evitar dependencias circulares y optimizar peso en Server Component
  const { processFlyerWithAI } = await import('@/lib/ai/process-flyer-ai')

  const tasks = pendingFlyers.map(async (flyer) => {
    try {
      const result = await processFlyerWithAI(flyer.id)
      return {
        flyerId: flyer.id,
        igPostId: flyer.ig_post_id,
        success: result.success,
        eventId: result.eventId,
        error: result.error,
      }
    } catch (err: any) {
      return {
        flyerId: flyer.id,
        igPostId: flyer.ig_post_id,
        success: false,
        error: err.message || String(err),
      }
    }
  })

  const results = await Promise.allSettled(tasks)
  const processedResults = results.map((res, index) => {
    if (res.status === 'fulfilled') return res.value
    return {
      flyerId: pendingFlyers[index].id,
      igPostId: pendingFlyers[index].ig_post_id,
      success: false,
      error: `Error crítico en promesa: ${res.reason}`,
    }
  })

  const successCount = processedResults.filter(r => r.success).length
  const failCount = processedResults.length - successCount

  revalidatePath('/')
  revalidatePath('/admin/revision')

  return {
    success: true,
    message: `Procesamiento en lote finalizado. Éxitos: ${successCount}, Fallas: ${failCount}`,
    processedCount: processedResults.length
  }
}

export async function getPendingEvents() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'ADMIN') return []

  // El left join con profiles se debe hacer a través del created_by
  const { data, error } = await supabase
    .from('events')
    .select(`
      *,
      category:categories(id, name, slug),
      venue:venues(id, name),
      profile:profiles!events_created_by_fkey(full_name, email)
    `)
    .eq('status', 'PENDING')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching pending events:', error)
    return []
  }

  return data || []
}

export async function approvePendingEvent(eventId: string) {
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

  const { error } = await adminClient
    .from('events')
    .update({ status: 'PUBLISHED', updated_at: new Date().toISOString() })
    .eq('id', eventId)

  if (error) return { error: error.message }

  revalidatePath('/admin/pendientes')
  revalidatePath('/')
  return { success: true }
}



