-- Verificación de solo lectura de scripts/db/produccion/aplicar-r58.sql.
-- La corre el supervisor (o Mauro). No escribe nada. Solo agregados y
-- metadata: ninguna consulta devuelve user_id ni email.

-- ----------------------------------------------------------------------------
-- ANTES de aplicar.
-- ----------------------------------------------------------------------------

-- A1. La etapa 2 está aplicada: sponsored_campaigns (130200) y
--     delete_my_account (130300). Esperado: 2 filas. Si falta alguna, NO
--     aplicar (esta migración las altera o las redefine).
select version, name
from supabase_migrations.schema_migrations
where version in ('20261018130200', '20261018130300')
order by version;

-- A2. gen_random_bytes existe en el schema extensions (lo usa el default del
--     token de ad_campaign_reports). Esperado: true.
select exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'extensions' and p.proname = 'gen_random_bytes'
) as gen_random_bytes_en_extensions;

-- A3. La R58 todavía no está (esperado: 0 versiones y 0 tablas; si ya está,
--     el script es idempotente, pero no hace falta correrlo).
select
  (select count(*) from supabase_migrations.schema_migrations where version = '20261019120000') as version_r58,
  (select count(*) from pg_tables where schemaname = 'public'
     and tablename in ('ad_price_cycles', 'ad_prices', 'ad_settings', 'ad_occupancy_daily', 'ad_campaign_reports')) as tablas_r58;

-- A4. Las campañas patrocinadas de hoy (para comparar después; no cambian).
select count(*) as campanias from public.sponsored_campaigns;

-- ----------------------------------------------------------------------------
-- DESPUÉS de aplicar.
-- ----------------------------------------------------------------------------

-- D1. Las 5 tablas nuevas, con RLS habilitada (esperado: 5 filas, rls = true).
select c.relname as tabla, c.relrowsecurity as rls
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('ad_price_cycles', 'ad_prices', 'ad_settings', 'ad_occupancy_daily', 'ad_campaign_reports')
order by c.relname;

-- D2. Las policies (esperado, por tabla y acción):
--     ad_campaign_reports: DELETE, INSERT, SELECT, UPDATE, {authenticated}, con is_admin().
--     ad_occupancy_daily: SELECT, {authenticated}, con is_admin().
--     ad_price_cycles: SELECT y UPDATE, {authenticated}, con is_admin().
--     ad_prices: SELECT {anon} con estado = 'aprobado'; SELECT {authenticated}
--                con estado = 'aprobado' OR is_admin(); UPDATE {authenticated} con is_admin().
--     ad_settings: SELECT y UPDATE, {authenticated}, con is_admin().
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('ad_price_cycles', 'ad_prices', 'ad_settings', 'ad_occupancy_daily', 'ad_campaign_reports')
order by tablename, cmd, policyname;

-- D3. Privilegios de anon y authenticated (esperado: anon solo SELECT en
--     ad_prices y nada en las demás; authenticated sin TRUNCATE en ninguna, y
--     sin INSERT ni DELETE salvo en ad_campaign_reports. REFERENCES y TRIGGER
--     vienen de los privilegios por defecto de Supabase).
select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privilegios
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('ad_price_cycles', 'ad_prices', 'ad_settings', 'ad_occupancy_daily', 'ad_campaign_reports')
  and grantee in ('anon', 'authenticated')
group by table_name, grantee
order by table_name, grantee;

-- D4. ad_settings tiene su única fila, con los defaults (esperado: 1 fila,
--     aprobacion_automatica = false, umbral_bajas_push = 0.020, sin pausa).
select aprobacion_automatica, umbral_bajas_push, push_patrocinado_pausado_at is null as sin_pausa
from public.ad_settings;

-- D5. Las tablas de datos arrancan vacías (esperado: 0, 0, 0, 0).
select
  (select count(*) from public.ad_price_cycles) as ciclos,
  (select count(*) from public.ad_prices) as precios,
  (select count(*) from public.ad_occupancy_daily) as ocupacion,
  (select count(*) from public.ad_campaign_reports) as reportes;

-- D6. Las columnas nuevas de sponsored_campaigns (esperado: 3 filas, nullable)
--     y el CHECK de bajas validado.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'sponsored_campaigns'
  and column_name in ('destinatarios', 'bajas_48h', 'bajas_medidas_at')
order by column_name;
select conname, convalidated from pg_constraint where conname = 'sponsored_campaigns_bajas_check';
-- Esperado: sponsored_campaigns_bajas_check, t.

-- D7. Las funciones: SECURITY DEFINER (solo delete_my_account), search_path
--     vacío y quién las ejecuta.
select p.proname,
       p.prosecdef as security_definer,
       p.proconfig as config,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('delete_my_account', 'ad_settings_exigir_ciclos')
order by p.proname;
-- Esperado: ad_settings_exigir_ciclos: f, {search_path=""}, f, f, (cualquiera).
--           delete_my_account: t, {search_path=""}, f, t, f.

-- D8. delete_my_account() desvincula las tres columnas nuevas (esperado: true, true, true).
select
  pg_get_functiondef('public.delete_my_account()'::regprocedure) like '%update public.ad_price_cycles set approved_by = null where approved_by = v_uid%' as ciclos,
  pg_get_functiondef('public.delete_my_account()'::regprocedure) like '%update public.ad_settings set updated_by = null where updated_by = v_uid%' as settings,
  pg_get_functiondef('public.delete_my_account()'::regprocedure) like '%update public.ad_campaign_reports set created_by = null where created_by = v_uid%' as reportes;

-- D9. El trigger de los 3 ciclos está en ad_settings (esperado: 1 fila, enabled = O).
select tgname, tgenabled as enabled
from pg_trigger
where tgrelid = 'public.ad_settings'::regclass and not tgisinternal;

-- D10. Las campañas no cambiaron (esperado: el mismo número que A4).
select count(*) as campanias from public.sponsored_campaigns;

-- D11. La versión quedó registrada (esperado: 1 fila).
select version, name
from supabase_migrations.schema_migrations
where version = '20261019120000';
