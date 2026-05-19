import { createClient } from '@/lib/supabase/server'
import type { Event, Category, Venue } from '@/lib/types'

export async function getEvents(options?: {
  categorySlug?: string
  featured?: boolean
  limit?: number
  search?: string
}): Promise<(Event & { category: Category; venue: Venue | null })[]> {
  const supabase = await createClient()
  
  let query = supabase
    .from('events')
    .select(`
      *,
      category:categories(*),
      venue:venues(*)
    `)
    .eq('status', 'PUBLISHED')
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

export async function getFeaturedEvents(): Promise<(Event & { category: Category; venue: Venue | null })[]> {
  return getEvents({ featured: true, limit: 5 })
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

export async function getVenues(): Promise<Venue[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('venues')
    .select('*')
    .order('name')
  
  if (error) {
    console.error('Error fetching venues:', error)
    return []
  }
  
  return data as Venue[]
}
