-- ============================================================================
-- Hotfix del panel de admin (13/10): public.unmerge_event(drop_id)
-- ============================================================================
--
-- Deshace una fusión manual (merge_events, R19 / 20261011120000_merge_events.sql)
-- desde el botón "Deshacer fusión" de /admin/revision.
--
-- Qué se revierte, con lo que guardó merge_events en merge_audit del que
-- queda (entrada con context = 'admin' y absorbed_event_id = drop_id):
--   - el descartado: se le quitan merged_into_event_id / merged_at /
--     merged_by de ai_metadata y vuelve is_featured del snapshot. Queda en
--     DRAFT aunque antes estuviera publicado (decisión del hotfix: vuelve a la
--     cola de revisión y se publica con las guardas de siempre); la respuesta
--     trae previous_status.
--   - instagram_flyers con event_id = keep y merged_from_event_id = drop:
--     vuelven a event_id = drop y se les quita merged_from_event_id.
--   - ticket_sources del que queda: se sacan las ticket_sources_added
--     entradas agregadas, que son las ÚLTIMAS cuyo link (misma identidad que
--     merge_events: lower(rtrim(btrim(url), '/'))) es del descartado. Una
--     fusión posterior no puede agregar esos links otra vez (los deduplica),
--     así que las propias del que queda siempre están antes. Si hay menos de
--     las que se agregaron, alguien las cambió: aborta sin tocar nada.
--     No se recupera la normalización que hizo merge_events sobre las propias
--     del que queda (entradas sin url descartadas, su ticket_url sumado como
--     entrada): no cambia lo que se ve, porque normalizeTicketSources hace lo
--     mismo al leer.
--   - la entrada de merge_audit se quita.
--   - Favoritos: merge_events solo guardó cuántos movió, no de quién. No se
--     pueden revertir con certeza: quedan en el que se conserva y la
--     respuesta trae la cantidad (favorites_moved).
--
-- Fusiones sin esa entrada de auditoría (las hechas a mano en la R9 o las de
-- la deduplicación automática): alcance mínimo. Se quitan las claves de
-- fusión del descartado y vuelve SU flyer (ai_metadata.flyer_id del
-- descartado) si hoy apunta al que queda. ticket_sources, is_featured y
-- merge_audit no se tocan; la respuesta trae audit_found = false.
--
-- Además, el par se agrega a duplicate_dismissals: deshacer una fusión es
-- decir "son distintos", y el par no vuelve a "Posibles duplicados".
--
-- Seguridad, igual que merge_events: SECURITY DEFINER, search_path = '',
-- is_admin() como primera instrucción, EXECUTE solo para authenticated. Sin
-- SQL dinámico y sin EXCEPTION WHEN: un error en cualquier paso deshace todo.
-- La versión es anterior a las de la R23 (20261013120000…) a propósito: se
-- aplica en producción antes que esas.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.unmerge_event(drop_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row              public.events%ROWTYPE;
  v_drop             public.events%ROWTYPE;
  v_keep             public.events%ROWTYPE;
  v_keep_text        text;
  v_keep_id          uuid;
  v_audit            jsonb;
  v_audit_ord        bigint;
  v_snapshot         jsonb;
  v_added            integer := 0;
  v_drop_keys        text[] := ARRAY[]::text[];
  v_elem             jsonb;
  v_positions        bigint[];
  v_remove           bigint[];
  v_new_sources      jsonb;
  v_new_audit        jsonb;
  v_flyers_restored  integer := 0;
  v_dismissed        integer := 0;
BEGIN
  -- 1. Primera instrucción del cuerpo.
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  IF drop_id IS NULL THEN
    RAISE EXCEPTION 'drop_id no puede ser nulo' USING ERRCODE = '22023';
  END IF;

  -- 2. A dónde apunta el descartado (sin bloquear todavía: hace falta el id
  --    del que queda para bloquear las dos filas en orden).
  SELECT e.ai_metadata->>'merged_into_event_id' INTO v_keep_text
  FROM public.events e WHERE e.id = drop_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El evento (%) no existe', drop_id USING ERRCODE = 'P0002';
  END IF;
  IF v_keep_text IS NULL THEN
    RAISE EXCEPTION 'Este evento no está fusionado en otro' USING ERRCODE = 'P0001';
  END IF;
  IF v_keep_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'La fusión guardada en este evento no es válida: hay que revisarla a mano' USING ERRCODE = 'P0001';
  END IF;
  v_keep_id := v_keep_text::uuid;

  -- 3. Las dos filas, bloqueadas en orden de id (como merge_events).
  FOR v_row IN
    SELECT * FROM public.events WHERE id IN (v_keep_id, drop_id) ORDER BY id FOR UPDATE
  LOOP
    IF v_row.id = v_keep_id THEN v_keep := v_row; END IF;
    IF v_row.id = drop_id THEN v_drop := v_row; END IF;
  END LOOP;

  -- Pudo cambiar entre el paso 2 y el bloqueo.
  IF v_drop.id IS NULL OR v_drop.ai_metadata->>'merged_into_event_id' IS DISTINCT FROM v_keep_id::text THEN
    RAISE EXCEPTION 'La fusión cambió mientras se deshacía: recargá la página' USING ERRCODE = 'P0001';
  END IF;
  IF v_keep.id IS NULL THEN
    RAISE EXCEPTION 'El evento en el que se fusionó ya no existe' USING ERRCODE = 'P0002';
  END IF;
  IF v_drop.status IS DISTINCT FROM 'DRAFT'::public.event_status THEN
    RAISE EXCEPTION 'Solo se deshace la fusión de un evento en borrador' USING ERRCODE = 'P0001';
  END IF;
  IF v_keep.ai_metadata->>'merged_into_event_id' IS NOT NULL THEN
    RAISE EXCEPTION 'El evento que quedó también fue fusionado en otro: deshacé esa fusión primero' USING ERRCODE = 'P0001';
  END IF;

  -- 4. La entrada de auditoría de esta fusión (la última, si hubiera más).
  SELECT t.elem, t.ord INTO v_audit, v_audit_ord
  FROM jsonb_array_elements(v_keep.merge_audit) WITH ORDINALITY AS t(elem, ord)
  WHERE jsonb_typeof(t.elem) = 'object'
    AND t.elem->>'absorbed_event_id' = drop_id::text
    AND t.elem->>'context' = 'admin'
  ORDER BY t.ord DESC
  LIMIT 1;

  IF v_audit IS NOT NULL THEN
    v_snapshot := v_audit->'absorbed_snapshot';
    v_added := coalesce((v_audit->>'ticket_sources_added')::integer, 0);

    IF v_added > 0 THEN
      -- Links del descartado antes de la fusión (snapshot), con la identidad de merge_events.
      FOR v_elem IN SELECT value FROM jsonb_array_elements(coalesce(v_snapshot->'ticket_sources', '[]'::jsonb))
      LOOP
        IF jsonb_typeof(v_elem) = 'object' AND jsonb_typeof(v_elem->'url') = 'string' THEN
          v_drop_keys := v_drop_keys || lower(rtrim(btrim(v_elem->>'url'), '/'));
        END IF;
      END LOOP;
      IF jsonb_typeof(v_snapshot->'ticket_url') = 'string' AND btrim(v_snapshot->>'ticket_url') <> '' THEN
        v_drop_keys := v_drop_keys || lower(rtrim(btrim(v_snapshot->>'ticket_url'), '/'));
      END IF;

      SELECT array_agg(t.ord ORDER BY t.ord DESC) INTO v_positions
      FROM jsonb_array_elements(coalesce(v_keep.ticket_sources, '[]'::jsonb)) WITH ORDINALITY AS t(elem, ord)
      WHERE jsonb_typeof(t.elem) = 'object'
        AND jsonb_typeof(t.elem->'url') = 'string'
        AND lower(rtrim(btrim(t.elem->>'url'), '/')) = ANY(v_drop_keys);

      IF coalesce(array_length(v_positions, 1), 0) < v_added THEN
        RAISE EXCEPTION 'Los links de compra del evento que quedó cambiaron desde la fusión: no se pueden separar solos, hay que revisarlos a mano' USING ERRCODE = 'P0001';
      END IF;

      v_remove := v_positions[1:v_added];

      SELECT coalesce(jsonb_agg(t.elem ORDER BY t.ord), '[]'::jsonb) INTO v_new_sources
      FROM jsonb_array_elements(coalesce(v_keep.ticket_sources, '[]'::jsonb)) WITH ORDINALITY AS t(elem, ord)
      WHERE NOT (t.ord = ANY(v_remove));
    ELSE
      v_new_sources := v_keep.ticket_sources;
    END IF;

    SELECT coalesce(jsonb_agg(t.elem ORDER BY t.ord), '[]'::jsonb) INTO v_new_audit
    FROM jsonb_array_elements(v_keep.merge_audit) WITH ORDINALITY AS t(elem, ord)
    WHERE t.ord <> v_audit_ord;

    UPDATE public.events
    SET ticket_sources = v_new_sources,
        merge_audit = v_new_audit,
        updated_at = now()
    WHERE id = v_keep_id;
  END IF;

  -- 5. Flyers: los que movió merge_events (merged_from_event_id) y el flyer
  --    propio del descartado, siempre que hoy apunten al que queda.
  UPDATE public.instagram_flyers f
  SET ai_metadata = (f.ai_metadata - 'merged_from_event_id') || jsonb_build_object('event_id', drop_id)
  WHERE f.ai_metadata->>'event_id' = v_keep_id::text
    AND (
      f.ai_metadata->>'merged_from_event_id' = drop_id::text
      OR f.id::text = v_drop.ai_metadata->>'flyer_id'
    );
  GET DIAGNOSTICS v_flyers_restored = ROW_COUNT;

  -- 6. El descartado: sin las claves de fusión, sigue en DRAFT.
  UPDATE public.events
  SET ai_metadata = v_drop.ai_metadata - 'merged_into_event_id' - 'merged_at' - 'merged_by',
      is_featured = CASE
        WHEN v_snapshot IS NOT NULL AND jsonb_typeof(v_snapshot->'is_featured') = 'boolean'
          THEN (v_snapshot->>'is_featured')::boolean
        ELSE v_drop.is_featured
      END,
      updated_at = now()
  WHERE id = drop_id;

  -- 7. "Son distintos": el par no vuelve a "Posibles duplicados".
  INSERT INTO public.duplicate_dismissals (event_a, event_b, decided_by)
  VALUES (least(drop_id, v_keep_id), greatest(drop_id, v_keep_id), auth.uid())
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_dismissed = ROW_COUNT;

  -- 8. Nada de user_id ni email en la respuesta.
  RETURN jsonb_build_object(
    'keep_id', v_keep_id,
    'drop_id', drop_id,
    'audit_found', v_audit IS NOT NULL,
    'previous_status', v_snapshot->>'status',
    'flyers_restored', v_flyers_restored,
    'ticket_sources_removed', CASE WHEN v_audit IS NOT NULL THEN v_added ELSE 0 END,
    'favorites_moved', CASE WHEN v_audit IS NOT NULL THEN coalesce((v_audit->>'favorites_moved')::integer, 0) END,
    'dismissed', v_dismissed > 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.unmerge_event(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unmerge_event(uuid) TO authenticated;

COMMENT ON FUNCTION public.unmerge_event(uuid) IS
  'Hotfix 13/10: deshace una fusión manual de merge_events() ("Deshacer fusión" en /admin/revision). SECURITY DEFINER, is_admin() primero (42501), EXECUTE solo authenticated. Con la entrada de merge_audit revierte flyers, ticket_sources agregados, is_featured y la entrada; sin ella (fusiones viejas), solo las claves de fusión y el flyer propio. El descartado queda en DRAFT. Los favoritos movidos no se revierten (no se guardó de quién eran). Agrega el par a duplicate_dismissals.';
