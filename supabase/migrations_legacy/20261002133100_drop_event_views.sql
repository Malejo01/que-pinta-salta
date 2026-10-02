-- Sprint 0 / 0.2 (docs/AUDITORIA-2026-10.md §A.2)
--
-- event_views tenía RLS deshabilitado y anon con INSERT/UPDATE/DELETE:
-- cualquiera podía llenarla sin autenticarse. Ningún código la lee ni la
-- escribe (grep en todo el repo) y tenía 0 filas. Reemplaza a
-- 20260729_enable_rls_event_views.sql, que nunca se aplicó y además dejaba
-- el INSERT público abierto.

DROP TABLE IF EXISTS public.event_views;
