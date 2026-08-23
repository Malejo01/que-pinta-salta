-- ============================================================================
-- Deduplicación de eventos  (Track B — fix/event-dedup)
-- ============================================================================
--
-- Problema
-- --------
-- El mismo evento entra por varias fuentes (ticketeras + portal provincial +
-- carga manual + Instagram) y queda como N filas distintas en `events`, con
-- datos parcialmente contradictorios: distinto venue, distinto horario,
-- distinta imagen, y un solo link de compra cada una.
--
-- La dedup anterior (findDuplicateEvent) comparaba (venue_id, fecha) y salía
-- por null si el evento no tenía venue_id resuelto — que es exactamente el
-- caso de los duplicados que importan.
--
-- Qué agrega esta migración
-- -------------------------
-- 1. `events.dedup_key`   clave de agrupación: título normalizado + día.
-- 2. `events.merge_audit` historial de fusiones y variantes descartadas.
--
-- Dónde se calcula la clave
-- -------------------------
-- En TypeScript (lib/scraper/dedup-key.ts), NO en Postgres. Es deliberado:
-- la normalización de títulos va a seguir cambiando (sufijos de ciudad nuevos,
-- casos raros de una ticketera) y tener la misma lógica escrita dos veces
-- garantiza que en algún momento difieran. La columna es un caché
-- consultable/indexable; la fuente de verdad es la función TS, y la ingesta y
-- el job de limpieza recalculan la clave en memoria en vez de confiar en la
-- columna. Por eso `dedup_key` NO tiene constraint UNIQUE: es un índice de
-- búsqueda, no una garantía de integridad, y un UNIQUE acá haría fallar la
-- ingesta entera en vez de fusionar.
--
-- Nada se borra acá. El borrado de filas duplicadas lo hace el job de limpieza
-- (lib/scraper/dedup-cleanup.ts), siempre después de un dry-run y siempre
-- dejando el snapshot completo de la fila absorbida en `merge_audit` del
-- registro que sobrevive.
--
-- Aplicación
-- ----------
-- Idempotente. Aplicar fuera de las ventanas de cron (00:00 y 08:00 UTC).
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Columnas
-- ---------------------------------------------------------------------------

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS dedup_key   TEXT,
  ADD COLUMN IF NOT EXISTS merge_audit JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.events.dedup_key IS
  'Clave de deduplicación "<titulo normalizado>|<YYYY-MM-DD en hora de Salta>". La calcula buildDedupKey() en lib/scraper/dedup-key.ts; esta columna es un caché indexable, no la fuente de verdad. NULL = fila anterior a la migración, todavía sin backfill.';

COMMENT ON COLUMN public.events.merge_audit IS
  'Array de fusiones aplicadas a esta fila. Cada entrada guarda la fuente ganadora, la perdedora, cada valor descartado con su motivo, y — en la limpieza retroactiva — el snapshot completo de la fila absorbida. Es lo que hace que el merge no pierda datos.';


-- ---------------------------------------------------------------------------
-- 2. Índices
-- ---------------------------------------------------------------------------

-- Búsqueda del duplicado en la ingesta (un lookup por evento entrante).
CREATE INDEX IF NOT EXISTS events_dedup_key_idx
  ON public.events (dedup_key)
  WHERE dedup_key IS NOT NULL;

-- El job de limpieza y la ingesta traen candidatos por rango de día.
CREATE INDEX IF NOT EXISTS events_start_date_idx
  ON public.events (start_date);

-- Auditoría consultable: "¿qué se fusionó y qué se descartó?".
CREATE INDEX IF NOT EXISTS events_merge_audit_idx
  ON public.events USING gin (merge_audit)
  WHERE merge_audit <> '[]'::jsonb;


-- ---------------------------------------------------------------------------
-- 3. Vista de apoyo para inspección manual
-- ---------------------------------------------------------------------------
-- Sólo sirve DESPUÉS del backfill (npm run dedup:events -- --apply, o el
-- dry-run con --backfill). Agrupa por la clave ya persistida; no recalcula
-- nada, para no duplicar la normalización en SQL.

CREATE OR REPLACE VIEW public.event_duplicate_groups AS
SELECT
  e.dedup_key,
  count(*)                                   AS total,
  array_agg(e.id ORDER BY e.created_at)      AS event_ids,
  array_agg(DISTINCT e.scrape_source_key)    AS sources,
  min(e.created_at)                          AS first_seen
FROM public.events e
WHERE e.dedup_key IS NOT NULL
  AND e.status <> 'CANCELLED'
GROUP BY e.dedup_key
HAVING count(*) > 1;

COMMENT ON VIEW public.event_duplicate_groups IS
  'Grupos de eventos que comparten dedup_key. Sólo refleja lo que ya está backfilleado en events.dedup_key.';
