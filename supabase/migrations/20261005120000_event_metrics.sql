-- QPS-027: medición de vistas y clics a la ticketera, por evento y día.
-- Solo agregados: sin cookies, sin IP, sin user agent, sin datos personales.

CREATE TABLE public.event_metrics_daily (
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  -- Día calendario de Salta.
  day      date NOT NULL,
  origin   text NOT NULL,
  -- Si el evento era destacado en el momento de contar.
  featured boolean NOT NULL DEFAULT false,
  views    bigint NOT NULL DEFAULT 0,
  clicks   bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, day, origin, featured),
  CONSTRAINT event_metrics_daily_origin_check CHECK (
    origin IN ('hero','hoy','fila','busqueda','favoritos','ficha','radar','directo')
  )
);

COMMENT ON TABLE public.event_metrics_daily IS
  'Vistas y clics a la ticketera por evento, día de Salta, origen y destacado. Solo agregados. Se escribe únicamente con record_event_metric().';

ALTER TABLE public.event_metrics_daily ENABLE ROW LEVEL SECURITY;

-- Lectura solo para admins. Sin políticas de escritura.
CREATE POLICY "Allow read for admins" ON public.event_metrics_daily
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

-- Los default privileges de public les dan todo a anon/authenticated.
REVOKE ALL ON TABLE public.event_metrics_daily FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.event_metrics_daily FROM authenticated;

-- Única vía de escritura: la llaman los route handlers del servidor con la
-- service key. Es SECURITY DEFINER con search_path fijo.
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
     ('hero','hoy','fila','busqueda','favoritos','ficha','radar','directo') THEN
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

COMMENT ON COLUMN public.events.view_count IS
  'Columna muerta: no se actualiza. Las vistas reales están en event_metrics_daily.';
