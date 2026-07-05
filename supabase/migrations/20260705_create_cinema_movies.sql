-- ============================================================
-- Migración SQL: Crear tabla de Películas de Cine y Showings
-- ============================================================

CREATE TABLE public.cinema_movies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  poster_url text,
  is_currently_showing boolean DEFAULT true NOT NULL,
  showings jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.cinema_movies ENABLE ROW LEVEL SECURITY;

-- Política de lectura pública para todos
CREATE POLICY "Allow public read for cinema_movies"
  ON public.cinema_movies FOR SELECT
  USING (true);

-- Política de escritura solo para administradores
CREATE POLICY "Allow admin write for cinema_movies"
  ON public.cinema_movies FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Trigger para mantener actualizado updated_at
DROP TRIGGER IF EXISTS set_cinema_movies_updated_at ON public.cinema_movies;
CREATE TRIGGER set_cinema_movies_updated_at
  BEFORE UPDATE ON public.cinema_movies
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
