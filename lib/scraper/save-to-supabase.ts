import { createClient } from '@supabase/supabase-js';
import type { Event, Venue } from '../types';
import { upsertEventWithDeduplication } from './deduplicate';
import { saltaWallClockToUtcISO } from '../date-format';
import { formatVenueError, resolveVenueId } from '../venues/resolve';

// Cliente directo (service role key para uso en scripts, nunca en browser)
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Faltan variables de entorno SUPABASE');
  return createClient(url, key);
}

/**
 * Busca o crea un venue por nombre. Retorna el id del venue CANÓNICO.
 *
 * Toda la lógica vive en resolve_venue_id() (Postgres, ver lib/venues/resolve.ts).
 * Antes esto hacía `ilike('name', name)` + insert, y por eso la tabla terminó con
 * 145 filas para ~90 lugares: cualquier diferencia de tilde, mayúscula, sufijo
 * de ciudad o un salto de línea en el nombre creaba una fila nueva.
 */
export async function upsertVenue(
  venueName: string,
  source?: string,
  onError?: (rawName: string, message: string) => void
): Promise<string | null> {
  return resolveVenueId(getAdminClient(), venueName, {
    source: source ?? 'scraper',
    // Un evento sin venue_id no se puede deduplicar (findDuplicateEvent compara
    // venue_id + fecha), así que se crea el venue y queda encolado en
    // venue_review_queue antes que perder la deduplicación.
    autocreate: true,
    onError,
  });
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
  venueName: string,
  description: string = ''
): Promise<{ categoryId: string; source: 'alias' } | null> {
  const supabase = getAdminClient()

  try {
    const { data: aliases } = await supabase
      .from('aliases')
      .select('alias, target_id')
      .eq('target_type', 'category');

    if (aliases && aliases.length > 0) {
      const combined = `${title} ${venueName} ${description}`.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      for (const item of aliases) {
        if (!item.alias || !item.target_id) continue;
        const cleanAlias = item.alias.toLowerCase().trim()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        
        const escaped = cleanAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'i');
        if (regex.test(combined)) {
          return { categoryId: item.target_id, source: 'alias' };
        }
      }
    }
  } catch (err) {
    console.error('[save-to-supabase:autoClassifyEvent] Error reading aliases:', err);
  }

  return null;
}

export type SaveResult = {
  inserted: number;
  skipped: number;
  errors: string[];
  /**
   * Fallas de resolve_venue_id: el evento se guarda igual, sin venue_id.
   * Opcional para no romper a los llamadores que ya armaban un SaveResult
   * a mano (alpogo-scraper.ts, entradauno-scraper.ts, vamos-scraper.ts):
   * ninguno de ellos la lee hoy, pero saveEventsToSupabase() siempre la llena.
   */
  venueErrors?: string[];
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
  // Variable local (en vez de result.venueErrors directo) para que TS la vea
  // siempre como string[]: el campo en SaveResult es opcional por los
  // llamadores que construyen un SaveResult a mano sin esa propiedad.
  const venueErrors: string[] = [];
  const result: SaveResult = { inserted: 0, skipped: 0, errors: [], venueErrors };

  for (const event of events) {
    try {
      // Resolver venue_id
      const venueName = typeof event.venue === 'string' ? event.venue : '';
      const venue_id = await upsertVenue(venueName, sourceKey || 'scraper', (rawName, message) => {
        venueErrors.push(formatVenueError(rawName, message));
      });

      // Clasificación:
      // 1) Priorizar coincidencia de alias en base de datos (admin overrides)
      // 2) Si no coincide ningún alias, resolver el slug provisto por el scraper
      // 3) Si no hay ninguno, null (uncategorized)
      let category_id: string | null = null;
      let classification_source: 'scraper' | 'alias' | null = null;

      const autoMatch = await autoClassifyEvent(event.title ?? '', venueName, event.description ?? '');
      if (autoMatch) {
        category_id = autoMatch.categoryId;
        classification_source = 'alias';
      }

      if (!category_id && event.category_id) {
        const resolved = await resolveCategoryId(event.category_id);
        if (resolved) {
          category_id = resolved;
          classification_source = 'scraper';
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
        // Las ticketeras publican la hora de pared de Salta, sin zona.
        // Se convierte al instante UTC real antes de tocar la columna timestamptz.
        start_date: event.start_date ? saltaWallClockToUtcISO(event.start_date) : event.start_date,
        end_date: event.end_date ? saltaWallClockToUtcISO(event.end_date) : null,
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
