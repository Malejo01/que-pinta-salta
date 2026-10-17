import slugify from 'slugify';
import {
  fetchVamosCartelera,
  normalizeVamosEvento,
} from './vamos-parsers';
import { saveEventsToSupabase, type SaveResult } from './save-to-supabase';
import { slugConFechaHora } from '@qps/core/scraper/slug-fecha-hora';
import type { Event } from '../types';

/**
 * Obtiene todos los eventos de vamos.gob.ar via la API de EntradaUno
 * y los guarda en Supabase.
 *
 * La API devuelve todos los eventos en una sola llamada -- no hay paginacion.
 * Salida anticipada: si todos los eventos ya estaban en la BD, no hay nada mas que hacer.
 */
export async function scrapeVamosGobAr(): Promise<SaveResult> {
  // Variable local (en vez de accumulated.venueErrors directo) para que TS la
  // vea siempre como string[]: el campo en SaveResult es opcional.
  const venueErrors: string[] = [];
  const accumulated: SaveResult = { inserted: 0, skipped: 0, errors: [], venueErrors };

  try {
    // 1. Fetch de la cartelera completa
    console.log('[vamos] Obteniendo cartelera desde API EntradaUno...');
    const { eventos, venues } = await fetchVamosCartelera();
    console.log(`[vamos] ${eventos.length} evento(s) recibidos de la API.`);

    // 2. Normalizar
    const eventsToSave: Partial<Omit<Event, 'venue'> & { venue?: string }>[] = [];

    for (const apiEvento of eventos) {
      const normalized = normalizeVamosEvento(apiEvento, venues);
      if (!normalized) {
        console.warn(`[vamos] Saltando "${apiEvento.cNombre}": sin fecha.`);
        accumulated.errors.push(`Sin fecha: "${apiEvento.cNombre}"`);
        continue;
      }

      console.log(`[vamos]   -> ${normalized.title}`);

      // Slug: vamos manda un ítem por espectáculo (start_date es la primera
      // función, end_date la última), así que el slug lleva la fecha/hora de
      // la primera función para que un espectáculo que vuelve meses después
      // con el mismo nombre no se fusione en la fila vieja. Riesgo conocido:
      // si la API deja de listar funciones pasadas, la "primera función"
      // cambia, y con ella el slug en la próxima corrida.
      const slug = slugConFechaHora(slugify(normalized.title, { lower: true, strict: true }), normalized.start_date);

      eventsToSave.push({
        title:             normalized.title,
        slug,
        description:       normalized.description || null,
        short_description: normalized.short_description || null,
        category_id:       normalized.category_id,   // slug -> save-to-supabase resuelve el ID
        venue:             normalized.venue_name,     // upsertVenue lo crea/reutiliza
        start_date:        normalized.start_date,
        end_date:          normalized.end_date,
        is_free:           normalized.is_free,
        price_min:         normalized.price_min,
        ticket_url:        normalized.ticket_url || null,
        image_url:         normalized.image_url || null,
        gallery_urls:      [],
        tags:              [],
      });
    }

    if (eventsToSave.length === 0) {
      console.log('[vamos] Ningun evento valido para guardar.');
      return accumulated;
    }

    // 3. Guardar en Supabase
    console.log(`[vamos] Guardando ${eventsToSave.length} evento(s) en Supabase...`);
    const result = await saveEventsToSupabase(eventsToSave, 'vamos');
    accumulated.inserted += result.inserted;
    accumulated.skipped  += result.skipped;
    accumulated.errors.push(...result.errors);
    venueErrors.push(...(result.venueErrors ?? []));

    // 4. Log de salida anticipada si todos son duplicados
    if (result.inserted === 0 && result.skipped > 0) {
      console.log('[vamos] Todos los eventos ya estaban en la BD. Nada nuevo.');
    }

    console.log(
      `[vamos] Listo. Insertados: ${accumulated.inserted}, ` +
      `Saltados: ${accumulated.skipped}, Errores: ${accumulated.errors.length}`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[vamos] Error fatal:', msg);
    accumulated.errors.push(msg);
  }

  return accumulated;
}
