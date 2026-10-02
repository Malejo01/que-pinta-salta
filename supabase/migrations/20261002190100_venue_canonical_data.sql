-- ============================================================================
-- Migración de datos: consolidación de venues  (Sprint 3 / 3.2, parte 2 de 2)
-- Requiere: 20261002190000_venue_canonical.sql
-- Revierte:  supabase/rollbacks/20261002190000_venue_canonical_down.sql
-- ============================================================================
--
-- No borra ninguna fila. Por cada par (canónico <- duplicado) del plan:
--   - repuntea events.venue_id al canónico (valor previo en venue_merge_log),
--   - copia al canónico lo que le falte (domicilio, geo, teléfono) y guarda
--     los valores previos en venue_merge_log.old_values,
--   - registra el nombre del duplicado como alias (es lo que las fuentes van a
--     seguir mandando),
--   - marca el duplicado con canonical_venue_id + merged_at.
--
-- Plan regenerado el 2026-10-02 contra los 145 venues de prod (la rama
-- original era de 103). Incluye los duplicados que encontró la auditoría y los
-- venues que son direcciones sueltas: se crearon el 2026-09-15 porque el
-- default_venue_name de 16 cuentas de Instagram era el domicilio del lugar
-- (amnesiasalta -> "Balcarce 899", lametrosalta -> "Marcelino Freyre ...").
-- Cada uno se asigna a la cuenta que lo originó (eventos -> flyer -> cuenta).
--
-- FALSOS POSITIVOS: el fuzzy NUNCA fusiona solo. Pares parecidos que son
-- lugares distintos (ver la rama original): "Casona del Sur" / "La Casona del
-- Molino", "Museo de Arte MAC" / "Museo de Bellas Artes", "Amnesia" / "Amnesia
-- Ibiza". Lo dudoso va a venue_review_queue para una persona.
-- ============================================================================

DO $migration$
DECLARE
  v_tag        TEXT := '20261002190100_venue_canonical_data';
  v_canon      public.venues%ROWTYPE;
  v_dup        public.venues%ROWTYPE;
  v_pair       RECORD;
  v_moved      INTEGER;
  v_total_ev   INTEGER := 0;
  v_total_dup  INTEGER := 0;
  v_new_addr   TEXT;
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
  -- Paso 2. Plan curado (canónico <- duplicado), por NOMBRE: los ids cambian
  -- entre entornos. dup_is_address = el "nombre" del duplicado es en realidad
  -- el domicilio del canónico, y se copia como address si al canónico le falta.
  -- Los números son eventos al 2026-10-02.
  -- -------------------------------------------------------------------------
  CREATE TEMP TABLE _venue_plan (ord SERIAL, canonical TEXT, duplicate TEXT, dup_is_address BOOLEAN NOT NULL DEFAULT FALSE) ON COMMIT DROP;
  INSERT INTO _venue_plan (canonical, duplicate, dup_is_address) VALUES
    ('30 y Pico',                             '30 y Pico Salta',            false),  -- 11 + 1
    ('30 y Pico',                             'Treinta y Pico',             false),  -- + 0
    ('30 y Pico',                             'Treinta y Pico Salta',       false),  -- + 0
    ('30 y Pico',                             'Treintaypico',               false),  -- + 0
    ('30 y Pico',                             'Balcarce 865',               true),   -- + 5  (@treintaypicosalta)
    ('Amnesia Pub & Música',                  'Amnesia',                    false),  -- 1 + 11
    ('Amnesia Pub & Música',                  'Amnesia Salta',              false),  -- + 3
    ('Amnesia Pub & Música',                  'Amnesia Pub & Music',        false),  -- + 6
    ('Amnesia Pub & Música',                  'Balcarce 899',               true),   -- + 3  (@amnesiasalta)
    ('Autódromo de Salta',                    'Autodromo de Salta',         false),  -- 1 + 1
    ('Babylon',                               'Babylon Salta',              false),  -- 23 + 13
    ('Babylon',                               'Espacio Babylon',            false),  -- + 1
    ('Babylon',                               'Necochea 719',               true),   -- + 3  (@babylonsalta)
    ('Balderrama',                            'Peña Boliche Balderrama',    false),  -- 9 + 3
    ('Balderrama',                            'Av. San Martín 1126',        true),   -- + 1  (@bolichebalderrama)
    ('Bounce',                                'Bounce Salta',               false),  -- 15 + 6
    ('Bounce',                                'Las Heras 1237',             true),   -- + 2  (@bounce.salta)
    ('Bunker Owl Music Bar',                  'Bunker',                     false),  -- 1 + 4
    ('Bunker Owl Music Bar',                  'Búnker',                     false),  -- + 0
    ('Bunker Owl Music Bar',                  'Bunker Owl',                 false),  -- + 0
    ('Bunker Owl Music Bar',                  'Balcarce 926',               true),   -- + 3  (@bunker.owl)
    ('Casagrande Peña',                       'CasaGrande',                 false),  -- 1 + 3
    ('Casagrande Peña',                       'Casa Grande',                false),  -- + 3
    ('Casagrande Peña',                       'Casa Grande Peña',           false),  -- + 0
    ('Casagrande Peña',                       'Casagrande Salta',           false),  -- + 1
    ('Casagrande Peña',                       'casagrande.salta',           false),  -- + 0
    ('Casagrande Peña',                       'San martin 484',             true),   -- + 1  (@casagrande.salta)
    ('Casona del Sur',                        'La Casona del Sur',          false),  -- 11 + 0
    ('Casona del Sur',                        'Coronel moldes 399',         true),   -- + 1  (@casonadelsur.salta)
    ('Centro de Convenciones Salta',          'Centro de Convenciones de Salta', false), -- 3 + 1
    ('Coco Club',                             'CocoClub',                   false),  -- 26 + 1
    ('Coco Club',                             'Avenida Jhon F. Kennedy',    true),   -- + 4  (@cococlub.sla)
    ('Elephant',                              'Elephant Salta',             false),  -- 0 + 1
    ('Fábrica de Música',                     'Fabrica de Musica',          false),  -- 1 + 2
    ('Juan de los Palotes',                   'JP',                         false),  -- 17 + 2
    ('Juan de los Palotes',                   'juandelospalotes.jp',        false),  -- + 3
    ('Juan de los Palotes',                   'Av. J.F. Kennedy y Radio Gral. Paz de Cordoba', true), -- + 4 (@juandelospalotes.jp)
    ('La Casona de Güemes',                   'Casona de Guemes',           false),  -- 21 + 0
    ('La Casona de Güemes',                   'La Casona Güemes',           false),  -- + 1
    ('La Casona de Güemes',                   E'La Casona de G\r\nuemes',   false),  -- + 1  (CRLF en el nombre)
    ('La Casona de Güemes',                   'General Guemes 485',         true),   -- + 3  (@lacasonaguemes)
    ('La Güemesiana',                         'Balcarce 935',               true),   -- 19 + 3 (@la.guemesiana)
    ('La Mata',                               'La Mata Reggaeton',          false),  -- 1 + 1
    ('La Metro',                              'Marcelino Freyre 1438-1498', true),   -- 32 + 6 (@lametrosalta)
    ('La Metro',                              'Marcelino Freyre 1438-1498', true),   -- + 1  (la misma dirección está dos veces)
    ('LA ROKA',                               'La Roka Salta',              false),  -- 6 + 1
    ('LA ROKA',                               'Roka',                       false),  -- + 1
    ('LA ROKA',                               'Salta Roka',                 false),  -- + 3
    ('LA ROKA',                               'Saltaroka',                  false),  -- + 5
    ('One Club',                              'ONE',                        false),  -- 0 + 3
    ('One Club',                              'One Oficial Salta',          false),  -- + 3
    ('One Club',                              'Balcarce 920',               true),   -- + 5  (@oneoficialsalta)
    ('Salón Templo',                          'Salon Templo',               false),  -- 2 + 1
    ('Salón Templo',                          'Gral. Richieri y Los Gladiolos', true), -- + 2 (@salon.templo)
    ('Teatro Provincial Juan Carlos Saravia', 'Teatro Provincial JCS',      false),  -- 72 + 1
    ('Teatro Provincial Juan Carlos Saravia', 'Teatro Provincial de Salta', false),  -- + 1 (trae Zuviría 70 y geo)
    ('Trewa Club',                            'Trewa',                      false);  -- 9 + 2

  -- -------------------------------------------------------------------------
  -- Paso 3. Aplicar el plan.
  -- Canónico y duplicado se buscan primero por nombre EXACTO: pares como
  -- "Autódromo de Salta"/"Autodromo de Salta" normalizan a la misma clave y
  -- con solo venue_normalize() el LIMIT 1 elegía cualquiera de los dos.
  -- -------------------------------------------------------------------------
  FOR v_pair IN SELECT * FROM _venue_plan ORDER BY ord LOOP
    SELECT * INTO v_canon FROM public.venues
     WHERE public.venue_normalize(name) = public.venue_normalize(v_pair.canonical)
       AND canonical_venue_id IS NULL AND NOT is_placeholder
     ORDER BY (name = v_pair.canonical) DESC,
              (SELECT count(*) FROM public.events e WHERE e.venue_id = venues.id) DESC,
              created_at
     LIMIT 1;

    IF NOT FOUND THEN
      RAISE NOTICE 'Canónico no encontrado, se saltea: %', v_pair.canonical;
      CONTINUE;
    END IF;

    SELECT * INTO v_dup FROM public.venues
     WHERE public.venue_normalize(name) = public.venue_normalize(v_pair.duplicate)
       AND canonical_venue_id IS NULL
       AND id <> v_canon.id
     ORDER BY (name = v_pair.duplicate) DESC, created_at
     LIMIT 1;

    IF NOT FOUND THEN
      CONTINUE;   -- ya fusionado o no existe en este entorno
    END IF;

    -- Domicilio: el del canónico gana solo si es un domicilio de verdad (muchas
    -- filas repiten su propio nombre en address). Si el duplicado ES una
    -- dirección, su nombre es el domicilio.
    v_new_addr := COALESCE(
      public.venue_useful_address(v_canon.name, v_canon.address),
      CASE WHEN v_pair.dup_is_address THEN public.venue_sanitize(v_dup.name) END,
      public.venue_useful_address(v_dup.name, v_dup.address),
      v_canon.address);

    IF v_new_addr IS DISTINCT FROM v_canon.address
       OR (v_canon.latitude IS NULL AND v_dup.latitude IS NOT NULL)
       OR (v_canon.longitude IS NULL AND v_dup.longitude IS NOT NULL)
       OR (v_canon.google_maps_url IS NULL AND v_dup.google_maps_url IS NOT NULL)
       OR (v_canon.phone IS NULL AND v_dup.phone IS NOT NULL)
       OR (v_canon.capacity IS NULL AND v_dup.capacity IS NOT NULL) THEN
      INSERT INTO public.venue_merge_log (migration_tag, entity, entity_id, from_venue_id, to_venue_id, old_values)
      VALUES (v_tag, 'venue_update', v_canon.id, v_dup.id, v_canon.id,
              jsonb_build_object('address', v_canon.address, 'latitude', v_canon.latitude,
                                 'longitude', v_canon.longitude, 'google_maps_url', v_canon.google_maps_url,
                                 'phone', v_canon.phone, 'capacity', v_canon.capacity));

      UPDATE public.venues c SET
          address         = v_new_addr,
          latitude        = COALESCE(c.latitude,  v_dup.latitude),
          longitude       = COALESCE(c.longitude, v_dup.longitude),
          google_maps_url = COALESCE(c.google_maps_url, v_dup.google_maps_url),
          phone           = COALESCE(c.phone,     v_dup.phone),
          capacity        = COALESCE(c.capacity,  v_dup.capacity),
          updated_at      = now()
        WHERE c.id = v_canon.id
        RETURNING * INTO v_canon;
    END IF;

    -- Repuntear eventos, guardando el origen para poder revertir.
    INSERT INTO public.venue_merge_log (migration_tag, entity, entity_id, from_venue_id, to_venue_id)
    SELECT v_tag, 'event', e.id, e.venue_id, v_canon.id
      FROM public.events e WHERE e.venue_id = v_dup.id;

    UPDATE public.events SET venue_id = v_canon.id WHERE venue_id = v_dup.id;
    GET DIAGNOSTICS v_moved = ROW_COUNT;
    v_total_ev := v_total_ev + v_moved;

    -- El nombre viejo (saneado) pasa a ser alias.
    INSERT INTO public.venue_aliases (venue_id, alias, source)
    VALUES (v_canon.id, public.venue_sanitize(v_dup.name), 'migration')
    ON CONFLICT (alias_normalized) DO NOTHING;

    INSERT INTO public.venue_merge_log (migration_tag, entity, entity_id, from_venue_id, to_venue_id)
    VALUES (v_tag, 'venue', v_dup.id, NULL, v_canon.id);

    UPDATE public.venues
       SET canonical_venue_id = v_canon.id, merged_at = now(), updated_at = now()
     WHERE id = v_dup.id;

    v_total_dup := v_total_dup + 1;
    RAISE NOTICE 'MERGE | % | <- | % | eventos=% | address=%', v_canon.name, replace(replace(v_dup.name, E'\r', '\r'), E'\n', '\n'), v_moved, v_canon.address;
  END LOOP;

  -- -------------------------------------------------------------------------
  -- Paso 4. Barrido automático: colisiones EXACTAS de clave normalizada que el
  -- plan no haya cubierto (filas creadas después de escribirlo). Nunca fuzzy.
  -- Gana la fila con más eventos; a igualdad, la más antigua.
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

    INSERT INTO public.venue_merge_log (migration_tag, entity, entity_id, from_venue_id, to_venue_id)
    VALUES (v_tag, 'venue', v_pair.dup_id, NULL, v_pair.canon_id);

    UPDATE public.venues
       SET canonical_venue_id = v_pair.canon_id, merged_at = now(), updated_at = now()
     WHERE id = v_pair.dup_id;

    v_total_dup := v_total_dup + 1;
    RAISE NOTICE 'AUTO  | % | eventos=%', v_pair.dup_name, v_moved;
  END LOOP;

  -- Aplanar cadenas A->B->C (venue_canonical_of() asume un solo salto).
  UPDATE public.venues d
     SET canonical_venue_id = p.canonical_venue_id
    FROM public.venues p
   WHERE d.canonical_venue_id = p.id
     AND p.canonical_venue_id IS NOT NULL
     AND p.canonical_venue_id <> d.id;

  -- -------------------------------------------------------------------------
  -- Paso 5. Grafía de display de dos canónicos. Solo display: las claves de
  -- match no cambian. El nombre previo queda en venue_merge_log.
  -- -------------------------------------------------------------------------
  FOR v_pair IN
    SELECT v.id, v.name AS old_name, p.preferred
      FROM public.venues v
      JOIN (VALUES
        ('la roka',             'La Roka'),              -- "LA ROKA" en mayúsculas
        ('museo antropologico', 'Museo Antropológico')   -- sin tilde
      ) AS p(key, preferred) ON public.venue_normalize(v.name) = p.key
     WHERE v.canonical_venue_id IS NULL
       AND v.name IS DISTINCT FROM p.preferred
  LOOP
    INSERT INTO public.venue_merge_log (migration_tag, entity, entity_id, old_values)
    VALUES (v_tag, 'venue_rename', v_pair.id, jsonb_build_object('name', v_pair.old_name));
    UPDATE public.venues SET name = v_pair.preferred, updated_at = now() WHERE id = v_pair.id;
    RAISE NOTICE 'RENAME | % -> %', v_pair.old_name, v_pair.preferred;
  END LOOP;

  -- -------------------------------------------------------------------------
  -- Paso 6. default_venue_name de las cuentas de Instagram: el nombre del
  -- lugar, no su domicilio (que ahora está en venues.address). Es lo que usan
  -- el fallback y la tarjeta del flyer; con el domicilio, cada flyer creaba un
  -- venue-dirección. El valor previo queda en venue_merge_log.
  -- -------------------------------------------------------------------------
  FOR v_pair IN
    SELECT a.id, a.username, a.default_venue_name AS old_name, x.new_name
      FROM public.instagram_accounts a
      JOIN (VALUES
        ('amnesiasalta',           'Amnesia Pub & Música'),
        ('babylonsalta',           'Babylon'),
        ('bolichebalderrama',      'Balderrama'),
        ('bounce.salta',           'Bounce'),
        ('bunker.owl',             'Bunker Owl Music Bar'),
        ('casagrande.salta',       'Casagrande Peña'),
        ('casonadelsur.salta',     'Casona del Sur'),
        ('cococlub.sla',           'Coco Club'),
        ('juandelospalotes.jp',    'Juan de los Palotes'),
        ('la.guemesiana',          'La Güemesiana'),
        ('lacasonaguemes',         'La Casona de Güemes'),
        ('lametrosalta',           'La Metro'),
        ('laviejaestacionensalta', 'La Vieja Estación'),
        ('oneoficialsalta',        'One Club'),
        ('salon.templo',           'Salón Templo'),
        ('treintaypicosalta',      '30 y Pico'),
        ('peppers.gintoneria',     'Peppers')
      ) AS x(username, new_name) ON x.username = a.username
     WHERE a.default_venue_name IS DISTINCT FROM x.new_name
  LOOP
    INSERT INTO public.venue_merge_log (migration_tag, entity, entity_id, old_values)
    VALUES (v_tag, 'instagram_account', v_pair.id, jsonb_build_object('default_venue_name', v_pair.old_name));
    UPDATE public.instagram_accounts SET default_venue_name = v_pair.new_name WHERE id = v_pair.id;
    RAISE NOTICE 'IG    | @% | % -> %', v_pair.username, v_pair.old_name, v_pair.new_name;
  END LOOP;

  -- "Peppers Gintonería" (el default viejo de @peppers.gintoneria) resuelve a Peppers.
  INSERT INTO public.venue_aliases (venue_id, alias, source)
  SELECT v.id, 'Peppers Gintonería', 'migration'
    FROM public.venues v
   WHERE public.venue_normalize(v.name) = 'peppers' AND v.canonical_venue_id IS NULL
  ON CONFLICT (alias_normalized) DO NOTHING;

  -- -------------------------------------------------------------------------
  -- Paso 7. Slug para todo venue canónico (desempate con sufijo numérico).
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
  -- Paso 8. Revisión manual: lo que el plan no fusiona a propósito.
  -- -------------------------------------------------------------------------
  INSERT INTO public.venue_review_queue (raw_name, source, legacy_venue_id, notes)
  SELECT v.name, 'migration', v.id, x.note
    FROM (VALUES
      ('El Patio de la Roka',            'DECISIÓN PENDIENTE: ¿mismo espacio que "La Roka" o uno propio dentro del predio? Sin coordenadas ni domicilio real. El Patio recibe shows nacionales por ticketera; La Roka, fiestas de Instagram. Si es el mismo: alias. Si no: cargar dirección en ambos.'),
      ('Balcarce 980',                   'Probablemente Live Fresh: su único evento es de @livefresh.ok ("AIRBAG: Rockstar, pero a lo Fresh"). Inferido, no confirmado: si es Live Fresh, fusionar o aliasar.'),
      ('Don Emilio',                     'El default de @saltaroka es "Don Emilio, Av. Paraguay 202": ¿La Roka funciona en Don Emilio? Si es así, fusionar o aliasar.'),
      ('Amnesia Ibiza',                  'Club de Ibiza (España), NO es el Amnesia de Salta. ¿Corresponde a esta agenda?'),
      ('Poble Espanyol',                 'Recinto de Barcelona. Probable ruido de una cuenta internacional.'),
      ('Autódromo M. M. de Güemes',      'Casi seguro el mismo lugar que "Autódromo de Salta". Confirmar y fusionar o aliasar.'),
      ('Microestadio Delmi',             '¿Mismo lugar que "Estadio Delmi"? Confirmar.'),
      ('Feria de Turismo',               'Junto con "Feria Internacional de Turismo" y "FIT América Latina": parece un evento, no un lugar. Identificar dónde se hizo.'),
      ('Feria Internacional de Turismo', 'Ver "Feria de Turismo".'),
      ('FIT América Latina',             'Ver "Feria de Turismo".'),
      ('Baby',                           'Nombre demasiado corto. ¿Es "Babylon" o un lugar propio?'),
      ('Elephant + One',                 'Fiesta conjunta de dos lugares, no un venue.'),
      ('Bresh',                          'Fiesta itinerante, no un lugar fijo.'),
      ('Salon',                          'Genérico. Identificar el lugar real.'),
      ('Centro Comercial',               'Genérico. Identificar el lugar real.')
    ) AS x(nm, note)
    JOIN public.venues v ON public.venue_normalize(v.name) = public.venue_normalize(x.nm)
                        AND v.canonical_venue_id IS NULL
  ON CONFLICT (normalized) DO UPDATE
    SET notes = EXCLUDED.notes, legacy_venue_id = EXCLUDED.legacy_venue_id;

  -- Sugerencias fuzzy entre canónicos que quedaron sin fusionar.
  INSERT INTO public.venue_review_queue (raw_name, source, legacy_venue_id, suggested_venue_id, similarity, notes)
  SELECT DISTINCT ON (public.venue_normalize(a.name))
         a.name, 'migration', a.id, b.id,
         extensions.similarity(public.venue_normalize(a.name), public.venue_normalize(b.name)),
         'Posible duplicado por similitud. NO se fusionó: verificar que sea el mismo lugar.'
    FROM public.venues a
    JOIN public.venues b
      ON b.canonical_venue_id IS NULL AND NOT b.is_placeholder
     AND a.id <> b.id
     AND extensions.similarity(public.venue_normalize(a.name), public.venue_normalize(b.name)) >= 0.55
   WHERE a.canonical_venue_id IS NULL AND NOT a.is_placeholder
   ORDER BY public.venue_normalize(a.name),
            extensions.similarity(public.venue_normalize(a.name), public.venue_normalize(b.name)) DESC
  ON CONFLICT (normalized) DO NOTHING;

  INSERT INTO public.data_migrations (name, notes)
  VALUES (v_tag, format('%s venues absorbidos, %s eventos repunteados', v_total_dup, v_total_ev));

  RAISE NOTICE 'TOTAL | absorbidos=% | eventos movidos=% | canónicos=% | en revisión=%',
    v_total_dup, v_total_ev,
    (SELECT count(*) FROM public.venues WHERE canonical_venue_id IS NULL AND NOT is_placeholder),
    (SELECT count(*) FROM public.venue_review_queue WHERE status = 'pending');
END;
$migration$;

-- Recién ahora, sin colisiones: un nombre normalizado por venue canónico.
CREATE UNIQUE INDEX IF NOT EXISTS venues_canonical_norm_key
  ON public.venues (public.venue_normalize(name))
  WHERE canonical_venue_id IS NULL;

-- Registro canónico con actividad y aliases. security_invoker: respeta el RLS
-- de quien consulta.
CREATE OR REPLACE VIEW public.venues_canonical
WITH (security_invoker = on) AS
SELECT v.id, v.name, v.slug, v.address, v.latitude, v.longitude,
       v.google_maps_url, v.phone, v.capacity, v.created_at,
       (SELECT count(*) FROM public.events e WHERE e.venue_id = v.id)        AS event_count,
       (SELECT count(*) FROM public.venue_aliases a WHERE a.venue_id = v.id) AS alias_count
  FROM public.venues v
 WHERE v.canonical_venue_id IS NULL AND NOT v.is_placeholder;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.venues_canonical FROM anon, authenticated;
