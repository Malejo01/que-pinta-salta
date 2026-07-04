import { createClient } from '@supabase/supabase-js';
import type { Event, Venue } from '../types';
import { upsertEventWithDeduplication } from './deduplicate';

// Cliente directo (service role key para uso en scripts, nunca en browser)
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Faltan variables de entorno SUPABASE');
  return createClient(url, key);
}

/**
 * Busca o crea un venue por nombre. Retorna el id del venue.
 */
export async function upsertVenue(venueName: string): Promise<string | null> {
  if (!venueName) return null;
  const supabase = getAdminClient();

  // Extraer solo la parte del nombre del venue (antes de la primera coma)
  const name = venueName.split(',')[0].trim();
  const address = venueName.trim();

  // Buscar por nombre exacto
  const { data: existing } = await supabase
    .from('venues')
    .select('id')
    .ilike('name', name)
    .limit(1)
    .single();

  if (existing?.id) return existing.id;

  // Crear nuevo venue
  const { data: created, error } = await supabase
    .from('venues')
    .insert({ name, address })
    .select('id')
    .single();

  if (error) {
    console.warn('Error creando venue:', name, error.message);
    return null;
  }
  return created?.id ?? null;
}

/**
 * Resuelve el category_id real desde la tabla categories.
 * Si el slug no existe, usa 'otros' o el primero disponible como fallback.
 */
export async function resolveCategoryId(slug: string): Promise<string> {
  const supabase = getAdminClient();

  const { data } = await supabase
    .from('categories')
    .select('id')
    .eq('slug', slug)
    .single();

  if (data?.id) return data.id;

  // Fallback: buscar 'otros' o cualquier categoría
  const { data: fallback } = await supabase
    .from('categories')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  return fallback?.id ?? '';
}

/**
 * Intenta clasificar un evento buscando coincidencias de alias
 * contra el nombre del venue y palabras clave del título.
 * Retorna { categoryId, source } si hay match, o null si no.
 */
async function autoClassifyEvent(
  title: string,
  venueName: string
): Promise<{ categoryId: string; source: 'alias' } | null> {
  const supabase = getAdminClient()

  const candidates = [
    venueName.toLowerCase().trim(),
    ...title
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3),
  ].filter(Boolean)

  for (const text of candidates) {
    const { data } = await supabase
      .from('aliases')
      .select('target_id')
      .eq('alias', text)
      .eq('target_type', 'category')
      .maybeSingle()

    if (data?.target_id) {
      return { categoryId: data.target_id, source: 'alias' }
    }
  }

  return null
}

export type SaveResult = {
  inserted: number;
  skipped: number;
  errors: string[];
};

/**
 * Guarda los eventos scrapeados en Supabase.
 * - Verifica duplicados utilizando el motor de de-duplicación (mismo venue y fecha + similitud).
 * - Crea/reutiliza venues automáticamente.
 * - Resuelve la category_id real.
 */
export async function saveEventsToSupabase(
  events: Partial<Omit<Event, 'venue'> & { venue?: string }>[],
  sourceKey?: string
): Promise<SaveResult> {
  const supabase = getAdminClient();
  const result: SaveResult = { inserted: 0, skipped: 0, errors: [] };

  for (const event of events) {
    try {
      // Resolver venue_id
      const venueName = typeof event.venue === 'string' ? event.venue : '';
      const venue_id = await upsertVenue(venueName);

      // Clasificación: 1) scraper ya provee slug → resolver a ID
      //                2) alias match en venue/título
      //                3) null → va a la cola de "sin categorizar"
      let category_id: string | null = null;
      let classification_source: 'scraper' | 'alias' | null = null;

      if (event.category_id) {
        const resolved = await resolveCategoryId(event.category_id);
        if (resolved) {
          category_id = resolved;
          classification_source = 'scraper';
        }
      }

      if (!category_id) {
        const autoMatch = await autoClassifyEvent(event.title ?? '', venueName);
        if (autoMatch) {
          category_id = autoMatch.categoryId;
          classification_source = 'alias';
        }
      }

      const eventData = {
        title: event.title,
        slug: event.slug,
        description: event.description || null,
        short_description: event.short_description || null,
        category_id,
        venue_id,
        image_url: event.image_url || null,
        gallery_urls: event.gallery_urls || [],
        start_date: event.start_date,
        end_date: event.end_date || null,
        is_recurring: false,
        recurrence_rule: null,
        price_min: event.price_min ?? 0,
        price_max: event.price_max || null,
        is_free: event.is_free ?? false,
        ticket_url: event.ticket_url || null,
        is_commercial: event.is_commercial ?? false,
        age_restriction: 0,
        tags: event.tags || [],
        status: 'PUBLISHED',
        is_featured: false,
        view_count: 0,
        created_by: null,
        classification_source,
      };

      const upsertResult = await upsertEventWithDeduplication(
        eventData,
        sourceKey || 'unknown',
        supabase
      );

      if (upsertResult.action === 'insert') {
        result.inserted++;
        console.log(`✓ Guardado (Nuevo): ${event.title}`);
      } else {
        result.skipped++;
        console.log(`⟳ Fusionado (Duplicado): ${event.title}`);
      }
    } catch (e: any) {
      result.errors.push(`Excepción en "${event.title}": ${e?.message}`);
    }
  }

  return result;
}
