-- ============================================================
-- Migración SQL: Múltiples Fuentes de Venta y Prioridad Comercial
-- ============================================================

-- 1. Agregar columnas a la tabla events
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS ticket_sources JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS is_commercial BOOLEAN DEFAULT false;

-- 2. Migrar registros de ticket_url existentes al nuevo array JSONB
UPDATE public.events
SET ticket_sources = jsonb_build_array(
  jsonb_build_object(
    'source', COALESCE(scrape_source_key, 'manual'),
    'url', ticket_url,
    'price_min', COALESCE(price_min, 0)
  )
)
WHERE ticket_url IS NOT NULL 
  AND (ticket_sources IS NULL OR jsonb_array_length(ticket_sources) = 0);

-- 3. Crear índices para optimizar búsquedas
CREATE INDEX IF NOT EXISTS idx_events_ticket_sources ON public.events USING gin (ticket_sources);
CREATE INDEX IF NOT EXISTS idx_events_is_commercial ON public.events (is_commercial);
