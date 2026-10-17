-- Verificación de solo lectura de scripts/db/produccion/aplicar-r38.sql.
-- La corre el supervisor (o Mauro) después de aplicar. No escribe nada.

-- 1. merge_events es la versión con QPS-110: SECURITY DEFINER, search_path
--    vacío y el comentario que menciona QPS-110 y event_attendance.
select
  p.proname,
  p.prosecdef as es_security_definer,
  p.proconfig as search_path_config,
  obj_description(p.oid, 'pg_proc') like '%QPS-110%' as comentario_qps_110,
  pg_get_functiondef(p.oid) like '%public.event_attendance%' as repunta_asistencia
from pg_proc p
where p.proname = 'merge_events'
  and p.pronamespace = 'public'::regnamespace;

-- 2. La política de event_attendance_totals mira el estado del evento (QPS-194).
select policyname, roles, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'event_attendance_totals';
-- Esperado: una sola fila, "lectura pública", SELECT, {anon,authenticated},
-- y un qual con EXISTS ... events ... status = 'PUBLISHED'.

-- 3. Los grants no cambiaron (la vista security_invoker los necesita).
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'event_attendance_totals'
  and grantee in ('anon', 'authenticated')
order by grantee, privilege_type;
-- Esperado: anon SELECT y authenticated SELECT, nada más.

-- 4. Las dos versiones quedaron registradas.
select version, name
from supabase_migrations.schema_migrations
where version in ('20261017120000', '20261017120100')
order by version;
