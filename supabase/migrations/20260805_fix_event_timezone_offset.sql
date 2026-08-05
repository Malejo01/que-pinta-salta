-- Corrige el desfase de 3 horas en events.start_date / events.end_date.
--
-- Contexto
-- --------
-- `start_date` es timestamptz, pero todas las rutas de ingesta venían guardando
-- la hora de pared de Salta como si fuera UTC: un evento de las 21:00 quedaba
-- almacenado como 21:00+00, que en realidad son las 18:00 de Salta. Como el
-- frontend formatea con timeZone 'America/Argentina/Salta', el sitio mostraba
-- todos los horarios tres horas antes de lo real.
--
-- El código ya normaliza a UTC en la escritura (lib/date-format.ts ->
-- saltaWallClockToUtcISO). Esta migración corrige las filas que quedaron mal.
--
-- Qué NO se toca
-- --------------
-- Los eventos de 'instagram-ai' cuya fecha no pudo extraerse del flyer usan
-- `instagram_flyers.published_at` como start_date, y ese valor viene de Apify
-- como instante UTC real: ya está bien y sumarle 3 horas lo rompería. Se los
-- detecta porque `ai_metadata -> 'extracted_data' ->> 'date'` no es una fecha
-- válida. La tabla `instagram_flyers` no se modifica en absoluto.
--
-- Orden de aplicación
-- -------------------
-- Aplicar esta migración y desplegar el código en la misma ventana, evitando
-- los horarios de cron (00:00 y 08:00 UTC). Si un scrape corriera entre ambos
-- pasos, esas filas podrían quedar corridas. La migración está guardada contra
-- doble ejecución, así que reintentarla es inofensivo.

CREATE TABLE IF NOT EXISTS public.data_migrations (
  name       TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes      TEXT
);

-- Solo service_role (que hace bypass de RLS) debe tocar esta tabla.
ALTER TABLE public.data_migrations ENABLE ROW LEVEL SECURITY;

DO $migration$
DECLARE
  v_name     TEXT := '20260805_fix_event_timezone_offset';
  v_affected BIGINT;
BEGIN
  IF EXISTS (SELECT 1 FROM public.data_migrations WHERE name = v_name) THEN
    RAISE NOTICE 'Migración % ya aplicada el %, no se hace nada.',
      v_name,
      (SELECT applied_at FROM public.data_migrations WHERE name = v_name);
    RETURN;
  END IF;

  UPDATE public.events
  SET
    start_date = start_date + INTERVAL '3 hours',
    end_date   = end_date   + INTERVAL '3 hours'
  WHERE NOT (
    COALESCE(scrape_source_key, '') = 'instagram-ai'
    AND COALESCE(ai_metadata -> 'extracted_data' ->> 'date', '') !~ '^\d{4}-\d{2}-\d{2}$'
  );

  GET DIAGNOSTICS v_affected = ROW_COUNT;

  INSERT INTO public.data_migrations (name, notes)
  VALUES (v_name, format('%s filas de events corridas +3 horas', v_affected));

  RAISE NOTICE 'Migración %: % filas actualizadas.', v_name, v_affected;
END
$migration$;
