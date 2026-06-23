-- ============================================================
-- Migración SQL: Configuración de Seguridad RLS y Storage
-- ============================================================

-- 1. Crear función auxiliar con privilegios definidores (Security Definer)
-- para evitar recursión infinita al validar el rol de administrador.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'ADMIN'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Habilitar RLS en todas las tablas
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scrape_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scrape_runs ENABLE ROW LEVEL SECURITY;

-- 3. Políticas para la tabla 'categories'
CREATE POLICY "Allow public read for categories"
  ON public.categories FOR SELECT
  USING (true);

CREATE POLICY "Allow admin write for categories"
  ON public.categories FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 4. Políticas para la tabla 'venues'
CREATE POLICY "Allow public read for venues"
  ON public.venues FOR SELECT
  USING (true);

CREATE POLICY "Allow admin write for venues"
  ON public.venues FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 5. Políticas para la tabla 'events'
CREATE POLICY "Allow public read for events"
  ON public.events FOR SELECT
  USING (true);

CREATE POLICY "Allow insert for owner or admin"
  ON public.events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by OR public.is_admin());

CREATE POLICY "Allow update for owner or admin"
  ON public.events FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by OR public.is_admin())
  WITH CHECK (auth.uid() = created_by OR public.is_admin());

CREATE POLICY "Allow delete for owner or admin"
  ON public.events FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by OR public.is_admin());

-- 6. Políticas para la tabla 'profiles'
CREATE POLICY "Allow profile read for owner or admin"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Allow profile insert for owner"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Allow profile update for owner or admin"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id OR public.is_admin())
  WITH CHECK (auth.uid() = id OR public.is_admin());

-- 7. Políticas para la tabla 'favorites'
CREATE POLICY "Allow select for owner"
  ON public.favorites FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Allow insert for owner"
  ON public.favorites FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow delete for owner"
  ON public.favorites FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 8. Políticas para la tabla 'aliases'
CREATE POLICY "Allow read for admins"
  ON public.aliases FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Allow write for admins"
  ON public.aliases FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 9. Políticas para la tabla 'scrape_sources'
CREATE POLICY "Allow read for admins"
  ON public.scrape_sources FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Allow write for admins"
  ON public.scrape_sources FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 10. Políticas para la tabla 'scrape_runs'
CREATE POLICY "Allow read for admins"
  ON public.scrape_runs FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Allow write for admins"
  ON public.scrape_runs FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 11. Políticas para almacenamiento (storage.objects) - Bucket 'flyers'
-- Habilitar RLS en storage.objects (normalmente está por defecto en Supabase y no requiere ser alterado)

CREATE POLICY "Allow public read of flyers"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'flyers');

CREATE POLICY "Allow authenticated upload of flyers"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'flyers' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Allow owner or admin update of flyers"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'flyers' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()))
  WITH CHECK (bucket_id = 'flyers' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()));

CREATE POLICY "Allow owner or admin delete of flyers"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'flyers' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()));
