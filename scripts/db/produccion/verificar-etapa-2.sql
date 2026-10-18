-- Verificación de solo lectura de scripts/db/produccion/aplicar-etapa-2.sql.
-- La corre el supervisor (o Mauro). No escribe nada. Solo agregados y
-- metadata: ninguna consulta devuelve user_id ni email.

-- ----------------------------------------------------------------------------
-- ANTES de aplicar.
-- ----------------------------------------------------------------------------

-- A1. venues que romperían los CHECK de coordenadas (esperado: 0 y 0).
--     Si alguna da más que 0, NO aplicar: corregir esas filas antes (o avisar
--     al lead para pasar el CHECK a NOT VALID sin VALIDATE).
select
  count(*) filter (where (latitude is null) <> (longitude is null)) as una_sola_coordenada,
  count(*) filter (where latitude not between -90 and 90 or longitude not between -180 and 180) as fuera_de_rango
from public.venues;

-- A2. Cuántos lugares tienen ubicación (para comparar después; no cambia).
select count(*) filter (where latitude is not null) as con_ubicacion,
       count(*) filter (where latitude is null) as sin_ubicacion
from public.venues;

-- A3. Cuántos eventos están destacados hoy con is_featured (no se migran).
select count(*) filter (where is_featured) as destacados_is_featured from public.events;

-- ----------------------------------------------------------------------------
-- DESPUÉS de aplicar.
-- ----------------------------------------------------------------------------

-- D1. Columnas nuevas (esperado: 9 filas).
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and (table_name, column_name) in (
    ('venues', 'geocoded_at'), ('venues', 'geocode_source'),
    ('events', 'featured_until'), ('events', 'featured_set_by'), ('events', 'featured_set_at'),
    ('notification_sends', 'campaign_id'),
    ('notification_preferences', 'sponsored'),
    ('sponsored_campaigns', 'id'), ('sponsored_campaigns', 'created_by')
  )
order by table_name, column_name;

-- D2. CHECK de venues y de sponsored_campaigns, validados (esperado: 6 filas,
--     convalidated = true en todas).
select conrelid::regclass as tabla, conname, convalidated
from pg_constraint
where contype = 'c'
  and conname in ('venues_geocode_source_check', 'venues_coordenadas_juntas_check',
                  'venues_coordenadas_rango_check', 'sponsored_campaigns_fechas_check',
                  'sponsored_campaigns_destino_check', 'sponsored_campaigns_url_check')
order by conname;

-- D3. sponsored_campaigns: RLS habilitada y 4 policies solo admin.
select relrowsecurity as rls from pg_class where oid = 'public.sponsored_campaigns'::regclass;
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'sponsored_campaigns'
order by cmd;
-- Esperado: DELETE, INSERT, SELECT, UPDATE; roles {authenticated}; todas con is_admin().

-- D4. Privilegios de tabla de sponsored_campaigns (esperado: anon nada;
--     authenticated DELETE,INSERT,REFERENCES,SELECT,TRIGGER,UPDATE, sin
--     TRUNCATE; REFERENCES y TRIGGER vienen de los privilegios por defecto de
--     Supabase, como en el resto de las tablas).
select grantee, string_agg(privilege_type, ',' order by privilege_type) as privilegios
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'sponsored_campaigns'
  and grantee in ('anon', 'authenticated')
group by grantee;

-- D5. Las dos funciones: SECURITY DEFINER, search_path vacío y quién las ejecuta.
select p.proname,
       p.prosecdef as security_definer,
       p.proconfig as config,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('delete_my_account', 'purge_notification_sends')
order by p.proname;
-- Esperado: delete_my_account: t, {search_path=""}, f, t, f.
--           purge_notification_sends: t, {search_path=""}, f, f, t.

-- D6. El trigger de events fuerza también las columnas de destacado.
select pg_get_functiondef('public.enforce_event_user_rules()'::regprocedure) like '%NEW.featured_until := OLD.featured_until%'
  as trigger_cubre_destacados;
-- Esperado: true.

-- D7. delete_my_account() necesita poder borrar de auth.users (lo hace como
--     el dueño de la función, postgres). Esperado: true.
select has_table_privilege(
  (select pg_get_userbyid(proowner) from pg_proc where oid = 'public.delete_my_account()'::regprocedure),
  'auth.users', 'DELETE'
) as duenio_puede_borrar_auth_users;

-- D8. notification_preferences.sponsored quedó en true para todas las filas
--     que ya existían (esperado: apagados = 0).
select count(*) filter (where sponsored) as prendidos,
       count(*) filter (where not sponsored) as apagados
from public.notification_preferences;

-- D9. Las cinco versiones quedaron registradas.
select version, name
from supabase_migrations.schema_migrations
where version in ('20261018130000', '20261018130100', '20261018130200', '20261018130300', '20261018130400')
order by version;
