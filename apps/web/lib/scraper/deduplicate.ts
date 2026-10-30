import { createClient } from '@supabase/supabase-js';
import type { Event, TicketSource } from '../types';
import { formatSaltaDayKey } from '../date-format';
import { buildDedupKey, dedupKeyOf, saltaDayRangeUtc, normalizeTitleForKey, venuesCompatible, sameTicketEvent, hasRealTime, horasCompatibles } from './dedup-key';
import { mergeEvents, appendAudit, mergeTicketSources } from './merge-events';
import { describeSource } from './source-priority';
import { resolveMergeTarget, mergedIntoId } from '../events/merged';
import { slugConFechaHora } from '@qps/core/scraper/slug-fecha-hora';

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

/** Forma mínima de un error de Postgrest/Supabase que necesitamos para detectarlo. */
interface SupabaseErrorLike {
  message?: string;
  details?: string;
}

function isMissingDedupColumn(error: SupabaseErrorLike | null | undefined): boolean {
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

function stripDedupColumns(payload: Record<string, unknown>): Record<string, unknown> {
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
  matchedBy: 'ticket_url' | 'dedup_key' | 'venue_similarity' | 'slug';
  score: number;
};

/**
 * Reloj (hora:minuto) de un start_date, para comparar horas de inicio en el
 * paso 1 de findDuplicateMatch. No se puede reusar saltaClock() de
 * dedup-key.ts (la que usa sameTicketEvent() en el paso 0) porque no está
 * exportada: es un helper privado de ese módulo. Se compara acá por otro
 * camino que da el mismo resultado: el offset de Salta es la constante fija
 * -03:00 (sin horario de verano desde 2009), así que comparar hora:minuto en
 * UTC es equivalente a compararla en hora de Salta — restar la misma
 * constante a los dos lados no cambia si son iguales o no.
 */
function sameClock(a: string | Date, b: string | Date): boolean {
  const dateA = new Date(a);
  const dateB = new Date(b);
  return dateA.getUTCHours() === dateB.getUTCHours() && dateA.getUTCMinutes() === dateB.getUTCMinutes();
}

/**
 * Criterio de "misma hora" del paso 1 (clave exacta): la misma hora de Salta (sameClock), o que
 * a alguna de las dos le falte hora real (hasRealTime, 00:00 es el placeholder de "sin hora").
 * Es más estricto que horasCompatibles() (dedup-key.ts): acá tiene que ser la hora EXACTA, no
 * dentro de una tolerancia. Sólo lo usa el paso 1. El paso 2 (respaldo difuso) y la colisión de
 * slug único de upsertEventWithDeduplication usan horasCompatibles(), con la tolerancia de
 * TOLERANCIA_HORA_DEDUP_MIN (decisión de Mauro, QPS-164, hallazgo 1).
 */
function sameStartTimeForKey(a?: string | Date | null, b?: string | Date | null): boolean {
  if (!a || !b) return false;
  if (!hasRealTime(a) || !hasRealTime(b)) return true;
  return sameClock(a, b);
}

/**
 * Busca el evento equivalente que ya está en la base.
 *
 * Tres pasadas, en este orden:
 *
 *   0. Mismo link de compra + mismo día + misma hora (ver sameTicketEvent).
 *      Gana aunque los venues difieran.
 *
 *   1. Clave de dedup exacta (título normalizado + día en hora de Salta) +
 *      misma hora de inicio (ver sameStartTimeForKey más arriba, salvo que a
 *      alguna de las dos filas le falte hora real). Es la regla principal y
 *      no necesita venue_id: justamente los duplicados que importan son los
 *      que escriben el lugar distinto o no lo traen.
 *
 *   2. Respaldo difuso: mismo venue_id + similitud de título >= 0.65 + hora
 *      compatible (horasCompatibles(), con tolerancia TOLERANCIA_HORA_DEDUP_MIN,
 *      dedup-key.ts), sobre los mismos candidatos del día. Cubre lo que la
 *      clave exacta no puede — "Airbag" vs "Airbag: Gira El Rey del Mundo" —
 *      y es el comportamiento que esta función ya tenía, con el agregado de
 *      la hora: dos funciones reales del mismo show, el mismo día, en el
 *      mismo venue y con título idéntico, a más de la tolerancia de minutos,
 *      ya NO se fusionan (QPS-164, hallazgo 1, decisión de Mauro del 17/10).
 *      Con el mismo puntaje, el desempate es determinista (ver más abajo, en
 *      el cuerpo del paso 2): no depende del orden en que vino el array.
 *
 * El paso 1 exige la hora EXACTA (sameStartTimeForKey); el paso 2 exige hora
 * compatible dentro de la tolerancia (horasCompatibles). La colisión de slug
 * único de upsertEventWithDeduplication (más abajo) es un cuarto camino, fuera
 * de esta función, que también usa horasCompatibles() — ver su comentario.
 *
 * Los candidatos se traen por rango del día calendario de Salta, no de UTC: un
 * evento de las 22:00 es 01:00 UTC del día siguiente, y agrupar por día UTC
 * partiría en dos los duplicados de casi todos los eventos nocturnos.
 */
export async function findDuplicateMatch(
  event: Partial<Event>,
  // `any` a propósito: tests/scraper/deduplicate-similitud.test.ts y
  // dedupe-merged.test.ts pasan `db.client` (fake mínimo `{ from }`, ver
  // tests/events/fake-events-db.ts) sin cast a SupabaseClient.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cliente supabase simulado por tests
  supabaseClient?: any,
  options?: { excludeMerged?: boolean }
): Promise<DuplicateMatch | null> {
  const supabase = supabaseClient || getAdminClient();

  if (!event.start_date || !event.title) {
    return null;
  }

  const incomingKey = buildDedupKey(event.title, event.start_date);
  const { from, to } = saltaDayRangeUtc(event.start_date);

  const { data: rawCandidates, error } = await supabase
    .from('events')
    .select('*')
    .gte('start_date', from)
    .lte('start_date', to);
  // Con excludeMerged, los eventos fusionados a mano no son candidatos (en
  // ninguna de las tres vías): se usa cuando su cadena no resuelve.
  const candidates = options?.excludeMerged && rawCandidates
    ? rawCandidates.filter((c: { ai_metadata?: unknown }) => mergedIntoId(c) === null)
    : rawCandidates;

  if (error) {
    console.error('[deduplicate] Error buscando candidatos:', error.message);
    return null;
  }

  if (!candidates || candidates.length === 0) {
    return null;
  }

  // 0. Mismo link de compra, mismo día y misma hora: es el mismo evento aunque
  //    el venue o el título difieran. Va primero porque es la señal más fuerte,
  //    y es lo que impide que un scraper recree la fila que la limpieza fusionó
  //    (pasó con No Te Va Gustar: norteticket lo volvía a crear en otro venue).
  for (const candidate of candidates) {
    if (sameTicketEvent(event, candidate)) {
      console.log(
        `[deduplicate] MATCH por link de compra: "${event.title}" == "${candidate.title}" (${candidate.id})`
      );
      return { event: candidate as Event, matchedBy: 'ticket_url', score: 1 };
    }
  }

  // 1. Clave exacta. Se recalcula sobre el candidato en vez de leer la columna
  //    para que un cambio en la normalización aplique sin backfill previo.
  //    Lugar compatible además de la clave: misma clave en dos venues
  //    distintos son dos eventos (dos boliches con "Fiesta de fin de semana"
  //    el mismo sábado).
  if (incomingKey) {
    const keyCandidates = candidates.filter(
      (candidate: { title?: string | null; start_date?: string | null; venue_id?: string | null }) =>
        dedupKeyOf(candidate) === incomingKey && venuesCompatible(event.venue_id, candidate.venue_id)
    );

    // Dos pasadas, no un solo filtro con el bypass de "sin hora real": la
    // consulta de candidatos (arriba) es `.gte/.lte` SIN `.order()`, así que
    // PostgREST no garantiza el orden del array `candidates`. Con un solo
    // filtro, si hubiera dos candidatos con la misma clave y venue compatible
    // —uno sin hora real y otro con la hora exacta del entrante— el resultado
    // dependería de cuál vino primero en el array, no de cuál corresponde: un
    // mis-merge (QPS-164, hallazgo del revisor en la vuelta 1 de 34-a).
    //
    // Primera pasada: sólo candidatos con hora real igual a la del entrante.
    // Esto gana siempre que exista, sin depender del orden.
    const exactTimeMatch = keyCandidates.find(
      (candidate: { start_date?: string | null }) =>
        hasRealTime(event.start_date) &&
        hasRealTime(candidate.start_date) &&
        sameStartTimeForKey(event.start_date, candidate.start_date)
    );

    // Segunda pasada, sólo si ninguno calificó arriba: el bypass de "a alguna
    // de las dos le falta hora real" (00:00 de Salta, el placeholder de "sin
    // hora") se mantiene igual que antes de esta tarea — sin esto, dos
    // funciones reales del mismo show el mismo día (16:00 y 21:00) quedaban
    // en una sola fila.
    const match =
      exactTimeMatch ??
      keyCandidates.find(
        (candidate: { start_date?: string | null }) =>
          !hasRealTime(event.start_date) || !hasRealTime(candidate.start_date)
      );

    if (match) {
      console.log(
        `[deduplicate] MATCH por clave: "${event.title}" == "${match.title}" (${incomingKey})`
      );
      return { event: match as Event, matchedBy: 'dedup_key', score: 1 };
    }
  }

  // 2. Respaldo difuso, sólo dentro del mismo lugar y con hora compatible
  //    (tolerancia TOLERANCIA_HORA_DEDUP_MIN, dedup-key.ts).
  if (!event.venue_id) return null;

  let bestMatch: Event | null = null;
  let highestScore = 0;
  // Desempate determinista, en tres criterios (necesario porque la consulta de candidatos no
  // tiene `.order()`: con cualquier orden del array el resultado tiene que ser el mismo):
  //   1. gana el mayor puntaje;
  //   2. con el mismo puntaje, gana el candidato con menor diferencia en minutos. Un candidato
  //      sin hora real no tiene diferencia comparable (horasCompatibles ya lo dejó pasar por el
  //      bypass de "sin hora"), así que se lo trata como el peor caso posible (Infinity): pierde
  //      el desempate contra cualquiera que sí tenga hora real dentro de la tolerancia;
  //   3. con el mismo puntaje Y la misma diferencia en minutos (dos candidatos a la misma
  //      distancia del entrante, ver tests/scraper/dedup-tolerancia.test.ts), gana el de menor
  //      `id` (comparación de strings). Sin este tercer criterio, ese empate exacto lo decidía
  //      el orden del array (el `<` de la comparación de arriba es estricto), que es justo lo que
  //      esta función no puede depender.
  let bestDiffMs = Infinity;

  for (const candidate of candidates) {
    if (candidate.venue_id !== event.venue_id) continue;
    if (!horasCompatibles(event.start_date, candidate.start_date)) continue;
    const score = calculateSimilarity(event.title || '', candidate.title);
    if (score < SIMILARITY_THRESHOLD) continue;

    const diffMs =
      hasRealTime(event.start_date) && hasRealTime(candidate.start_date)
        ? Math.abs(
            new Date(event.start_date as string).getTime() - new Date(candidate.start_date as string).getTime()
          )
        : Infinity;

    const isBetter =
      score > highestScore ||
      (score === highestScore &&
        (diffMs < bestDiffMs || (diffMs === bestDiffMs && (!bestMatch || candidate.id < bestMatch.id))));

    if (isBetter) {
      highestScore = score;
      bestDiffMs = diffMs;
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
  // `any` por el mismo motivo que en findDuplicateMatch.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cliente supabase simulado por tests
  supabaseClient?: any,
  options?: { excludeMerged?: boolean }
): Promise<Event | null> {
  const match = await findDuplicateMatch(event, supabaseClient, options);
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
  // `eventData: any` a propósito: lo llaman save-to-supabase.ts, run-scrape-job.ts,
  // process-flyer-ai.ts y recurrentes/generar.ts con formas distintas (status
  // ancho a `string`, con/sin `venue`, con/sin `ticket_sources`), y los tests
  // (dedupe-merged.test.ts, deduplicate-similitud.test.ts) pasan esos mismos
  // literales sin cast. No hay un tipo único que sea a la vez más estricto que
  // `any` y compatible con todos esos llamadores sin tocar archivos fuera de
  // los permitidos de esta tarea.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- llamadores heterogéneos sin tipo único
  eventData: any,
  sourceKey: string,
  // `any` por el mismo motivo que en findDuplicateMatch.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cliente supabase simulado por tests
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
      const matchesByTitle = sameKey || score >= SIMILARITY_THRESHOLD;

      // Tolerancia de hora (QPS-164, hallazgo 1, decisión de Mauro del 17/10): esta rama fusiona
      // por `sameKey` o por `score >= SIMILARITY_THRESHOLD` (ninguno de los dos mira la hora) PERO
      // sólo si además las horas son compatibles (horasCompatibles(), con la tolerancia
      // TOLERANCIA_HORA_DEDUP_MIN de dedup-key.ts). Acá adentro el slug ya es IDÉNTICO, así que
      // "clave igual implica score >= 0,65" vale (slugify no recorta sufijos de ciudad ni stop
      // words) — pero eso es una propiedad de ESTA rama, no general: fuera de acá (paso 2,
      // respaldo difuso) "Rock en Salta"/"Rock" comparten clave y dan score 0,5.
      if (matchesByTitle && horasCompatibles(eventData.start_date, eventBySlug.start_date)) {
        existingEvent = eventBySlug;
        console.log(`[deduplicate] MATCH POR SLUG: "${eventData.title}" coincide con "${eventBySlug.title}" (ID: ${eventBySlug.id})`);
      } else if (matchesByTitle) {
        // No fusionó SÓLO por la hora: clave o similitud alcanzaban, pero las horas están a más
        // de la tolerancia. El slug nuevo lleva fecha Y hora (slugConFechaHora), no sólo el día
        // (el `else` de abajo): con sólo el día, una TERCERA función del mismo show el mismo día
        // volvería a chocar acá, porque esta consulta sólo mira el slug que ya existe (el de la
        // primera función) y nunca vuelve a comprobar si el slug nuevo también colisiona. Con
        // `-día` la segunda y la tercera función saldrían las dos con el mismo slug (`show-día`)
        // y el segundo insert violaría el índice único; con `-día-hora` cada una saca su propio
        // sufijo. El `|| new Date()` es el mismo respaldo que ya tenía el `else` de abajo: hoy es
        // inalcanzable (sin start_date, horasCompatibles da `true` y se fusiona arriba, nunca se
        // llega acá por la hora), pero si el criterio de horasCompatibles cambiara y el sufijo
        // saliera vacío, slugConFechaHora devolvería el slug sin tocar y el insert chocaría contra
        // el mismo índice único.
        eventData.slug = slugConFechaHora(eventData.slug, eventData.start_date || new Date());
        console.log(`[deduplicate] Colisión de slug evitada por hora para "${eventData.title}". Nuevo slug: "${eventData.slug}"`);
      } else {
        // Tienen el mismo slug original pero son eventos completamente distintos (ni clave ni
        // similitud). Agregamos la fecha al slug del nuevo evento para evitar violar el
        // constraint único en BD.
        const dateStr = formatSaltaDayKey(eventData.start_date || new Date());
        eventData.slug = `${eventData.slug}-${dateStr}`;
        console.log(`[deduplicate] Colisión de slug evitada para "${eventData.title}". Nuevo slug: "${eventData.slug}"`);
      }
    }
  }

  // 2b. Si el candidato es un evento fusionado a mano (DRAFT absorbido), la
  //     fusión se hace sobre el que quedó. Si la cadena no resuelve (ciclo,
  //     destino borrado, demasiados saltos) no se toca el fusionado y se crea
  //     un evento nuevo.
  if (existingEvent) {
    const original = existingEvent;
    const { target, hops } = await resolveMergeTarget(supabase, original);
    if (hops > 0) {
      console.log(
        target
          ? `[deduplicate] Candidato fusionado: "${original.title}" (${original.id}) -> ${target.id} (${hops} salto/s)`
          : `[deduplicate] Candidato fusionado sin destino válido: "${original.title}" (${original.id}), se crea evento nuevo`
      );
    }
    existingEvent = target;
    if (!target) {
      // Cadena rota: se busca de nuevo ignorando fusionados, para que la
      // próxima corrida actualice lo que esta inserta en vez de repetir el choque.
      existingEvent = await findDuplicateEvent(eventData, supabase, { excludeMerged: true });
      if (existingEvent) {
        console.log(`[deduplicate] Sin destino para ${original.id}; se fusiona en ${existingEvent.id}`);
      } else if (eventData.slug && eventData.slug === original.slug) {
        // El insert nuevo chocaría con el slug único del fusionado.
        eventData.slug = `${eventData.slug}-${formatSaltaDayKey(eventData.start_date || new Date())}`;
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

    const update: Record<string, unknown> = {
      ...merge.patch,
      dedup_key: buildDedupKey(finalTitle, finalStart) || null,
      updated_at: new Date().toISOString(),
    };

    // Sólo se anota en auditoría si hubo algo que descartar. Si la corrida no
    // aportó nada nuevo, no tiene sentido engordar el array en cada cron.
    if (merge.audit.discarded.length > 0) {
      // Event no declara merge_audit (es un campo interno de auditoría, no del
      // tipo público): el cast sólo agrega esa propiedad opcional, no cambia nada.
      update.merge_audit = appendAudit((existingEvent as { merge_audit?: unknown }).merge_audit, merge.audit);
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

  const newEvent: Record<string, unknown> = {
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
  // `any` por el mismo motivo que en findDuplicateMatch.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cliente supabase simulado por tests
  supabaseClient?: any
): Promise<boolean> {
  const duplicate = await findDuplicateEvent(event, supabaseClient);
  return duplicate === null;
}

// Re-export para que los consumidores no tengan que conocer la estructura interna.
export { buildDedupKey, dedupKeyOf, normalizeTitleForKey };
