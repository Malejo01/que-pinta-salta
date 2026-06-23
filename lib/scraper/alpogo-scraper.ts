import slugify from 'slugify';
import { saveEventsToSupabase, type SaveResult } from './save-to-supabase';
import type { Event } from '../types';

const ALPOGO_API_URL = 'https://alpogo.com/api/events/getEvents2';

// Commercial categories matching EntradaUno criteria
const COMMERCIAL_CATEGORIES = new Set(['recitales', 'teatro', 'boliches', 'penas']);

/**
 * Maps Alpogo activity name to database category slugs
 */
export function mapAlpogoCategory(actividad: string): string {
  const act = (actividad || '').trim();
  const mapping: Record<string, string> = {
    'Recital': 'recitales',
    'Tributo': 'recitales',
    'Peña': 'penas',
    'Fiesta/Disco': 'boliches',
    'Teatro': 'teatro',
    'Café Concert': 'teatro',
    'Deportes y salud': 'deportes',
    'Cultural': 'espectaculos',
    'Festival': 'espectaculos',
    'Taller o curso': 'espectaculos',
    'Otros': 'espectaculos'
  };
  return mapping[act] || 'espectaculos';
}

/**
 * Clean description HTML tags
 */
function cleanDescription(html: string): { description: string; short_description: string } {
  if (!html) return { description: '', short_description: '' };
  try {
    const text = html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '') // Strip HTML tags
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return {
      description: text,
      short_description: text.substring(0, 160) + (text.length > 160 ? '...' : '')
    };
  } catch {
    return { description: '', short_description: '' };
  }
}

/**
 * Scrapes Alpogo.com events for Salta (provincia_id 16) and saves them to Supabase.
 */
export async function scrapeAlpogoSalta(): Promise<SaveResult> {
  const accumulated: SaveResult = { inserted: 0, skipped: 0, errors: [] };

  try {
    console.log('[alpogo] Obteniendo eventos de Salta desde la API...');
    const payload = {
      limit: 100,
      offset: 0,
      eventos_estado: 'activo',
      funciones_estado: 'activo',
      provincia_id: '16', // Salta
      tipo_actividad: null,
      fecha_inicio: null,
      fecha_fin: null
    };

    const res = await fetch(ALPOGO_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`Error HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    console.log(`[alpogo] ${data.length} evento(s) recibidos de la API.`);

    const eventsToSave: Partial<Omit<Event, 'venue'> & { venue?: string }>[] = [];

    for (const item of data) {
      if (!item.nombre || !item.fecha_funcion) {
        console.warn(`[alpogo] Saltando evento: sin nombre o fecha.`);
        accumulated.errors.push(`Sin nombre o fecha: "${item.nombre || 'Desconocido'}"`);
        continue;
      }

      console.log(`[alpogo]   -> ${item.nombre}`);

      // Slug
      const slug = slugify(item.nombre, { lower: true, strict: true });

      // Descriptions
      const { description, short_description } = cleanDescription(item.descripcion || item.descripcion_corta);

      // Category & Commercial Check
      const categorySlug = mapAlpogoCategory(item.actividad);
      const isCommercial = COMMERCIAL_CATEGORIES.has(categorySlug);

      // Prices & Free status
      const priceMin = parseInt(item.menor_precio || item.botonPrecio || '0', 10) || 0;
      const isFree = item.gratuito === '1' || priceMin === 0;

      // Image
      const imageUrl = item.imagen_grilla || item.imagen_logo || null;

      // Format ISO Dates
      const start_date = item.fecha_funcion.replace(' ', 'T');
      const end_date = item.fecha_fin_funcion ? item.fecha_fin_funcion.replace(' ', 'T') : null;

      eventsToSave.push({
        title: item.nombre.trim(),
        slug,
        description: description || null,
        short_description: short_description || null,
        category_id: categorySlug,
        venue: item.lugar,
        start_date,
        end_date,
        is_free: isFree,
        price_min: priceMin,
        ticket_url: item.urlCompra || item.url || null,
        image_url: imageUrl,
        is_commercial: isCommercial,
        gallery_urls: [],
        tags: ['alpogo', 'scraped'],
      });
    }

    if (eventsToSave.length === 0) {
      console.log('[alpogo] Ningún evento válido para guardar.');
      return accumulated;
    }

    // Save to Supabase
    console.log(`[alpogo] Guardando ${eventsToSave.length} evento(s) en Supabase...`);
    const result = await saveEventsToSupabase(eventsToSave, 'alpogo');
    accumulated.inserted += result.inserted;
    accumulated.skipped += result.skipped;
    accumulated.errors.push(...result.errors);

    console.log(
      `[alpogo] Listo. Insertados: ${accumulated.inserted}, ` +
      `Saltados: ${accumulated.skipped}, Errores: ${accumulated.errors.length}`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[alpogo] Error fatal:', msg);
    accumulated.errors.push(msg);
  }

  return accumulated;
}

// Manual testing trigger
if (require.main === module) {
  scrapeAlpogoSalta().then(res => {
    console.log('Test execution finished:', res);
  });
}
