-- ============================================================
-- Instagram Event Engine - Smart Boliches
-- Migración para inyectar datos estáticos de boliches
-- ============================================================

-- 1. Agregar columnas a public.instagram_accounts
ALTER TABLE public.instagram_accounts 
  ADD COLUMN IF NOT EXISTS default_venue_name TEXT,
  ADD COLUMN IF NOT EXISTS default_maps_url TEXT,
  ADD COLUMN IF NOT EXISTS default_category TEXT NOT NULL DEFAULT 'boliches';

-- 2. Agregar columnas a public.instagram_flyers
ALTER TABLE public.instagram_flyers
  ADD COLUMN IF NOT EXISTS venue_name TEXT,
  ADD COLUMN IF NOT EXISTS maps_url TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'boliches',
  ADD COLUMN IF NOT EXISTS price_min INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_free BOOLEAN NOT NULL DEFAULT false;
