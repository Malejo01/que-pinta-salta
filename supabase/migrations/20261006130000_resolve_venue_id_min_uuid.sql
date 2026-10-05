-- QPS-044: resolve_venue_id fallaba con "function min(uuid) does not exist".
--
-- El paso (4) "core key" hacía SELECT count(*), min(v.id) sobre una columna
-- uuid. Postgres no tiene min(uuid) (recién lo agrega PG 18 en adelante), así
-- que cualquier nombre que no matcheara por alias, nombre exacto o puntero
-- legacy abortaba la función antes del autocreate: ningún venue nuevo, ningún
-- caso en venue_review_queue y eventos sin lugar.
--
-- Arreglo: (array_agg(v.id))[1] en vez de min(v.id). El paso solo devuelve el
-- id si count = 1, así que el resultado es idéntico al previsto originalmente.
-- El resto del cuerpo es copia exacta de 20261002190000_venue_canonical.sql.

CREATE OR REPLACE FUNCTION public.resolve_venue_id(
  p_raw         TEXT,
  p_source      TEXT DEFAULT NULL,
  p_autocreate  BOOLEAN DEFAULT FALSE,
  p_threshold   REAL DEFAULT 0.62
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_name      TEXT;
  v_norm      TEXT;
  v_core      TEXT;
  v_id        UUID;
  v_matches   INTEGER;
  v_best_id   UUID;
  v_best_sim  REAL;
BEGIN
  p_raw := public.venue_sanitize(p_raw);
  IF p_raw IS NULL THEN
    RETURN NULL;
  END IF;

  -- Varias fuentes mandan "Teatro del Huerto, Salta, Salta" (nombre + domicilio).
  -- El nombre es lo anterior a la primera coma; el string completo se guarda
  -- como address sólo si hay que crear el venue.
  v_name := public.venue_sanitize(split_part(p_raw, ',', 1));
  v_norm := public.venue_normalize(v_name);
  IF v_norm IS NULL THEN
    RETURN NULL;
  END IF;
  v_core := public.venue_core_key(v_name);

  -- (1) alias exacto
  SELECT va.venue_id INTO v_id
  FROM public.venue_aliases va
  WHERE va.alias_normalized = v_norm
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN public.venue_canonical_of(v_id);
  END IF;

  -- (2) nombre canónico exacto
  SELECT v.id INTO v_id
  FROM public.venues v
  WHERE v.canonical_venue_id IS NULL
    AND NOT v.is_placeholder
    AND public.venue_normalize(v.name) = v_norm
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- (3) fila legacy ya absorbida: el nombre viejo sigue siendo un match válido
  SELECT v.id INTO v_id
  FROM public.venues v
  WHERE v.canonical_venue_id IS NOT NULL
    AND public.venue_normalize(v.name) = v_norm
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN public.venue_canonical_of(v_id);
  END IF;

  -- (4) core key — sólo si es inequívoca
  SELECT count(*), (array_agg(v.id))[1] INTO v_matches, v_id
  FROM public.venues v
  WHERE v.canonical_venue_id IS NULL
    AND NOT v.is_placeholder
    AND public.venue_core_key(v.name) = v_core;
  IF v_matches = 1 THEN
    RETURN v_id;
  END IF;

  -- (5) fuzzy: NO resuelve. Sólo se guarda como sugerencia para revisión.
  SELECT v.id, extensions.similarity(public.venue_normalize(v.name), v_norm)
    INTO v_best_id, v_best_sim
  FROM public.venues v
  WHERE v.canonical_venue_id IS NULL
    AND NOT v.is_placeholder
    AND extensions.similarity(public.venue_normalize(v.name), v_norm) >= p_threshold
  ORDER BY 2 DESC
  LIMIT 1;

  INSERT INTO public.venue_review_queue (raw_name, source, suggested_venue_id, similarity)
  VALUES (v_name, p_source, v_best_id, v_best_sim)
  ON CONFLICT (normalized) DO UPDATE
    SET occurrences        = public.venue_review_queue.occurrences + 1,
        suggested_venue_id = COALESCE(public.venue_review_queue.suggested_venue_id, EXCLUDED.suggested_venue_id),
        similarity         = COALESCE(public.venue_review_queue.similarity, EXCLUDED.similarity);

  IF NOT p_autocreate THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.venues (name, address, slug)
  VALUES (v_name, p_raw, public.venue_slugify(v_name))
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  -- Carrera con otro worker de ingesta: si el índice único lo rechazó,
  -- el venue ya existe y hay que releerlo.
  IF v_id IS NULL THEN
    SELECT v.id INTO v_id FROM public.venues v
    WHERE public.venue_normalize(v.name) = v_norm AND v.canonical_venue_id IS NULL
    LIMIT 1;
  END IF;

  RETURN v_id;
END;
$fn$;

-- Se vuelve a afirmar el control de acceso (SECURITY DEFINER que crea venues).
REVOKE ALL ON FUNCTION public.resolve_venue_id(TEXT, TEXT, BOOLEAN, REAL) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_venue_id(TEXT, TEXT, BOOLEAN, REAL) TO service_role;
