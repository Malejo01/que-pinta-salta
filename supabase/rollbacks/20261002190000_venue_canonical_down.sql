-- ============================================================================
-- REVERSIÓN de la normalización canónica de venues
-- Deshace: 20261002190100_venue_canonical_data.sql (+ opcional el esquema de
--          20261002190000_venue_canonical.sql)
-- ============================================================================
--
-- Está en supabase/rollbacks/ y no en supabase/migrations/ a propósito: ahí el
-- CLI lo aplicaría como una migración más, justo después de la que revierte.
--
-- Es exacta: la migración no borró filas y dejó en venue_merge_log todo lo que
-- cambió —eventos repunteados (from_venue_id), duplicados marcados, y en
-- old_values los valores previos de cada venue modificado (domicilio, geo,
-- teléfono), de cada renombre y de cada default_venue_name de las cuentas de
-- Instagram—.
--
-- Uso (contra la base que corresponda; en prod con la connection string):
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/rollbacks/20261002190000_venue_canonical_down.sql
-- Y después, para que el historial del CLI quede coherente:
--   npx supabase migration repair --db-url "$DB_URL" --status reverted 20261002190100
--
-- Por defecto revierte SOLO los datos y deja el esquema nuevo (tablas,
-- funciones) en su lugar. El código desplegado sigue funcionando: resolve_venue_id
-- existe. Para tirar también el esquema, descomentar el bloque final (y antes
-- revertir el deploy, porque la ingesta llama a resolve_venue_id por RPC).
-- ============================================================================

-- Al desfusionar vuelven a coexistir filas canónicas con la misma clave
-- ("Autódromo de Salta" / "Autodromo de Salta"): el índice único las rechazaría.
DROP INDEX IF EXISTS public.venues_canonical_norm_key;

DO $revert$
DECLARE
  v_tag       TEXT := '20261002190100_venue_canonical_data';
  v_n         INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.data_migrations WHERE name = v_tag) THEN
    RAISE NOTICE 'La migración % no figura como aplicada. Nada que revertir.', v_tag;
    RETURN;
  END IF;

  -- 1. Eventos a su venue original (si uno se movió dos veces, gana el
  --    registro más antiguo: tiene el venue_id previo a todo).
  WITH first_move AS (
    SELECT DISTINCT ON (entity_id) entity_id, from_venue_id
      FROM public.venue_merge_log
     WHERE migration_tag = v_tag AND entity = 'event'
     ORDER BY entity_id, created_at ASC, id
  )
  UPDATE public.events e
     SET venue_id = f.from_venue_id
    FROM first_move f
   WHERE e.id = f.entity_id
     AND e.venue_id IS DISTINCT FROM f.from_venue_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Eventos restaurados        : %', v_n;

  -- 2. Domicilio/geo/teléfono de los canónicos: el primer old_values de cada
  --    uno es el valor previo a la migración.
  WITH first_update AS (
    SELECT DISTINCT ON (entity_id) entity_id, old_values
      FROM public.venue_merge_log
     WHERE migration_tag = v_tag AND entity = 'venue_update'
     ORDER BY entity_id, created_at ASC, id
  )
  UPDATE public.venues v SET
      address         = f.old_values->>'address',
      latitude        = (f.old_values->>'latitude')::double precision,
      longitude       = (f.old_values->>'longitude')::double precision,
      google_maps_url = f.old_values->>'google_maps_url',
      phone           = f.old_values->>'phone',
      capacity        = (f.old_values->>'capacity')::integer,
      updated_at      = now()
    FROM first_update f
   WHERE v.id = f.entity_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Venues con datos restaurados: %', v_n;

  -- 3. Renombres de display.
  UPDATE public.venues v SET name = l.old_values->>'name', updated_at = now()
    FROM public.venue_merge_log l
   WHERE l.migration_tag = v_tag AND l.entity = 'venue_rename' AND v.id = l.entity_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Renombres revertidos       : %', v_n;

  -- 4. default_venue_name de las cuentas de Instagram.
  UPDATE public.instagram_accounts a SET default_venue_name = l.old_values->>'default_venue_name'
    FROM public.venue_merge_log l
   WHERE l.migration_tag = v_tag AND l.entity = 'instagram_account' AND a.id = l.entity_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Cuentas IG restauradas     : %', v_n;

  -- 5. Duplicados: vuelven a ser venues independientes.
  UPDATE public.venues
     SET canonical_venue_id = NULL, merged_at = NULL, updated_at = now()
   WHERE id IN (SELECT entity_id FROM public.venue_merge_log
                 WHERE migration_tag = v_tag AND entity = 'venue');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Venues desfusionados       : %', v_n;

  -- 6. Aliases y revisión que generó la migración (los manuales se conservan),
  --    centinelas y slugs.
  DELETE FROM public.venue_aliases      WHERE source = 'migration';
  DELETE FROM public.venue_review_queue WHERE source = 'migration' AND status = 'pending';
  UPDATE public.venues SET is_placeholder = FALSE WHERE is_placeholder;
  UPDATE public.venues SET slug = NULL WHERE slug IS NOT NULL;

  DELETE FROM public.venue_merge_log WHERE migration_tag = v_tag;
  DELETE FROM public.data_migrations WHERE name = v_tag;

  RAISE NOTICE 'Venues totales             : %', (SELECT count(*) FROM public.venues);
END;
$revert$;

DROP VIEW IF EXISTS public.venues_canonical;


-- ============================================================================
-- Reversión del ESQUEMA (opcional). Antes, revertir el deploy de la app: la
-- ingesta llama a resolve_venue_id() por RPC. Después:
--   npx supabase migration repair --db-url "$DB_URL" --status reverted 20261002190000
-- ============================================================================

-- DROP FUNCTION IF EXISTS public.resolve_venue_id(TEXT, TEXT, BOOLEAN, REAL);
-- DROP FUNCTION IF EXISTS public.venue_canonical_of(UUID);
-- DROP TABLE IF EXISTS public.venue_merge_log;
-- DROP TABLE IF EXISTS public.venue_review_queue;
-- DROP TABLE IF EXISTS public.venue_aliases;
-- DROP TYPE  IF EXISTS public.venue_review_status;
-- DROP INDEX IF EXISTS public.venues_core_key_idx;
-- DROP INDEX IF EXISTS public.venues_canonical_venue_id_idx;
-- DROP INDEX IF EXISTS public.venues_name_trgm_idx;
-- ALTER TABLE public.venues DROP CONSTRAINT IF EXISTS venues_canonical_not_self;
-- ALTER TABLE public.venues
--   DROP COLUMN IF EXISTS slug,
--   DROP COLUMN IF EXISTS canonical_venue_id,
--   DROP COLUMN IF EXISTS merged_at,
--   DROP COLUMN IF EXISTS is_placeholder,
--   DROP COLUMN IF EXISTS updated_at;
-- DROP FUNCTION IF EXISTS public.venue_useful_address(TEXT, TEXT);
-- DROP FUNCTION IF EXISTS public.venue_slugify(TEXT);
-- DROP FUNCTION IF EXISTS public.venue_core_key(TEXT);
-- DROP FUNCTION IF EXISTS public.venue_normalize(TEXT);
-- DROP FUNCTION IF EXISTS public.venue_sanitize(TEXT);
