-- ============================================================================
-- Ronda 19 (19-a): merge_events() y duplicate_dismissals (QPS-061)
-- ============================================================================
--
-- Contexto: la revisión manual de duplicados (lib/events/duplicate-candidates.ts,
-- app/admin/duplicados/page.tsx) necesita que un admin pueda fusionar dos
-- eventos a mano desde el panel, sin pasar por la deduplicación automática de
-- la ingesta (lib/scraper/merge-events.ts, lib/scraper/dedup-cleanup.ts). Esta
-- migración agrega:
--
--   1. public.merge_events(keep_id, drop_id): hace en una sola transacción de
--      base lo que dedup-cleanup.ts hace en varios roundtrips desde Node
--      (repointFavorites, repointInstagramFlyers, mergeTicketSources, el
--      snapshot en merge_audit y dejar el descartado en DRAFT con
--      ai_metadata.merged_into_event_id, que es lo que sigue
--      lib/events/merged.ts). SECURITY DEFINER porque un usuario común no
--      tiene permiso de UPDATE/DELETE cruzado entre eventos de otro dueño ni
--      de leer user_favorites ajenos; is_admin() se verifica como primera
--      instrucción del cuerpo, antes de tocar cualquier dato, y EXECUTE queda
--      revocado a todos salvo `authenticated` (adentro, is_admin() igual
--      rechaza a cualquier authenticated que no sea admin).
--   2. public.duplicate_dismissals: para que un admin pueda descartar un par
--      candidato ("no son el mismo evento") sin que vuelva a aparecer en la
--      lista cada vez que se recalculan los candidatos.
--
-- Decisiones de Mauro (09/10), no negociables:
--   1. Si el evento que se descarta está PUBLISHED y el que queda no, se
--      RECHAZA la fusión entera: nunca se publica el que queda como efecto
--      colateral de un merge manual.
--   2. event_metrics del descartado no se toca (ni se mueve ni se borra):
--      las métricas quedan asociadas al id original, igual que hoy con la
--      deduplicación automática.
--
-- Idempotente: CREATE OR REPLACE FUNCTION, CREATE TABLE IF NOT EXISTS,
-- CREATE INDEX IF NOT EXISTS, DROP POLICY IF EXISTS antes de cada CREATE
-- POLICY. No se aplica en producción con esta migración: la aplica Mauro.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. public.merge_events(keep_id uuid, drop_id uuid) RETURNS jsonb
-- ---------------------------------------------------------------------------
-- LANGUAGE plpgsql, SECURITY DEFINER, SET search_path = '': todo objeto va
-- calificado con su esquema (public.events, public.user_favorites,
-- public.instagram_flyers, public.event_status, auth.uid()). Sin SQL
-- dinámico. La función no atrapa excepciones (no hay EXCEPTION WHEN …): un
-- error en cualquier paso deshace todo el UPDATE/DELETE anterior porque el
-- cuerpo entero corre dentro de la transacción implícita de la función.

CREATE OR REPLACE FUNCTION public.merge_events(keep_id uuid, drop_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row                   public.events%ROWTYPE;
  v_keep                   public.events%ROWTYPE;
  v_drop                   public.events%ROWTYPE;
  v_ticket_sources         jsonb := '[]'::jsonb;
  v_seen_keys              text[] := ARRAY[]::text[];
  v_ts_elem                jsonb;
  v_key                    text;
  v_keep_sources_count     integer;
  v_ticket_sources_added   integer;
  v_flyers_moved           integer := 0;
  v_favorites_moved        integer := 0;
  v_favorites_dropped      integer := 0;
  v_merge_audit            jsonb;
  v_audit_entry            jsonb;
BEGIN
  -- 1. Primera instrucción del cuerpo: antes de validar ids, sin DECLARE con
  --    consultas. Cualquier authenticated que no sea admin queda afuera acá,
  --    aunque igual tenga EXECUTE otorgado (ver GRANT más abajo).
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  -- 2. Ids no nulos y distintos.
  IF keep_id IS NULL OR drop_id IS NULL OR keep_id = drop_id THEN
    RAISE EXCEPTION 'keep_id y drop_id tienen que ser valores distintos y no nulos' USING ERRCODE = '22023';
  END IF;

  -- 3. Se traen y bloquean las dos filas en un único SELECT, en orden de id
  --    (evita deadlocks si dos fusiones concurrentes comparten un evento).
  FOR v_row IN
    SELECT * FROM public.events WHERE id IN (keep_id, drop_id) ORDER BY id FOR UPDATE
  LOOP
    IF v_row.id = keep_id THEN
      v_keep := v_row;
    END IF;
    IF v_row.id = drop_id THEN
      v_drop := v_row;
    END IF;
  END LOOP;

  IF v_keep.id IS NULL THEN
    RAISE EXCEPTION 'El evento que queda (%) no existe', keep_id USING ERRCODE = 'P0002';
  END IF;

  IF v_drop.id IS NULL THEN
    RAISE EXCEPTION 'El evento que se descarta (%) no existe', drop_id USING ERRCODE = 'P0002';
  END IF;

  -- 4. Rechazos, en este orden exacto: ciclo, keep ya fusionado, drop ya
  --    fusionado, alguno CANCELLED, drop PUBLISHED con keep sin publicar
  --    (decisión 1 de Mauro: nunca se publica el que queda).
  IF v_keep.ai_metadata->>'merged_into_event_id' = drop_id::text THEN
    RAISE EXCEPTION 'El evento que queda ya está fusionado hacia el que se quiere descartar: sería un ciclo' USING ERRCODE = 'P0001';
  ELSIF v_keep.ai_metadata->>'merged_into_event_id' IS NOT NULL THEN
    RAISE EXCEPTION 'El evento que queda ya fue fusionado hacia otro evento' USING ERRCODE = 'P0001';
  ELSIF v_drop.ai_metadata->>'merged_into_event_id' IS NOT NULL THEN
    RAISE EXCEPTION 'El evento que se descarta ya fue fusionado hacia otro evento' USING ERRCODE = 'P0001';
  ELSIF v_keep.status = 'CANCELLED'::public.event_status OR v_drop.status = 'CANCELLED'::public.event_status THEN
    RAISE EXCEPTION 'No se puede fusionar un evento cancelado' USING ERRCODE = 'P0001';
  ELSIF v_drop.status = 'PUBLISHED'::public.event_status AND v_keep.status IS DISTINCT FROM 'PUBLISHED'::public.event_status THEN
    RAISE EXCEPTION 'El evento que se descarta está publicado y el que queda no: no se puede fusionar sin publicar primero el que queda' USING ERRCODE = 'P0001';
  END IF;

  -- 5. ticket_sources del que queda: acoplado a mergeTicketSources en
  --    lib/scraper/merge-events.ts. Identidad del link:
  --    lower(rtrim(btrim(url), '/')); solo entradas que sean objeto con
  --    `url` texto (como normalizeTicketSources). Se arranca con los propios
  --    del que queda (su ticket_url es el primero si no tenía
  --    ticket_sources) y se agregan los del descartado y su ticket_url.
  FOR v_ts_elem IN SELECT value FROM jsonb_array_elements(coalesce(v_keep.ticket_sources, '[]'::jsonb))
  LOOP
    IF jsonb_typeof(v_ts_elem) = 'object' AND jsonb_typeof(v_ts_elem->'url') = 'string' THEN
      v_key := lower(rtrim(btrim(v_ts_elem->>'url'), '/'));
      IF v_key <> '' AND NOT (v_key = ANY(v_seen_keys)) THEN
        v_seen_keys := v_seen_keys || v_key;
        v_ticket_sources := v_ticket_sources || jsonb_build_array(jsonb_build_object(
          'source', coalesce(v_ts_elem->>'source', v_keep.scrape_source_key, 'manual'),
          'url', v_ts_elem->>'url',
          'price_min', coalesce((v_ts_elem->>'price_min')::numeric, 0)
        ));
      END IF;
    END IF;
  END LOOP;

  IF v_keep.ticket_url IS NOT NULL AND btrim(v_keep.ticket_url) <> '' THEN
    v_key := lower(rtrim(btrim(v_keep.ticket_url), '/'));
    IF NOT (v_key = ANY(v_seen_keys)) THEN
      v_seen_keys := v_seen_keys || v_key;
      v_ticket_sources := v_ticket_sources || jsonb_build_array(jsonb_build_object(
        'source', coalesce(v_keep.scrape_source_key, 'manual'),
        'url', v_keep.ticket_url,
        'price_min', coalesce(v_keep.price_min, 0)
      ));
    END IF;
  END IF;

  v_keep_sources_count := jsonb_array_length(v_ticket_sources);

  FOR v_ts_elem IN SELECT value FROM jsonb_array_elements(coalesce(v_drop.ticket_sources, '[]'::jsonb))
  LOOP
    IF jsonb_typeof(v_ts_elem) = 'object' AND jsonb_typeof(v_ts_elem->'url') = 'string' THEN
      v_key := lower(rtrim(btrim(v_ts_elem->>'url'), '/'));
      IF v_key <> '' AND NOT (v_key = ANY(v_seen_keys)) THEN
        v_seen_keys := v_seen_keys || v_key;
        v_ticket_sources := v_ticket_sources || jsonb_build_array(jsonb_build_object(
          'source', coalesce(v_ts_elem->>'source', v_drop.scrape_source_key, 'manual'),
          'url', v_ts_elem->>'url',
          'price_min', coalesce((v_ts_elem->>'price_min')::numeric, 0)
        ));
      END IF;
    END IF;
  END LOOP;

  IF v_drop.ticket_url IS NOT NULL AND btrim(v_drop.ticket_url) <> '' THEN
    v_key := lower(rtrim(btrim(v_drop.ticket_url), '/'));
    IF NOT (v_key = ANY(v_seen_keys)) THEN
      v_seen_keys := v_seen_keys || v_key;
      v_ticket_sources := v_ticket_sources || jsonb_build_array(jsonb_build_object(
        'source', coalesce(v_drop.scrape_source_key, 'manual'),
        'url', v_drop.ticket_url,
        'price_min', coalesce(v_drop.price_min, 0)
      ));
    END IF;
  END IF;

  v_ticket_sources_added := jsonb_array_length(v_ticket_sources) - v_keep_sources_count;

  -- 6. instagram_flyers que apuntaban al descartado pasan a apuntar al que
  --    queda, sin perder el rastro de dónde venían.
  UPDATE public.instagram_flyers
  SET ai_metadata = ai_metadata || jsonb_build_object('event_id', keep_id, 'merged_from_event_id', drop_id)
  WHERE ai_metadata->>'event_id' = drop_id::text;
  GET DIAGNOSTICS v_flyers_moved = ROW_COUNT;

  -- 7. user_favorites: se repuntan los que no generan duplicado por el
  --    UNIQUE (user_id, event_id); los que ya tenían los dos favoritos se
  --    borran (la fila sobrante queda huérfana al borrar drop_id más abajo).
  UPDATE public.user_favorites
  SET event_id = keep_id
  WHERE event_id = drop_id
    AND user_id NOT IN (SELECT user_id FROM public.user_favorites WHERE event_id = keep_id);
  GET DIAGNOSTICS v_favorites_moved = ROW_COUNT;

  DELETE FROM public.user_favorites WHERE event_id = drop_id;
  GET DIAGNOSTICS v_favorites_dropped = ROW_COUNT;

  -- 9. Entrada de auditoría sobre el que queda: el snapshot completo de la
  --    fila descartada ANTES de tocarla (v_drop, capturado en el paso 3), más
  --    los contadores de este merge. Se conservan las últimas 50 entradas
  --    (igual que appendAudit() en lib/scraper/merge-events.ts).
  v_audit_entry := jsonb_build_object(
    'context', 'admin',
    'merged_at', now(),
    'merged_by', auth.uid(),
    'absorbed_event_id', drop_id,
    'absorbed_snapshot', to_jsonb(v_drop),
    'favorites_moved', v_favorites_moved,
    'favorites_dropped', v_favorites_dropped,
    'flyers_moved', v_flyers_moved,
    'ticket_sources_added', v_ticket_sources_added
  );

  v_merge_audit := coalesce(v_keep.merge_audit, '[]'::jsonb) || jsonb_build_array(v_audit_entry);

  SELECT coalesce(jsonb_agg(elem ORDER BY ord), '[]'::jsonb)
  INTO v_merge_audit
  FROM (
    SELECT elem, ord
    FROM jsonb_array_elements(v_merge_audit) WITH ORDINALITY AS t(elem, ord)
    ORDER BY ord DESC
    LIMIT 50
  ) sub;

  -- 8. El descartado vuelve a DRAFT, se le quita el destaque y queda la
  --    cadena de fusión en ai_metadata, tal como espera
  --    lib/events/merged.ts (mergedIntoId / findMergeRedirect).
  UPDATE public.events
  SET status = 'DRAFT'::public.event_status,
      is_featured = false,
      ai_metadata = coalesce(v_drop.ai_metadata, '{}'::jsonb) || jsonb_build_object(
        'merged_into_event_id', keep_id,
        'merged_at', now(),
        'merged_by', auth.uid()
      ),
      updated_at = now()
  WHERE id = drop_id;

  -- 9. El que queda: ticket_sources fusionados y merge_audit actualizado.
  --    event_metrics del descartado NO se toca (decisión 2 de Mauro).
  UPDATE public.events
  SET ticket_sources = v_ticket_sources,
      merge_audit = v_merge_audit,
      updated_at = now()
  WHERE id = keep_id;

  -- 10. Nada de user_id ni email en la respuesta.
  RETURN jsonb_build_object(
    'keep_id', keep_id,
    'drop_id', drop_id,
    'favorites_moved', v_favorites_moved,
    'favorites_dropped', v_favorites_dropped,
    'flyers_moved', v_flyers_moved,
    'ticket_sources_added', v_ticket_sources_added
  );
END;
$$;

REVOKE ALL ON FUNCTION public.merge_events(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_events(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.merge_events(uuid, uuid) IS
  'QPS-061 / Ronda 19 (19-a): fusión manual de dos eventos desde el panel de duplicados. SECURITY DEFINER, is_admin() verificado como primera instrucción (RAISE 42501 si no es admin), EXECUTE revocado a PUBLIC/anon y otorgado solo a authenticated. Rechaza (RAISE P0001) ciclos, eventos ya fusionados, CANCELLED, y el caso del descartado PUBLISHED con el que queda sin publicar (decisión 1 de Mauro). Todo en una transacción: sin EXCEPTION WHEN, un error en cualquier paso deshace el merge entero. event_metrics del descartado no se toca (decisión 2 de Mauro).';


-- ---------------------------------------------------------------------------
-- 2. public.duplicate_dismissals
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.duplicate_dismissals (
  event_a     uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  event_b     uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  decided_by  uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  decided_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_a, event_b),
  CHECK (event_a < event_b)
);

COMMENT ON TABLE public.duplicate_dismissals IS
  'QPS-061 / Ronda 19 (19-a): pares de eventos candidatos a duplicado (lib/events/duplicate-candidates.ts) que un admin marcó como "no son el mismo evento", para que no vuelvan a aparecer en la revisión manual.';

-- La FK sin índice la marca el advisor ("unindexed_foreign_keys"); event_a ya
-- queda indexado porque es la primera columna de la PRIMARY KEY.
CREATE INDEX IF NOT EXISTS duplicate_dismissals_event_b_idx
  ON public.duplicate_dismissals (event_b);

ALTER TABLE public.duplicate_dismissals ENABLE ROW LEVEL SECURITY;

-- Una sola policy PERMISSIVE por acción (select/insert/delete), to
-- authenticated, con (select public.is_admin()) envuelto (evita el aviso
-- "auth_rls_initplan" del Performance Advisor, ver rls_lint.test.sql de la
-- R17). No hay UPDATE: un descarte se borra y se vuelve a crear, no se edita.
DROP POLICY IF EXISTS "lectura admin" ON public.duplicate_dismissals;
CREATE POLICY "lectura admin"
  ON public.duplicate_dismissals FOR SELECT
  TO authenticated
  USING ((select public.is_admin()));

DROP POLICY IF EXISTS "inserción admin" ON public.duplicate_dismissals;
CREATE POLICY "inserción admin"
  ON public.duplicate_dismissals FOR INSERT
  TO authenticated
  WITH CHECK (
    (select public.is_admin())
    AND decided_by = (select auth.uid())
  );

DROP POLICY IF EXISTS "eliminación admin" ON public.duplicate_dismissals;
CREATE POLICY "eliminación admin"
  ON public.duplicate_dismissals FOR DELETE
  TO authenticated
  USING ((select public.is_admin()));

REVOKE ALL ON public.duplicate_dismissals FROM anon;
GRANT SELECT, INSERT, DELETE ON public.duplicate_dismissals TO authenticated;
