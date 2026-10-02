-- ============================================================================
-- REVERSIÓN de 20261002200000_venue_patio_roka.sql
-- ============================================================================
--
-- Está en supabase/rollbacks/ y no en supabase/migrations/ a propósito: ahí el
-- CLI lo aplicaría como una migración más.
--
-- Uso:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/rollbacks/20261002200000_venue_patio_roka_down.sql
--   npx supabase migration repair --db-url "$DB_URL" --status reverted 20261002200000
--
-- Los eventos vuelven al patio sólo si todavía apuntan a La Roka: si después
-- alguien los movió a mano, se respeta ese cambio.
-- ============================================================================

DO $revert$
DECLARE
  v_tag TEXT := '20261002200000_venue_patio_roka';
  v_n   INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.data_migrations WHERE name = v_tag) THEN
    RAISE NOTICE 'La migración % no figura como aplicada. Nada que revertir.', v_tag;
    RETURN;
  END IF;

  UPDATE public.events e
     SET venue_id = l.from_venue_id
    FROM public.venue_merge_log l
   WHERE l.migration_tag = v_tag AND l.entity = 'event'
     AND e.id = l.entity_id AND e.venue_id = l.to_venue_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Eventos restaurados : %', v_n;

  UPDATE public.venues
     SET canonical_venue_id = NULL, merged_at = NULL, updated_at = now()
   WHERE id IN (SELECT entity_id FROM public.venue_merge_log
                 WHERE migration_tag = v_tag AND entity = 'venue');

  DELETE FROM public.venue_aliases
   WHERE source = 'migration' AND public.venue_normalize(alias) = 'el patio de la roka';

  UPDATE public.venue_review_queue q SET
      status            = (l.old_values->>'status')::public.venue_review_status,
      resolved_venue_id = (l.old_values->>'resolved_venue_id')::uuid,
      notes             = l.old_values->>'notes',
      reviewed_at       = (l.old_values->>'reviewed_at')::timestamptz
    FROM public.venue_merge_log l
   WHERE l.migration_tag = v_tag AND l.entity = 'review' AND q.id = l.entity_id;

  DELETE FROM public.venue_merge_log WHERE migration_tag = v_tag;
  DELETE FROM public.data_migrations WHERE name = v_tag;
END;
$revert$;
