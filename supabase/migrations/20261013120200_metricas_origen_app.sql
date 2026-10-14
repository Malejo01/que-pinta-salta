-- ============================================================================
-- Ronda 23 (23-a): origen "app" en las métricas propias (/go/<id>?o=app y
-- /evento/<id>?o=app).
-- ============================================================================
--
-- Única "baja" de la ronda, y no cambia ningún dato: el CHECK de
-- event_metrics_daily.origin se reemplaza por uno que SUMA 'app' a la lista
-- (toda fila vieja lo sigue cumpliendo), y record_event_metric() se recrea
-- idéntica a supabase/migrations/20261005120000_event_metrics.sql, con solo
-- 'app' agregado a la lista de orígenes válidos. Mismos SECURITY DEFINER,
-- SET search_path = public, pg_temp (NO search_path = '': es el mismo
-- search_path que ya tiene hoy la función, no se cambia), REVOKE y GRANT
-- que tiene hoy.
--
-- Un origen desconocido no da error: la función hace RETURN y no cuenta
-- nada. Por eso el código y esta migración se pueden desplegar en
-- cualquier orden.
--
-- Idempotente: DROP CONSTRAINT IF EXISTS antes del ADD, CREATE OR REPLACE
-- FUNCTION.
-- ============================================================================

ALTER TABLE public.event_metrics_daily
  DROP CONSTRAINT IF EXISTS event_metrics_daily_origin_check;

ALTER TABLE public.event_metrics_daily
  ADD CONSTRAINT event_metrics_daily_origin_check CHECK (
    origin IN ('hero','hoy','fila','busqueda','favoritos','ficha','radar','directo','app')
  );

-- Cuerpo exacto de 20261005120000_event_metrics.sql, con 'app' agregado a
-- la lista de orígenes válidos (la única diferencia).
CREATE OR REPLACE FUNCTION public.record_event_metric(
  p_event_id uuid,
  p_kind text,
  p_origin text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_featured boolean;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('view', 'click') THEN
    RETURN;
  END IF;
  IF p_origin IS NULL OR p_origin NOT IN
     ('hero','hoy','fila','busqueda','favoritos','ficha','radar','directo','app') THEN
    RETURN;
  END IF;

  SELECT COALESCE(e.is_featured, false) INTO v_featured
  FROM public.events e
  WHERE e.id = p_event_id AND e.status = 'PUBLISHED';

  -- Evento inexistente o no publicado: no cuenta nada.
  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO public.event_metrics_daily AS m (event_id, day, origin, featured, views, clicks)
  VALUES (
    p_event_id,
    (now() AT TIME ZONE 'America/Argentina/Salta')::date,
    p_origin,
    v_featured,
    CASE WHEN p_kind = 'view' THEN 1 ELSE 0 END,
    CASE WHEN p_kind = 'click' THEN 1 ELSE 0 END
  )
  ON CONFLICT (event_id, day, origin, featured) DO UPDATE
    SET views  = m.views  + EXCLUDED.views,
        clicks = m.clicks + EXCLUDED.clicks;
END;
$$;

REVOKE ALL ON FUNCTION public.record_event_metric(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_event_metric(uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.record_event_metric(uuid, text, text) IS
  'Suma una vista (view) o un clic (click) al contador diario del evento. Solo service_role.';
