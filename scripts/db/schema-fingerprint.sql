-- Huella del esquema: una línea por objeto, ordenada. scripts/db/check-drift.sh
-- la corre igual en prod y en la base local y compara las salidas con diff.
with x(k) as (
  -- columnas de public
  select 'col|' || table_name || '.' || column_name || '|' || data_type || '|' || coalesce(udt_name,'') || '|null=' || is_nullable || '|def=' || coalesce(column_default,'')
  from information_schema.columns where table_schema = 'public'
  union all
  -- constraints de public
  select 'con|' || conrelid::regclass || '|' || conname || '|' || pg_get_constraintdef(oid)
  from pg_constraint where connamespace = 'public'::regnamespace
  union all
  -- índices de public
  select 'idx|' || tablename || '|' || indexname || '|' || indexdef from pg_indexes where schemaname = 'public'
  union all
  -- RLS por tabla
  select 'rls|' || relname || '|enabled=' || relrowsecurity || '|forced=' || relforcerowsecurity
  from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'
  union all
  -- políticas de public y storage
  select 'pol|' || schemaname || '.' || tablename || '|' || policyname || '|' || permissive || '|' || array_to_string(roles, ',') || '|' || cmd || '|' || coalesce(qual, '') || '|' || coalesce(with_check, '')
  from pg_policies where schemaname in ('public', 'storage')
  union all
  -- triggers de usuario en public, y los de auth/storage que llaman a public
  select 'trg|' || c.relnamespace::regnamespace || '.' || c.relname || '|' || t.tgname || '|' || t.tgenabled::text || '|' || p.pronamespace::regnamespace || '.' || p.proname
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc p on p.oid = t.tgfoid
  where not t.tgisinternal and (c.relnamespace = 'public'::regnamespace or p.pronamespace = 'public'::regnamespace)
  union all
  -- funciones de public (cuerpo hasheado)
  select 'fn|' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')|secdef=' || p.prosecdef || '|cfg=' || coalesce(array_to_string(p.proconfig, ','), '') || '|md5=' || md5(pg_get_functiondef(p.oid))
  from pg_proc p where p.pronamespace = 'public'::regnamespace
  union all
  -- grants de funciones de public
  select 'fgrant|' || p.proname || '|' || coalesce(array_to_string(array(select unnest(p.proacl)::text order by 1), ','), 'default')
  from pg_proc p where p.pronamespace = 'public'::regnamespace
  union all
  -- grants de tablas de public
  select 'tgrant|' || c.relname || '|' || coalesce(array_to_string(array(select unnest(c.relacl)::text order by 1), ','), 'default')
  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'S')
  union all
  -- enums
  select 'enum|' || t.typname || '|' || string_agg(e.enumlabel, ',' order by e.enumsortorder)
  from pg_type t join pg_enum e on e.enumtypid = t.oid where t.typnamespace = 'public'::regnamespace group by t.typname
  union all
  -- vistas de public
  select 'view|' || viewname || '|md5=' || md5(definition) from pg_views where schemaname = 'public'
  union all
  -- extensiones
  select 'ext|' || extname || '|' || extnamespace::regnamespace from pg_extension
  union all
  -- buckets
  select 'bucket|' || id || '|' || name || '|' || public || '|' || coalesce(file_size_limit::text, '') || '|' || coalesce(array_to_string(allowed_mime_types, ','), '')
  from storage.buckets
)
select k from x order by k;
