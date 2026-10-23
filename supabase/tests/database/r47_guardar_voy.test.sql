-- pgTAP de la R47 "Guardar, Voy y Seguir", migración
-- 20261018120000_r47_guardar_voy.sql: el backfill a Guardados, el borrado de
-- 'me_interesa', el CHECK que solo acepta 'voy' y que correrla dos veces no
-- cambia nada.
--
-- El estado final (CHECK y comentario) se prueba sobre la base tal como la
-- dejó la migración. El backfill se prueba volviendo, dentro de esta
-- transacción, al CHECK de antes (kind in ('voy','me_interesa')), cargando
-- marcas inventadas y corriendo el MISMO cuerpo de la migración, dos veces.
-- El cuerpo está copiado en pg_temp.r47_cuerpo(): si cambia la migración,
-- cambiar acá también.
--
-- uuid fijo, prefijo "47" (no choca con los otros archivos). Todo dentro de
-- una transacción con rollback: nada de esto queda en la base.
--   U1 = 47000000-0000-4000-8000-000000000001: 'voy' sin favorito.
--   U2 = 47000000-0000-4000-8000-000000000002: 'me_interesa' sin favorito.
--   U3 = 47000000-0000-4000-8000-000000000003: 'voy' que YA tenía favorito.
--   E1 = 47111111-1111-4111-8111-111111111111, E2 = 47222222-2222-4222-8222-222222222222.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- ---------------------------------------------------------------------------
-- Estado que dejó la migración.
-- ---------------------------------------------------------------------------

-- 1. El CHECK solo acepta 'voy' y está validado.
select is(
  (select pg_get_constraintdef(oid) from pg_constraint
   where conrelid = 'public.event_attendance'::regclass and conname = 'event_attendance_kind_check'),
  'CHECK ((kind = ''voy''::text))',
  '1. event_attendance_kind_check: CHECK ((kind = ''voy''::text))'
);

select ok(
  (select convalidated from pg_constraint
   where conrelid = 'public.event_attendance'::regclass and conname = 'event_attendance_kind_check'),
  '2. event_attendance_kind_check: validado (convalidated = true)'
);

-- 3. Es el único CHECK de kind (se conservó el nombre, no quedó el viejo).
select is(
  (select count(*)::int from pg_constraint
   where conrelid = 'public.event_attendance'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%kind%'),
  1,
  '3. event_attendance: un solo CHECK sobre kind'
);

select ok(
  obj_description(
    (select oid from pg_constraint
     where conrelid = 'public.event_attendance'::regclass and conname = 'event_attendance_kind_check'),
    'pg_constraint'
  ) like 'R47%',
  '4. event_attendance_kind_check: comentario de la R47'
);

-- ---------------------------------------------------------------------------
-- Fixtures.
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000', '47000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'qa-r47-u1@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '47000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'qa-r47-u2@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '47000000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'qa-r47-u3@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');

insert into public.events (id, title, slug, start_date, status, created_by)
values
  ('47111111-1111-4111-8111-111111111111', 'QA R47 Uno', 'qa-r47-uno',
   now() + interval '1 day', 'PUBLISHED', null),
  ('47222222-2222-4222-8222-222222222222', 'QA R47 Dos', 'qa-r47-dos',
   now() + interval '1 day', 'PUBLISHED', null);

-- 5. Con el CHECK nuevo, 'me_interesa' se rechaza (como postgres, sin RLS).
select throws_ok(
  $$insert into public.event_attendance (user_id, event_id, kind)
    values ('47000000-0000-4000-8000-000000000001', '47111111-1111-4111-8111-111111111111', 'me_interesa')$$,
  '23514', NULL,
  '5. event_attendance: un INSERT de ''me_interesa'' se rechaza por el CHECK (23514)'
);

-- ---------------------------------------------------------------------------
-- Volver al estado de antes de la migración (solo en esta transacción).
-- ---------------------------------------------------------------------------
alter table public.event_attendance drop constraint event_attendance_kind_check;
alter table public.event_attendance
  add constraint event_attendance_kind_check check (kind in ('voy', 'me_interesa'));

insert into public.event_attendance (user_id, event_id, kind)
values
  ('47000000-0000-4000-8000-000000000001', '47111111-1111-4111-8111-111111111111', 'voy'),
  ('47000000-0000-4000-8000-000000000002', '47111111-1111-4111-8111-111111111111', 'me_interesa'),
  ('47000000-0000-4000-8000-000000000003', '47222222-2222-4222-8222-222222222222', 'voy');

insert into public.user_favorites (user_id, event_id)
values ('47000000-0000-4000-8000-000000000003', '47222222-2222-4222-8222-222222222222');

-- 6. Preparación: E1 tiene voy=1 y me_interesa=1 antes del backfill.
select ok(
  (select voy = 1 and me_interesa = 1 from public.event_attendance_totals
   where event_id = '47111111-1111-4111-8111-111111111111'),
  '6. prep: event_attendance_totals/E1 antes: voy=1, me_interesa=1'
);

-- El cuerpo de 20261018120000_r47_guardar_voy.sql, sin cambios.
create function pg_temp.r47_cuerpo() returns void language plpgsql as $f$
begin
  insert into public.user_favorites (user_id, event_id)
  select user_id, event_id
  from public.event_attendance
  on conflict do nothing;

  delete from public.event_attendance
  where kind = 'me_interesa';

  alter table public.event_attendance
    drop constraint if exists event_attendance_kind_check;

  alter table public.event_attendance
    add constraint event_attendance_kind_check check (kind = 'voy') not valid;

  alter table public.event_attendance
    validate constraint event_attendance_kind_check;

  comment on constraint event_attendance_kind_check on public.event_attendance is
    'R47 (Guardar, Voy y Seguir): solo ''voy''. "Me interesa" se reemplazó por el favorito (♥ Guardar) y por seguir lugares y cuentas. La columna me_interesa de event_attendance_totals y de la vista event_attendance_counts queda en 0 hasta una limpieza futura.';
end
$f$;

-- 7. Primera corrida.
select lives_ok($$ select pg_temp.r47_cuerpo() $$, '7. la migración corre sobre el estado de antes');

-- 8. U1 ('voy' sin favorito) quedó guardado.
select is(
  (select count(*)::int from public.user_favorites
   where user_id = '47000000-0000-4000-8000-000000000001' and event_id = '47111111-1111-4111-8111-111111111111'),
  1,
  '8. backfill: el Voy de U1 pasó a Guardados'
);

-- 9. U2 ('me_interesa' sin favorito) quedó guardado.
select is(
  (select count(*)::int from public.user_favorites
   where user_id = '47000000-0000-4000-8000-000000000002' and event_id = '47111111-1111-4111-8111-111111111111'),
  1,
  '9. backfill: el Me interesa de U2 pasó a Guardados'
);

-- 10. U3 (ya tenía favorito) sigue con uno solo.
select is(
  (select count(*)::int from public.user_favorites
   where user_id = '47000000-0000-4000-8000-000000000003' and event_id = '47222222-2222-4222-8222-222222222222'),
  1,
  '10. backfill: U3, que ya tenía el favorito, no queda duplicado'
);

-- 11. No queda ninguna marca 'me_interesa'; las 'voy' siguen.
select is(
  (select jsonb_build_object(
     'me_interesa', count(*) filter (where kind = 'me_interesa'),
     'voy', count(*) filter (where kind = 'voy'))
   from public.event_attendance
   where user_id in ('47000000-0000-4000-8000-000000000001',
                     '47000000-0000-4000-8000-000000000002',
                     '47000000-0000-4000-8000-000000000003')),
  '{"me_interesa": 0, "voy": 2}'::jsonb,
  '11. event_attendance: 0 me_interesa, los 2 voy siguen'
);

-- 12. El trigger dejó los totales bien: E1 voy=1, me_interesa=0.
select ok(
  (select voy = 1 and me_interesa = 0 from public.event_attendance_totals
   where event_id = '47111111-1111-4111-8111-111111111111'),
  '12. event_attendance_totals/E1 después: voy=1, me_interesa=0 (lo restó el trigger)'
);

-- 13. Ningún Voy sin Guardado.
select is(
  (select count(*)::int from public.event_attendance a
   where not exists (select 1 from public.user_favorites f
                     where f.user_id = a.user_id and f.event_id = a.event_id)),
  0,
  '13. ningún Voy queda sin su Guardado'
);

-- 14. El CHECK volvió a quedar en 'voy', validado.
select ok(
  (select pg_get_constraintdef(oid) = 'CHECK ((kind = ''voy''::text))' and convalidated
   from pg_constraint
   where conrelid = 'public.event_attendance'::regclass and conname = 'event_attendance_kind_check'),
  '14. después de correrla: CHECK ((kind = ''voy''::text)) validado'
);

-- 15. Idempotente: la segunda corrida no falla...
select lives_ok($$ select pg_temp.r47_cuerpo() $$, '15. idempotencia: la segunda corrida no falla');

-- 16. ...y no cambia nada (mismos favoritos y marcas de los fixtures).
select is(
  (select jsonb_build_object(
     'favoritos', (select count(*) from public.user_favorites
                   where user_id::text like '47000000-%'),
     'marcas', (select count(*) from public.event_attendance
                where user_id::text like '47000000-%'))),
  '{"favoritos": 3, "marcas": 2}'::jsonb,
  '16. idempotencia: la segunda corrida deja 3 favoritos y 2 marcas, igual que la primera'
);

-- 17. Y sigue habiendo un solo CHECK sobre kind.
select is(
  (select count(*)::int from pg_constraint
   where conrelid = 'public.event_attendance'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%kind%'),
  1,
  '17. idempotencia: un solo CHECK sobre kind después de dos corridas'
);

select * from finish();
rollback;
