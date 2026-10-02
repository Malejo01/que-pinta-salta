-- ============================================================
-- Clasificación de eventos: campos de tracking en events table
-- ============================================================

-- Permitir category_id nulo para eventos sin categorizar
ALTER TABLE events ALTER COLUMN category_id DROP NOT NULL;

-- Qué scraper importó el evento (ej: 'norteticket', 'paseshow')
ALTER TABLE events ADD COLUMN IF NOT EXISTS scrape_source_key VARCHAR(100);

-- Cómo fue clasificado el evento
ALTER TABLE events ADD COLUMN IF NOT EXISTS classification_source VARCHAR(20)
  CHECK (classification_source IN ('manual', 'alias', 'scraper'));

-- Index para la cola de "sin categorizar" (frecuente en /admin/clasificacion)
CREATE INDEX IF NOT EXISTS idx_events_uncategorized
  ON events (created_at DESC)
  WHERE category_id IS NULL;

-- Index para filtrar por fuente de scraper
CREATE INDEX IF NOT EXISTS idx_events_scrape_source
  ON events (scrape_source_key)
  WHERE scrape_source_key IS NOT NULL;
