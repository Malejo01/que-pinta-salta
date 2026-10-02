-- Sprint 0 / 0.6 (docs/AUDITORIA-2026-10.md §B, Funciones expuestas por RPC)
--
-- is_admin() es SECURITY DEFINER y la usan todas las políticas de admin:
-- sin search_path fijo, un objeto con el mismo nombre en otro schema podría
-- secuestrarla. Todas sus referencias ya están calificadas (public.profiles,
-- auth.uid()), así que alcanza con un search_path vacío.
ALTER FUNCTION public.is_admin() SET search_path = '';

-- handle_new_user() es la función del trigger de alta en auth.users; no
-- tiene sentido llamarla por /rest/v1/rpc. El EXECUTE también estaba
-- otorgado a PUBLIC, del que heredan anon y authenticated, así que se
-- revoca de los tres. Los triggers no chequean EXECUTE al dispararse; igual
-- se le deja explícito a supabase_auth_admin (el rol de GoTrue, que hasta
-- ahora lo heredaba de PUBLIC) por si algún día lo hiciera.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;
