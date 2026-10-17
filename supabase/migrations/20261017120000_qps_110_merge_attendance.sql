-- ============================================================================
-- QPS-110 (Ronda 38 / 38-c), merge_events() repunta "voy"/
-- "me interesa" (event_attendance) además de favoritos.
-- ============================================================================
--
-- Propuesta de la R38 (ops/rondas/38-voy-me-interesa/qps-110-migracion.sql),
-- pasada a migración sin cambios de lógica por el lead de día (17/10). En
-- producción la aplica Mauro.
--
-- Reemplaza por completo la función public.merge_events(keep_id, drop_id) de
-- supabase/migrations/20261011120000_merge_events.sql (Ronda 19, QPS-061):
-- mismo cuerpo, con un paso nuevo (8) que repunta public.event_attendance
-- igual que el paso 7 ya repunta public.user_favorites, y los contadores
-- nuevos (attendance_moved, attendance_dropped) sumados a la auditoría y al
-- jsonb de retorno. Los pasos 9-12 del original estaban mal numerados (dos
-- pasos "9."): esta versión los renumera 9-12 de corrido; no cambia ninguna
-- otra línea de lógica fuera del paso 8 y lo que toca para agregarlo
-- (DECLARE, auditoría, retorno).
--
-- Decisiones de esta propuesta (a confirmar por Mauro si hace falta):
--
--   A. Conflicto de marcas (el usuario ya tiene marca en los DOS eventos,
--      "voy"/"me_interesa" en cualquier combinación): la marca del evento
--      que QUEDA manda, la del descartado se borra. Es la misma regla que
--      ya usa el paso 7 con user_favorites (ahí no hay "contenido" que
--      conservar, solo existencia; acá sí hay un valor, "kind", y se eligió
--      no combinarlo). Motivo: no hay una forma no arbitraria de resolver
--      "voy" contra "me_interesa" automáticamente (promover siempre a "voy"
--      sería inventarle al usuario una intención -presencia confirmada- que
--      nunca expresó sobre el evento que queda; quedarse con el valor más
--      "fuerte" requeriría definir un orden entre los dos kinds que hoy no
--      existe en ningún lado del esquema). Conservar la marca del evento que
--      queda es consistente con cómo ya se tratan ticket_sources/ai_metadata
--      del lado "keep": lo que ya tenía el que queda no se pisa con lo del
--      descartado, se le agrega lo que falta. Si en algún momento se quiere
--      otro criterio (por ejemplo value del merge_audit, fecha de la marca
--      más reciente), es un cambio de esta función, no del trigger.
--
--   B. Por qué el UNIQUE (user_id, event_id) nunca se viola: exactamente el
--      mismo argumento que ya vale para user_favorites en el paso 7. El
--      UPDATE del paso 8 solo mueve las filas de event_attendance cuyo
--      user_id NO tiene ya una fila en keep_id (ese es el filtro del WHERE);
--      para esas filas, mover event_id de drop_id a keep_id no puede
--      chocar con nada porque, por construcción, no existe otra fila de ese
--      user_id en keep_id. El DELETE que sigue solo borra las filas que
--      TODAVÍA apuntan a drop_id (las que no se movieron porque sí tenían
--      conflicto); nunca se intenta mover una fila que chocaría, así que la
--      restricción no se evalúa nunca en un caso que fallaría.
--
--   C. event_attendance_totals: NO se recalcula a mano en esta función. El
--      trigger tr_sync_event_attendance_totals (función
--      public.sync_event_attendance_totals(), en
--      supabase/migrations/20261013120100_voy_me_interesa.sql) es FOR EACH
--      ROW, así que el UPDATE y el DELETE del paso 8 lo disparan una vez
--      por cada fila que tocan, con OLD/NEW de esa fila puntual. Dos casos:
--        - El UPDATE (mover una marca sin conflicto) cambia event_id de
--          drop_id a keep_id sin cambiar kind. Esa combinación entra por la
--          rama "if new.event_id is distinct from old.event_id then" del
--          trigger (líneas 159-173 de 20261013120100_voy_me_interesa.sql),
--          que resta 1 de la columna de OLD.kind en event_id = OLD.event_id
--          (drop_id) e inserta/suma (upsert) 1 en la columna de NEW.kind en
--          event_id = NEW.event_id (keep_id). Como esta función no toca
--          kind en el UPDATE (NEW.kind = OLD.kind), el total de esa marca
--          pasa intacto de un evento al otro: drop_id baja 1 en la columna
--          que corresponde, keep_id sube 1 en la misma columna.
--        - El DELETE (descartar una marca por conflicto) entra por la rama
--          "elsif tg_op = 'DELETE' then" del trigger (líneas 186-194 de la
--          misma migración), que resta 1 de la columna de OLD.kind en
--          event_id = OLD.event_id. En el momento del DELETE esas filas
--          todavía tienen event_id = drop_id (no las tocó el UPDATE
--          anterior, porque son justamente las que tenían conflicto), así
--          que el trigger resta en drop_id. No hace falta sumar nada en
--          keep_id: la marca que queda (la del usuario en keep_id) nunca se
--          tocó, así que su conteo ya es el correcto.
--      Con esas dos ramas ya alcanza: event_attendance_totals de los dos
--      eventos queda consistente con event_attendance sin que esta función
--      escriba un solo UPDATE sobre event_attendance_totals. No hace falta
--      el "recálculo idempotente a partir de event_attendance" que pedía la
--      tarea como alternativa: el trigger ya resuelve exactamente lo mismo,
--      fila por fila, y es el mismo trigger que ya mantiene los totales en
--      el resto del sistema (no se duplica lógica en dos lugares que
--      puedan desincronizarse).
--
-- Decisiones ya existentes que esta propuesta no toca (vienen del merge
-- original, Mauro, 09/10): si el descartado está PUBLISHED y el que queda
-- no, se rechaza la fusión entera; event_metrics del descartado no se mueve
-- ni se borra.
--
-- Idempotente: CREATE OR REPLACE FUNCTION. En producción la aplica Mauro.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- public.merge_events(keep_id uuid, drop_id uuid) RETURNS jsonb
-- ---------------------------------------------------------------------------
-- LANGUAGE plpgsql, SECURITY DEFINER, SET search_path = '': todo objeto va
-- calificado con su esquema (public.events, public.user_favorites,
-- public.event_attendance, public.instagram_flyers, public.event_status,
-- auth.uid()). Sin SQL dinámico. La función no atrapa excepciones (no hay
-- EXCEPTION WHEN …): un error en cualquier paso deshace todo el
-- UPDATE/DELETE anterior porque el cuerpo entero corre dentro de la
-- transacción implícita de la función.

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
  v_attendance_moved       integer := 0;
  v_attendance_dropped     integer := 0;
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

  -- 8. event_attendance (QPS-110, nuevo): mismo patrón que el paso 7 con
  --    user_favorites. Si el usuario no tiene marca en keep_id, la marca del
  --    descartado se mueve (UPDATE de event_id, mismo kind). Si ya tiene una
  --    marca en keep_id, la del descartado se borra sin importar si el kind
  --    es distinto (decisión A del encabezado: la marca del que queda
  --    manda, no se combinan "voy" y "me_interesa"). El UNIQUE
  --    (user_id, event_id) nunca se viola por la decisión B del encabezado:
  --    el UPDATE solo toca usuarios sin fila en keep_id, el DELETE solo
  --    toca usuarios que ya tenían una.
  --
  --    event_attendance_totals no se recalcula a mano: el trigger
  --    tr_sync_event_attendance_totals (public.sync_event_attendance_totals(),
  --    FOR EACH ROW) se dispara una vez por cada fila que este UPDATE/DELETE
  --    toca y ya la deja correcta — ver la decisión C del encabezado con la
  --    cita exacta de las dos ramas del trigger que entran en juego.
  UPDATE public.event_attendance
  SET event_id = keep_id
  WHERE event_id = drop_id
    AND user_id NOT IN (SELECT user_id FROM public.event_attendance WHERE event_id = keep_id);
  GET DIAGNOSTICS v_attendance_moved = ROW_COUNT;

  DELETE FROM public.event_attendance WHERE event_id = drop_id;
  GET DIAGNOSTICS v_attendance_dropped = ROW_COUNT;

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
    'attendance_moved', v_attendance_moved,
    'attendance_dropped', v_attendance_dropped,
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

  -- 10. El descartado vuelve a DRAFT, se le quita el destaque y queda la
  --     cadena de fusión en ai_metadata, tal como espera
  --     lib/events/merged.ts (mergedIntoId / findMergeRedirect).
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

  -- 11. El que queda: ticket_sources fusionados y merge_audit actualizado.
  --     event_metrics del descartado NO se toca (decisión 2 de Mauro).
  UPDATE public.events
  SET ticket_sources = v_ticket_sources,
      merge_audit = v_merge_audit,
      updated_at = now()
  WHERE id = keep_id;

  -- 12. Nada de user_id ni email en la respuesta.
  RETURN jsonb_build_object(
    'keep_id', keep_id,
    'drop_id', drop_id,
    'favorites_moved', v_favorites_moved,
    'favorites_dropped', v_favorites_dropped,
    'attendance_moved', v_attendance_moved,
    'attendance_dropped', v_attendance_dropped,
    'flyers_moved', v_flyers_moved,
    'ticket_sources_added', v_ticket_sources_added
  );
END;
$$;

REVOKE ALL ON FUNCTION public.merge_events(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_events(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.merge_events(uuid, uuid) IS
  'QPS-061 (R19) + QPS-110 (R38): fusión manual de dos eventos desde el panel de duplicados. SECURITY DEFINER, is_admin() verificado como primera instrucción (RAISE 42501 si no es admin), EXECUTE revocado a PUBLIC/anon y otorgado solo a authenticated. Rechaza (RAISE P0001) ciclos, eventos ya fusionados, CANCELLED, y el caso del descartado PUBLISHED con el que queda sin publicar (decisión 1 de Mauro). Repunta user_favorites y event_attendance del descartado hacia el que queda (UPDATE si no hay conflicto por el UNIQUE, DELETE si ya existía): en event_attendance, si el usuario ya tenía marca en los dos eventos, la del que queda manda y la del descartado se borra sin combinar kinds. event_attendance_totals queda correcto solo por el trigger tr_sync_event_attendance_totals (FOR EACH ROW), sin ningún UPDATE manual sobre esa tabla. Todo en una transacción: sin EXCEPTION WHEN, un error en cualquier paso deshace el merge entero. event_metrics del descartado no se toca (decisión 2 de Mauro).';
