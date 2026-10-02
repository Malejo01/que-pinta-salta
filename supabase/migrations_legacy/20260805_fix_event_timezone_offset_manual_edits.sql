-- Complemento de 20260805_fix_event_timezone_offset.sql
--
-- Aquella migración excluyó a los eventos de 'instagram-ai' sin fecha extraída,
-- asumiendo que su start_date venía de `instagram_flyers.published_at` (instante
-- UTC real de Apify, que no hay que corregir). El supuesto se cumple en 59 de
-- esos 75 casos, pero no en todos: cuando Gemini no lograba extraer la fecha, el
-- evento caía a DRAFT y un admin lo completaba a mano en /admin/revision. Ese
-- editor escribía hora de pared de Salta sin zona, así que esas filas sí quedaron
-- corridas y la primera migración las salteó.
--
-- Se identifican por tres condiciones simultáneas:
--   1. Son de 'instagram-ai' y no tienen fecha extraída válida.
--   2. Su start_date NO coincide al minuto con el published_at de su flyer.
--   3. Su hora en Salta cae exacta en punto (minuto '00'), firma de la carga
--      manual. Los published_at de Apify tienen minutos dispersos (:50, :52,
--      :22, :04...), así que esta condición protege a los pocos eventos cuyo
--      flyer ya no existe y no se pueden comparar contra nada.
--
-- Alcance verificado antes de aplicar: 14 filas, todas eventos de boliche
-- cargados a mano a las 00:00 o 22:00.

DO $migration$
DECLARE
  v_name     TEXT := '20260805_fix_event_timezone_offset_manual_edits';
  v_affected BIGINT;
BEGIN
  IF EXISTS (SELECT 1 FROM public.data_migrations WHERE name = v_name) THEN
    RAISE NOTICE 'Migración % ya aplicada el %, no se hace nada.',
      v_name,
      (SELECT applied_at FROM public.data_migrations WHERE name = v_name);
    RETURN;
  END IF;

  UPDATE public.events e
  SET
    start_date = e.start_date + INTERVAL '3 hours',
    end_date   = e.end_date   + INTERVAL '3 hours'
  WHERE
    e.scrape_source_key = 'instagram-ai'
    AND COALESCE(e.ai_metadata -> 'extracted_data' ->> 'date', '') !~ '^\d{4}-\d{2}-\d{2}$'
    AND to_char(e.start_date AT TIME ZONE 'America/Argentina/Salta', 'MI') = '00'
    AND NOT EXISTS (
      SELECT 1
      FROM public.instagram_flyers f
      WHERE f.id = (e.ai_metadata ->> 'flyer_id')::uuid
        AND date_trunc('minute', e.start_date) = date_trunc('minute', f.published_at)
    );

  GET DIAGNOSTICS v_affected = ROW_COUNT;

  INSERT INTO public.data_migrations (name, notes)
  VALUES (v_name, format('%s filas editadas a mano corridas +3 horas', v_affected));

  RAISE NOTICE 'Migración %: % filas actualizadas.', v_name, v_affected;
END
$migration$;
