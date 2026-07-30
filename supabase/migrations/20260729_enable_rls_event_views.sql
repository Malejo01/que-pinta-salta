-- ============================================================
-- Migración SQL: Habilitar RLS en event_views y añadir políticas
-- ============================================================

-- Habilitar RLS en la tabla event_views si existe
DO $$
BEGIN
    IF EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'event_views'
    ) THEN
        ALTER TABLE public.event_views ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- Permitir inserción para cualquier usuario (anónimo o autenticado) para registrar vistas
CREATE POLICY "Allow public insert for event_views"
  ON public.event_views FOR INSERT
  WITH CHECK (true);

-- Permitir lectura pública (si es necesario mostrar la cantidad de vistas)
CREATE POLICY "Allow public read for event_views"
  ON public.event_views FOR SELECT
  USING (true);

-- Solo administradores pueden actualizar (usando la función is_admin que ya existe)
CREATE POLICY "Allow admin update for event_views"
  ON public.event_views FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Solo administradores pueden eliminar
CREATE POLICY "Allow admin delete for event_views"
  ON public.event_views FOR DELETE
  TO authenticated
  USING (public.is_admin());
