
import { parseAllEventsFromHtml, parseEventDetail } from './parsers';
import { enrichVenueWithGoogle } from './venue-enrichment';
import { deduplicateEvent } from './deduplicate';
import type { Event } from '../types';

// Definición local del tipo VenueData (solo para anotación)
type VenueData = {
  id: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  google_maps_url: string | null;
};
import { saveEventsToSupabase, type SaveResult } from './save-to-supabase';

const NORTE_TICKET_SALTA_URL = 'https://norteticket.com/?subcategoria=Salta';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Scrapea todos los eventos de Salta en Norteticket y retorna un array de eventos completos.
 */
export async function scrapeNorteticketSalta(): Promise<Event[]> {
  const response = await fetch(NORTE_TICKET_SALTA_URL, {
    headers: { 'User-Agent': USER_AGENT }
  });

  if (!response.ok) {
    throw new Error(`HTTP error ${response.status} fetching ${NORTE_TICKET_SALTA_URL}`);
  }

  const html = await response.text();
  const baseEvents = parseAllEventsFromHtml(html);
  const events: Event[] = [];

  for (const baseEvent of baseEvents) {
    // Scrape de detalle para descripción y categoría
    let detail = { description: '', short_description: '', category_id: '' };
    try {
      detail = await parseEventDetail(baseEvent.ticket_url || '');
    } catch (e) {
      console.warn('Error scrapeando detalle de', baseEvent.ticket_url, e);
    }
    baseEvent.description = detail.description;
    baseEvent.short_description = detail.short_description;
    baseEvent.category_id = detail.category_id;

    // Enriquecer venue con Google API
    const venueName = typeof baseEvent.venue === 'string' ? baseEvent.venue : '';
    let venue: VenueData = {
      id: '',
      name: venueName,
      address: venueName,
      latitude: null,
      longitude: null,
      google_maps_url: null,
    };
    try {
      venue = await enrichVenueWithGoogle(venueName);
    } catch (e) {
      console.warn('Error enriqueciendo venue', venueName, e);
    }
    baseEvent.venue_id = venue.id;

    // Deduplicar
    let isNew = true;
    try {
      isNew = await deduplicateEvent(baseEvent as any);
    } catch (e) {
      console.warn('Error deduplicando evento', baseEvent.title, e);
    }
    if (isNew) {
      events.push(baseEvent as any);
    }
  }

  return events;
}

// Para pruebas manuales
if (require.main === module) {
  scrapeNorteticketSalta().then(async events => {
    console.log(`\nEventos scrapeados: ${events.length}`);
    const result = await saveEventsToSupabase(events as any);
    console.log(`✓ Insertados: ${result.inserted}`);
    console.log(`⊘ Omitidos (duplicados): ${result.skipped}`);
    if (result.errors.length) console.error('Errores:', result.errors);
  });
}

