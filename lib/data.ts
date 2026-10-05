import { createClient } from '@/lib/supabase/server'
import type { Event, Category, Venue } from '@/lib/types'
import { saltaStartOfDayISO } from '@/lib/event-display'

export async function getEvents(options?: {
  categorySlug?: string
  featured?: boolean
  limit?: number
  search?: string
  /**
   * Solo para la home (filtro "Hoy"): trae desde las 00:00 de Salta en vez de
   * desde ahora, así lo que ya empezó hoy (museos, 10:00) sigue visible. El
   * cliente vuelve a descartar lo pasado en el resto de la agenda.
   */
  includeStartedToday?: boolean
}): Promise<(Event & { category: Category; venue: Venue | null })[]> {
  const supabase = await createClient()
  const nowIso = options?.includeStartedToday
    ? saltaStartOfDayISO()
    : new Date().toISOString()
  
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
      venue:venues(*)
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
 * Venues canónicos, para selectores y agregación por espacio. Excluye los
 * duplicados absorbidos (canonical_venue_id no nulo) y los centinelas
 * ("Lugar no especificado"): si no, los pickers ofrecerían "Amnesia",
 * "Amnesia Salta" y "Amnesia Pub & Music" como tres lugares.
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
