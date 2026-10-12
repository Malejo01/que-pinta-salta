-- Ronda 17 (17-c): la versión local, como pgTAP, de dos avisos del Performance
-- Advisor de Supabase sobre `pg_policies` del schema `public`, para que una
-- migración futura que los rompa falle en el CI (no hace falta volver a mirar
-- el advisor a mano).
--
-- Chequeo 1 (espejo de "auth_rls_initplan"): ninguna policy tiene, suelta en
-- `qual` o `with_check`, una llamada a auth.uid()/auth.role()/auth.jwt()/
-- auth.email() o is_admin() que no esté envuelta en "(select …)". Postgres
-- reescribe la envuelta como "( SELECT auth.uid() AS uid)" al guardar la
-- policy (mayúsculas, espacio antes del nombre); el chequeo cuenta, con
-- regexp_matches(), cuántas veces aparece cada función en total y cuántas
-- veces aparece precedida de "SELECT": la diferencia son las llamadas sueltas.
-- Se valida con policies de control (casos marcables y no marcables, hechas
-- en esta misma transacción, ver más abajo) antes de confiar en el resultado
-- contra el esquema real, tal como pide la consigna.
--
-- Chequeo 2 (espejo de "multiple_permissive_policies"): para cada tabla, cada
-- rol efectivo (anon, authenticated; "public" cuenta para los dos) y cada
-- acción (ALL cuenta para las cuatro), como mucho una policy PERMISSIVE. Para
-- "ver" los roles/acciones reales hay que expandir el array `roles` y el
-- `cmd` de cada policy antes de agrupar y contar.
--
-- Estado histórico: antes de la migración `20261010120000_rls_initplan.sql`
-- el chequeo 1 fallaba con 35 policies (41 ocurrencias puntuales, contando
-- qual/with_check por separado) con una llamada suelta a auth.*()/is_admin(),
-- y el chequeo 2 fallaba con 21 combinaciones de tabla+rol+acción con más de
-- una policy permisiva (aliases, categories, cinema_movies, favorites,
-- instagram_accounts, instagram_flyers, profiles, scrape_runs,
-- scrape_sources, venue_aliases, venues) — no exactamente "24" y "~30" como
-- decía la estimación del plan ni lo que reporta hoy el Performance Advisor
-- de producción (24 y 30: cuenta distinto que este archivo).
--
-- Desde esa migración (aplicada en este mismo PR) los dos chequeos globales
-- tienen que quedar en verde. Si alguno de los dos vuelve a FALLAR es porque
-- una migración nueva agregó una policy con una llamada suelta a
-- auth.*()/is_admin(), o una segunda policy PERMISSIVE para la misma
-- combinación de tabla/rol/acción.
--
-- Todo en una transacción con rollback: las dos tablas de control
-- (qa_rls_lint_ctrl1, qa_rls_lint_ctrl2) y las funciones auxiliares en
-- pg_temp desaparecen al terminar. No se toca ninguna tabla real ni se lee
-- ninguna fila de datos (pg_policies es metadata, no tiene datos personales).
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- ---------------------------------------------------------------------------
-- Funciones auxiliares (pg_temp: viven solo en esta sesión/transacción).
-- Reciben only_tables / exclude_tables para poder correr el mismo chequeo
-- sobre las tablas de control o sobre el esquema real sin repetir la consulta.
-- ---------------------------------------------------------------------------

create function pg_temp.rls_lint_check1(only_tables text[] default null, exclude_tables text[] default null)
returns table(tablename text, policyname text, cmd text, motivo text)
language sql
as $fn$
  with pol as (
    select
      p.tablename::text as tablename,
      p.policyname::text as policyname,
      p.cmd::text as cmd,
      coalesce(p.qual, '') as qual,
      coalesce(p.with_check, '') as with_check
    from pg_policies p
    where p.schemaname = 'public'
      and (only_tables is null or p.tablename::text = any(only_tables))
      and (exclude_tables is null or p.tablename::text <> all(exclude_tables))
  ),
  -- \m = inicio de palabra (evita que "my_is_admin()" matchee como is_admin()).
  fns(label, re) as (
    values
      ('auth.uid()',   '\mauth\.uid\s*\('),
      ('auth.role()',  '\mauth\.role\s*\('),
      ('auth.jwt()',   '\mauth\.jwt\s*\('),
      ('auth.email()', '\mauth\.email\s*\('),
      ('is_admin()',   '\mis_admin\s*\(')
  ),
  findings as (
    select
      p.tablename, p.policyname, p.cmd, f.label,
      (select count(*) from regexp_matches(p.qual, f.re, 'g'))
        - (select count(*) from regexp_matches(p.qual, '(?i)SELECT\s+' || f.re, 'g')) as loose_qual,
      (select count(*) from regexp_matches(p.with_check, f.re, 'g'))
        - (select count(*) from regexp_matches(p.with_check, '(?i)SELECT\s+' || f.re, 'g')) as loose_check
    from pol p cross join fns f
  )
  select tablename, policyname, cmd,
    string_agg(
      label || case when loose_qual > 0 and loose_check > 0 then ' (qual y with_check)'
                     when loose_qual > 0 then ' (qual)'
                     else ' (with_check)' end,
      ', ' order by label
    ) as motivo
  from findings
  where loose_qual > 0 or loose_check > 0
  group by tablename, policyname, cmd;
$fn$;

create function pg_temp.rls_lint_check2(only_tables text[] default null, exclude_tables text[] default null)
returns table(tablename text, role text, action text, cantidad int, politicas text)
language sql
as $fn$
  with pol as (
    select
      p.tablename::text as tablename,
      p.policyname::text as policyname,
      p.permissive::text as permissive,
      -- "public" en roles cubre anon y authenticated; cualquier otro rol que
      -- no sea esos dos (hoy no hay ninguno) se ignora, porque postgres y
      -- service_role bypassean RLS y no participan de esta matriz.
      case when 'public'::name = any(p.roles) then array['anon','authenticated']
           else array(select r::text from unnest(p.roles) r where r::text in ('anon','authenticated'))
      end as eff_roles,
      case when p.cmd = 'ALL' then array['SELECT','INSERT','UPDATE','DELETE'] else array[p.cmd::text] end as eff_actions
    from pg_policies p
    where p.schemaname = 'public'
      and (only_tables is null or p.tablename::text = any(only_tables))
      and (exclude_tables is null or p.tablename::text <> all(exclude_tables))
  ),
  expanded as (
    select tablename, policyname, permissive, r as role, a as action
    from pol, unnest(eff_roles) r, unnest(eff_actions) a
  )
  select tablename, role, action, count(*)::int as cantidad,
    string_agg(policyname, ', ' order by policyname) as politicas
  from expanded
  -- Solo PERMISSIVE, como el advisor: las RESTRICTIVE se combinan con AND
  -- (no "OR" entre sí como las permisivas), así que varias RESTRICTIVE para
  -- la misma tabla/rol/acción no son un problema de rendimiento.
  where permissive = 'PERMISSIVE'
  group by tablename, role, action
  having count(*) > 1;
$fn$;

-- ---------------------------------------------------------------------------
-- Preparación: tabla de control del chequeo 1. Dos policies envueltas en
-- (select …) (una con auth.uid(), otra con is_admin()) que NO tienen que
-- marcarse, tres sueltas a nivel de tope (auth.uid() en qual, auth.uid() en
-- with_check, is_admin() en qual) que SÍ tienen que marcarse, una suelta
-- dentro de un "exists (select 1 from … where …)" (el patrón real de la
-- vieja policy "Admins can manage aliases" de la baseline) que también TIENE
-- que marcarse, y una que llama a una función de control cuyo nombre
-- contiene "is_admin" como subcadena (my_is_admin(), no la función
-- is_admin()) que NO tiene que marcarse (ver el comentario de \m, más abajo).
-- ---------------------------------------------------------------------------
create table qa_rls_lint_ctrl1 (id uuid primary key default gen_random_uuid(), user_id uuid);
alter table qa_rls_lint_ctrl1 enable row level security;

create function pg_temp.my_is_admin() returns boolean
language sql
as $fn$ select true $fn$;

create policy "ctrl1 envuelta uid" on qa_rls_lint_ctrl1
  for select using ((select auth.uid()) = user_id);
create policy "ctrl1 envuelta admin" on qa_rls_lint_ctrl1
  for select using ((select is_admin()));
create policy "ctrl1 suelta uid qual" on qa_rls_lint_ctrl1
  for update using (auth.uid() = user_id);
create policy "ctrl1 suelta uid check" on qa_rls_lint_ctrl1
  for insert with check (auth.uid() = user_id);
create policy "ctrl1 suelta admin" on qa_rls_lint_ctrl1
  for delete using (is_admin());
create policy "ctrl1 suelta exists" on qa_rls_lint_ctrl1
  for select using (
    exists (
      select 1 from qa_rls_lint_ctrl1 as inner_t
      where inner_t.id = qa_rls_lint_ctrl1.id
        and auth.uid() = inner_t.user_id
    )
  );
create policy "ctrl1 falso positivo my_is_admin" on qa_rls_lint_ctrl1
  for select using (pg_temp.my_is_admin());

-- ---------------------------------------------------------------------------
-- Preparación: tabla de control del chequeo 2. Una policy sola en
-- (authenticated, DELETE) que NO tiene que marcarse, y dos policies
-- permisivas de SELECT ("to public", así que cubren anon y authenticated)
-- que SÍ tienen que marcarse en ambos roles.
-- ---------------------------------------------------------------------------
create table qa_rls_lint_ctrl2 (id uuid primary key default gen_random_uuid());
alter table qa_rls_lint_ctrl2 enable row level security;

create policy "ctrl2 clean delete" on qa_rls_lint_ctrl2
  for delete to authenticated using (true);
create policy "ctrl2 dup select a" on qa_rls_lint_ctrl2
  for select using (true);
create policy "ctrl2 dup select b" on qa_rls_lint_ctrl2
  for select using (true);

-- ===========================================================================
-- CONTROLES
-- ===========================================================================

-- 1. Chequeo 1, falsos positivos: ninguna de las dos envueltas se marca.
select is(
  (select coalesce(string_agg(tablename || '.' || policyname || ' (' || cmd || '): ' || motivo, E'\n' order by policyname), '')
   from pg_temp.rls_lint_check1(only_tables => array['qa_rls_lint_ctrl1'])
   where policyname in ('ctrl1 envuelta uid', 'ctrl1 envuelta admin')),
  '',
  '1. control chequeo 1: auth.uid()/is_admin() envueltos en (select …) no se marcan'
);

-- 2. Chequeo 1, falsos negativos: las tres sueltas sí se marcan (ninguna falta).
select is(
  (select coalesce(string_agg(esperado.policyname, ', ' order by esperado.policyname), '')
   from (values ('ctrl1 suelta uid qual'), ('ctrl1 suelta uid check'), ('ctrl1 suelta admin')) as esperado(policyname)
   where esperado.policyname not in (
     select policyname from pg_temp.rls_lint_check1(only_tables => array['qa_rls_lint_ctrl1'])
   )),
  '',
  '2. control chequeo 1: auth.uid() (qual y with_check) e is_admin() sueltos sí se marcan'
);

-- 3. Chequeo 2, caso limpio: una sola policy permisiva en (authenticated, DELETE) no se marca.
select is(
  (select coalesce(string_agg(tablename || '/' || role || '/' || action || ': ' || politicas, E'\n'), '')
   from pg_temp.rls_lint_check2(only_tables => array['qa_rls_lint_ctrl2'])
   where role = 'authenticated' and action = 'DELETE'),
  '',
  '3. control chequeo 2: una sola policy permisiva por rol y acción no se marca'
);

-- 4. Chequeo 2, caso duplicado: las dos de SELECT "to public" se marcan en anon y en authenticated.
select is(
  (select coalesce(string_agg(esperado.combo, ', ' order by esperado.combo), '')
   from (values ('anon/SELECT'), ('authenticated/SELECT')) as esperado(combo)
   where esperado.combo not in (
     select role || '/' || action
     from pg_temp.rls_lint_check2(only_tables => array['qa_rls_lint_ctrl2'])
   )),
  '',
  '4. control chequeo 2: dos policies permisivas del mismo rol y acción sí se marcan'
);

-- 5. Chequeo 1, falso negativo dentro de un subselect: una llamada suelta
--    metida en "exists (select 1 from … where …)" también se marca (es el
--    regex sobre el texto completo de la policy, no solo el nivel de tope;
--    este control existe para que un regex futuro "más estricto" no deje
--    pasar en silencio el patrón real de la vieja policy "Admins can manage
--    aliases" de la baseline).
select is(
  (select coalesce(string_agg(policyname, ', '), '')
   from pg_temp.rls_lint_check1(only_tables => array['qa_rls_lint_ctrl1'])
   where policyname = 'ctrl1 suelta exists'),
  'ctrl1 suelta exists',
  '5. control chequeo 1: auth.uid() suelto dentro de un exists (…) también se marca'
);

-- 6. Chequeo 1, falso positivo evitado: una función de control cuyo nombre
--    contiene "is_admin" como subcadena (my_is_admin(), no la función
--    is_admin()) no se marca, gracias al \m (inicio de palabra) del regex.
select is(
  (select coalesce(string_agg(policyname, ', '), '')
   from pg_temp.rls_lint_check1(only_tables => array['qa_rls_lint_ctrl1'])
   where policyname = 'ctrl1 falso positivo my_is_admin'),
  '',
  '6. control chequeo 1: my_is_admin() no se confunde con is_admin() y no se marca'
);

-- ===========================================================================
-- CHEQUEOS GLOBALES (sobre el esquema real, sin las tablas de control)
-- ===========================================================================

-- Se vuelca el detalle con diag() además de en el "have" del is(), para que
-- quede legible en la salida de "npx supabase test db" aunque el runner
-- recorte el mensaje de fallo.
select diag(
  (select coalesce(string_agg(tablename || '.' || policyname || ' (' || cmd || '): ' || motivo, E'\n' order by tablename, cmd, policyname), '(sin hallazgos)')
   from pg_temp.rls_lint_check1(exclude_tables => array['qa_rls_lint_ctrl1', 'qa_rls_lint_ctrl2']))
);

-- 7. Chequeo 1 global: ninguna policy de `public` tiene auth.*()/is_admin()
--    suelto. Antes de la migración `20261010120000_rls_initplan.sql` esto
--    fallaba con 35 policies (41 ocurrencias); desde esa migración tiene que
--    quedar en verde. Si vuelve a FALLAR es porque una migración nueva
--    agregó una policy con una llamada suelta a auth.*()/is_admin().
select is(
  (select coalesce(string_agg(tablename || '.' || policyname || ' (' || cmd || '): ' || motivo, E'\n' order by tablename, cmd, policyname), '')
   from pg_temp.rls_lint_check1(exclude_tables => array['qa_rls_lint_ctrl1', 'qa_rls_lint_ctrl2'])),
  '',
  '7. Chequeo 1: ninguna policy de public tiene auth.uid()/auth.role()/auth.jwt()/auth.email()/is_admin() suelto'
);

select diag(
  (select coalesce(string_agg(tablename || '/' || role || '/' || action || ': ' || politicas, E'\n' order by tablename, role, action), '(sin hallazgos)')
   from pg_temp.rls_lint_check2(exclude_tables => array['qa_rls_lint_ctrl1', 'qa_rls_lint_ctrl2']))
);

-- 8. Chequeo 2 global: ninguna tabla tiene más de una policy permisiva por
--    rol efectivo y acción. Antes de la migración
--    `20261010120000_rls_initplan.sql` esto fallaba con 21 combinaciones de
--    tabla+rol+acción; desde esa migración tiene que quedar en verde. Si
--    vuelve a FALLAR es porque una migración nueva agregó una segunda
--    policy PERMISSIVE para la misma combinación.
select is(
  (select coalesce(string_agg(tablename || '/' || role || '/' || action || ': ' || politicas, E'\n' order by tablename, role, action), '')
   from pg_temp.rls_lint_check2(exclude_tables => array['qa_rls_lint_ctrl1', 'qa_rls_lint_ctrl2'])),
  '',
  '8. Chequeo 2: ninguna tabla tiene más de una policy permisiva por rol efectivo y acción'
);

select * from finish();
rollback;
