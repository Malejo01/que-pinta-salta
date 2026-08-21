-- ============================================================================
-- REVERSIÓN de la normalización canónica de venues
-- Deshace: 20260821_venue_canonical_data.sql + 20260821_venue_canonical.sql
-- ============================================================================
--
-- La reversión es exacta porque la migración no borró nada: cada evento
-- repunteado quedó registrado en `venue_merge_log` con su venue_id original,
-- y cada duplicado sigue siendo una fila viva de `venues` (sólo con
-- canonical_venue_id seteado).
--
-- Lo único que NO se revierte con precisión es el enriquecimiento de geo del
-- paso 3 (copiar lat/lng del duplicado al canónico cuando al canónico le
-- faltaban). Se dejan esos valores: son datos correctos y borrarlos sería
-- perder información, no restaurarla. Está listado abajo por si se los quiere
-- limpiar a mano.
--
-- Uso
-- ---
--   \i 20260821_venue_canonical_down.sql
--
-- Por defecto revierte SÓLO los datos y deja el esquema nuevo en su lugar
-- (que es lo que casi siempre se quiere: rehacer el mapeo con otro plan).
-- Para tirar también las tablas y funciones, descomentar el bloque final.
-- ============================================================================

DO $revert$
DECLARE
  v_tag       TEXT := '20260821_venue_canonical_data';
  v_restored  INTEGER := 0;
  v_unmerged  INTEGER := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.data_migrations WHERE name = v_tag) THEN
    RAISE NOTICE 'La migración % no figura como aplicada. Nada que revertir.', v_tag;
    RETURN;
  END IF;

  -- 1. Devolver cada evento a su venue original.
  -- Si un evento fue repunteado más de una vez (por el aplanado de cadenas),
  -- gana el registro más ANTIGUO: ése tiene el venue_id previo a todo.
  WITH first_move AS (
    SELECT DISTINCT ON (entity_id) entity_id, from_venue_id
      FROM public.venue_merge_log
     WHERE migration_tag = v_tag AND entity = 'event'
     ORDER BY entity_id, created_at ASC
  )
  UPDATE public.events e
     SET venue_id = f.from_venue_id
    FROM first_move f
   WHERE e.id = f.entity_id
     AND e.venue_id IS DISTINCT FROM f.from_venue_id;
  GET DIAGNOSTICS v_restored = ROW_COUNT;

  -- 2. Desmarcar los duplicados: vuelven a ser venues canónicos independientes.
  UPDATE public.venues
     SET canonical_venue_id = NULL, merged_at = NULL, updated_at = now()
   WHERE id IN (
     SELECT entity_id FROM public.venue_merge_log
      WHERE migration_tag = v_tag AND entity = 'venue'
   );
  GET DIAGNOSTICS v_unmerged = ROW_COUNT;

  -- 3. Borrar los aliases y las filas de revisión que generó esta migración.
  --    Los cargados a mano después (source = 'manual' / 'ingest') se conservan.
  DELETE FROM public.venue_aliases     WHERE source = 'migration';
  DELETE FROM public.venue_review_queue WHERE source = 'migration' AND status = 'pending';

  -- 4. Deshacer los centinelas y los slugs.
  UPDATE public.venues SET is_placeholder = FALSE WHERE is_placeholder;
  UPDATE public.venues SET slug = NULL WHERE slug IS NOT NULL;

  DELETE FROM public.venue_merge_log   WHERE migration_tag = v_tag;
  DELETE FROM public.data_migrations   WHERE name = v_tag;

  RAISE NOTICE '--------------------------------------------------';
  RAISE NOTICE 'Eventos restaurados : %', v_restored;
  RAISE NOTICE 'Venues desfusionados: %', v_unmerged;
  RAISE NOTICE 'Venues totales      : %', (SELECT count(*) FROM public.venues);
  RAISE NOTICE 'Geo enriquecida NO revertida — revisar a mano si hace falta:';
  RAISE NOTICE '  SELECT id, name, latitude, longitude FROM venues WHERE latitude IS NOT NULL;';
  RAISE NOTICE '--------------------------------------------------';
END;
$revert$;


-- ============================================================================
-- Reversión del ESQUEMA (opcional — descomentar sólo si se quiere volver
-- al estado exacto anterior a la migración).
--
-- Ojo: el código de ingesta en lib/venues/ llama a resolve_venue_id() vía RPC.
-- Si se tira la función, hay que revertir también el deploy de la app, o la
-- ingesta va a fallar al resolver venues.
-- ============================================================================

-- DROP VIEW  IF EXISTS public.venues_canonical;
--
-- DROP FUNCTION IF EXISTS public.resolve_venue_id(TEXT, TEXT, BOOLEAN, REAL);
-- DROP FUNCTION IF EXISTS public.venue_canonical_of(UUID);
--
-- DROP TABLE IF EXISTS public.venue_merge_log;
-- DROP TABLE IF EXISTS public.venue_review_queue;
-- DROP TABLE IF EXISTS public.venue_aliases;
-- DROP TYPE  IF EXISTS public.venue_review_status;
--
-- DROP INDEX IF EXISTS public.venues_canonical_norm_key;
-- DROP INDEX IF EXISTS public.venues_core_key_idx;
-- DROP INDEX IF EXISTS public.venues_canonical_venue_id_idx;
-- DROP INDEX IF EXISTS public.venues_name_trgm_idx;
--
-- ALTER TABLE public.venues DROP CONSTRAINT IF EXISTS venues_canonical_not_self;
-- ALTER TABLE public.venues
--   DROP COLUMN IF EXISTS slug,
--   DROP COLUMN IF EXISTS canonical_venue_id,
--   DROP COLUMN IF EXISTS merged_at,
--   DROP COLUMN IF EXISTS is_placeholder,
--   DROP COLUMN IF EXISTS updated_at;
--
-- DROP FUNCTION IF EXISTS public.venue_slugify(TEXT);
-- DROP FUNCTION IF EXISTS public.venue_core_key(TEXT);
-- DROP FUNCTION IF EXISTS public.venue_normalize(TEXT);
