-- ============================================================
-- Instagram Event Engine - AI Extraction Metadata
-- Tablas: instagram_flyers, events
-- ============================================================

-- 1. Agregar columnas a public.instagram_flyers para trazabilidad y estado de IA
ALTER TABLE public.instagram_flyers
  ADD COLUMN IF NOT EXISTS ai_metadata JSONB,
  ADD COLUMN IF NOT EXISTS ai_processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_status TEXT DEFAULT 'PENDING'
    CHECK (ai_status IN ('PENDING', 'PROCESSED', 'FAILED', 'SKIPPED'));

-- 2. Agregar columna a public.events para guardar el JSON original de la IA
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS ai_metadata JSONB;

-- 3. Crear índice parcial para procesar flyers pendientes de manera eficiente
CREATE INDEX IF NOT EXISTS idx_ig_flyers_ai_status_pending
  ON public.instagram_flyers (ai_status)
  WHERE ai_status = 'PENDING';
