import { createClient } from '@supabase/supabase-js';
import type { Event, TicketSource } from '../types';
import { formatSaltaDayKey } from '../date-format';

// Helper to get admin Supabase client if not passed
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Faltan variables de entorno SUPABASE');
  return createClient(url, key);
}

/**
 * Normaliza una cadena de texto quitando acentos, caracteres especiales y palabras vacías.
 */
export function normalizeTitle(title: string): string {
  if (!title) return '';
  
  // Lista de palabras vacías (stop words) comunes en títulos de eventos
  const stopWords = new Set([
    'de', 'la', 'el', 'en', 'con', 'para', 'un', 'una', 'los', 'las', 'del', 'al',
    'show', 'concierto', 'recital', 'presenta', 'presentacion', 'en vivo', 'live',
    'tour', 'teatro', 'obra', 'festival', 'gira'
  ]);

  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
    .replace(/[^a-z0-9\s]/g, ' ')    // Reemplazar caracteres especiales por espacios
    .split(/\s+/)
    .filter(word => word.length > 1 && !stopWords.has(word))
    .join(' ')
    .trim();
}

export function calculateSimilarity(title1: string, title2: string): number {
  const clean1 = normalizeTitle(title1);
  const clean2 = normalizeTitle(title2);

  if (!clean1 || !clean2) return 0;
  if (clean1 === clean2) return 1.0;
  
  // Si uno contiene al otro por completo (y tiene longitud significativa), es muy probable que sea el mismo
  if ((clean1.length > 5 && clean2.includes(clean1)) || (clean2.length > 5 && clean1.includes(clean2))) {
    return 0.9;
  }

  const words1 = clean1.split(' ');
  const words2 = clean2.split(' ');

  const set1 = new Set(words1);
  const set2 = new Set(words2);

  let intersection = 0;
  const matchedWords2 = new Set<string>();

  for (const w1 of set1) {
    for (const w2 of set2) {
      if (matchedWords2.has(w2)) continue;
      // Match exacto o substring si la palabra es suficientemente larga (ej. "cine" en "cineclub")
      if (w1 === w2 || (w1.length > 3 && w2.length > 3 && (w1.includes(w2) || w2.includes(w1)))) {
        intersection++;
        matchedWords2.add(w2);
        break;
      }
    }
  }

  const union = set1.size + set2.size - intersection;
  if (union === 0) return 0;

  return intersection / union;
}

/**
 * Busca si ya existe un evento equivalente en la misma fecha y lugar (venue).
 * Retorna el evento completo encontrado o null.
 */
export async function findDuplicateEvent(
  event: Partial<Event>,
  supabaseClient?: any
): Promise<Event | null> {
  const supabase = supabaseClient || getAdminClient();
  
  if (!event.start_date || !event.venue_id) {
    return null;
  }

  // 1. Definir rango de fecha (mismo día calendario en hora UTC/Local)
  const eventDate = new Date(event.start_date);
  const startOfDay = new Date(eventDate);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(eventDate);
  endOfDay.setUTCHours(23, 59, 59, 999);

  // 2. Buscar candidatos en el mismo lugar y mismo día
  const { data: candidates, error } = await supabase
    .from('events')
    .select('*')
    .eq('venue_id', event.venue_id)
    .gte('start_date', startOfDay.toISOString())
    .lte('start_date', endOfDay.toISOString());

  if (error) {
    console.error('[deduplicate] Error buscando candidatos:', error.message);
    return null;
  }

  if (!candidates || candidates.length === 0) {
    return null;
  }

  // 3. Comparar títulos de los candidatos usando similitud lingüística
  const THRESHOLD = 0.65; // Umbral de Jaccard aceptable
  let bestMatch: Event | null = null;
  let highestScore = 0;

  for (const candidate of candidates) {
    const score = calculateSimilarity(event.title || '', candidate.title);
    if (score >= THRESHOLD && score > highestScore) {
      highestScore = score;
      bestMatch = candidate;
    }
  }

  if (bestMatch) {
    console.log(
      `[deduplicate] MATCH ENCONTRADO: "${event.title}" coincide con ` +
      `"${bestMatch.title}" (Similitud: ${(highestScore * 100).toFixed(1)}%)`
    );
  }

  return bestMatch;
}

/**
 * Mapea e inserta o actualiza un evento según corresponda.
 * Retorna true si se insertó, false si se actualizó (fusionó), o lanza error.
 */
export async function upsertEventWithDeduplication(
  eventData: any,
  sourceKey: string,
  supabaseClient?: any
): Promise<{ success: boolean; action: 'insert' | 'update' | 'skip'; eventId: string }> {
  const supabase = supabaseClient || getAdminClient();

  // 1. Buscar duplicado por lugar y fecha
  let existingEvent = await findDuplicateEvent(eventData, supabase);

  // 2. Si no se encontró por lugar y fecha, verificar colisión por slug único
  if (!existingEvent && eventData.slug) {
    const { data: eventBySlug } = await supabase
      .from('events')
      .select('*')
      .eq('slug', eventData.slug)
      .maybeSingle();

    if (eventBySlug) {
      const score = calculateSimilarity(eventData.title || '', eventBySlug.title);
      if (score >= 0.65) {
        existingEvent = eventBySlug;
        console.log(`[deduplicate] MATCH POR SLUG: "${eventData.title}" coincide con "${eventBySlug.title}" (ID: ${eventBySlug.id})`);
      } else {
        // Tienen el mismo slug original pero son eventos completamente distintos.
        // Agregamos la fecha al slug del nuevo evento para evitar violar el constraint único en BD.
        const dateStr = formatSaltaDayKey(eventData.start_date || new Date());
        eventData.slug = `${eventData.slug}-${dateStr}`;
        console.log(`[deduplicate] Colisión de slug evitada para "${eventData.title}". Nuevo slug: "${eventData.slug}"`);
      }
    }
  }

  if (existingEvent) {
    // Si existe coincidencia, agregamos el link de compra alternativo (UPDATE)
    const existingSources: TicketSource[] = Array.isArray(existingEvent.ticket_sources)
      ? (existingEvent.ticket_sources as TicketSource[])
      : [];

    const newSourceUrl = eventData.ticket_url;
    
    // Verificar si esta fuente ya está registrada en el evento
    const hasSource = existingSources.some(
      src => src.url === newSourceUrl || src.source === sourceKey
    );

    let updatedSources = [...existingSources];
    if (!hasSource && newSourceUrl) {
      updatedSources.push({
        source: sourceKey,
        url: newSourceUrl,
        price_min: eventData.price_min ?? 0
      });
    }

    // Actualizar precio mínimo general si la nueva opción es más barata
    let finalPriceMin = existingEvent.price_min;
    if (eventData.price_min !== undefined && eventData.price_min < existingEvent.price_min) {
      finalPriceMin = eventData.price_min;
    }

    // Consolidar flags comerciales (si cualquiera es comercial, el evento pasa a ser comercial)
    const finalIsCommercial = existingEvent.is_commercial || eventData.is_commercial || false;

    // Consolidar is_free: si el nuevo scrape determina que no es gratis o si el precio mínimo final es > 0, corregimos a false
    let finalIsFree = existingEvent.is_free;
    if (eventData.is_free !== undefined) {
      if (eventData.is_free === false || finalPriceMin > 0) {
        finalIsFree = false;
      }
    }

    // Consolidar imagen: si la imagen actual es nula o es una miniatura, y la nueva es mejor, la actualizamos
    let finalImageUrl = existingEvent.image_url;
    if (eventData.image_url && (!existingEvent.image_url || existingEvent.image_url.includes('150x150') || existingEvent.image_url.toLowerCase().includes('thumb') || existingEvent.image_url.toLowerCase().includes('equity'))) {
      finalImageUrl = eventData.image_url;
    }

    // Consolidar category_id y su clasificación
    let finalCategoryId = existingEvent.category_id;
    let finalClassificationSource = existingEvent.classification_source;
    
    if (eventData.category_id) {
      const currentSource = existingEvent.classification_source;
      const newSource = eventData.classification_source;
      
      if (
        !existingEvent.category_id || 
        currentSource === null || 
        (currentSource === 'scraper' && (newSource === 'alias' || newSource === 'scraper'))
      ) {
        finalCategoryId = eventData.category_id;
        finalClassificationSource = newSource || 'scraper';
      }
    }

    // Actualizar base de datos
    const { error } = await supabase
      .from('events')
      .update({
        ticket_sources: updatedSources,
        price_min: finalPriceMin,
        is_free: finalIsFree,
        image_url: finalImageUrl,
        is_commercial: finalIsCommercial,
        category_id: finalCategoryId,
        classification_source: finalClassificationSource,
        updated_at: new Date().toISOString()
      })
      .eq('id', existingEvent.id);

    if (error) {
      throw new Error(`Error actualizando evento duplicado: ${error.message}`);
    }

    return { success: true, action: 'update', eventId: existingEvent.id };
  } else {
    // Si no existe, creamos el arreglo de ticket_sources inicial e insertamos
    const initialSources: TicketSource[] = [];
    if (eventData.ticket_url) {
      initialSources.push({
        source: sourceKey,
        url: eventData.ticket_url,
        price_min: eventData.price_min ?? 0
      });
    }

    const newEvent = {
      ...eventData,
      ticket_sources: initialSources,
      scrape_source_key: sourceKey,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Eliminar propiedad temporal 'venue' que se usa para resolver
    delete newEvent.venue;

    const { data, error } = await supabase
      .from('events')
      .insert(newEvent)
      .select('id')
      .single();

    if (error) {
      throw new Error(`Error insertando nuevo evento: ${error.message}`);
    }

    return { success: true, action: 'insert', eventId: data.id };
  }
}

/**
 * Verifica si el evento ya existe en la base de datos (por slug, ticket_url o similitud).
 * Retorna true si es nuevo, false si es duplicado.
 */
export async function deduplicateEvent(
  event: Partial<Event>,
  supabaseClient?: any
): Promise<boolean> {
  const duplicate = await findDuplicateEvent(event, supabaseClient);
  return duplicate === null;
}
