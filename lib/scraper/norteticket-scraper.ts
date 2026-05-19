
import puppeteer from 'puppeteer';
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

/**
 * Scrapea todos los eventos de Salta en Norteticket y retorna un array de eventos completos.
 */
export async function scrapeNorteticketSalta(): Promise<Event[]> {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('https://norteticket.com/?subcategoria=Salta', { waitUntil: 'networkidle2' });
  const html = await page.content();
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
      isNew = await deduplicateEvent(baseEvent);
    } catch (e) {
      console.warn('Error deduplicando evento', baseEvent.title, e);
    }
    if (isNew) {
      events.push(baseEvent as Event);
    }
  }

  await browser.close();
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
