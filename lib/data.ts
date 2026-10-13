import { createClient } from '@/lib/supabase/server'
import type { Event, Category, Venue } from '@/lib/types'
import { applyVigenciaPrefilter, isVigente } from '@/lib/events/vigencia'
import { PUBLIC_EVENT_SELECT } from '@/lib/events/public-select'

export async function getEvents(options?: {
  categorySlug?: string
  featured?: boolean
  limit?: number
  search?: string
  /**
   * Solo para la home: devuelve todo lo del prefiltro de vigencia (que ya
   * incluye lo que empezó hoy) sin el filtro exacto, porque la home filtra en
   * el cliente con dos criterios: la agenda general con isVigente y la fila
   * "Hoy" con isRelevantToday (los museos siguen todo el día, QPS-011).
   */
  includeStartedToday?: boolean
}): Promise<(Event & { category: Category; venue: Venue | null })[]> {
  const supabase = await createClient()
  const now = new Date()

  let query = supabase
    .from('events')
    .select(PUBLIC_EVENT_SELECT)
    .eq('status', 'PUBLISHED')
  query = applyVigenciaPrefilter(query, now, { includeToday: !!options?.includeStartedToday }).order('start_date', { ascending: true })

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
  
  // PUBLIC_EVENT_SELECT es un string armado en runtime (no un literal), así
  // que supabase-js no puede inferir con él el tipo de la fila: "as unknown
  // as" en vez de "as" (ver el comentario en lib/events/public-select.ts).
  const rows = data as unknown as (Event & { category: Category; venue: Venue | null })[]
  return options?.includeStartedToday ? rows : rows.filter((e) => isVigente(e, now))
}

export async function getEventBySlug(slug: string): Promise<(Event & { category: Category; venue: Venue | null }) | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('events')
    .select(PUBLIC_EVENT_SELECT)
    .eq('slug', slug)
    .single()
  
  if (error) {
    console.error('Error fetching event:', error)
    return null
  }
  
  return data as unknown as Event & { category: Category; venue: Venue | null }
}

export async function getEventById(id: string): Promise<(Event & { category: Category; venue: Venue | null }) | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('events')
    .select(PUBLIC_EVENT_SELECT)
    .eq('id', id)
    // maybeSingle: un evento fusionado, borrado o sin publicar no es un error
    // (la página hace su 308 o su 404); con single() cada visita logueaba un PGRST116.
    .maybeSingle()

  if (error) {
    console.error('Error fetching event by id:', error)
    return null
  }

  return (data as unknown as (Event & { category: Category; venue: Venue | null }) | null) ?? null
}

export async function getFeaturedEvents(): Promise<(Event & { category: Category; venue: Venue | null })[]> {
  const supabase = await createClient()
  const now = new Date()

  const { data, error } = await applyVigenciaPrefilter(supabase
    .from('events')
    .select(PUBLIC_EVENT_SELECT)
    .eq('status', 'PUBLISHED')
    .not('category_id', 'is', null), now)
    .order('start_date', { ascending: true })
    .limit(12)

  if (error) {
    console.error('Error fetching upcoming carousel events:', error)
    return []
  }

  return (data as unknown as (Event & { category: Category; venue: Venue | null })[])
    .filter((e) => isVigente(e, now))
    .slice(0, 6)
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
