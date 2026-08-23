-- ============================================================================
-- Normalización canónica de venues  (Track A — fix/venue-canonical)
-- ============================================================================
--
-- Problema
-- --------
-- `venues` acumuló 103 filas para ~70 lugares reales. La ingesta multi-fuente
-- crea un venue nuevo cada vez que el string crudo difiere en un carácter:
--   - tildes:         "Autodromo de Salta"  vs "Autódromo de Salta"
--   - sufijo ciudad:  "Amnesia"             vs "Amnesia Salta"
--   - mayúsculas:     "LA ROKA"             vs "La Roka Salta"
--   - handle de IG:   "Juan de los Palotes" vs "juandelospalotes.jp"
--   - nombre parcial: "Roka" / "Salta Roka" vs "El Patio de la Roka"
--
-- Eso rompe la agregación por espacio y, peor, la deduplicación de eventos:
-- findDuplicateEvent() compara (venue_id, fecha), así que dos filas de venue
-- distintas para el mismo lugar dejan pasar el mismo evento dos veces.
--
-- Qué hace esta migración
-- -----------------------
-- 1. Extiende `venues` in-place con slug + puntero canónico. NO crea una tabla
--    `venues` nueva: 803 filas de `events` tienen FK a esta tabla y ~15 sitios
--    del código leen `venues.name`. Reemplazarla rompería todo eso sin ganar
--    nada. La columna canónica sigue llamándose `name`.
-- 2. Crea `venue_aliases` (alias -> venue_id) con clave normalizada única.
-- 3. Crea `venue_review_queue` para lo que no resuelve automáticamente.
-- 4. Crea `venue_merge_log`: registro fila-por-fila de cada evento repunteado,
--    que es lo que hace reversible la migración de datos.
-- 5. Publica `resolve_venue_id(text)`, el único punto de resolución.
--
-- Qué NO hace
-- -----------
-- No borra ni una fila. Los duplicados quedan en `venues` con
-- `canonical_venue_id` apuntando al venue bueno y `merged_at` sellado.
-- El fuzzy NUNCA fusiona solo: sólo sugiere hacia `venue_review_queue`.
-- Ver el bloque "FALSOS POSITIVOS" en la parte 2 para por qué eso no es opcional.
--
-- Reversión
-- ---------
-- supabase/migrations/20260821_venue_canonical_down.sql
--
-- Aplicación
-- ----------
-- Idempotente y guardada contra doble ejecución vía `data_migrations`.
-- Aplicar fuera de las ventanas de cron (00:00 y 08:00 UTC).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS public.data_migrations (
  name       TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes      TEXT
);
ALTER TABLE public.data_migrations ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- 1. Funciones de normalización
-- ---------------------------------------------------------------------------
-- IMMUTABLE a propósito: se usan en índices y columnas generadas.
-- Por eso NO se usa unaccent(), que es STABLE (depende de un diccionario
-- recargable) y no puede indexarse sin envolverla en un wrapper mentiroso.
-- translate() cubre el set que realmente aparece en las fuentes y es
-- determinista por construcción.

CREATE OR REPLACE FUNCTION public.venue_normalize(raw TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $fn$
  SELECT NULLIF(
    -- 4. colapsar espacios y recortar
    btrim(regexp_replace(
      -- 3. todo lo que no sea alfanumérico pasa a ser separador
      regexp_replace(
        -- 2. quitar diacríticos (equivalente a NFD + strip U+0300..U+036F)
        translate(
          -- 1. lowercase
          lower(COALESCE(raw, '')),
          'áàäâãåéèëêíìïîóòöôõúùüûñçýÿšžāēīōūăşţğ',
          'aaaaaaeeeeiiiiooooouuuuncyyszaeiouastg'
        ),
        '[^a-z0-9]+', ' ', 'g'
      ),
      '\s+', ' ', 'g'
    )),
  '');
$fn$;

COMMENT ON FUNCTION public.venue_normalize(TEXT) IS
  'Clave de match exacto: lowercase + sin diacríticos + puntuación a espacio + espacios colapsados. "Amnesia Pub & Música" -> "amnesia pub musica".';


-- Clave "núcleo": además saca artículo inicial y sufijo/prefijo de ciudad.
-- Es la que hace que "Amnesia" y "Amnesia Salta" caigan en el mismo bucket.
-- Se mantiene separada de venue_normalize() porque es más agresiva y sólo se
-- consulta si el match exacto ya falló.
CREATE OR REPLACE FUNCTION public.venue_core_key(raw TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $fn$
  SELECT NULLIF(btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(public.venue_normalize(raw), '^(el|la|los|las) ', ''),
        ' (salta salta|salta capital|salta|oficial salta|oficial|argentina)$', ''
      ),
      '^salta ', ''
    ),
    '\s+', ' ', 'g')), '');
$fn$;

COMMENT ON FUNCTION public.venue_core_key(TEXT) IS
  'Clave de match relajado: venue_normalize() menos artículo inicial y sufijo de ciudad. "La Casona de Güemes"/"Casona de Guemes" -> "casona de guemes".';


-- Muchas filas guardan el propio nombre en `address` ("Amnesia" -> addr
-- "Amnesia", "LA ROKA" -> addr "LA ROKA, salta, Salta"): eso no es un
-- domicilio, es ruido de la ingesta. Devuelve NULL en ese caso para que un
-- COALESCE pueda preferir un domicilio de verdad aunque venga de otra fila.
CREATE OR REPLACE FUNCTION public.venue_useful_address(p_name TEXT, p_address TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $fn$
  SELECT CASE
    WHEN p_address IS NULL OR btrim(p_address) = ''                    THEN NULL
    WHEN public.venue_core_key(p_address) = public.venue_core_key(p_name) THEN NULL
    ELSE btrim(p_address)
  END;
$fn$;


CREATE OR REPLACE FUNCTION public.venue_slugify(raw TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $fn$
  SELECT left(replace(public.venue_normalize(raw), ' ', '-'), 100);
$fn$;


-- ---------------------------------------------------------------------------
-- 2. Esquema canónico sobre `venues`
-- ---------------------------------------------------------------------------
-- El pedido original era `venues(id, nombre_canonico, slug, direccion, lat, lng)`.
-- Se mapea sobre las columnas que ya existen para no romper `events.venue_id`
-- ni el código que lee `venue.name` / `venue.address` / `venue.latitude`:
--     nombre_canonico -> name
--     direccion       -> address
--     lat / lng       -> latitude / longitude
-- Lo único que faltaba es `slug`, que se agrega acá.

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS slug               TEXT,
  ADD COLUMN IF NOT EXISTS canonical_venue_id UUID REFERENCES public.venues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merged_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_placeholder     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ NOT NULL DEFAULT now();

COMMENT ON COLUMN public.venues.canonical_venue_id IS
  'NULL = esta fila ES canónica. No NULL = duplicado absorbido; apunta al venue bueno. La fila nunca se borra.';
COMMENT ON COLUMN public.venues.is_placeholder IS
  'TRUE para centinelas que no son lugares reales ("Lugar no especificado"). Se excluyen del registro canónico.';

-- Un venue no puede ser su propio canónico.
ALTER TABLE public.venues DROP CONSTRAINT IF EXISTS venues_canonical_not_self;
ALTER TABLE public.venues ADD CONSTRAINT venues_canonical_not_self
  CHECK (canonical_venue_id IS NULL OR canonical_venue_id <> id);

-- Índice único sólo sobre las filas canónicas: los duplicados absorbidos
-- conservan su nombre viejo y no deben competir por la clave.
CREATE UNIQUE INDEX IF NOT EXISTS venues_canonical_norm_key
  ON public.venues (public.venue_normalize(name))
  WHERE canonical_venue_id IS NULL;

CREATE INDEX IF NOT EXISTS venues_core_key_idx
  ON public.venues (public.venue_core_key(name))
  WHERE canonical_venue_id IS NULL;

CREATE INDEX IF NOT EXISTS venues_canonical_venue_id_idx
  ON public.venues (canonical_venue_id) WHERE canonical_venue_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS venues_name_trgm_idx
  ON public.venues USING gin (public.venue_normalize(name) gin_trgm_ops);

-- Se define acá y no junto al resto de las funciones porque el cuerpo de una
-- función SQL se valida al crearla, y `canonical_venue_id` recién existe
-- después del ALTER TABLE de arriba.
-- Sigue el puntero canónico un salto: la migración de datos garantiza que no
-- hay cadenas de más de un salto (ver paso 4 de la parte 2).
CREATE OR REPLACE FUNCTION public.venue_canonical_of(p_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
AS $fn$
  SELECT COALESCE(v.canonical_venue_id, v.id) FROM public.venues v WHERE v.id = p_id;
$fn$;


-- ---------------------------------------------------------------------------
-- 3. venue_aliases
-- ---------------------------------------------------------------------------
-- Tabla propia y no la `aliases` genérica que ya existe: aquélla usa
-- (alias, target_type, target_id) sin clave normalizada ni unicidad, y su
-- consumo actual es por regex de palabra sobre el título del evento para
-- clasificar categorías. Mezclar los dos usos obligaría a que el match de
-- venues herede esa semántica de substring, que es justo la que produce los
-- falsos positivos que esta migración viene a evitar.

CREATE TABLE IF NOT EXISTS public.venue_aliases (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id         UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  alias            TEXT NOT NULL,
  alias_normalized TEXT GENERATED ALWAYS AS (public.venue_normalize(alias)) STORED,
  source           TEXT NOT NULL DEFAULT 'manual',   -- manual | migration | ingest
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- El alias normalizado es la clave de resolución: tiene que ser único global.
CREATE UNIQUE INDEX IF NOT EXISTS venue_aliases_normalized_key
  ON public.venue_aliases (alias_normalized);
CREATE INDEX IF NOT EXISTS venue_aliases_venue_id_idx
  ON public.venue_aliases (venue_id);

ALTER TABLE public.venue_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "venue_aliases lectura publica" ON public.venue_aliases;
CREATE POLICY "venue_aliases lectura publica"
  ON public.venue_aliases FOR SELECT USING (true);

DROP POLICY IF EXISTS "venue_aliases escritura admin" ON public.venue_aliases;
CREATE POLICY "venue_aliases escritura admin"
  ON public.venue_aliases FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'ADMIN'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'ADMIN'));


-- ---------------------------------------------------------------------------
-- 4. venue_review_queue
-- ---------------------------------------------------------------------------

DO $blk$ BEGIN
  CREATE TYPE public.venue_review_status AS ENUM ('pending', 'resolved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $blk$;

CREATE TABLE IF NOT EXISTS public.venue_review_queue (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_name            TEXT NOT NULL,
  normalized          TEXT GENERATED ALWAYS AS (public.venue_normalize(raw_name)) STORED,
  source              TEXT,                      -- norteticket | instagram-ai | ...
  legacy_venue_id     UUID REFERENCES public.venues(id) ON DELETE SET NULL,
  suggested_venue_id  UUID REFERENCES public.venues(id) ON DELETE SET NULL,
  similarity          REAL,
  occurrences         INTEGER NOT NULL DEFAULT 1,
  status              public.venue_review_status NOT NULL DEFAULT 'pending',
  resolved_venue_id   UUID REFERENCES public.venues(id) ON DELETE SET NULL,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at         TIMESTAMPTZ,
  reviewed_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Un string crudo entra una sola vez; las repeticiones suben `occurrences`.
CREATE UNIQUE INDEX IF NOT EXISTS venue_review_queue_normalized_key
  ON public.venue_review_queue (normalized);
CREATE INDEX IF NOT EXISTS venue_review_queue_status_idx
  ON public.venue_review_queue (status) WHERE status = 'pending';

ALTER TABLE public.venue_review_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "venue_review_queue solo admin" ON public.venue_review_queue;
CREATE POLICY "venue_review_queue solo admin"
  ON public.venue_review_queue FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'ADMIN'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'ADMIN'));


-- ---------------------------------------------------------------------------
-- 5. venue_merge_log  (lo que hace reversible el paso de datos)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.venue_merge_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_tag  TEXT NOT NULL,
  entity         TEXT NOT NULL,          -- 'event' | 'venue'
  entity_id      UUID NOT NULL,
  from_venue_id  UUID,
  to_venue_id    UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS venue_merge_log_tag_idx ON public.venue_merge_log (migration_tag);
CREATE INDEX IF NOT EXISTS venue_merge_log_entity_idx ON public.venue_merge_log (entity, entity_id);
ALTER TABLE public.venue_merge_log ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- 6. resolve_venue_id(text) — punto único de resolución
-- ---------------------------------------------------------------------------
-- Orden de intentos, del más estricto al más laxo. Se corta en el primero que
-- dé un resultado ÚNICO:
--   1. alias exacto normalizado           (venue_aliases)
--   2. nombre canónico exacto normalizado (venues)
--   3. fila legacy ya absorbida           (sigue canonical_venue_id)
--   4. core key exacta                    (sin artículo ni sufijo de ciudad)
--   5. fuzzy trigram >= p_threshold       -> SÓLO sugiere, no resuelve
--
-- `p_autocreate` en TRUE crea el venue si no hubo ningún match; en FALSE
-- devuelve NULL. La ingesta lo llama en TRUE porque un evento sin venue_id no
-- se puede deduplicar, y eso es peor que un venue de más — pero el string
-- igual queda encolado en venue_review_queue para curaduría.

CREATE OR REPLACE FUNCTION public.resolve_venue_id(
  p_raw         TEXT,
  p_source      TEXT DEFAULT NULL,
  p_autocreate  BOOLEAN DEFAULT FALSE,
  p_threshold   REAL DEFAULT 0.62
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  IF p_raw IS NULL OR btrim(p_raw) = '' THEN
    RETURN NULL;
  END IF;

  -- Varias fuentes mandan "Teatro del Huerto, Salta, Salta" (nombre + domicilio).
  -- El nombre es lo anterior a la primera coma; el string completo se guarda
  -- como address sólo si hay que crear el venue.
  v_name := btrim(split_part(p_raw, ',', 1));
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
  SELECT count(*), min(v.id) INTO v_matches, v_id
  FROM public.venues v
  WHERE v.canonical_venue_id IS NULL
    AND NOT v.is_placeholder
    AND public.venue_core_key(v.name) = v_core;
  IF v_matches = 1 THEN
    RETURN v_id;
  END IF;

  -- (5) fuzzy: NO resuelve. Sólo se guarda como sugerencia para revisión.
  SELECT v.id, similarity(public.venue_normalize(v.name), v_norm)
    INTO v_best_id, v_best_sim
  FROM public.venues v
  WHERE v.canonical_venue_id IS NULL
    AND NOT v.is_placeholder
    AND similarity(public.venue_normalize(v.name), v_norm) >= p_threshold
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
  VALUES (v_name, btrim(p_raw), public.venue_slugify(v_name))
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

REVOKE ALL ON FUNCTION public.resolve_venue_id(TEXT, TEXT, BOOLEAN, REAL) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_venue_id(TEXT, TEXT, BOOLEAN, REAL) TO service_role;
