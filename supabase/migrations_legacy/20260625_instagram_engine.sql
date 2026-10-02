-- ============================================================
-- Instagram Event Engine - Fase 1
-- Tablas: instagram_accounts, instagram_flyers
-- ============================================================

-- 1. Tabla de cuentas de Instagram a monitorear
CREATE TABLE IF NOT EXISTS public.instagram_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  profile_pic_url TEXT,
  instagram_url TEXT GENERATED ALWAYS AS
    ('https://www.instagram.com/' || username || '/') STORED,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger de updated_at (reutiliza función existente de 20260525_scrape_admin.sql)
DROP TRIGGER IF EXISTS set_instagram_accounts_updated_at ON public.instagram_accounts;
CREATE TRIGGER set_instagram_accounts_updated_at
  BEFORE UPDATE ON public.instagram_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed de cuentas curadas (boliches y productoras salteñas reales)
INSERT INTO public.instagram_accounts (username, display_name, notes) VALUES
  ('treintaypicosalta', 'Treinta y Pico', 'Bar/boliche +30'),
  ('salon.templo', 'Salón Templo', 'Venue nocturno'),
  ('juandelospalotes.jp', 'Juan de los Palotes', 'Bar cultural'),
  ('lametrosalta', 'La Metro Salta', 'Boliche referente'),
  ('oneoficialsalta', 'ONE Salta', 'Boliche electrónico'),
  ('saltaroka', 'Salta Roka', 'Productora de rock'),
  ('bunker.owl', 'Búnker OWL', 'Bar/boliche alternativo'),
  ('bounce.salta', 'Bounce Salta', 'Boliche/fiesta'),
  ('party_is_dead', 'Party is Dead', 'Productora de fiestas'),
  ('sex_us_machina', 'Sex Us Machina', 'Productora de eventos'),
  ('cococlub.sla', 'Coco Club', 'Boliche - publica videos (usar thumbnail)')
ON CONFLICT (username) DO NOTHING;

-- 2. Tabla de flyers extraídos de Instagram
CREATE TABLE IF NOT EXISTS public.instagram_flyers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  -- Datos del post de Instagram
  ig_post_id TEXT NOT NULL UNIQUE,
  ig_post_url TEXT NOT NULL,
  ig_post_type TEXT DEFAULT 'Image',
  caption TEXT,
  published_at TIMESTAMPTZ NOT NULL,
  -- Imagen procesada
  original_image_url TEXT,
  storage_image_path TEXT,
  storage_image_url TEXT,
  -- Metadata de gestión
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_ig_flyers_status
  ON public.instagram_flyers (status) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_ig_flyers_published
  ON public.instagram_flyers (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_ig_flyers_account
  ON public.instagram_flyers (account_id);

-- 3. RLS Policies
ALTER TABLE public.instagram_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_flyers ENABLE ROW LEVEL SECURITY;

-- instagram_accounts: lectura pública (frontend necesita display_name), escritura solo admin
CREATE POLICY "Allow public read for instagram_accounts"
  ON public.instagram_accounts FOR SELECT
  USING (true);

CREATE POLICY "Allow admin write for instagram_accounts"
  ON public.instagram_accounts FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- instagram_flyers: lectura pública solo ACTIVE, escritura admin/service
CREATE POLICY "Allow public read for active instagram_flyers"
  ON public.instagram_flyers FOR SELECT
  USING (status = 'ACTIVE');

CREATE POLICY "Allow admin write for instagram_flyers"
  ON public.instagram_flyers FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
