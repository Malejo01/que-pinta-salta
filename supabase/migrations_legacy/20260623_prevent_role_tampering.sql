-- ============================================================
-- Migración SQL: Trigger para Evitar Escalación de Roles
-- ============================================================

-- Crear la función que valida si el rol está siendo alterado
CREATE OR REPLACE FUNCTION public.prevent_role_tampering()
RETURNS TRIGGER AS $$
BEGIN
  -- Si la consulta proviene del rol privilegiado del sistema (service_role), permitir
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Si el valor NEW.role es diferente de OLD.role
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- Permitir el cambio únicamente si el ejecutor es administrador
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'No tienes permisos de administrador para modificar roles.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear el Trigger asociado a la tabla public.profiles
DROP TRIGGER IF EXISTS tr_prevent_role_tampering ON public.profiles;

CREATE TRIGGER tr_prevent_role_tampering
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_role_tampering();
