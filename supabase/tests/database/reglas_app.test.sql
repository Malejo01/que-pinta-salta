-- Ronda 15 (15-b): pgTAP de las reglas de usuario que van a la base para que
-- la app móvil (habla directo con Supabase, sin pasar por las server
-- actions) no se salte ninguna. Prueba los triggers de la migración
-- 20261009120000_reglas_app.sql: enforce_event_user_rules() en events,
-- force_user_role_on_insert() en profiles y enforce_radar_email_target() en
-- user_radar_settings. Alcance (ver ops/rondas/15-reglas-app/plan.md,
-- "Diseño"): solo authenticated/anon que no son admin; service_role y
-- postgres (incluido handle_new_user, que es SECURITY DEFINER) quedan afuera
-- a propósito, porque por ahí entran los scrapers, los crons y las
-- migraciones.
--
-- Contra la base SIN esta migración, los casos 1, 3, 7, 9 y 10 fallan (lo pide
-- el criterio de la tarea 15-b): hoy no hay trigger que fuerce DRAFT en el
-- INSERT/UPDATE de un usuario sobre events, ni USER en el INSERT de profiles,
-- ni el email de la cuenta en user_radar_settings. Los casos 1 y 3, además,
-- sin el trigger ni siquiera llegan a insertar/actualizar: la policy de RLS
-- de hoy (que exige status='DRAFT' para el dueño) los rechaza directo, por
-- eso van envueltos en lives_ok (no tiran abajo el resto de la transacción).
--
-- Usuarios y eventos son inventados y evidentes (qa-...@example.com, "QA
-- Evento ..."). Todo adentro de una transacción con rollback: no se lee
-- ninguna fila real de profiles ni de auth.users.
--
-- Ojo con "reset role;": solo vuelve al rol de postgres, pero NO limpia
-- request.jwt.claims (sigue seteado hasta que se lo pisa o se hace rollback).
-- enforce_radar_email_target() es SECURITY DEFINER, así que ahí current_user
-- ya no sirve para saber quién llamó (pasa a ser el dueño de la función) y el
-- alcance se resuelve con auth.role(), que lee justamente ese claim. Por eso
-- cada "reset role;" de este archivo va acompañado de
-- "reset request.jwt.claims;": sin eso, una preparación hecha "como postgres"
-- después de actuar como un usuario puede quedar, para esa función,
-- alcanzada por el trigger igual que si la hiciera ese usuario.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- ---------------------------------------------------------------------------
-- Preparación (como postgres).
--
-- uuids fijos e inventados:
--   U1 = a...001 = qa-usuario@example.com
--   U2 = a...002 = qa-admin@example.com (perfil pasa a ADMIN más abajo)
--   U3 = a...003 = qa-usuario-tres@example.com (caso 7: sin perfil al empezar)
--   U4 = a...004 = qa-alta-admin@example.com (caso 13: alta que pide ADMIN)
--
-- events.category_id y events.venue_id son nulleables: no hace falta tomar
-- ninguna fila real de categories ni de venues.
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'qa-usuario@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
   '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'qa-admin@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
   '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'qa-usuario-tres@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
   '', '', '', '');

-- El trigger on_auth_user_created (handle_new_user) ya creó los 3 perfiles con
-- role='USER'. El de U2 pasa a ADMIN. Se deshabilita tr_prevent_role_tampering
-- nada más que para esta fila: ese trigger (de antes de esta ronda) solo deja
-- cambiar el role si auth.role() = 'service_role' o is_admin(), y corriendo
-- como postgres sin claims ninguno de los dos es cierto. No es parte de lo que
-- prueba este archivo (eso lo prueba el caso 8, con el trigger habilitado).
alter table public.profiles disable trigger tr_prevent_role_tampering;
update public.profiles set role = 'ADMIN'
  where id = 'a0000000-0000-4000-8000-000000000002';
alter table public.profiles enable trigger tr_prevent_role_tampering;

-- Caso 7 necesita "un tercer uid sin perfil": se borra el que creó
-- handle_new_user al insertar en auth.users, como pide la consigna.
delete from public.profiles where id = 'a0000000-0000-4000-8000-000000000003';

-- ---------------------------------------------------------------------------
-- 1. Usuario, INSERT en events con PUBLISHED/is_featured=true/view_count=999:
--    el trigger lo manda a DRAFT/false/0 y fija created_by = su uid.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';

select lives_ok(
  $$insert into public.events (title, slug, start_date, status, is_featured, view_count)
    values ('QA Evento Uno', 'qa-evento-uno', now() + interval '1 day', 'PUBLISHED', true, 999)$$,
  '1a. usuario: el INSERT publicado/destacado/con vistas no se rechaza (el trigger lo corrige antes del check de RLS)'
);

select ok(
  (select status = 'DRAFT' and is_featured = false and view_count = 0
          and created_by = 'a0000000-0000-4000-8000-000000000001'
   from public.events where slug = 'qa-evento-uno'),
  '1b. usuario: ese evento queda DRAFT, sin destacar, en 0 vistas y con created_by = su uid'
);

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- 2. Usuario, INSERT con created_by de otro usuario: el trigger lo pisa con
--    el suyo. No lo rechaza RLS: la policy "Allow insert for owner or admin"
--    hace su WITH CHECK después de los triggers BEFORE, así que para cuando
--    RLS mira la fila, created_by ya es auth.uid() (el trigger lo escribió
--    antes); nunca llega a comparar con el valor ajeno que mandamos.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';

select lives_ok(
  $$insert into public.events (title, slug, start_date, created_by)
    values ('QA Evento Dos', 'qa-evento-dos', now() + interval '1 day', 'a0000000-0000-4000-8000-000000000002')$$,
  '2a. usuario: el INSERT con created_by de otro usuario no se rechaza'
);

select is(
  (select created_by from public.events where slug = 'qa-evento-dos'),
  'a0000000-0000-4000-8000-000000000001'::uuid,
  '2b. usuario: ese evento queda con el uid de quien lo crea (el trigger lo pisa), no con el que mandó'
);

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- 3. Usuario, UPDATE de su evento publicado (creado como postgres) cambiando
--    el título: vuelve a DRAFT y is_featured/ai_metadata quedan como antes.
--    Los claims se limpiaron arriba: esta inserción "como postgres" no debe
--    quedar alcanzada por ningún trigger con el rastro del actor anterior.
-- ---------------------------------------------------------------------------
insert into public.events (title, slug, start_date, status, is_featured, created_by, ai_metadata)
values ('QA Evento Tres', 'qa-evento-tres', now() + interval '1 day', 'PUBLISHED', true,
        'a0000000-0000-4000-8000-000000000001', '{"qa_sentinel": true}'::jsonb);

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';

select lives_ok(
  $$update public.events set title = 'QA Evento Tres (editado)' where slug = 'qa-evento-tres'$$,
  '3a. usuario: el UPDATE de su evento publicado no se rechaza (el trigger lo vuelve a DRAFT antes del check de RLS)'
);

select ok(
  (select title = 'QA Evento Tres (editado)' and status = 'DRAFT' and is_featured = true
          and ai_metadata = '{"qa_sentinel": true}'::jsonb
   from public.events where slug = 'qa-evento-tres'),
  '3b. usuario: ese UPDATE cambia el título, vuelve a DRAFT y conserva is_featured/ai_metadata'
);

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- 4. Admin: INSERT y UPDATE con PUBLISHED/is_featured=true se respetan (el
--    trigger no alcanza a quien is_admin() da true).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}';

insert into public.events (title, slug, start_date, status, is_featured, created_by)
values ('QA Evento Cuatro', 'qa-evento-cuatro', now() + interval '1 day', 'PUBLISHED', true,
        'a0000000-0000-4000-8000-000000000002');

select ok(
  (select status = 'PUBLISHED' and is_featured = true
   from public.events where slug = 'qa-evento-cuatro'),
  '4a. admin: el INSERT publicado y destacado se respeta'
);

update public.events set title = 'QA Evento Cuatro (editado)' where slug = 'qa-evento-cuatro';

select ok(
  (select title = 'QA Evento Cuatro (editado)' and status = 'PUBLISHED' and is_featured = true
   from public.events where slug = 'qa-evento-cuatro'),
  '4b. admin: el UPDATE de ese evento publicado y destacado los conserva'
);

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- 5. service_role (el camino de los scrapers): INSERT publicado queda
--    publicado. Es el caso más importante: si el trigger alcanzara a este
--    rol, los scrapers empezarían a crear borradores en vez de eventos
--    publicados.
-- ---------------------------------------------------------------------------
set local role service_role;

insert into public.events (title, slug, start_date, status)
values ('QA Evento Cinco', 'qa-evento-cinco', now() + interval '1 day', 'PUBLISHED');

select is(
  (select status::text from public.events where slug = 'qa-evento-cinco'),
  'PUBLISHED',
  '5. service_role: el INSERT publicado (scraper/cron) queda publicado'
);

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- 6. postgres: INSERT publicado queda publicado (migraciones, SQL editor).
-- ---------------------------------------------------------------------------
insert into public.events (title, slug, start_date, status)
values ('QA Evento Seis', 'qa-evento-seis', now() + interval '1 day', 'PUBLISHED');

select is(
  (select status::text from public.events where slug = 'qa-evento-seis'),
  'PUBLISHED',
  '6. postgres: el INSERT publicado queda publicado'
);

-- ---------------------------------------------------------------------------
-- 7. Usuario, INSERT en profiles con role='ADMIN': el trigger de alta lo
--    fuerza a USER. U3 no tiene perfil (se borró en la preparación).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}';

insert into public.profiles (id, email, role)
values ('a0000000-0000-4000-8000-000000000003', 'qa-usuario-tres@example.com', 'ADMIN');

select is(
  (select role::text from public.profiles where id = 'a0000000-0000-4000-8000-000000000003'),
  'USER',
  '7. usuario: el INSERT en profiles pidiendo ADMIN queda en USER'
);

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- 8. Usuario, UPDATE de su propio role a ADMIN: sigue rechazándolo el trigger
--    de siempre (tr_prevent_role_tampering), que esta ronda no toca.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';

-- throws_ok de 2 argumentos compara el 2do contra el mensaje de error real si
-- no son exactamente 5 caracteres (lo confunde con un SQLSTATE): por eso va
-- con el código y NULL en el mensaje, para no atarse al texto en castellano.
-- P0001 = RAISE EXCEPTION genérico, el que usa prevent_role_tampering().
select throws_ok(
  $$update public.profiles set role = 'ADMIN' where id = 'a0000000-0000-4000-8000-000000000001'$$,
  'P0001', NULL,
  '8. usuario: el UPDATE de su propio role a ADMIN sigue bloqueado'
);

-- ---------------------------------------------------------------------------
-- 9. Usuario, upsert en user_radar_settings con email_target ajeno: el
--    trigger lo pisa con el email de su cuenta.
-- ---------------------------------------------------------------------------
insert into public.user_radar_settings (user_id, email_target)
values ('a0000000-0000-4000-8000-000000000001', 'otro@example.com')
on conflict (user_id) do update set email_target = excluded.email_target;

select is(
  (select email_target from public.user_radar_settings
   where user_id = 'a0000000-0000-4000-8000-000000000001'),
  'qa-usuario@example.com',
  '9. usuario: el email_target ajeno queda en el email de la cuenta'
);

reset role;
-- Clave para este caso: enforce_radar_email_target() es SECURITY DEFINER, así
-- que current_user ya no identifica al invocador (ver header del archivo) y
-- resuelve el alcance con auth.role(), que lee request.jwt.claims. Si no se
-- limpia ese claim acá, el UPDATE de preparación de abajo (que se hace "como
-- postgres") todavía se ve como si lo hiciera el usuario del caso 9, el
-- trigger lo toma como alcanzado y no deja fijar el last_sent_at semilla.
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- 10. Usuario, UPDATE de last_sent_at: conserva el valor anterior. El valor
--     anterior lo fija postgres (scope excluido) simulando lo que deja el
--     cron del Radar.
-- ---------------------------------------------------------------------------
update public.user_radar_settings
set last_sent_at = '2026-01-01T00:00:00+00'::timestamptz
where user_id = 'a0000000-0000-4000-8000-000000000001';

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';

update public.user_radar_settings
set last_sent_at = now()
where user_id = 'a0000000-0000-4000-8000-000000000001';

select is(
  (select last_sent_at from public.user_radar_settings
   where user_id = 'a0000000-0000-4000-8000-000000000001'),
  '2026-01-01T00:00:00+00'::timestamptz,
  '10. usuario: el UPDATE de last_sent_at no se le acepta, conserva el valor anterior'
);

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- 11. enforce_radar_email_target no es ejecutable por anon ni authenticated
--     (SECURITY DEFINER, lee auth.users: solo el trigger la llama).
-- ---------------------------------------------------------------------------
select ok(
  not has_function_privilege('anon', 'public.enforce_radar_email_target()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.enforce_radar_email_target()', 'EXECUTE'),
  '11. enforce_radar_email_target: anon y authenticated no tienen EXECUTE'
);

-- ---------------------------------------------------------------------------
-- 12. anon no puede insertar en events: ninguna policy de INSERT lo alcanza
--     (la de hoy es "TO authenticated").
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

-- 42501 = insufficient_privilege, el SQLSTATE estándar de "new row violates
-- row-level security policy" (ver nota del caso 8 sobre throws_ok de 2 args).
select throws_ok(
  $$insert into public.events (title, slug, start_date)
    values ('QA Evento Anon', 'qa-evento-anon', now() + interval '1 day')$$,
  '42501', NULL,
  '12. anon: el INSERT en events se rechaza'
);

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- 13. handle_new_user: un alta que pide ADMIN en el metadata crea el perfil
--     en USER (handle_new_user no lee ese campo; manda el default de la
--     columna).
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000004',
  'authenticated', 'authenticated', 'qa-alta-admin@example.com', 'qa-no-es-password-real',
  now(), '{"provider":"email","providers":["email"]}'::jsonb,
  '{"role":"ADMIN","full_name":"QA"}'::jsonb, now(), now(), '', '', '', ''
);

select is(
  (select role::text from public.profiles where id = 'a0000000-0000-4000-8000-000000000004'),
  'USER',
  '13. handle_new_user: el alta que pide ADMIN crea el perfil en USER'
);

-- ---------------------------------------------------------------------------
-- 14. service_role (el cron del Radar y la baja) puede seguir escribiendo
--     last_sent_at: es el espejo del caso 5. Si el trigger alcanzara a
--     service_role, app/api/cron/radar-newsletter/route.ts:140 (createAdminClient(),
--     service role) no podría registrar el envío y el cron reenviaría a
--     todos en cada corrida; lo mismo usa app/api/radar/baja/route.ts:56.
--     A diferencia del caso 5, aquí los claims sí importan: la fila ya tiene
--     un valor puesto por el caso 10 y enforce_radar_email_target() resuelve
--     el alcance con auth.role(), que lee el claim que se fije acá.
-- ---------------------------------------------------------------------------
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';

update public.user_radar_settings
set last_sent_at = '2026-02-02T00:00:00+00'::timestamptz
where user_id = 'a0000000-0000-4000-8000-000000000001';

select is(
  (select last_sent_at from public.user_radar_settings
   where user_id = 'a0000000-0000-4000-8000-000000000001'),
  '2026-02-02T00:00:00+00'::timestamptz,
  '14. service_role: el cron del Radar puede escribir last_sent_at'
);

reset role;
reset request.jwt.claims;

select * from finish();
rollback;
