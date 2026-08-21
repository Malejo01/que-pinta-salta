import { createClient } from '@/lib/supabase/server'
import type { Event, Category, Venue } from '@/lib/types'

export async function getEvents(options?: {
  categorySlug?: string
  featured?: boolean
  limit?: number
  search?: string
}): Promise<(Event & { category: Category; venue: Venue | null })[]> {
  const supabase = await createClient()
  const nowIso = new Date().toISOString()
  
  let query = supabase
    .from('events')
    .select(`
      *,
      category:categories(*),
      venue:venues(*)
    `)
    .eq('status', 'PUBLISHED')
    .gte('start_date', nowIso)
    .order('start_date', { ascending: true })
  
  if (options?.categorySlug) {
    const { data: category } = await supabase
      .from('categories')
      .select('id')
      .eq('slug', options.categorySlug)
      .single()
    
    if (category) {
      query = query.eq('category_id', category.id)
    }
  }
  
  if (options?.featured) {
    query = query.eq('is_featured', true)
  }
  
  if (options?.limit) {
    query = query.limit(options.limit)
  }
  
  if (options?.search) {
    query = query.ilike('title', `%${options.search}%`)
  }
  
  const { data, error } = await query
  
  if (error) {
    console.error('Error fetching events:', error)
    return []
  }
  
  return data as (Event & { category: Category; venue: Venue | null })[]
}

export async function getEventBySlug(slug: string): Promise<(Event & { category: Category; venue: Venue | null }) | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('events')
    .select(`
      *,
      category:categories(*),
      venue:venues(*)
    `)
    .eq('slug', slug)
    .single()
  
  if (error) {
    console.error('Error fetching event:', error)
    return null
  }
  
  return data as Event & { category: Category; venue: Venue | null }
}

export async function getEventById(id: string): Promise<(Event & { category: Category; venue: Venue | null }) | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('events')
    .select(`
      *,
      category:categories(*),
      venue:venues(*),
      profile:profiles!events_created_by_fkey(role, full_name, contact_type, contact_value)
    `)
    .eq('id', id)
    .single()
  
  if (error) {
    console.error('Error fetching event by id:', error)
    return null
  }
  
  return data as Event & { category: Category; venue: Venue | null }
}

export async function getFeaturedEvents(): Promise<(Event & { category: Category; venue: Venue | null })[]> {
  const supabase = await createClient()
  const nowIso = new Date().toISOString()

  const { data, error } = await supabase
    .from('events')
    .select(`
      *,
      category:categories(*),
      venue:venues(*)
    `)
    .eq('status', 'PUBLISHED')
    .not('category_id', 'is', null)
    .gte('start_date', nowIso)
    .order('start_date', { ascending: true })
    .limit(6)

  if (error) {
    console.error('Error fetching upcoming carousel events:', error)
    return []
  }

  return data as (Event & { category: Category; venue: Venue | null })[]
}

export async function getEventsByCategory(categorySlug: string): Promise<(Event & { category: Category; venue: Venue | null })[]> {
  return getEvents({ categorySlug })
}

export async function getCategories(): Promise<Category[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('name')
  
  if (error) {
    console.error('Error fetching categories:', error)
    return []
  }
  
  return data as Category[]
}

/**
 * Venues canónicos, para selectores y agregación por espacio.
 *
 * Excluye los duplicados absorbidos (canonical_venue_id no nulo) y los
 * centinelas. Si no se filtrara, los pickers volverían a ofrecer "Amnesia",
 * "Amnesia Salta" y "Amnesia Pub & Music" como si fueran tres lugares, que es
 * justo lo que la consolidación viene a arreglar.
 *
 * Requiere 20260821_venue_canonical.sql aplicada: la migración va antes que
 * el deploy.
 */
export async function getVenues(): Promise<Venue[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('venues')
    .select('*')
    .is('canonical_venue_id', null)
    .eq('is_placeholder', false)
    .order('name')

  if (error) {
    console.error('Error fetching venues:', error)
    return []
  }

  return data as Venue[]
}

export async function getInstagramAccounts(): Promise<any[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('instagram_accounts')
    .select('*')
    .eq('is_active', true)
    .order('display_name')
  
  if (error) {
    console.error('Error fetching instagram accounts:', error)
    return []
  }
  
  return data
}
