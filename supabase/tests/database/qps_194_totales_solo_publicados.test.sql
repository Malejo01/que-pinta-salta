-- QPS-194: anon y authenticated leen event_attendance_totals solo de eventos
-- PUBLISHED (igual que la vista event_attendance_counts). Todo en una
-- transacción con rollback; usuarios y eventos inventados (prefijo "f").
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'qa-totales-a@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');

insert into public.events (id, title, slug, start_date, status, created_by)
values
  ('f1111111-1111-4111-8111-111111111111', 'QA Totales Publicado', 'qa-totales-publicado',
   now() + interval '1 day', 'PUBLISHED', 'f0000000-0000-4000-8000-000000000001'),
  ('f2222222-2222-4222-8222-222222222222', 'QA Totales Draft', 'qa-totales-draft',
   now() + interval '1 day', 'DRAFT', 'f0000000-0000-4000-8000-000000000001');

-- Los totales se escriben como postgres (en la app los escribe solo el trigger).
insert into public.event_attendance_totals (event_id, voy, me_interesa)
values
  ('f1111111-1111-4111-8111-111111111111', 3, 1),
  ('f2222222-2222-4222-8222-222222222222', 5, 2);

set local role anon;
select is(
  (select voy from public.event_attendance_totals where event_id = 'f1111111-1111-4111-8111-111111111111'),
  3,
  '1. anon: lee los totales de un evento PUBLISHED'
);
select is_empty(
  $$ select 1 from public.event_attendance_totals where event_id = 'f2222222-2222-4222-8222-222222222222' $$,
  '2. anon: NO lee los totales de un evento DRAFT con su UUID (QPS-194)'
);
select is(
  (select voy from public.event_attendance_counts where event_id = 'f1111111-1111-4111-8111-111111111111'),
  3,
  '3. anon: la vista pública sigue mostrando el PUBLISHED'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(
  (select me_interesa from public.event_attendance_totals where event_id = 'f1111111-1111-4111-8111-111111111111'),
  1,
  '4. authenticated: lee los totales de un evento PUBLISHED'
);
select is_empty(
  $$ select 1 from public.event_attendance_totals where event_id = 'f2222222-2222-4222-8222-222222222222' $$,
  '5. authenticated (aunque sea el autor): NO lee los totales de un evento DRAFT (QPS-194)'
);
select is_empty(
  $$ select 1 from public.event_attendance_counts where event_id = 'f2222222-2222-4222-8222-222222222222' $$,
  '6. authenticated: la vista tampoco muestra el DRAFT'
);
reset role;
reset request.jwt.claims;

select * from finish();
rollback;
