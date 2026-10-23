-- ============================================================================
-- pgTAP de QPS-110 (Ronda 38 / 38-c), el repunte de
-- public.event_attendance que agrega qps-110-migracion.sql a
-- public.merge_events(keep_id, drop_id).
-- ============================================================================
--
-- Pasado de ops/rondas/38-voy-me-interesa/qps-110-pgtap.sql sin cambios de
-- casos (17/10). No prueba de nuevo
-- is_admin()/permisos/rechazos/favoritos/flyers/ticket_sources de
-- merge_events: eso ya lo cubre supabase/tests/database/merge_events.test.sql
-- (Ronda 19) y sigue valiendo igual porque esta propuesta no le cambia una
-- sola línea a esa parte de la función. Acá solo se prueba lo nuevo: el
-- repunte de event_attendance y que event_attendance_totals cierre.
--
-- Caso elegido para cubrir los 5 escenarios de la consigna EN UNA SOLA
-- llamada a merge_events() (demuestra además que "dos usuarios distintos a
-- la vez" funciona: los 4 usuarios de abajo se repuntan en el mismo UPDATE/
-- DELETE, no en llamadas separadas):
--   U1: marca en LOS DOS eventos, MISMO kind ('voy' en keep y en drop).
--   U2: marca en LOS DOS eventos (otro usuario, para probar que el DELETE
--       toca a varios a la vez). Antes de la R47 tenía kind DISTINTO en cada
--       evento ('me_interesa' en drop); desde la R47 el único kind es 'voy'
--       (migración 20261018120000_r47_guardar_voy.sql).
--   U3: marca SOLO en el descartado ('voy'): tiene que moverse.
--   U4: marca SOLO en el que queda ('voy'): no tiene que cambiar.
--
-- uuid fijo, prefijo "e" (no choca con los prefijos c/d que ya usan
-- merge_events.test.sql y voy_me_interesa.test.sql; cada archivo de pgTAP
-- corre en su propia transacción con rollback, así que ni haría falta, pero
-- se mantiene la convención de "un prefijo por archivo" del resto de la
-- suite).
--
-- Todo dentro de una transacción con rollback: nada de esto queda en la
-- base ni se usa ninguna fila real (usuarios y eventos inventados y
-- evidentes, "qa-attfusion-...@example.com" / "QA Attfusion ...").
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- ---------------------------------------------------------------------------
-- Preparación: admin (para poder llamar merge_events) y 4 usuarios comunes.
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'qa-attfusion-admin@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'qa-attfusion-u1@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'qa-attfusion-u2@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-000000000004',
   'authenticated', 'authenticated', 'qa-attfusion-u3@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-000000000005',
   'authenticated', 'authenticated', 'qa-attfusion-u4@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');

-- El trigger on_auth_user_created ya creó los 5 perfiles en USER. El de
-- ADMIN pasa a ADMIN (mismo truco que merge_events.test.sql).
alter table public.profiles disable trigger tr_prevent_role_tampering;
update public.profiles set role = 'ADMIN'
  where id = 'e0000000-0000-4000-8000-000000000001';
alter table public.profiles enable trigger tr_prevent_role_tampering;

insert into public.events (id, title, slug, start_date, status, created_by)
values
  ('e1111111-1111-4111-8111-111111111111', 'QA Attfusion Keep', 'qa-attfusion-keep',
   now() + interval '1 day', 'PUBLISHED', null),
  ('e2222222-2222-4222-8222-222222222222', 'QA Attfusion Drop', 'qa-attfusion-drop',
   now() + interval '1 day', 'PUBLISHED', null);

-- Fixtures de event_attendance, como postgres (bypassea RLS igual que el
-- resto de la suite inserta user_favorites directo como postgres).
insert into public.event_attendance (user_id, event_id, kind)
values
  -- U1: mismo kind en los dos eventos.
  ('e0000000-0000-4000-8000-000000000002', 'e1111111-1111-4111-8111-111111111111', 'voy'),
  ('e0000000-0000-4000-8000-000000000002', 'e2222222-2222-4222-8222-222222222222', 'voy'),
  -- U2: también en los dos eventos.
  ('e0000000-0000-4000-8000-000000000003', 'e1111111-1111-4111-8111-111111111111', 'voy'),
  ('e0000000-0000-4000-8000-000000000003', 'e2222222-2222-4222-8222-222222222222', 'voy'),
  -- U3: solo en el descartado.
  ('e0000000-0000-4000-8000-000000000004', 'e2222222-2222-4222-8222-222222222222', 'voy'),
  -- U4: solo en el que queda.
  ('e0000000-0000-4000-8000-000000000005', 'e1111111-1111-4111-8111-111111111111', 'voy');

-- ---------------------------------------------------------------------------
-- Preparación: totales antes de fusionar (el trigger ya los mantiene al
-- insertar los fixtures). keep: 3 "voy" (U1,U2,U4). drop: 3 "voy" (U1,U2,U3).
-- ---------------------------------------------------------------------------
select ok(
  (select voy = 3 and me_interesa = 0 from public.event_attendance_totals
   where event_id = 'e1111111-1111-4111-8111-111111111111'),
  'prep-keep. event_attendance_totals/keep antes de fusionar: voy=3, me_interesa=0'
);

select ok(
  (select voy = 3 and me_interesa = 0 from public.event_attendance_totals
   where event_id = 'e2222222-2222-4222-8222-222222222222'),
  'prep-drop. event_attendance_totals/drop antes de fusionar: voy=3, me_interesa=0'
);

-- ---------------------------------------------------------------------------
-- La fusión, como admin. Resultado en una tabla temporal para poder leer
-- los contadores devueltos además del estado final.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"e0000000-0000-4000-8000-000000000001","role":"authenticated"}';

create temp table qa_attfusion_result as
select public.merge_events(
  'e1111111-1111-4111-8111-111111111111',
  'e2222222-2222-4222-8222-222222222222'
) as result;

reset role;
reset request.jwt.claims;

-- 1. attendance_moved = 1: solo U3 (único sin marca previa en keep) se mueve
--    con un UPDATE de event_id.
select is(
  (select (result->>'attendance_moved')::int from qa_attfusion_result),
  1,
  '1. merge_events: attendance_moved = 1 (solo U3, que no tenía marca en keep)'
);

-- 2. attendance_dropped = 2: U1 y U2 ya tenían marca en keep, así que sus
--    filas en drop se borran en vez de moverse.
select is(
  (select (result->>'attendance_dropped')::int from qa_attfusion_result),
  2,
  '2. merge_events: attendance_dropped = 2 (U1 y U2, que ya tenían marca en keep)'
);

-- 3. No queda ninguna fila de event_attendance apuntando al descartado.
select is(
  (select count(*)::int from public.event_attendance
   where event_id = 'e2222222-2222-4222-8222-222222222222'),
  0,
  '3. event_attendance: ninguna fila apunta al descartado después de la fusión'
);

-- 4. event_attendance_totals/keep cierra: voy=4 (U1, U2, U4 sin cambios + el
--    "voy" de U3 que se movió), me_interesa=0.
select ok(
  (select voy = 4 and me_interesa = 0 from public.event_attendance_totals
   where event_id = 'e1111111-1111-4111-8111-111111111111'),
  '4. event_attendance_totals/keep después de fusionar: voy=4, me_interesa=0'
);

-- 5. event_attendance_totals/drop cierra en 0/0 (se restó todo: los "voy" de
--    U1 y U2 al borrarse, el de U3 al moverse).
select ok(
  (select voy = 0 and me_interesa = 0 from public.event_attendance_totals
   where event_id = 'e2222222-2222-4222-8222-222222222222'),
  '5. event_attendance_totals/drop después de fusionar: voy=0, me_interesa=0'
);

-- 6. U1 (mismo kind en los dos eventos): una sola fila, en keep, kind='voy'
--    (la propia de keep, no se tocó por la fusión).
select is(
  (select jsonb_build_object('n', count(*), 'event_id', min(event_id::text), 'kind', min(kind))
   from public.event_attendance where user_id = 'e0000000-0000-4000-8000-000000000002'),
  jsonb_build_object('n', 1, 'event_id', 'e1111111-1111-4111-8111-111111111111', 'kind', 'voy'),
  '6. U1 (mismo kind en los dos): 1 sola fila, en keep, kind=voy sin cambios'
);

-- 7. U2 (marca en los dos eventos): una sola fila, en keep, kind='voy'
--    (la de keep manda; la de drop se descartó).
select is(
  (select jsonb_build_object('n', count(*), 'event_id', min(event_id::text), 'kind', min(kind))
   from public.event_attendance where user_id = 'e0000000-0000-4000-8000-000000000003'),
  jsonb_build_object('n', 1, 'event_id', 'e1111111-1111-4111-8111-111111111111', 'kind', 'voy'),
  '7. U2 (marca en los dos eventos): 1 sola fila, en keep, kind=voy (la de keep manda)'
);

-- 8. U3 (solo en el descartado): una sola fila, ahora en keep, con el kind
--    que ya tenía ('voy') preservado por el UPDATE.
select is(
  (select jsonb_build_object('n', count(*), 'event_id', min(event_id::text), 'kind', min(kind))
   from public.event_attendance where user_id = 'e0000000-0000-4000-8000-000000000004'),
  jsonb_build_object('n', 1, 'event_id', 'e1111111-1111-4111-8111-111111111111', 'kind', 'voy'),
  '8. U3 (solo en el descartado): se movió a keep, kind=voy preservado'
);

-- 9. U4 (solo en el que queda): sin cambios.
select is(
  (select jsonb_build_object('n', count(*), 'event_id', min(event_id::text), 'kind', min(kind))
   from public.event_attendance where user_id = 'e0000000-0000-4000-8000-000000000005'),
  jsonb_build_object('n', 1, 'event_id', 'e1111111-1111-4111-8111-111111111111', 'kind', 'voy'),
  '9. U4 (solo en el que queda): sin cambios, sigue en keep con kind=voy'
);

-- 10. Las 4 marcas (U1, U2, U3, U4) quedan todas en keep: el UNIQUE
--     (user_id, event_id) no se violó en ningún momento (si se hubiera
--     violado, la llamada a merge_events habría lanzado 23505 y el
--     create temp table de más arriba habría fallado).
select is(
  (select count(*)::int from public.event_attendance
   where event_id = 'e1111111-1111-4111-8111-111111111111'),
  4,
  '10. event_attendance/keep: las 4 marcas (U1, U2, U3, U4) conviven sin violar el UNIQUE'
);

drop table qa_attfusion_result;

select * from finish();
rollback;
