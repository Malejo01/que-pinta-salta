-- ============================================================================
-- "El Patio de la Roka" es parte de La Roka: se fusiona en el canónico.
-- ============================================================================
--
-- Decisión de producto del 2026-10-02 (Sprint 3): el patio es un sector de La
-- Roka, no otro lugar. norteticket cargó Bersuit dos veces, una en cada uno, y
-- No Te Va Gustar quedó en el patio.
--
-- Mismo mecanismo que 20261002190100_venue_canonical_data.sql:
--   - repuntea events.venue_id (valor previo en venue_merge_log),
--   - "El Patio de la Roka" pasa a ser alias de La Roka, así la ingesta lo
--     resuelve directo al canónico,
--   - marca el duplicado con canonical_venue_id + merged_at (no se borra),
--   - cierra el caso pendiente de venue_review_queue (estado previo en
--     venue_merge_log.old_values).
--
-- Por NOMBRE y no por id: los ids cambian entre entornos. Si alguno de los dos
-- venues no existe (base vacía de CI), no hace nada más que registrarse.
-- Reversión: supabase/rollbacks/20261002200000_venue_patio_roka_down.sql
-- ============================================================================

DO $migration$
DECLARE
  v_tag    TEXT := '20261002200000_venue_patio_roka';
  v_canon  public.venues%ROWTYPE;
  v_dup    public.venues%ROWTYPE;
  v_moved  INTEGER := 0;
  v_review INTEGER := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM public.data_migrations WHERE name = v_tag) THEN
    RAISE NOTICE 'Migración % ya aplicada, no se hace nada.', v_tag;
    RETURN;
  END IF;

  SELECT * INTO v_canon FROM public.venues
   WHERE public.venue_normalize(name) = 'la roka' AND canonical_venue_id IS NULL
   ORDER BY created_at LIMIT 1;
  SELECT * INTO v_dup FROM public.venues
   WHERE public.venue_normalize(name) = 'el patio de la roka' AND canonical_venue_id IS NULL
   ORDER BY created_at LIMIT 1;

  IF v_canon.id IS NOT NULL AND v_dup.id IS NOT NULL THEN
    INSERT INTO public.venue_merge_log (migration_tag, entity, entity_id, from_venue_id, to_venue_id)
    SELECT v_tag, 'event', e.id, e.venue_id, v_canon.id
      FROM public.events e WHERE e.venue_id = v_dup.id;

    UPDATE public.events SET venue_id = v_canon.id WHERE venue_id = v_dup.id;
    GET DIAGNOSTICS v_moved = ROW_COUNT;

    INSERT INTO public.venue_aliases (venue_id, alias, source)
    VALUES (v_canon.id, public.venue_sanitize(v_dup.name), 'migration')
    ON CONFLICT (alias_normalized) DO NOTHING;

    INSERT INTO public.venue_merge_log (migration_tag, entity, entity_id, from_venue_id, to_venue_id)
    VALUES (v_tag, 'venue', v_dup.id, NULL, v_canon.id);

    UPDATE public.venues
       SET canonical_venue_id = v_canon.id, merged_at = now(), updated_at = now()
     WHERE id = v_dup.id;

    INSERT INTO public.venue_merge_log (migration_tag, entity, entity_id, old_values)
    SELECT v_tag, 'review', q.id,
           jsonb_build_object('status', q.status, 'resolved_venue_id', q.resolved_venue_id,
                              'notes', q.notes, 'reviewed_at', q.reviewed_at)
      FROM public.venue_review_queue q
     WHERE q.normalized = 'el patio de la roka' AND q.status = 'pending';

    UPDATE public.venue_review_queue
       SET status = 'resolved', resolved_venue_id = v_canon.id, reviewed_at = now(),
           notes = 'Sprint 3: el patio es parte de La Roka (' || v_tag || ')'
     WHERE normalized = 'el patio de la roka' AND status = 'pending';
    GET DIAGNOSTICS v_review = ROW_COUNT;

    RAISE NOTICE 'MERGE | % | <- | % | eventos=% | revisiones cerradas=%', v_canon.name, v_dup.name, v_moved, v_review;
  ELSE
    RAISE NOTICE 'No están los dos venues (La Roka / El Patio de la Roka): nada que fusionar.';
  END IF;

  INSERT INTO public.data_migrations (name, notes)
  VALUES (v_tag, format('El Patio de la Roka -> La Roka: %s eventos, %s revisiones', v_moved, v_review));
END;
$migration$;

-- Test: no puede quedar ningún evento apuntando a un venue absorbido.
DO $test$
BEGIN
  IF EXISTS (SELECT 1 FROM public.events e JOIN public.venues v ON v.id = e.venue_id
              WHERE v.canonical_venue_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Quedan eventos apuntando a un venue fusionado';
  END IF;
  IF EXISTS (SELECT 1 FROM public.venues WHERE public.venue_normalize(name) = 'la roka' AND canonical_venue_id IS NULL)
     AND EXISTS (SELECT 1 FROM public.venues WHERE public.venue_normalize(name) = 'el patio de la roka' AND canonical_venue_id IS NULL) THEN
    RAISE EXCEPTION 'El Patio de la Roka sigue como venue canónico';
  END IF;
END;
$test$;
