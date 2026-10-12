-- Ronda 17 (17-a): la foto de hoy de quién puede qué en cada tabla de `public`
-- con RLS, ANTES de que la migración de 17-b toque una sola policy. Corre
-- contra el esquema actual, con los triggers de la Ronda 15 ya aplicados
-- (tr_enforce_event_user_rules, tr_force_user_role_on_insert,
-- tr_prevent_role_tampering, tr_enforce_radar_email_target).
--
-- Cuatro actores, inventados y creados dentro de la transacción:
--   anon          -> set local role anon;          claims sin "sub"
--   A             -> set local role authenticated; claims con "sub" de A
--   B             -> (no actúa directo: su fila es la que A no tiene que ver)
--   ADMIN         -> set local role authenticated; claims con "sub" del admin
--   service_role  -> set local role service_role;  claims role=service_role
-- (más "postgres", que es quien prepara los datos: `reset role` vuelve a él.
-- postgres y service_role tienen rolbypassrls=true en esta base, así que para
-- ellos todo lo de abajo sale por el camino corto: ninguna policy los filtra.)
--
-- Convención lives_ok / throws_ok / is(...,0,...), igual en las ~20 tablas:
--   - Lectura: is(count) sobre un conjunto armado a propósito con slugs/ids
--     "qa-rls-...", nunca select count(*) de la tabla entera (algunas, como
--     profiles, pueden tener filas reales de producción en esta base local).
--   - Escritura permitida: lives_ok.
--   - Escritura negada en un INSERT: throws_ok con '42501' (insufficient_
--     privilege, el código estándar de "new row violates row-level security
--     policy"). En un INSERT no hay fila previa que USING pueda filtrar: el
--     único control es WITH CHECK, y si falla, Postgres aborta la sentencia.
--   - Escritura negada en un UPDATE o DELETE: la policy filtra en silencio.
--     El USING de la policy decide qué filas ve la sentencia ANTES de
--     tocarlas; si la fila ajena no matchea ningún USING permisivo, el
--     UPDATE/DELETE simplemente no la encuentra: 0 filas afectadas, sin
--     error. Por eso estos casos van con is(...) releyendo el valor (como
--     postgres, que sí ve todo) en vez de throws_ok.
--
-- Todas las filas son inventadas y evidentes ("QA RLS ..."), creadas dentro
-- de esta transacción; el rollback del final no deja rastro. No se lee
-- ninguna fila real de profiles/auth.* fuera de las que crea este archivo.
begin;
create extension if not exists pgtap with schema extensions;
select plan(80);

-- ---------------------------------------------------------------------------
-- Preparación general (como postgres, antes de que actúe ningún rol: así no
-- hace falta "reset request.jwt.claims" entre fixtures, porque todavía no se
-- seteó ningún claim).
--
-- uuids fijos e inventados, prefijo b0000000 (distinto del a0000000... que ya
-- usa reglas_app.test.sql, aunque corran en transacciones separadas):
--   A     = b...001 = qa-rls-a@example.com
--   B     = b...002 = qa-rls-b@example.com (nunca actúa: es "lo ajeno" que A
--           no tiene que ver ni editar)
--   ADMIN = b...003 = qa-rls-admin@example.com (perfil pasa a ADMIN abajo)
--   C     = b...004 = qa-rls-c@example.com (sin perfil: para el INSERT en
--           profiles con el id de otra cuenta que sí existe en auth.users)
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'qa-rls-a@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"QA RLS Usuario A"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'qa-rls-b@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"QA RLS Usuario B"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'qa-rls-admin@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"QA RLS Admin"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-000000000004',
   'authenticated', 'authenticated', 'qa-rls-c@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
   '', '', '', '');

-- handle_new_user ya creó los 4 perfiles en USER. El del admin pasa a ADMIN
-- (se deshabilita tr_prevent_role_tampering solo para esta fila, como hace
-- reglas_app.test.sql: ese trigger no deja cambiar el role salvo
-- service_role/is_admin(), y corriendo como postgres sin claims ninguno de
-- los dos es cierto).
alter table public.profiles disable trigger tr_prevent_role_tampering;
update public.profiles set role = 'ADMIN'
  where id = 'b0000000-0000-4000-8000-000000000003';
alter table public.profiles enable trigger tr_prevent_role_tampering;

-- C se queda sin perfil: hace falta "un uid que existe en auth.users pero no
-- tiene fila en profiles" para el caso 15 (INSERT en profiles con el id de
-- otra cuenta que sí existe).
delete from public.profiles where id = 'b0000000-0000-4000-8000-000000000004';

-- Catálogos base (categories, venues, cinema_movies, instagram_accounts):
-- una fila propia en cada uno, con nombre/slug "qa-rls-..." para no mezclarse
-- con datos reales si esta base los llega a tener cargados.
insert into public.categories (name, slug) values ('QA RLS Categoria Uno', 'qa-rls-categoria-uno');
insert into public.venues (name, address, slug) values ('QA RLS Venue Uno', 'Dirección Inventada QA RLS 1, Salta', 'qa-rls-venue-uno');
insert into public.cinema_movies (slug, title) values ('qa-rls-pelicula-uno', 'QA RLS Película Uno');
insert into public.instagram_accounts (username, display_name) values ('qa_rls_cuenta_uno', 'QA RLS Cuenta Uno');

-- instagram_flyers: un ACTIVE y un ARCHIVED del mismo caso de ejemplo de la
-- consigna (anon/A ven 1, el admin ve 2).
insert into public.instagram_flyers (account_id, ig_post_id, ig_post_url, published_at, status, archived_at)
values
  ((select id from public.instagram_accounts where username = 'qa_rls_cuenta_uno'),
   'qa-rls-post-activo', 'https://instagram.com/p/qa-rls-activo', now(), 'ACTIVE', null),
  ((select id from public.instagram_accounts where username = 'qa_rls_cuenta_uno'),
   'qa-rls-post-archivado', 'https://instagram.com/p/qa-rls-archivado', now(), 'ARCHIVED', now());

-- events: público de B, dos drafts (uno de A, uno de B) y uno más de A
-- reservado para el caso de borrado propio. Todo insertado como postgres:
-- tr_enforce_event_user_rules no alcanza a current_user='postgres', así que
-- status/created_by quedan exactamente como se escriben acá.
insert into public.events (title, slug, start_date, status, created_by, venue_id, category_id)
values
  ('QA RLS Evento Publico', 'qa-rls-evento-publico', now() + interval '1 day', 'PUBLISHED',
   'b0000000-0000-4000-8000-000000000002',
   (select id from public.venues where slug = 'qa-rls-venue-uno'),
   (select id from public.categories where slug = 'qa-rls-categoria-uno')),
  ('QA RLS Evento Draft A', 'qa-rls-evento-draft-a', now() + interval '1 day', 'DRAFT',
   'b0000000-0000-4000-8000-000000000001', null, null),
  ('QA RLS Evento Draft B', 'qa-rls-evento-draft-b', now() + interval '1 day', 'DRAFT',
   'b0000000-0000-4000-8000-000000000002', null, null),
  ('QA RLS Evento Borrar A', 'qa-rls-evento-borrar-a', now() + interval '1 day', 'DRAFT',
   'b0000000-0000-4000-8000-000000000001', null, null);

-- aliases / venue_aliases, apuntando al venue qa-rls-venue-uno.
insert into public.aliases (alias, target_type, target_id)
values ('QA RLS Alias Uno', 'venue', (select id from public.venues where slug = 'qa-rls-venue-uno'));
insert into public.venue_aliases (venue_id, alias)
values ((select id from public.venues where slug = 'qa-rls-venue-uno'), 'QA RLS Alias Venue Uno');

-- venue_review_queue: una fila "pending" cualquiera. "normalized" es una
-- columna generada, no se inserta a mano.
insert into public.venue_review_queue (raw_name, source, similarity)
values ('QA RLS Lugar Revision', 'qa', 0.5);

-- scrape_sources / scrape_runs: lo que hoy escribe un admin autenticado
-- desde el panel (lib/scraper-actions.ts), no el scraper en sí.
insert into public.scrape_sources (key, name, site_url, is_enabled)
values ('qa-rls-fuente-uno', 'QA RLS Fuente Uno', 'https://example.com/qa-rls', true);
insert into public.scrape_runs (source_key, status)
values ('qa-rls-fuente-uno', 'RUNNING');

-- job_runs: lo que hoy escribe un cron con el cliente admin (service_role).
insert into public.job_runs (job_key, status) values ('qa-rls-job-uno', 'SUCCESS');

-- event_metrics_daily: una fila de métricas del evento público. "origin"
-- tiene un check constraint con valores fijos (hero/hoy/fila/busqueda/
-- favoritos/ficha/radar/directo); se usa "ficha" y se separan los días para
-- no pisar la primary key (event_id, day, origin, featured) con los INSERT
-- de los casos 79 y 80.
insert into public.event_metrics_daily (event_id, day, origin, views)
values ((select id from public.events where slug = 'qa-rls-evento-publico'), current_date, 'ficha', 5);

-- favorites / user_favorites / user_followed_* / user_radar_settings: todas
-- "de B", para que A las encuentre como "lo ajeno" en cada sección.
insert into public.favorites (user_id, event_id)
values ('b0000000-0000-4000-8000-000000000002',
        (select id from public.events where slug = 'qa-rls-evento-publico'));
insert into public.user_favorites (user_id, cinema_movie_id)
values ('b0000000-0000-4000-8000-000000000002',
        (select id from public.cinema_movies where slug = 'qa-rls-pelicula-uno'));
insert into public.user_followed_categories (user_id, category_id)
values ('b0000000-0000-4000-8000-000000000002',
        (select id from public.categories where slug = 'qa-rls-categoria-uno'));
insert into public.user_followed_venues (user_id, venue_id)
values ('b0000000-0000-4000-8000-000000000002',
        (select id from public.venues where slug = 'qa-rls-venue-uno'));
insert into public.user_followed_instagram_accounts (user_id, instagram_account_id)
values ('b0000000-0000-4000-8000-000000000002',
        (select id from public.instagram_accounts where username = 'qa_rls_cuenta_uno'));
insert into public.user_radar_settings (user_id, email_target, email_frequency)
values ('b0000000-0000-4000-8000-000000000002', 'qa-rls-b@example.com', 'weekly');

-- ===========================================================================
-- EVENTS
-- "Allow read for published or owner or admin" (status=PUBLISHED OR
-- auth.uid()=created_by OR is_admin()); insert/update/delete: owner o admin.
-- ===========================================================================

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is(
  (select count(*)::int from public.events where slug like 'qa-rls-evento-%'),
  1,
  '1. events/anon: de los 4 eventos qa-rls, solo ve el PUBLISHED'
);
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(
  (select count(*)::int from public.events where slug like 'qa-rls-evento-%'),
  3,
  '2. events/A: ve el PUBLISHED y sus dos propios drafts, no el de B'
);
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is(
  (select count(*)::int from public.events where slug like 'qa-rls-evento-%'),
  4,
  '3. events/admin: ve los 4, incluidos los dos drafts'
);
reset role;
reset request.jwt.claims;

-- 4. A, UPDATE del draft de B: el USING de la policy (auth.uid()=created_by
--    OR is_admin()) no matchea esa fila, así que el UPDATE la filtra en
--    silencio (0 filas, sin error).
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
update public.events set title = 'QA RLS Hackeado' where slug = 'qa-rls-evento-draft-b';
reset role;
reset request.jwt.claims;
select is(
  (select title from public.events where slug = 'qa-rls-evento-draft-b'),
  'QA RLS Evento Draft B',
  '4. events/A: el UPDATE del draft de B no cambia nada (RLS lo filtra, 0 filas)'
);

-- 5. A, DELETE del draft de B: mismo USING, mismo filtrado en silencio.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
delete from public.events where slug = 'qa-rls-evento-draft-b';
reset role;
reset request.jwt.claims;
select is(
  (select count(*)::int from public.events where slug = 'qa-rls-evento-draft-b'),
  1,
  '5. events/A: el DELETE del draft de B no borra nada (RLS lo filtra, 0 filas)'
);

-- 6. A, DELETE de su propio draft: sí matchea el USING (auth.uid()=created_by).
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok(
  $$delete from public.events where slug = 'qa-rls-evento-borrar-a'$$,
  '6. events/A: el DELETE de su propio draft no se rechaza'
);
reset role;
reset request.jwt.claims;

-- 7. anon, INSERT: la policy de INSERT es "TO authenticated", anon no
--    matchea ninguna -> WITH CHECK falla -> excepción (no hay fila previa
--    que filtrar, es la única sentencia posible y aborta).
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok(
  $$insert into public.events (title, slug, start_date)
    values ('QA RLS Evento Anon', 'qa-rls-evento-anon', now() + interval '1 day')$$,
  '42501', NULL,
  '7. events/anon: el INSERT se rechaza'
);
reset role;
reset request.jwt.claims;

-- 8. A, INSERT propio: matchea "auth.uid()=created_by AND status=DRAFT"
--    (tr_enforce_event_user_rules fuerza created_by/status antes del check).
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok(
  $$insert into public.events (title, slug, start_date)
    values ('QA RLS Evento Nuevo A', 'qa-rls-evento-nuevo-a', now() + interval '1 day')$$,
  '8. events/A: el INSERT propio no se rechaza'
);
reset role;
reset request.jwt.claims;

-- 9. admin, UPDATE del evento público (de B): is_admin() lo deja pasar aunque
--    no sea el dueño.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select lives_ok(
  $$update public.events set title = 'QA RLS Evento Publico (admin)' where slug = 'qa-rls-evento-publico'$$,
  '9. events/admin: el UPDATE del evento de B no se rechaza'
);
reset role;
reset request.jwt.claims;

-- 10. service_role, INSERT publicado: el camino de la ingesta. rolbypassrls
--     hace que ninguna policy se evalúe.
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select lives_ok(
  $$insert into public.events (title, slug, start_date, status)
    values ('QA RLS Evento Service', 'qa-rls-evento-service', now() + interval '1 day', 'PUBLISHED')$$,
  '10. events/service_role: el INSERT publicado (ingesta) no se rechaza'
);
reset role;
reset request.jwt.claims;

-- ===========================================================================
-- PROFILES
-- Lectura/escritura: dueño o admin (auth.uid()=id OR is_admin()); el INSERT
-- exige auth.uid()=id (nadie crea el perfil de otro).
-- ===========================================================================

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is(
  (select count(*)::int from public.profiles
   where id in ('b0000000-0000-4000-8000-000000000001',
                'b0000000-0000-4000-8000-000000000002',
                'b0000000-0000-4000-8000-000000000003')),
  0,
  '11. profiles/anon: no ve ninguno de los 3 perfiles de prueba'
);
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(
  (select count(*)::int from public.profiles
   where id in ('b0000000-0000-4000-8000-000000000001',
                'b0000000-0000-4000-8000-000000000002',
                'b0000000-0000-4000-8000-000000000003')),
  1,
  '12. profiles/A: de los 3, solo ve el suyo'
);
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is(
  (select count(*)::int from public.profiles
   where id in ('b0000000-0000-4000-8000-000000000001',
                'b0000000-0000-4000-8000-000000000002',
                'b0000000-0000-4000-8000-000000000003')),
  3,
  '13. profiles/admin: ve los 3'
);
reset role;
reset request.jwt.claims;

-- 14. A, UPDATE del full_name de B: USING (auth.uid()=id OR is_admin()) no
--     matchea la fila de B -> 0 filas, sin error.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
update public.profiles set full_name = 'QA RLS Hackeado' where id = 'b0000000-0000-4000-8000-000000000002';
reset role;
reset request.jwt.claims;
select is(
  (select full_name from public.profiles where id = 'b0000000-0000-4000-8000-000000000002'),
  'QA RLS Usuario B',
  '14. profiles/A: el UPDATE del full_name de B no cambia nada (RLS lo filtra, 0 filas)'
);

-- 15. A, INSERT de un perfil para C (existe en auth.users, no tiene perfil):
--     WITH CHECK exige auth.uid()=id; A no es C -> excepción.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$insert into public.profiles (id, email) values ('b0000000-0000-4000-8000-000000000004', 'qa-rls-c@example.com')$$,
  '42501', NULL,
  '15. profiles/A: el INSERT de un perfil para otra cuenta se rechaza'
);
reset role;
reset request.jwt.claims;

-- 16. admin, UPDATE del full_name de B: is_admin() lo permite.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select lives_ok(
  $$update public.profiles set full_name = 'QA RLS Usuario B (admin)' where id = 'b0000000-0000-4000-8000-000000000002'$$,
  '16. profiles/admin: el UPDATE del full_name de B no se rechaza'
);
reset role;
reset request.jwt.claims;

-- ===========================================================================
-- FAVORITES (tabla legacy user_id+event_id): dueño únicamente, sin admin.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(
  (select count(*)::int from public.favorites where user_id = 'b0000000-0000-4000-8000-000000000002'),
  0,
  '17. favorites/A: no ve el favorito de B'
);
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok(
  $$insert into public.favorites (user_id, event_id)
    values ('b0000000-0000-4000-8000-000000000001',
            (select id from public.events where slug = 'qa-rls-evento-publico'))$$,
  '18. favorites/A: el INSERT de su propio favorito no se rechaza'
);
-- 19. A, DELETE del favorito de B: USING (auth.uid()=user_id) no matchea su
--     fila -> 0 filas, sin error.
delete from public.favorites where user_id = 'b0000000-0000-4000-8000-000000000002';
reset role;
reset request.jwt.claims;
select is(
  (select count(*)::int from public.favorites where user_id = 'b0000000-0000-4000-8000-000000000002'),
  1,
  '19. favorites/A: el DELETE del favorito de B no borra nada (RLS lo filtra, 0 filas)'
);

-- ===========================================================================
-- USER_FAVORITES (event_id/instagram_flyer_id/cinema_movie_id): dueño
-- únicamente, sin admin. Misma forma que favorites.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(
  (select count(*)::int from public.user_favorites where user_id = 'b0000000-0000-4000-8000-000000000002'),
  0,
  '20. user_favorites/A: no ve el favorito de B'
);
select lives_ok(
  $$insert into public.user_favorites (user_id, cinema_movie_id)
    values ('b0000000-0000-4000-8000-000000000001',
            (select id from public.cinema_movies where slug = 'qa-rls-pelicula-uno'))$$,
  '21. user_favorites/A: el INSERT de su propio favorito no se rechaza'
);
-- 22. A, DELETE del favorito de B: 0 filas, sin error (mismo USING que arriba).
delete from public.user_favorites where user_id = 'b0000000-0000-4000-8000-000000000002';
reset role;
reset request.jwt.claims;
select is(
  (select count(*)::int from public.user_favorites where user_id = 'b0000000-0000-4000-8000-000000000002'),
  1,
  '22. user_favorites/A: el DELETE del favorito de B no borra nada (RLS lo filtra, 0 filas)'
);

-- ===========================================================================
-- USER_FOLLOWED_CATEGORIES: "ALL ... auth.uid()=user_id", dueño únicamente.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok(
  $$insert into public.user_followed_categories (user_id, category_id)
    values ('b0000000-0000-4000-8000-000000000001',
            (select id from public.categories where slug = 'qa-rls-categoria-uno'))$$,
  '23. user_followed_categories/A: el INSERT de su propio seguimiento no se rechaza'
);
-- 24. A, DELETE del seguimiento de B: 0 filas, sin error.
delete from public.user_followed_categories
where user_id = 'b0000000-0000-4000-8000-000000000002'
  and category_id = (select id from public.categories where slug = 'qa-rls-categoria-uno');
reset role;
reset request.jwt.claims;
select is(
  (select count(*)::int from public.user_followed_categories
   where user_id = 'b0000000-0000-4000-8000-000000000002'),
  1,
  '24. user_followed_categories/A: el DELETE del seguimiento de B no borra nada (RLS lo filtra, 0 filas)'
);

-- ===========================================================================
-- USER_FOLLOWED_VENUES: mismo patrón, y el caso que muestra que ACÁ el admin
-- NO tiene bypass (a diferencia de events/profiles/instagram_flyers, esta
-- policy es solo "auth.uid()=user_id", sin is_admin()).
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is(
  (select count(*)::int from public.user_followed_venues where user_id = 'b0000000-0000-4000-8000-000000000002'),
  0,
  '25. user_followed_venues/admin: NO ve el seguimiento de B (esta policy no tiene is_admin())'
);
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok(
  $$insert into public.user_followed_venues (user_id, venue_id)
    values ('b0000000-0000-4000-8000-000000000001',
            (select id from public.venues where slug = 'qa-rls-venue-uno'))$$,
  '26. user_followed_venues/A: el INSERT de su propio seguimiento no se rechaza'
);
-- 27. A, DELETE del seguimiento de B: 0 filas, sin error.
delete from public.user_followed_venues
where user_id = 'b0000000-0000-4000-8000-000000000002'
  and venue_id = (select id from public.venues where slug = 'qa-rls-venue-uno');
reset role;
reset request.jwt.claims;
select is(
  (select count(*)::int from public.user_followed_venues
   where user_id = 'b0000000-0000-4000-8000-000000000002'),
  1,
  '27. user_followed_venues/A: el DELETE del seguimiento de B no borra nada (RLS lo filtra, 0 filas)'
);

-- ===========================================================================
-- USER_FOLLOWED_INSTAGRAM_ACCOUNTS: mismo patrón que las dos anteriores.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok(
  $$insert into public.user_followed_instagram_accounts (user_id, instagram_account_id)
    values ('b0000000-0000-4000-8000-000000000001',
            (select id from public.instagram_accounts where username = 'qa_rls_cuenta_uno'))$$,
  '28. user_followed_instagram_accounts/A: el INSERT de su propio seguimiento no se rechaza'
);
-- 29. A, DELETE del seguimiento de B: 0 filas, sin error.
delete from public.user_followed_instagram_accounts
where user_id = 'b0000000-0000-4000-8000-000000000002'
  and instagram_account_id = (select id from public.instagram_accounts where username = 'qa_rls_cuenta_uno');
reset role;
reset request.jwt.claims;
select is(
  (select count(*)::int from public.user_followed_instagram_accounts
   where user_id = 'b0000000-0000-4000-8000-000000000002'),
  1,
  '29. user_followed_instagram_accounts/A: el DELETE del seguimiento de B no borra nada (RLS lo filtra, 0 filas)'
);

-- ===========================================================================
-- USER_RADAR_SETTINGS: mismo patrón ("ALL ... auth.uid()=user_id"). Se mira
-- solo el acceso (email_frequency), no el valor de email_target/last_sent_at:
-- eso ya lo prueba reglas_app.test.sql (casos 9, 10, 14, 15).
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok(
  $$insert into public.user_radar_settings (user_id, email_frequency)
    values ('b0000000-0000-4000-8000-000000000001', 'biweekly')
    on conflict (user_id) do update set email_frequency = excluded.email_frequency$$,
  '30. user_radar_settings/A: el upsert de su propia fila no se rechaza'
);
-- 31. A, UPDATE de la fila de B: USING no matchea -> 0 filas, sin error.
update public.user_radar_settings set email_frequency = 'biweekly'
where user_id = 'b0000000-0000-4000-8000-000000000002';
reset role;
reset request.jwt.claims;
select is(
  (select email_frequency from public.user_radar_settings where user_id = 'b0000000-0000-4000-8000-000000000002'),
  'weekly',
  '31. user_radar_settings/A: el UPDATE de la fila de B no cambia nada (RLS lo filtra, 0 filas)'
);

-- ===========================================================================
-- ALIASES: lectura pública (hasta para anon); escritura solo admin.
-- ===========================================================================

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is(
  (select count(*)::int from public.aliases where alias = 'QA RLS Alias Uno'),
  1,
  '32. aliases/anon: lee el alias (lectura pública, sin login)'
);
reset role;
reset request.jwt.claims;

-- 33. A (autenticado, no admin), INSERT: WITH CHECK exige is_admin() ->
--     excepción (no hay fila previa, es la única sentencia posible).
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$insert into public.aliases (alias, target_type, target_id)
    values ('QA RLS Alias De A', 'venue', (select id from public.venues where slug = 'qa-rls-venue-uno'))$$,
  '42501', NULL,
  '33. aliases/A: el INSERT se rechaza (estar logueado no alcanza, hace falta ser admin)'
);
reset role;
reset request.jwt.claims;

-- 34. admin, INSERT: is_admin() lo permite.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select lives_ok(
  $$insert into public.aliases (alias, target_type, target_id)
    values ('QA RLS Alias De Admin', 'venue', (select id from public.venues where slug = 'qa-rls-venue-uno'))$$,
  '34. aliases/admin: el INSERT no se rechaza'
);
reset role;
reset request.jwt.claims;

-- ===========================================================================
-- CATEGORIES: lectura pública; escritura solo admin.
-- ===========================================================================

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is(
  (select count(*)::int from public.categories where slug = 'qa-rls-categoria-uno'),
  1,
  '35. categories/anon: lee la categoría'
);
reset role;
reset request.jwt.claims;

-- 36. A, UPDATE: USING (is_admin()) no matchea -> 0 filas, sin error.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
update public.categories set icon = 'hackeado' where slug = 'qa-rls-categoria-uno';
reset role;
reset request.jwt.claims;
select is(
  (select icon from public.categories where slug = 'qa-rls-categoria-uno'),
  null,
  '36. categories/A: el UPDATE no cambia nada (RLS lo filtra, 0 filas)'
);

-- 37. admin, UPDATE: is_admin() lo permite.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select lives_ok(
  $$update public.categories set icon = 'estrella' where slug = 'qa-rls-categoria-uno'$$,
  '37. categories/admin: el UPDATE no se rechaza'
);
reset role;
reset request.jwt.claims;

-- 38. A, INSERT: excepción (WITH CHECK exige is_admin()).
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$insert into public.categories (name, slug) values ('QA RLS Categoria De A', 'qa-rls-categoria-de-a')$$,
  '42501', NULL,
  '38. categories/A: el INSERT se rechaza'
);
reset role;
reset request.jwt.claims;

-- ===========================================================================
-- CINEMA_MOVIES: lectura pública; escritura solo admin.
-- ===========================================================================

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is(
  (select count(*)::int from public.cinema_movies where slug = 'qa-rls-pelicula-uno'),
  1,
  '39. cinema_movies/anon: lee la película'
);
reset role;
reset request.jwt.claims;

-- 40. A, UPDATE: 0 filas, sin error.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
update public.cinema_movies set title = 'QA RLS Hackeada' where slug = 'qa-rls-pelicula-uno';
reset role;
reset request.jwt.claims;
select is(
  (select title from public.cinema_movies where slug = 'qa-rls-pelicula-uno'),
  'QA RLS Película Uno',
  '40. cinema_movies/A: el UPDATE no cambia nada (RLS lo filtra, 0 filas)'
);

-- 41. admin, UPDATE: lo permite.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select lives_ok(
  $$update public.cinema_movies set title = 'QA RLS Película Uno (admin)' where slug = 'qa-rls-pelicula-uno'$$,
  '41. cinema_movies/admin: el UPDATE no se rechaza'
);
reset role;
reset request.jwt.claims;

-- 42. A, INSERT: excepción.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$insert into public.cinema_movies (slug, title) values ('qa-rls-pelicula-de-a', 'QA RLS Película De A')$$,
  '42501', NULL,
  '42. cinema_movies/A: el INSERT se rechaza'
);
reset role;
reset request.jwt.claims;

-- ===========================================================================
-- INSTAGRAM_ACCOUNTS: lectura pública; escritura solo admin.
-- ===========================================================================

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is(
  (select count(*)::int from public.instagram_accounts where username = 'qa_rls_cuenta_uno'),
  1,
  '43. instagram_accounts/anon: lee la cuenta'
);
reset role;
reset request.jwt.claims;

-- 44. A, UPDATE: 0 filas, sin error.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
update public.instagram_accounts set notes = 'hackeado' where username = 'qa_rls_cuenta_uno';
reset role;
reset request.jwt.claims;
select is(
  (select notes from public.instagram_accounts where username = 'qa_rls_cuenta_uno'),
  null,
  '44. instagram_accounts/A: el UPDATE no cambia nada (RLS lo filtra, 0 filas)'
);

-- 45. admin, UPDATE: lo permite.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select lives_ok(
  $$update public.instagram_accounts set notes = 'nota de admin' where username = 'qa_rls_cuenta_uno'$$,
  '45. instagram_accounts/admin: el UPDATE no se rechaza'
);
reset role;
reset request.jwt.claims;

-- 46. A, INSERT: excepción.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$insert into public.instagram_accounts (username, display_name) values ('qa_rls_cuenta_de_a', 'QA RLS Cuenta De A')$$,
  '42501', NULL,
  '46. instagram_accounts/A: el INSERT se rechaza'
);
reset role;
reset request.jwt.claims;

-- ===========================================================================
-- INSTAGRAM_FLYERS: lectura pública solo de ACTIVE; el admin, con la policy
-- "ALL ... is_admin()", ve también el ARCHIVED (el ejemplo de la consigna).
-- ===========================================================================

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is(
  (select count(*)::int from public.instagram_flyers
   where ig_post_id in ('qa-rls-post-activo', 'qa-rls-post-archivado')),
  1,
  '47. instagram_flyers/anon: de los 2, solo ve el ACTIVE'
);
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is(
  (select count(*)::int from public.instagram_flyers
   where ig_post_id in ('qa-rls-post-activo', 'qa-rls-post-archivado')),
  2,
  '48. instagram_flyers/admin: ve los 2, incluido el ARCHIVED'
);
reset role;
reset request.jwt.claims;

-- 49. A, UPDATE del ACTIVE (que sí puede leer): la policy de escritura es
--     solo la "ALL ... is_admin()" -> USING no matchea -> 0 filas, sin error.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
update public.instagram_flyers set caption = 'hackeado' where ig_post_id = 'qa-rls-post-activo';
reset role;
reset request.jwt.claims;
select is(
  (select caption from public.instagram_flyers where ig_post_id = 'qa-rls-post-activo'),
  null,
  '49. instagram_flyers/A: el UPDATE del flyer ACTIVE no cambia nada (RLS lo filtra, 0 filas)'
);

-- 50. admin, UPDATE del ARCHIVED (que ni siquiera lee quien no es admin):
--     is_admin() lo permite.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select lives_ok(
  $$update public.instagram_flyers set caption = 'nota de admin' where ig_post_id = 'qa-rls-post-archivado'$$,
  '50. instagram_flyers/admin: el UPDATE del flyer ARCHIVED no se rechaza'
);
reset role;
reset request.jwt.claims;

-- 51. anon, INSERT: excepción.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok(
  $$insert into public.instagram_flyers (account_id, ig_post_id, ig_post_url, published_at)
    values ((select id from public.instagram_accounts where username = 'qa_rls_cuenta_uno'),
            'qa-rls-post-anon', 'https://instagram.com/p/qa-rls-anon', now())$$,
  '42501', NULL,
  '51. instagram_flyers/anon: el INSERT se rechaza'
);
reset role;
reset request.jwt.claims;

-- ===========================================================================
-- VENUES: lectura pública; escritura solo admin.
-- ===========================================================================

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is(
  (select count(*)::int from public.venues where slug = 'qa-rls-venue-uno'),
  1,
  '52. venues/anon: lee el venue'
);
reset role;
reset request.jwt.claims;

-- 53. A, UPDATE: 0 filas, sin error.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
update public.venues set phone = '000-hackeado' where slug = 'qa-rls-venue-uno';
reset role;
reset request.jwt.claims;
select is(
  (select phone from public.venues where slug = 'qa-rls-venue-uno'),
  null,
  '53. venues/A: el UPDATE no cambia nada (RLS lo filtra, 0 filas)'
);

-- 54. admin, UPDATE: lo permite.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select lives_ok(
  $$update public.venues set phone = '387-000-0000' where slug = 'qa-rls-venue-uno'$$,
  '54. venues/admin: el UPDATE no se rechaza'
);
reset role;
reset request.jwt.claims;

-- 55. A, INSERT: excepción.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$insert into public.venues (name, address, slug)
    values ('QA RLS Venue De A', 'Dirección Inventada QA RLS 2', 'qa-rls-venue-de-a')$$,
  '42501', NULL,
  '55. venues/A: el INSERT se rechaza'
);
reset role;
reset request.jwt.claims;

-- ===========================================================================
-- VENUE_ALIASES: lectura pública; escritura solo admin.
-- ===========================================================================

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is(
  (select count(*)::int from public.venue_aliases where alias = 'QA RLS Alias Venue Uno'),
  1,
  '56. venue_aliases/anon: lee el alias de venue'
);
reset role;
reset request.jwt.claims;

-- 57. A, UPDATE: 0 filas, sin error.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
update public.venue_aliases set alias = 'QA RLS Hackeado' where alias = 'QA RLS Alias Venue Uno';
reset role;
reset request.jwt.claims;
select is(
  (select count(*)::int from public.venue_aliases where alias = 'QA RLS Alias Venue Uno'),
  1,
  '57. venue_aliases/A: el UPDATE no cambia nada (RLS lo filtra, 0 filas)'
);

-- 58. admin, UPDATE: lo permite.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select lives_ok(
  $$update public.venue_aliases set alias = 'QA RLS Alias Venue Uno (admin)' where alias = 'QA RLS Alias Venue Uno'$$,
  '58. venue_aliases/admin: el UPDATE no se rechaza'
);
reset role;
reset request.jwt.claims;

-- 59. A, INSERT: excepción.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$insert into public.venue_aliases (venue_id, alias)
    values ((select id from public.venues where slug = 'qa-rls-venue-uno'), 'QA RLS Alias De A')$$,
  '42501', NULL,
  '59. venue_aliases/A: el INSERT se rechaza'
);
reset role;
reset request.jwt.claims;

-- ===========================================================================
-- VENUE_REVIEW_QUEUE: una sola policy ("ALL ... is_admin()"), sin lectura
-- pública: ni A ni anon ven una sola fila, solo el admin.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(
  (select count(*)::int from public.venue_review_queue where raw_name = 'QA RLS Lugar Revision'),
  0,
  '60. venue_review_queue/A: no ve la fila (no hay lectura pública, solo admin)'
);
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is(
  (select count(*)::int from public.venue_review_queue where raw_name = 'QA RLS Lugar Revision'),
  1,
  '61. venue_review_queue/admin: ve la fila'
);
reset role;
reset request.jwt.claims;

-- 62. A, UPDATE: 0 filas, sin error (ni siquiera la ve).
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
update public.venue_review_queue set status = 'rejected' where raw_name = 'QA RLS Lugar Revision';
reset role;
reset request.jwt.claims;
select is(
  (select status::text from public.venue_review_queue where raw_name = 'QA RLS Lugar Revision'),
  'pending',
  '62. venue_review_queue/A: el UPDATE no cambia nada (RLS lo filtra, 0 filas)'
);

-- 63. admin, UPDATE: lo permite.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select lives_ok(
  $$update public.venue_review_queue set status = 'resolved' where raw_name = 'QA RLS Lugar Revision'$$,
  '63. venue_review_queue/admin: el UPDATE no se rechaza'
);
reset role;
reset request.jwt.claims;

-- 64. A, INSERT: excepción.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$insert into public.venue_review_queue (raw_name) values ('QA RLS Lugar De A')$$,
  '42501', NULL,
  '64. venue_review_queue/A: el INSERT se rechaza'
);
reset role;
reset request.jwt.claims;

-- ===========================================================================
-- SCRAPE_SOURCES: solo policies "TO authenticated" con is_admin(); A (sin
-- ser admin) no matchea ninguna, ni para leer ni para escribir.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(
  (select count(*)::int from public.scrape_sources where key = 'qa-rls-fuente-uno'),
  0,
  '65. scrape_sources/A: no ve la fuente (solo admin)'
);
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is(
  (select count(*)::int from public.scrape_sources where key = 'qa-rls-fuente-uno'),
  1,
  '66. scrape_sources/admin: ve la fuente'
);
reset role;
reset request.jwt.claims;

-- 67. A, INSERT: excepción (no hay fila previa que filtrar).
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$insert into public.scrape_sources (key, name) values ('qa-rls-fuente-de-a', 'QA RLS Fuente De A')$$,
  '42501', NULL,
  '67. scrape_sources/A: el INSERT se rechaza'
);
reset role;
reset request.jwt.claims;

-- 68. admin, INSERT (el camino real: lib/scraper-actions.ts, con el usuario
--     autenticado como admin, no con el cliente de service_role): lo permite.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select lives_ok(
  $$insert into public.scrape_sources (key, name) values ('qa-rls-fuente-dos', 'QA RLS Fuente Dos')$$,
  '68. scrape_sources/admin: el INSERT no se rechaza'
);
reset role;
reset request.jwt.claims;

-- ===========================================================================
-- SCRAPE_RUNS: mismo patrón que scrape_sources.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(
  (select count(*)::int from public.scrape_runs where source_key = 'qa-rls-fuente-uno'),
  0,
  '69. scrape_runs/A: no ve la corrida (solo admin)'
);
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is(
  (select count(*)::int from public.scrape_runs where source_key = 'qa-rls-fuente-uno'),
  1,
  '70. scrape_runs/admin: ve la corrida'
);
reset role;
reset request.jwt.claims;

-- 71. A, UPDATE: USING (is_admin()) no matchea -> 0 filas, sin error.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
update public.scrape_runs set status = 'FAILED' where source_key = 'qa-rls-fuente-uno';
reset role;
reset request.jwt.claims;
select is(
  (select status from public.scrape_runs where source_key = 'qa-rls-fuente-uno'),
  'RUNNING',
  '71. scrape_runs/A: el UPDATE no cambia nada (RLS lo filtra, 0 filas)'
);

-- 72. admin, UPDATE: lo permite (el admin autenticado, igual que arriba).
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select lives_ok(
  $$update public.scrape_runs set status = 'SUCCESS' where source_key = 'qa-rls-fuente-uno'$$,
  '72. scrape_runs/admin: el UPDATE no se rechaza'
);
reset role;
reset request.jwt.claims;

-- ===========================================================================
-- JOB_RUNS: solo SELECT para admin, NINGUNA policy de escritura (ni para
-- admin): únicamente escribe quien bypassea RLS (el cron, con service_role).
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(
  (select count(*)::int from public.job_runs where job_key = 'qa-rls-job-uno'),
  0,
  '73. job_runs/A: no ve la corrida (solo admin puede leer)'
);
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is(
  (select count(*)::int from public.job_runs where job_key = 'qa-rls-job-uno'),
  1,
  '74. job_runs/admin: ve la corrida'
);

-- 75. admin, INSERT: no hay NINGUNA policy de INSERT, ni para admin -> WITH
--     CHECK implícito en false -> excepción (no hay fila previa que filtrar).
select throws_ok(
  $$insert into public.job_runs (job_key, status) values ('qa-rls-job-de-admin', 'SUCCESS')$$,
  '42501', NULL,
  '75. job_runs/admin: el INSERT se rechaza igual (no hay policy de escritura, ni para admin)'
);
reset role;
reset request.jwt.claims;

-- 76. service_role, INSERT: el camino real del cron (createAdminClient en
--     lib/job-runs.ts), bypassea RLS.
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select lives_ok(
  $$insert into public.job_runs (job_key, status) values ('qa-rls-job-de-cron', 'SUCCESS')$$,
  '76. job_runs/service_role: el INSERT del cron no se rechaza'
);
reset role;
reset request.jwt.claims;

-- ===========================================================================
-- EVENT_METRICS_DAILY: mismo patrón que job_runs (solo SELECT para admin,
-- sin ninguna policy de escritura).
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(
  (select count(*)::int from public.event_metrics_daily where origin = 'ficha'),
  0,
  '77. event_metrics_daily/A: no ve la métrica (solo admin puede leer)'
);
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is(
  (select count(*)::int from public.event_metrics_daily where origin = 'ficha'),
  1,
  '78. event_metrics_daily/admin: ve la métrica'
);

-- 79. admin, INSERT: sin policy de escritura -> excepción.
select throws_ok(
  $$insert into public.event_metrics_daily (event_id, day, origin)
    values ((select id from public.events where slug = 'qa-rls-evento-publico'), current_date + 1, 'radar')$$,
  '42501', NULL,
  '79. event_metrics_daily/admin: el INSERT se rechaza igual (no hay policy de escritura, ni para admin)'
);
reset role;
reset request.jwt.claims;

-- 80. service_role, INSERT: el camino real (record_event_metric(), llamado
--     con el cliente admin), bypassea RLS.
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select lives_ok(
  $$insert into public.event_metrics_daily (event_id, day, origin)
    values ((select id from public.events where slug = 'qa-rls-evento-publico'), current_date + 2, 'directo')$$,
  '80. event_metrics_daily/service_role: el INSERT no se rechaza'
);
reset role;
reset request.jwt.claims;

select * from finish();
rollback;
