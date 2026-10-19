-- pgTAP de 20261018130300_qps_190_delete_my_account.sql: delete_my_account()
-- borra solo lo de auth.uid(), en una transacción, y no lo puede llamar nadie
-- más que authenticated. uuid fijo, prefijo "19" (inventados,
-- "qa-borrar-..."). Todo en una transacción con rollback.
--   V = 19000000-0000-4000-8000-000000000001: quien borra su cuenta.
--   O = 19000000-0000-4000-8000-000000000002: otra persona, con lo mismo.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- ---------------------------------------------------------------------------
-- Definición y permisos.
-- ---------------------------------------------------------------------------

select ok(
  (select prosecdef and proconfig = array['search_path=""']
   from pg_proc where oid = 'public.delete_my_account()'::regprocedure),
  '1. delete_my_account: SECURITY DEFINER con search_path vacío'
);
select ok(
  has_function_privilege('authenticated', 'public.delete_my_account()', 'EXECUTE'),
  '2. delete_my_account: authenticated la puede ejecutar'
);
select ok(
  not has_function_privilege('anon', 'public.delete_my_account()', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.delete_my_account()', 'EXECUTE'),
  '3. delete_my_account: ni anon ni service_role la pueden ejecutar'
);

-- 4. Las FK hacia auth.users y profiles del schema public son exactamente las
--    que cubre la función (si aparece una nueva, este caso falla y hay que
--    sumarla a la función y a apps/web/lib/cuenta/tablas-personales.ts).
select is(
  (select string_agg(c.conrelid::regclass::text || '.' || a.attname, ','
                     order by c.conrelid::regclass::text, a.attname::text)
   from pg_constraint c
   join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
   where c.contype = 'f' and c.connamespace = 'public'::regnamespace
     and c.confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)),
  'aliases.created_by,duplicate_dismissals.decided_by,event_attendance.user_id,events.created_by,'
  || 'events.featured_set_by,favorites.user_id,notification_preferences.user_id,notification_sends.user_id,'
  || 'profiles.id,push_tokens.user_id,scrape_runs.triggered_by,sponsored_campaigns.created_by,'
  || 'user_favorites.user_id,user_followed_categories.user_id,user_followed_instagram_accounts.user_id,'
  || 'user_followed_venues.user_id,user_radar_settings.user_id,venue_aliases.created_by,'
  || 'venue_review_queue.reviewed_by',
  '4. las FK a auth.users/profiles son las 19 que cubre delete_my_account()'
);

-- ---------------------------------------------------------------------------
-- Fixtures (como postgres): V y O con una fila en cada tabla.
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000', '19000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'qa-borrar-v@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '19000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'qa-borrar-o@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');

insert into public.categories (id, name, slug)
values ('19c00000-0000-4000-8000-000000000001', 'QA Borrar Categoria', 'qa-borrar-categoria');
insert into public.venues (id, name, address)
values ('19a00000-0000-4000-8000-000000000001', 'QA Borrar Lugar', 'Calle QA 19');
insert into public.instagram_accounts (id, username, display_name)
values ('19b00000-0000-4000-8000-000000000001', 'qa_borrar_cuenta', 'QA Borrar Cuenta');

-- Un evento de cada uno, y uno destacado por V.
insert into public.events (id, title, slug, start_date, status, created_by, featured_set_by)
values
  ('19e00000-0000-4000-8000-000000000001', 'QA Borrar Evento V', 'qa-borrar-evento-v',
   now() + interval '1 day', 'PUBLISHED', '19000000-0000-4000-8000-000000000001', null),
  ('19e00000-0000-4000-8000-000000000002', 'QA Borrar Evento O', 'qa-borrar-evento-o',
   now() + interval '1 day', 'PUBLISHED', '19000000-0000-4000-8000-000000000002',
   '19000000-0000-4000-8000-000000000001');

insert into public.favorites (user_id, event_id) values
  ('19000000-0000-4000-8000-000000000001', '19e00000-0000-4000-8000-000000000002'),
  ('19000000-0000-4000-8000-000000000002', '19e00000-0000-4000-8000-000000000001');
insert into public.user_favorites (user_id, event_id) values
  ('19000000-0000-4000-8000-000000000001', '19e00000-0000-4000-8000-000000000002'),
  ('19000000-0000-4000-8000-000000000002', '19e00000-0000-4000-8000-000000000001');
insert into public.event_attendance (user_id, event_id, kind) values
  ('19000000-0000-4000-8000-000000000001', '19e00000-0000-4000-8000-000000000002', 'voy'),
  ('19000000-0000-4000-8000-000000000002', '19e00000-0000-4000-8000-000000000001', 'voy');
insert into public.push_tokens (user_id, token, platform) values
  ('19000000-0000-4000-8000-000000000001', 'qa-borrar-token-v', 'android'),
  ('19000000-0000-4000-8000-000000000002', 'qa-borrar-token-o', 'ios');
insert into public.notification_preferences (user_id) values
  ('19000000-0000-4000-8000-000000000001'),
  ('19000000-0000-4000-8000-000000000002');
insert into public.notification_sends (user_id, kind, channel, status, dedupe_key) values
  ('19000000-0000-4000-8000-000000000001', 'qa', 'push', 'enviado', 'qa-borrar-envio-v'),
  ('19000000-0000-4000-8000-000000000002', 'qa', 'push', 'enviado', 'qa-borrar-envio-o');
insert into public.user_radar_settings (user_id) values
  ('19000000-0000-4000-8000-000000000001'),
  ('19000000-0000-4000-8000-000000000002');
insert into public.user_followed_categories (user_id, category_id) values
  ('19000000-0000-4000-8000-000000000001', '19c00000-0000-4000-8000-000000000001'),
  ('19000000-0000-4000-8000-000000000002', '19c00000-0000-4000-8000-000000000001');
insert into public.user_followed_venues (user_id, venue_id) values
  ('19000000-0000-4000-8000-000000000001', '19a00000-0000-4000-8000-000000000001'),
  ('19000000-0000-4000-8000-000000000002', '19a00000-0000-4000-8000-000000000001');
insert into public.user_followed_instagram_accounts (user_id, instagram_account_id) values
  ('19000000-0000-4000-8000-000000000001', '19b00000-0000-4000-8000-000000000001'),
  ('19000000-0000-4000-8000-000000000002', '19b00000-0000-4000-8000-000000000001');
insert into public.duplicate_dismissals (event_a, event_b, decided_by) values
  ('19e00000-0000-4000-8000-000000000001', '19e00000-0000-4000-8000-000000000002',
   '19000000-0000-4000-8000-000000000001');
insert into public.aliases (alias, target_type, target_id, created_by) values
  ('qa-borrar-alias-v', 'venue', '19a00000-0000-4000-8000-000000000001', '19000000-0000-4000-8000-000000000001');
insert into public.venue_aliases (venue_id, alias, created_by) values
  ('19a00000-0000-4000-8000-000000000001', 'qa-borrar-venue-alias-v', '19000000-0000-4000-8000-000000000001');
insert into public.venue_review_queue (raw_name, reviewed_by) values
  ('QA Borrar Cola V', '19000000-0000-4000-8000-000000000001');
insert into public.scrape_runs (source_key, status, triggered_by) values
  ('qa-borrar', 'SUCCESS', '19000000-0000-4000-8000-000000000001');
insert into public.sponsored_campaigns (title, body, url, starts_at, ends_at, created_by) values
  ('QA Borrar Campaña', 'QA', 'https://example.com/qa', now(), now() + interval '1 day',
   '19000000-0000-4000-8000-000000000001');

-- Cuenta de filas de una persona en las tablas personales (helper del test).
create function pg_temp.filas_de(p uuid) returns integer language sql as $f$
  select (
    (select count(*) from public.favorites where user_id = p)
    + (select count(*) from public.user_favorites where user_id = p)
    + (select count(*) from public.event_attendance where user_id = p)
    + (select count(*) from public.push_tokens where user_id = p)
    + (select count(*) from public.notification_preferences where user_id = p)
    + (select count(*) from public.notification_sends where user_id = p)
    + (select count(*) from public.user_radar_settings where user_id = p)
    + (select count(*) from public.user_followed_categories where user_id = p)
    + (select count(*) from public.user_followed_venues where user_id = p)
    + (select count(*) from public.user_followed_instagram_accounts where user_id = p)
    + (select count(*) from public.duplicate_dismissals where decided_by = p)
    + (select count(*) from public.profiles where id = p)
  )::int
$f$;

-- 5. Preparación: V tiene 12 filas personales, O tiene 11 (sin duplicate_dismissals).
select is(pg_temp.filas_de('19000000-0000-4000-8000-000000000001'), 12,
  '5. prep: V tiene 12 filas personales');
select is(pg_temp.filas_de('19000000-0000-4000-8000-000000000002'), 11,
  '6. prep: O tiene 11 filas personales');

-- ---------------------------------------------------------------------------
-- Sin sesión: 42501.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated"}';
select throws_ok(
  $$select public.delete_my_account()$$,
  '42501', NULL,
  '7. authenticated sin sub (auth.uid() null): 42501'
);
reset role;
reset request.jwt.claims;

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok(
  $$select public.delete_my_account()$$,
  '42501', NULL,
  '8. anon: sin permiso de EXECUTE (42501)'
);
reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- Transaccional: si un paso falla, no cambia nada. Una tabla con FK NO ACTION
-- a profiles hace fallar el DELETE de profiles (el paso 3, después de
-- desvincular y de borrar casi todo). Es una tabla real (las temporales no
-- pueden tener FK a tablas permanentes), creada y borrada dentro de esta
-- transacción; el rollback del final la saca igual.
-- ---------------------------------------------------------------------------
create table public.qa_borrar_bloqueo (perfil uuid references public.profiles(id));
insert into public.qa_borrar_bloqueo values ('19000000-0000-4000-8000-000000000001');

set local role authenticated;
set local request.jwt.claims = '{"sub":"19000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$select public.delete_my_account()$$,
  '23503', NULL,
  '9. si el DELETE de profiles falla (FK), la función tira el error'
);
reset role;
reset request.jwt.claims;

select is(pg_temp.filas_de('19000000-0000-4000-8000-000000000001'), 12,
  '10. después del error, V sigue con sus 12 filas personales (nada a medias)');
select is(
  (select created_by from public.events where id = '19e00000-0000-4000-8000-000000000001'),
  '19000000-0000-4000-8000-000000000001'::uuid,
  '11. después del error, el evento de V sigue a su nombre (la desvinculación se deshizo)'
);

drop table public.qa_borrar_bloqueo;

-- ---------------------------------------------------------------------------
-- V borra su cuenta.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"19000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok(
  $$select public.delete_my_account()$$,
  '12. V: delete_my_account() no falla'
);
reset role;
reset request.jwt.claims;

select is(pg_temp.filas_de('19000000-0000-4000-8000-000000000001'), 0,
  '13. V: no le queda ninguna fila personal');
select is(
  (select count(*)::int from auth.users where id = '19000000-0000-4000-8000-000000000001'),
  0,
  '14. V: su fila de auth.users no está más'
);
select is(pg_temp.filas_de('19000000-0000-4000-8000-000000000002'), 11,
  '15. O: sigue con sus 11 filas personales');
select is(
  (select count(*)::int from auth.users where id = '19000000-0000-4000-8000-000000000002'),
  1,
  '16. O: su cuenta sigue'
);

-- Contenido público desvinculado, no borrado.
select ok(
  (select created_by is null and status = 'PUBLISHED'
   from public.events where id = '19e00000-0000-4000-8000-000000000001'),
  '17. el evento de V sigue publicado, sin autor'
);
select ok(
  (select created_by = '19000000-0000-4000-8000-000000000002' and featured_set_by is null
   from public.events where id = '19e00000-0000-4000-8000-000000000002'),
  '18. el evento de O sigue de O; featured_set_by (era V) quedó en null'
);
select is(
  (select count(*)::int from public.aliases where alias = 'qa-borrar-alias-v' and created_by is null),
  1, '19. aliases: el alias de V queda, sin autor');
select is(
  (select count(*)::int from public.venue_aliases where alias = 'qa-borrar-venue-alias-v' and created_by is null),
  1, '20. venue_aliases: queda, sin autor');
select is(
  (select count(*)::int from public.venue_review_queue where raw_name = 'QA Borrar Cola V' and reviewed_by is null),
  1, '21. venue_review_queue: queda, sin revisor');
select is(
  (select count(*)::int from public.scrape_runs where source_key = 'qa-borrar' and triggered_by is null),
  1, '22. scrape_runs: queda, sin quién la disparó');
select is(
  (select count(*)::int from public.sponsored_campaigns where title = 'QA Borrar Campaña' and created_by is null),
  1, '23. sponsored_campaigns: queda, sin autor');

-- 24. Los favoritos de O sobre el evento de V siguen (no se borra por event_id).
select is(
  (select count(*)::int from public.user_favorites
   where user_id = '19000000-0000-4000-8000-000000000002' and event_id = '19e00000-0000-4000-8000-000000000001'),
  1,
  '24. O: su favorito del evento de V sigue'
);

select * from finish();
rollback;
