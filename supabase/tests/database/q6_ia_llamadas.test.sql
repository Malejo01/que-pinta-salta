-- pgTAP de 20261104010000_q6_ia_llamadas.sql. Usuarios y filas inventados.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000', 'c8000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'qa-q6ia-u@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c8000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'qa-q6ia-admin@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');
alter table public.profiles disable trigger tr_prevent_role_tampering;
update public.profiles set role = 'ADMIN' where id = 'c8000000-0000-4000-8000-000000000002';
alter table public.profiles enable trigger tr_prevent_role_tampering;

select ok((select relrowsecurity from pg_class where oid = 'public.ia_llamadas'::regclass), '1. RLS habilitada');
select ok(not has_table_privilege('anon', 'public.ia_llamadas', 'SELECT'), '2. anon no lee');
select ok(not has_table_privilege('anon', 'public.ia_llamadas', 'INSERT'), '3. anon no inserta');
select ok(not has_table_privilege('authenticated', 'public.ia_llamadas', 'INSERT'), '4. authenticated no inserta');
select ok(not has_table_privilege('authenticated', 'public.ia_llamadas', 'UPDATE'), '5. authenticated no modifica');
select ok(not has_table_privilege('authenticated', 'public.ia_llamadas', 'DELETE'), '6. authenticated no borra');
select ok(has_table_privilege('service_role', 'public.ia_llamadas', 'INSERT'), '7. service_role inserta');

insert into public.ia_llamadas (uso, proveedor, modelo, tokens_entrada, tokens_salida, latencia_ms, ok, error_codigo)
values ('traduccion', 'gemini', 'gemini-3.5-flash-lite', 120, 40, 850, true, null),
       ('flyers', 'claude', 'claude-haiku-4-5', null, null, 30, false, 'sin_clave');
select is((select count(*)::int from public.ia_llamadas where uso in ('traduccion', 'flyers')), 2, '8. service_role registra éxitos y fallos');

select throws_ok($$insert into public.ia_llamadas (uso, proveedor, modelo, latencia_ms, ok) values ('flyers', 'openai', 'x', 1, true)$$,
  '23514', null, '9. proveedor desconocido: rechazado');
select throws_ok($$insert into public.ia_llamadas (uso, proveedor, modelo, latencia_ms, ok, error_codigo) values ('flyers', 'gemini', 'm', 1, false, 'la clave es sk-123')$$,
  '23514', null, '10. error_codigo libre (podría traer texto): rechazado');
select throws_ok($$insert into public.ia_llamadas (uso, proveedor, modelo, latencia_ms, ok, error_codigo) values ('flyers', 'gemini', 'm', 1, true, 'limite')$$,
  '23514', null, '11. ok con código de error: incoherente, rechazado');
select throws_ok($$insert into public.ia_llamadas (uso, proveedor, modelo, latencia_ms, ok) values ('Uso con espacios', 'gemini', 'm', 1, true)$$,
  '23514', null, '12. uso con texto libre: rechazado');

set local role authenticated;
set local request.jwt.claims = '{"sub":"c8000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*)::int from public.ia_llamadas), 0, '13. usuario común: no ve nada');
reset role;
reset request.jwt.claims;
set local role authenticated;
set local request.jwt.claims = '{"sub":"c8000000-0000-4000-8000-000000000002","role":"authenticated"}';
select ok((select count(*)::int from public.ia_llamadas) >= 2, '14. admin: lee');
reset role;
reset request.jwt.claims;

select * from finish();
rollback;
