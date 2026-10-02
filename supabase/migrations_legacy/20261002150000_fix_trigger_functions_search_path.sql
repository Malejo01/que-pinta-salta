-- Sprint 1 / 1.1: search_path fijo en las 3 funciones de trigger que marca
-- el advisor (function_search_path_mutable). Mismo patrón que is_admin()
-- (20261002133300): todas sus referencias ya están calificadas
-- (now() vive en pg_catalog, auth.role(), public.is_admin()).

ALTER FUNCTION public.set_updated_at() SET search_path = '';
ALTER FUNCTION public.update_updated_at() SET search_path = '';
ALTER FUNCTION public.prevent_role_tampering() SET search_path = '';
