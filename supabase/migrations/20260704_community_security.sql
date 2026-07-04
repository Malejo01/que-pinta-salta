-- ============================================================
-- Migración SQL: Seguridad de Tabla Events (RLS y Moderación)
-- ============================================================

-- 1. Asegurar la columna created_by vinculada a auth.users para el creador del evento
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='events' AND column_name='created_by'
  ) THEN
    ALTER TABLE public.events ADD COLUMN created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2. Establecer el status por defecto a 'DRAFT' para nuevos registros
ALTER TABLE public.events ALTER COLUMN status SET DEFAULT 'DRAFT';

-- 3. Habilitar RLS en public.events si no estuviera ya habilitado
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- 4. Limpiar políticas previas para evitar conflictos
DROP POLICY IF EXISTS "Allow public read for events" ON public.events;
DROP POLICY IF EXISTS "Allow insert for owner or admin" ON public.events;
DROP POLICY IF EXISTS "Allow update for owner or admin" ON public.events;
DROP POLICY IF EXISTS "Allow delete for owner or admin" ON public.events;
DROP POLICY IF EXISTS "Allow read for published or owner or admin" ON public.events;
DROP POLICY IF EXISTS "Allow insert for authenticated users with restrictions" ON public.events;

-- 5. Crear la política de lectura (SELECT):
-- Públicos (anónimos) solo ven eventos con status 'PUBLISHED'.
-- El creador del evento puede ver sus eventos en cualquier estado (ej. para verlos en su perfil).
-- El administrador puede ver todos los eventos.
CREATE POLICY "Allow read for published or owner or admin"
  ON public.events FOR SELECT
  USING (
    status = 'PUBLISHED' 
    OR auth.uid() = created_by 
    OR public.is_admin()
  );

-- 6. Crear la política de inserción (INSERT):
-- Solo usuarios autenticados pueden insertar.
-- Si es un usuario normal (no admin), el status debe ser 'DRAFT' (o nulo, que se convierte en 'DRAFT' por default).
-- Si es administrador, puede insertar el evento con cualquier estado.
CREATE POLICY "Allow insert for owner or admin"
  ON public.events FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.uid() = created_by AND (status = 'DRAFT' OR status IS NULL))
    OR public.is_admin()
  );

-- 7. Crear la política de actualización (UPDATE):
-- Solo el propietario o el administrador pueden actualizar.
-- Si un usuario común (no admin) actualiza el evento, la fila resultante debe volver al estado 'DRAFT' para nueva revisión.
-- El administrador puede actualizar cualquier campo sin restricciones de estado.
CREATE POLICY "Allow update for owner or admin"
  ON public.events FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = created_by 
    OR public.is_admin()
  )
  WITH CHECK (
    public.is_admin()
    OR (auth.uid() = created_by AND status = 'DRAFT')
  );

-- 8. Crear la política de borrado (DELETE):
-- Solo el propietario del evento o el administrador pueden eliminarlo.
CREATE POLICY "Allow delete for owner or admin"
  ON public.events FOR DELETE
  TO authenticated
  USING (
    auth.uid() = created_by 
    OR public.is_admin()
  );
