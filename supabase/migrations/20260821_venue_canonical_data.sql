-- ============================================================================
-- Migración de datos: consolidación de venues  (parte 2 de 2)
-- Requiere: 20260821_venue_canonical.sql
-- Revierte:  20260821_venue_canonical_down.sql
-- ============================================================================
--
-- No borra ninguna fila. Por cada cluster de duplicados:
--   - elige un venue canónico,
--   - marca los demás con canonical_venue_id + merged_at,
--   - registra su nombre viejo en venue_aliases,
--   - repuntea events.venue_id al canónico, dejando el valor anterior en
--     venue_merge_log para poder deshacerlo fila por fila.
--
-- ---------------------------------------------------------------------------
-- FALSOS POSITIVOS  — por qué el fuzzy no fusiona solo
-- ---------------------------------------------------------------------------
-- Corriendo similitud de trigramas sobre las 103 filas reales, estos pares dan
-- por encima de 0.35 y son lugares DISTINTOS. Un merge automático por umbral
-- los habría unido y no hay forma de deshacer eso sin este log:
--
--   0.63  "Balcarce 935"        <-> "Balcarce 980"          (dos domicilios)
--   0.50  "Casona del Sur"      <-> "La Casona del Molino"  (dos peñas)
--   0.43  "Museo de Arte MAC"   <-> "Museo de Bellas Artes"
--   0.41  "Museo Arqueológico de Cachi" <-> "Museo de Arqueología de Alta Montaña"
--   0.39  "Casona de Guemes"    <-> "Casona del Sur"
--   0.57  "Amnesia"             <-> "Amnesia Ibiza"         (Salta vs España)
--
-- Por eso el paso automático usa sólo igualdad de clave normalizada / core key,
-- y todo lo demás sale de la lista curada de abajo o va a revisión manual.
-- ============================================================================

DO $migration$
DECLARE
  v_tag        TEXT := '20260821_venue_canonical_data';
  v_canon_id   UUID;
  v_dup        RECORD;
  v_pair       RECORD;
  v_moved      INTEGER;
  v_total_ev   INTEGER := 0;
  v_total_dup  INTEGER := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM public.data_migrations WHERE name = v_tag) THEN
    RAISE NOTICE 'Migración % ya aplicada, no se hace nada.', v_tag;
    RETURN;
  END IF;

  -- -------------------------------------------------------------------------
  -- Paso 1. Centinelas: no son lugares reales.
  -- -------------------------------------------------------------------------
  UPDATE public.venues
     SET is_placeholder = TRUE, updated_at = now()
   WHERE public.venue_normalize(name) IN ('lugar no especificado', 'sin lugar', 'a confirmar');

  -- -------------------------------------------------------------------------
  -- Paso 2. Plan de consolidación curado.
  -- -------------------------------------------------------------------------
  -- (canónico, duplicado) por NOMBRE, no por UUID: los ids son distintos en
  -- cada entorno y esto tiene que poder correrse en staging antes que en prod.
  -- El match es por venue_normalize(), así que las tildes/mayúsculas de esta
  -- lista no importan.
  --
  -- Criterio de elección del canónico: el nombre propio más completo del lugar.
  -- Los conteos son eventos al 2026-08-21, para que se vea qué se está moviendo.
  CREATE TEMP TABLE _venue_plan (canonical TEXT, duplicate TEXT) ON COMMIT DROP;
  INSERT INTO _venue_plan (canonical, duplicate) VALUES
    -- sufijo de ciudad
    ('30 y Pico',                             '30 y Pico Salta'),          -- 9 + 1
    ('Babylon',                               'Babylon Salta'),            -- 13 + 9
    ('Bounce',                                'Bounce Salta'),             -- 6 + 3
    ('Elephant',                              'Elephant Salta'),           -- 0 + 1
    -- tildes / mayúsculas / puntuación
    ('Autódromo de Salta',                    'Autodromo de Salta'),       -- 1 + 1
    ('Fábrica de Música',                     'Fabrica de Musica'),        -- 1 + 2
    ('Salón Templo',                          'Salon Templo'),             -- 1 + 1
    ('Coco Club',                             'CocoClub'),                 -- 14 + 1
    -- artículo inicial
    ('Casona del Sur',                        'La Casona del Sur'),        -- 8 + 0
    ('La Casona de Güemes',                   'Casona de Guemes'),         -- 15 + 0
    ('La Casona de Güemes',                   'La Casona Güemes'),         -- + 1
    -- variantes de nombre comercial
    ('Amnesia Pub & Música',                  'Amnesia'),                  -- 1 + 9
    ('Amnesia Pub & Música',                  'Amnesia Salta'),            -- + 2
    ('Amnesia Pub & Música',                  'Amnesia Pub & Music'),      -- + 5
    ('Bunker Owl Music Bar',                  'Bunker'),                   -- 1 + 2
    ('Bunker Owl Music Bar',                  'Bunker Owl'),               -- + 0
    ('Casagrande Peña',                       'CasaGrande'),               -- 1 + 3
    ('Casagrande Peña',                       'Casa Grande Peña'),         -- + 0
    ('Casagrande Peña',                       'Casagrande Salta'),         -- + 1
    ('Casagrande Peña',                       'casagrande.salta'),         -- + 0
    ('La Mata',                               'La Mata Reggaeton'),        -- 1 + 1
    ('One Club',                              'ONE'),                      -- 0 + 1
    ('One Club',                              'One Oficial Salta'),        -- + 2
    ('Trewa Club',                            'Trewa'),                    -- 4 + 1
    -- nombre parcial: la fuente publica el apodo, no el nombre del lugar
    ('El Patio de la Roka',                   'LA ROKA'),                  -- 3 + 5
    ('El Patio de la Roka',                   'La Roka Salta'),            -- + 1
    ('El Patio de la Roka',                   'Roka'),                     -- + 0
    ('El Patio de la Roka',                   'Salta Roka'),               -- + 2
    ('El Patio de la Roka',                   'Saltaroka'),                -- + 5
    -- iniciales y handle de Instagram
    ('Juan de los Palotes',                   'JP'),                       -- 12 + 2
    ('Juan de los Palotes',                   'juandelospalotes.jp'),      -- + 3
    -- el teatro se renombró en 2023; "de Salta" es el nombre viejo y además
    -- es la única de las tres filas que trae lat/lng (Zuviría 70). El paso 3
    -- copia esa geo al canónico antes de absorberla.
    ('Teatro Provincial Juan Carlos Saravia', 'Teatro Provincial JCS'),    -- 57 + 1
    ('Teatro Provincial Juan Carlos Saravia', 'Teatro Provincial de Salta');-- + 0

  -- -------------------------------------------------------------------------
  -- Paso 3. Aplicar el plan.
  -- -------------------------------------------------------------------------
  FOR v_pair IN SELECT * FROM _venue_plan LOOP
    SELECT id INTO v_canon_id FROM public.venues
     WHERE public.venue_normalize(name) = public.venue_normalize(v_pair.canonical)
       AND canonical_venue_id IS NULL
     LIMIT 1;

    IF v_canon_id IS NULL THEN
      RAISE NOTICE 'Canónico no encontrado, se saltea: %', v_pair.canonical;
      CONTINUE;
    END IF;

    SELECT * INTO v_dup FROM public.venues
     WHERE public.venue_normalize(name) = public.venue_normalize(v_pair.duplicate)
       AND canonical_venue_id IS NULL
       AND id <> v_canon_id
     LIMIT 1;

    IF NOT FOUND THEN
      CONTINUE;   -- ya fusionado o no existe en este entorno
    END IF;

    -- El duplicado puede traer datos que al canónico le faltan (el caso
    -- "Teatro Provincial de Salta", que tiene lat/lng y el canónico no).
    -- Se copia sólo lo que esté vacío del lado canónico: nunca se pisa.
    UPDATE public.venues c SET
        address         = COALESCE(NULLIF(btrim(c.address), ''), v_dup.address),
        latitude        = COALESCE(c.latitude,  v_dup.latitude),
        longitude       = COALESCE(c.longitude, v_dup.longitude),
        google_maps_url = COALESCE(c.google_maps_url, v_dup.google_maps_url),
        phone           = COALESCE(c.phone,     v_dup.phone),
        capacity        = COALESCE(c.capacity,  v_dup.capacity),
        updated_at      = now()
      WHERE c.id = v_canon_id
        -- si address del canónico es sólo el nombre repetido, no aporta nada
        AND (v_dup.latitude IS NOT NULL OR v_dup.longitude IS NOT NULL
             OR v_dup.google_maps_url IS NOT NULL OR v_dup.phone IS NOT NULL
             OR v_dup.capacity IS NOT NULL);

    -- Repuntear eventos, guardando el origen para poder revertir.
    INSERT INTO public.venue_merge_log (migration_tag, entity, entity_id, from_venue_id, to_venue_id)
    SELECT v_tag, 'event', e.id, e.venue_id, v_canon_id
      FROM public.events e WHERE e.venue_id = v_dup.id;

    UPDATE public.events SET venue_id = v_canon_id WHERE venue_id = v_dup.id;
    GET DIAGNOSTICS v_moved = ROW_COUNT;
    v_total_ev := v_total_ev + v_moved;

    -- El nombre viejo pasa a ser alias: es exactamente lo que las fuentes
    -- van a seguir mandando en el próximo scrape.
    INSERT INTO public.venue_aliases (venue_id, alias, source)
    VALUES (v_canon_id, v_dup.name, 'migration')
    ON CONFLICT (alias_normalized) DO NOTHING;

    -- Marcar el duplicado. La fila queda; sólo deja de ser canónica.
    INSERT INTO public.venue_merge_log (migration_tag, entity, entity_id, from_venue_id, to_venue_id)
    VALUES (v_tag, 'venue', v_dup.id, NULL, v_canon_id);

    UPDATE public.venues
       SET canonical_venue_id = v_canon_id, merged_at = now(), updated_at = now()
     WHERE id = v_dup.id;

    v_total_dup := v_total_dup + 1;
    RAISE NOTICE '  % <- %  (% eventos)', v_pair.canonical, v_dup.name, v_moved;
  END LOOP;

  -- -------------------------------------------------------------------------
  -- Paso 4. Barrido automático: colisiones exactas de clave normalizada que
  -- el plan curado no haya cubierto (p. ej. filas creadas después de escribir
  -- esta migración). Sólo igualdad exacta — nunca fuzzy. Gana la fila con más
  -- eventos, y a igualdad la más antigua, para que sea determinista.
  -- -------------------------------------------------------------------------
  FOR v_pair IN
    WITH ranked AS (
      SELECT v.id, v.name, public.venue_normalize(v.name) AS k,
             (SELECT count(*) FROM public.events e WHERE e.venue_id = v.id) AS n_ev,
             v.created_at
        FROM public.venues v
       WHERE v.canonical_venue_id IS NULL AND NOT v.is_placeholder
    ), winners AS (
      SELECT DISTINCT ON (k) k, id AS canon_id FROM ranked
       ORDER BY k, n_ev DESC, created_at ASC
    )
    SELECT r.id AS dup_id, r.name AS dup_name, w.canon_id
      FROM ranked r JOIN winners w USING (k)
     WHERE r.id <> w.canon_id
  LOOP
    INSERT INTO public.venue_merge_log (migration_tag, entity, entity_id, from_venue_id, to_venue_id)
    SELECT v_tag, 'event', e.id, e.venue_id, v_pair.canon_id
      FROM public.events e WHERE e.venue_id = v_pair.dup_id;

    UPDATE public.events SET venue_id = v_pair.canon_id WHERE venue_id = v_pair.dup_id;
    GET DIAGNOSTICS v_moved = ROW_COUNT;
    v_total_ev := v_total_ev + v_moved;

    INSERT INTO public.venue_aliases (venue_id, alias, source)
    VALUES (v_pair.canon_id, v_pair.dup_name, 'migration')
    ON CONFLICT (alias_normalized) DO NOTHING;

    INSERT INTO public.venue_merge_log (migration_tag, entity, entity_id, from_venue_id, to_venue_id)
    VALUES (v_tag, 'venue', v_pair.dup_id, NULL, v_pair.canon_id);

    UPDATE public.venues
       SET canonical_venue_id = v_pair.canon_id, merged_at = now(), updated_at = now()
     WHERE id = v_pair.dup_id;

    v_total_dup := v_total_dup + 1;
    RAISE NOTICE '  [auto] % absorbido (% eventos)', v_pair.dup_name, v_moved;
  END LOOP;

  -- Aplanar cualquier cadena A->B->C que el orden del plan haya podido crear.
  -- venue_canonical_of() asume un solo salto.
  UPDATE public.venues d
     SET canonical_venue_id = p.canonical_venue_id
    FROM public.venues p
   WHERE d.canonical_venue_id = p.id
     AND p.canonical_venue_id IS NOT NULL
     AND p.canonical_venue_id <> d.id;

  -- -------------------------------------------------------------------------
  -- Paso 5. Ortografía canónica.
  -- -------------------------------------------------------------------------
  -- Cuando las dos filas de un par normalizan a la MISMA clave (o sea, sólo se
  -- diferencian en tildes), el plan no puede desempatar: los dos lados matchean
  -- por venue_normalize() y el LIMIT 1 elige cualquiera. Sin este paso el sitio
  -- podía terminar mostrando "Autodromo de Salta" o "Fabrica de Musica".
  --
  -- Acá se fija la grafía de display por clave normalizada, después de fusionar,
  -- así el resultado no depende de qué fila ganó. No cambia ninguna clave de
  -- match: las tildes se van igual en venue_normalize().
  UPDATE public.venues v SET name = p.preferred, updated_at = now()
    FROM (VALUES
      ('autodromo de salta',  'Autódromo de Salta'),
      ('fabrica de musica',   'Fábrica de Música'),
      ('salon templo',        'Salón Templo'),
      ('casagrande pena',     'Casagrande Peña'),
      ('la casona de guemes', 'La Casona de Güemes'),
      ('amnesia pub musica',  'Amnesia Pub & Música'),
      ('museo antropologico', 'Museo Antropológico')
    ) AS p(key, preferred)
   WHERE v.canonical_venue_id IS NULL
     AND public.venue_normalize(v.name) = p.key
     AND v.name IS DISTINCT FROM p.preferred;

  -- -------------------------------------------------------------------------
  -- Paso 6. Slug para todo venue canónico. Se desempata con sufijo numérico.
  -- -------------------------------------------------------------------------
  UPDATE public.venues v SET slug = s.new_slug, updated_at = now()
    FROM (
      SELECT id,
             CASE WHEN rn = 1 THEN base ELSE base || '-' || rn END AS new_slug
        FROM (
          SELECT id, public.venue_slugify(name) AS base,
                 row_number() OVER (PARTITION BY public.venue_slugify(name)
                                    ORDER BY created_at, id) AS rn
            FROM public.venues
           WHERE canonical_venue_id IS NULL
        ) t
    ) s
   WHERE v.id = s.id AND v.slug IS DISTINCT FROM s.new_slug;

  -- -------------------------------------------------------------------------
  -- Paso 7. Encolar para revisión manual lo que quedó sin resolver.
  -- -------------------------------------------------------------------------
  -- (a) venues canónicos sin actividad y sin geo: candidatos a ser basura de
  --     ingesta, pero la decisión es humana.
  INSERT INTO public.venue_review_queue (raw_name, source, legacy_venue_id, notes)
  SELECT v.name, 'migration', v.id,
         'Venue canónico sin eventos ni coordenadas. ¿Es un lugar real o ruido de ingesta?'
    FROM public.venues v
   WHERE v.canonical_venue_id IS NULL
     AND NOT v.is_placeholder
     AND v.latitude IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.events e WHERE e.venue_id = v.id)
  ON CONFLICT (normalized) DO NOTHING;

  -- (b) pares fuzzy que quedaron sin fusionar: sugerencia explícita con su
  --     similitud, para que la revisión no tenga que redescubrirlos.
  INSERT INTO public.venue_review_queue (raw_name, source, legacy_venue_id, suggested_venue_id, similarity, notes)
  SELECT DISTINCT ON (public.venue_normalize(a.name))
         a.name, 'migration', a.id, b.id,
         similarity(public.venue_normalize(a.name), public.venue_normalize(b.name)),
         'Posible duplicado por similitud. NO se fusionó automáticamente: verificar que sea el mismo lugar.'
    FROM public.venues a
    JOIN public.venues b
      ON b.canonical_venue_id IS NULL AND NOT b.is_placeholder
     AND a.id <> b.id
     AND similarity(public.venue_normalize(a.name), public.venue_normalize(b.name)) >= 0.55
   WHERE a.canonical_venue_id IS NULL AND NOT a.is_placeholder
   ORDER BY public.venue_normalize(a.name),
            similarity(public.venue_normalize(a.name), public.venue_normalize(b.name)) DESC
  ON CONFLICT (normalized) DO NOTHING;

  -- (c) casos concretos del audit que el fuzzy no alcanza pero que un humano
  --     tiene que mirar sí o sí.
  INSERT INTO public.venue_review_queue (raw_name, source, legacy_venue_id, notes)
  SELECT v.name, 'migration', v.id, x.note
    FROM (VALUES
      ('Amnesia Ibiza',             'Club de Ibiza (España), NO es el Amnesia de Salta. Decidir si el lugar corresponde a esta agenda.'),
      ('Poble Espanyol',            'Recinto de Barcelona. Probable ruido de una cuenta de Instagram internacional.'),
      ('Autódromo M. M. de Güemes', 'Casi seguro el mismo lugar que "Autódromo de Salta". Confirmar y agregar como alias.'),
      ('Baby',                      'Nombre demasiado corto. ¿Es "Babylon" o un lugar propio?'),
      ('Elephant + One',            'Parece una fiesta conjunta de dos lugares, no un venue. Revisar los eventos asociados.'),
      ('Bresh',                     'Fiesta itinerante, no un lugar fijo. Definir si va como venue o como tag.'),
      ('Balcarce 935',              'Sólo domicilio, sin nombre de lugar. Identificar a qué venue corresponde.'),
      ('Balcarce 980',              'Sólo domicilio, sin nombre de lugar. Identificar a qué venue corresponde.'),
      ('General Guemes 485',        'Sólo domicilio, sin nombre de lugar. Identificar a qué venue corresponde.'),
      ('Salon',                     'Genérico. Identificar el lugar real.'),
      ('Centro Comercial',          'Genérico. Identificar el lugar real.')
    ) AS x(nm, note)
    JOIN public.venues v ON public.venue_normalize(v.name) = public.venue_normalize(x.nm)
  ON CONFLICT (normalized) DO UPDATE
    SET notes = EXCLUDED.notes, legacy_venue_id = EXCLUDED.legacy_venue_id;

  INSERT INTO public.data_migrations (name, notes)
  VALUES (v_tag, format('%s venues absorbidos, %s eventos repunteados', v_total_dup, v_total_ev));

  RAISE NOTICE '--------------------------------------------------';
  RAISE NOTICE 'Venues absorbidos : %', v_total_dup;
  RAISE NOTICE 'Eventos movidos   : %', v_total_ev;
  RAISE NOTICE 'Venues canónicos  : %', (SELECT count(*) FROM public.venues WHERE canonical_venue_id IS NULL AND NOT is_placeholder);
  RAISE NOTICE 'En revisión manual: %', (SELECT count(*) FROM public.venue_review_queue WHERE status = 'pending');
  RAISE NOTICE '--------------------------------------------------';
END;
$migration$;


-- ---------------------------------------------------------------------------
-- Vista de conveniencia: el registro canónico, con actividad y aliases.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.venues_canonical AS
SELECT v.id, v.name, v.slug, v.address, v.latitude, v.longitude,
       v.google_maps_url, v.phone, v.capacity, v.created_at,
       (SELECT count(*) FROM public.events e WHERE e.venue_id = v.id)        AS event_count,
       (SELECT count(*) FROM public.venue_aliases a WHERE a.venue_id = v.id) AS alias_count
  FROM public.venues v
 WHERE v.canonical_venue_id IS NULL AND NOT v.is_placeholder;
