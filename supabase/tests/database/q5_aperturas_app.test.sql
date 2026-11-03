-- pgTAP de 20261103140000_q5_aperturas_app.sql. Hashes inventados.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000', 'c7000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'qa-q5u-u@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c7000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'qa-q5u-admin@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');
alter table public.profiles disable trigger tr_prevent_role_tampering;
update public.profiles set role = 'ADMIN' where id = 'c7000000-0000-4000-8000-000000000002';
alter table public.profiles enable trigger tr_prevent_role_tampering;

select ok((select relrowsecurity from pg_class where oid = 'public.app_aperturas_diarias'::regclass), '1. RLS habilitada');
select ok(not has_function_privilege('anon', 'public.registrar_apertura_app(date, text, text, text, text, boolean)', 'EXECUTE'), '2. anon no ejecuta la función');
select ok(not has_function_privilege('authenticated', 'public.registrar_apertura_app(date, text, text, text, text, boolean)', 'EXECUTE'), '3. authenticated no ejecuta la función');
select ok(not has_table_privilege('authenticated', 'public.app_aperturas_diarias', 'INSERT'), '4. authenticated no inserta');

select public.registrar_apertura_app('2026-11-03', repeat('a', 64), repeat('b', 64), 'android', '1.0.7', false);
select public.registrar_apertura_app('2026-11-03', repeat('a', 64), repeat('b', 64), 'android', null, true);
select is((select aperturas from public.app_aperturas_diarias where hash_dia = repeat('a', 64)), 2, '5. la segunda apertura del día suma');
select is((select con_cuenta from public.app_aperturas_diarias where hash_dia = repeat('a', 64)), true, '6. con_cuenta queda en true si alguna vez hubo sesión');
select is((select version_app from public.app_aperturas_diarias where hash_dia = repeat('a', 64)), '1.0.7', '7. una versión nula no pisa la que había');

select throws_ok($$select public.registrar_apertura_app('2026-11-03', 'no-es-un-hash', repeat('b', 64), 'android', null, false)$$,
  '23514', null, '8. un hash que no es sha256 en hex: rechazado');
select throws_ok($$select public.registrar_apertura_app('2026-11-03', repeat('c', 64), repeat('b', 64), 'windows', null, false)$$,
  '23514', null, '9. plataforma desconocida: rechazada');
select throws_ok($$select public.registrar_apertura_app('2026-11-03', repeat('c', 64), repeat('b', 64), 'android', '1.0; drop', false)$$,
  '23514', null, '10. versión con caracteres raros: rechazada');

set local role authenticated;
set local request.jwt.claims = '{"sub":"c7000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*)::int from public.app_aperturas_diarias), 0, '11. usuario común: no ve nada');
reset role;
reset request.jwt.claims;
set local role authenticated;
set local request.jwt.claims = '{"sub":"c7000000-0000-4000-8000-000000000002","role":"authenticated"}';
select ok((select count(*)::int from public.app_aperturas_diarias) >= 1, '12. admin: lee');
reset role;
reset request.jwt.claims;

select * from finish();
rollback;
