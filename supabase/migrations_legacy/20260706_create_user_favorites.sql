-- ============================================================
-- Migración SQL: Crear tabla de Favoritos del Usuario
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
  instagram_flyer_id UUID REFERENCES public.instagram_flyers(id) ON DELETE CASCADE,
  cinema_movie_id UUID REFERENCES public.cinema_movies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Asegurar que el favorito corresponda a exactamente una entidad (Mutuamente excluyentes)
  CONSTRAINT favorite_item_check CHECK (
    (event_id IS NOT NULL AND instagram_flyer_id IS NULL AND cinema_movie_id IS NULL) OR
    (event_id IS NULL AND instagram_flyer_id IS NOT NULL AND cinema_movie_id IS NULL) OR
    (event_id IS NULL AND instagram_flyer_id IS NULL AND cinema_movie_id IS NOT NULL)
  ),

  -- Evitar duplicados por usuario e ítem
  CONSTRAINT unique_user_event_favorite UNIQUE (user_id, event_id),
  CONSTRAINT unique_user_flyer_favorite UNIQUE (user_id, instagram_flyer_id),
  CONSTRAINT unique_user_movie_favorite UNIQUE (user_id, cinema_movie_id)
);

-- 1. Habilitar Row Level Security (RLS)
ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;

-- 2. Políticas de Seguridad RLS
CREATE POLICY "Allow select for owner"
  ON public.user_favorites FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Allow insert for owner"
  ON public.user_favorites FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow delete for owner"
  ON public.user_favorites FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 3. Índices de rendimiento para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id ON public.user_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_user_favorites_event_id ON public.user_favorites(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_favorites_flyer_id ON public.user_favorites(instagram_flyer_id) WHERE instagram_flyer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_favorites_movie_id ON public.user_favorites(cinema_movie_id) WHERE cinema_movie_id IS NOT NULL;
