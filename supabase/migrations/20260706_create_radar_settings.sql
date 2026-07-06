-- ============================================================
-- Migración SQL: Centro de Preferencias (Mi Radar Salteño)
-- ============================================================

-- Tabla base de configuración global del Radar
CREATE TABLE IF NOT EXISTS public.user_radar_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_frequency TEXT NOT NULL DEFAULT 'weekly' CHECK (email_frequency IN ('weekly', 'biweekly', 'monthly', 'disabled')),
  email_target TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabla de categorías seguidas (Junction)
CREATE TABLE IF NOT EXISTS public.user_followed_categories (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, category_id)
);

-- Tabla de venues/locales seguidos (Junction)
CREATE TABLE IF NOT EXISTS public.user_followed_venues (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, venue_id)
);

-- Habilitar RLS en todas las nuevas tablas
ALTER TABLE public.user_radar_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_followed_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_followed_venues ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS (Solo lectura y escritura para el dueño de los datos)
CREATE POLICY "Allow radar settings management for owner"
  ON public.user_radar_settings FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow category subscriptions management for owner"
  ON public.user_followed_categories FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow venue subscriptions management for owner"
  ON public.user_followed_venues FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Trigger para automatizar el updated_at de la configuración global
DROP TRIGGER IF EXISTS set_user_radar_settings_updated_at ON public.user_radar_settings;
CREATE TRIGGER set_user_radar_settings_updated_at
  BEFORE UPDATE ON public.user_radar_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Índices para mejorar las consultas relacionales
CREATE INDEX IF NOT EXISTS idx_followed_categories_user_id ON public.user_followed_categories(user_id);
CREATE INDEX IF NOT EXISTS idx_followed_venues_user_id ON public.user_followed_venues(user_id);
