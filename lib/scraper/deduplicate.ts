import { createClient } from '@supabase/supabase-js';
import type { Event, TicketSource } from '../types';
import { formatSaltaDayKey } from '../date-format';
import { buildDedupKey, dedupKeyOf, saltaDayRangeUtc, normalizeTitleForKey } from './dedup-key';
import { mergeEvents, appendAudit, mergeTicketSources } from './merge-events';
import { describeSource } from './source-priority';

// Helper to get admin Supabase client if not passed
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Faltan variables de entorno SUPABASE');
  return createClient(url, key);
}

/**
 * Las columnas `dedup_key` y `merge_audit` las agrega
 * supabase/migrations/20260821_event_dedup.sql. Si el código se despliega
 * antes que la migración, escribirlas rompe TODA la ingesta. En vez de eso se
 * detecta el error una vez, se avisa, y se sigue funcionando sin ellas: la
 * dedup no depende de la columna (la clave se recalcula en memoria), sólo
 * pierde el rastro de auditoría hasta que la migración se aplique.
 */
let dedupColumnsAvailable = true;

function isMissingDedupColumn(error: any): boolean {
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return message.includes('dedup_key') || message.includes('merge_audit');
}

function warnMissingColumnsOnce() {
  if (!dedupColumnsAvailable) return;
  dedupColumnsAvailable = false;
  console.warn(
    '[deduplicate] Falta aplicar 20260821_event_dedup.sql: se sigue deduplicando ' +
    'pero sin persistir dedup_key ni merge_audit.'
  );
}

function stripDedupColumns(payload: Record<string, any>): Record<string, any> {
  const rest = { ...payload };
  delete rest.dedup_key;
  delete rest.merge_audit;
  return rest;
}

/**
 * Normaliza una cadena de texto quitando acentos, caracteres especiales y palabras vacías.
 *
 * OJO: esto NO es la clave de deduplicación. Saca stop words, así que
 * "Show de Rock" y "Rock" colapsan al mismo string — sirve para puntuar
 * similitud, no para agrupar. La clave es normalizeTitleForKey() en
 * dedup-key.ts.
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

/** Umbral de Jaccard del matcher difuso de respaldo. */
const SIMILARITY_THRESHOLD = 0.65;

export type DuplicateMatch = {
  event: Event;
  matchedBy: 'dedup_key' | 'venue_similarity' | 'slug';
  score: number;
};

/**
 * Busca el evento equivalente que ya está en la base.
 *
 * Dos pasadas, en este orden:
 *
 *   1. Clave de dedup exacta (título normalizado + día en hora de Salta).
 *      Es la regla principal y no necesita venue_id: justamente los duplicados
 *      que importan son los que escriben el lugar distinto o no lo traen.
 *
 *   2. Respaldo difuso: mismo venue_id + similitud de título >= 0.65, sobre los
 *      mismos candidatos del día. Cubre lo que la clave exacta no puede —
 *      "Airbag" vs "Airbag: Gira El Rey del Mundo" — y es el comportamiento que
 *      esta función ya tenía, así que no se pierde ningún match que antes
 *      encontraba.
 *
 * Los candidatos se traen por rango del día calendario de Salta, no de UTC: un
 * evento de las 22:00 es 01:00 UTC del día siguiente, y agrupar por día UTC
 * partiría en dos los duplicados de casi todos los eventos nocturnos.
 */
export async function findDuplicateMatch(
  event: Partial<Event>,
  supabaseClient?: any
): Promise<DuplicateMatch | null> {
  const supabase = supabaseClient || getAdminClient();

  if (!event.start_date || !event.title) {
    return null;
  }

  const incomingKey = buildDedupKey(event.title, event.start_date);
  const { from, to } = saltaDayRangeUtc(event.start_date);

  const { data: candidates, error } = await supabase
    .from('events')
    .select('*')
    .gte('start_date', from)
    .lte('start_date', to);

  if (error) {
    console.error('[deduplicate] Error buscando candidatos:', error.message);
    return null;
  }

  if (!candidates || candidates.length === 0) {
    return null;
  }

  // 1. Clave exacta. Se recalcula sobre el candidato en vez de leer la columna
  //    para que un cambio en la normalización aplique sin backfill previo.
  if (incomingKey) {
    for (const candidate of candidates) {
      if (dedupKeyOf(candidate) === incomingKey) {
        console.log(
          `[deduplicate] MATCH por clave: "${event.title}" == "${candidate.title}" (${incomingKey})`
        );
        return { event: candidate as Event, matchedBy: 'dedup_key', score: 1 };
      }
    }
  }

  // 2. Respaldo difuso, sólo dentro del mismo lugar.
  if (!event.venue_id) return null;

  let bestMatch: Event | null = null;
  let highestScore = 0;

  for (const candidate of candidates) {
    if (candidate.venue_id !== event.venue_id) continue;
    const score = calculateSimilarity(event.title || '', candidate.title);
    if (score >= SIMILARITY_THRESHOLD && score > highestScore) {
      highestScore = score;
      bestMatch = candidate as Event;
    }
  }

  if (bestMatch) {
    console.log(
      `[deduplicate] MATCH por similitud: "${event.title}" ~ "${bestMatch.title}" ` +
      `(${(highestScore * 100).toFixed(1)}%, mismo venue)`
    );
    return { event: bestMatch, matchedBy: 'venue_similarity', score: highestScore };
  }

  return null;
}

/**
 * Compatibilidad con la firma anterior: devuelve sólo el evento encontrado.
 */
export async function findDuplicateEvent(
  event: Partial<Event>,
  supabaseClient?: any
): Promise<Event | null> {
  const match = await findDuplicateMatch(event, supabaseClient);
  return match?.event ?? null;
}

/**
 * Inserta o fusiona un evento entrante.
 *
 * Fusionar significa: unir los links de compra, completar los huecos, resolver
 * los campos en conflicto por prioridad de fuente y dejar cada valor descartado
 * en `merge_audit`. Nunca se pisa un dato en silencio.
 *
 * Es el único punto de escritura de la ingesta automática: lo llaman
 * save-to-supabase.ts (scrapers manuales), app/api/cron/scrape/route.ts (cron)
 * y lib/ai/process-flyer-ai.ts (Instagram). Deduplicar acá es lo que evita que
 * el duplicado llegue a existir; el job de limpieza es sólo para lo que ya
 * está en la base.
 */
export async function upsertEventWithDeduplication(
  eventData: any,
  sourceKey: string,
  supabaseClient?: any
): Promise<{ success: boolean; action: 'insert' | 'update' | 'skip'; eventId: string }> {
  const supabase = supabaseClient || getAdminClient();

  const dedupKey = buildDedupKey(eventData.title, eventData.start_date);

  // 1. Buscar duplicado por clave y, como respaldo, por lugar + similitud.
  let existingEvent = await findDuplicateEvent(eventData, supabase);

  // 2. Si no se encontró, verificar colisión por slug único
  if (!existingEvent && eventData.slug) {
    const { data: eventBySlug } = await supabase
      .from('events')
      .select('*')
      .eq('slug', eventData.slug)
      .maybeSingle();

    if (eventBySlug) {
      const sameKey = dedupKey && dedupKeyOf(eventBySlug) === dedupKey;
      const score = calculateSimilarity(eventData.title || '', eventBySlug.title);

      if (sameKey || score >= SIMILARITY_THRESHOLD) {
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
    const merge = mergeEvents(existingEvent, eventData, {
      incomingSource: sourceKey,
      dedupKey: dedupKey || dedupKeyOf(existingEvent),
      context: 'ingest',
    });

    const finalTitle = merge.patch.title ?? existingEvent.title;
    const finalStart = merge.patch.start_date ?? existingEvent.start_date;

    const update: Record<string, any> = {
      ...merge.patch,
      dedup_key: buildDedupKey(finalTitle, finalStart) || null,
      updated_at: new Date().toISOString(),
    };

    // Sólo se anota en auditoría si hubo algo que descartar. Si la corrida no
    // aportó nada nuevo, no tiene sentido engordar el array en cada cron.
    if (merge.audit.discarded.length > 0) {
      update.merge_audit = appendAudit((existingEvent as any).merge_audit, merge.audit);
      console.log(
        `[deduplicate] Fusión ${describeSource(sourceKey)} -> ${describeSource(existingEvent.scrape_source_key)}: ` +
        merge.audit.discarded.map(d => `${d.field} (gana ${d.kept_source})`).join(', ')
      );
    }

    let { error } = await supabase.from('events').update(update).eq('id', existingEvent.id);

    if (error && isMissingDedupColumn(error)) {
      warnMissingColumnsOnce();
      ({ error } = await supabase.from('events').update(stripDedupColumns(update)).eq('id', existingEvent.id));
    }

    if (error) {
      throw new Error(`Error actualizando evento duplicado: ${error.message}`);
    }

    return { success: true, action: 'update', eventId: existingEvent.id };
  }

  // 3. Evento nuevo: se crea el array de links con la fuente que lo trajo.
  const initialSources: TicketSource[] = mergeTicketSources(
    [],
    eventData.ticket_sources,
    sourceKey,
    eventData.ticket_url,
    eventData.price_min
  );

  const newEvent: Record<string, any> = {
    ...eventData,
    ticket_sources: initialSources,
    scrape_source_key: sourceKey,
    dedup_key: dedupKey || null,
    merge_audit: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // Eliminar propiedad temporal 'venue' que se usa para resolver
  delete newEvent.venue;

  let { data, error } = await supabase.from('events').insert(newEvent).select('id').single();

  if (error && isMissingDedupColumn(error)) {
    warnMissingColumnsOnce();
    ({ data, error } = await supabase.from('events').insert(stripDedupColumns(newEvent)).select('id').single());
  }

  if (error) {
    throw new Error(`Error insertando nuevo evento: ${error.message}`);
  }

  return { success: true, action: 'insert', eventId: data.id };
}

/**
 * Verifica si el evento ya existe en la base de datos.
 * Retorna true si es nuevo, false si es duplicado.
 */
export async function deduplicateEvent(
  event: Partial<Event>,
  supabaseClient?: any
): Promise<boolean> {
  const duplicate = await findDuplicateEvent(event, supabaseClient);
  return duplicate === null;
}

// Re-export para que los consumidores no tengan que conocer la estructura interna.
export { buildDedupKey, dedupKeyOf, normalizeTitleForKey };
