
import { parseAllEventsFromHtml, parseEventDetail } from './parsers';
import type { Event } from '../types';
import { saveEventsToSupabase } from './save-to-supabase';

const NORTE_TICKET_SALTA_URL = 'https://norteticket.com/?subcategoria=Salta';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Lo que realmente devuelve este scraper: igual que parseAllEventsFromHtml
// (parsers.ts), un evento parcial sin venue_id ni id (se resuelven en
// saveEventsToSupabase/upsertEventWithDeduplication, no acá).
type NorteticketScrapedEvent = Partial<Omit<Event, 'venue'> & { venue?: string }>;

/**
 * Scrapea todos los eventos de Salta en Norteticket y retorna un array de eventos completos.
 *
 * No resuelve venue_id ni deduplica acá: de ambas cosas se encarga
 * saveEventsToSupabase(), que hace upsert del venue por nombre y pasa por
 * upsertEventWithDeduplication(). Duplicar ese trabajo antes de tener el
 * venue_id resuelto no sirve, porque findDuplicateEvent() necesita el venue.
 */
export async function scrapeNorteticketSalta(): Promise<NorteticketScrapedEvent[]> {
  const response = await fetch(NORTE_TICKET_SALTA_URL, {
    headers: { 'User-Agent': USER_AGENT }
  });

  if (!response.ok) {
    throw new Error(`HTTP error ${response.status} fetching ${NORTE_TICKET_SALTA_URL}`);
  }

  const html = await response.text();
  const baseEvents = parseAllEventsFromHtml(html);

  if (baseEvents.length === 0) {
    throw new Error(
      'Norteticket devolvió HTML pero no se parseó ningún evento. ' +
      'Probablemente cambió el DOM (selector div#boxEvent en parsers.ts).'
    );
  }

  const events: NorteticketScrapedEvent[] = [];

  for (const baseEvent of baseEvents) {
    const venueName = typeof baseEvent.venue === 'string' ? baseEvent.venue : '';

    // Scrape de detalle para descripción y categoría
    let detail = { description: '', short_description: '', category_id: '' };
    try {
      detail = await parseEventDetail(baseEvent.ticket_url || '', venueName);
    } catch (e) {
      console.warn('Error scrapeando detalle de', baseEvent.ticket_url, e);
    }

    baseEvent.description = detail.description;
    baseEvent.short_description = detail.short_description;
    baseEvent.category_id = detail.category_id;

    events.push(baseEvent);
  }

  console.log(`[norteticket] ${events.length} evento(s) parseados.`);

  return events;
}

// Para pruebas manuales
if (require.main === module) {
  scrapeNorteticketSalta().then(async events => {
    console.log(`\nEventos scrapeados: ${events.length}`);
    const result = await saveEventsToSupabase(events);
    console.log(`✓ Insertados: ${result.inserted}`);
    console.log(`⊘ Omitidos (duplicados): ${result.skipped}`);
    if (result.errors.length) console.error('Errores:', result.errors);
  });
}

