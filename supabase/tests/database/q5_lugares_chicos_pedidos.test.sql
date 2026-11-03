-- pgTAP de 20261103130000_q5_lugares_chicos_pedidos.sql: nadie escribe salvo
-- service role; solo los admins leen y cambian. uuid fijo, prefijo "c6".
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000', 'c6000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'qa-q5p-u@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c6000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'qa-q5p-admin@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');

alter table public.profiles disable trigger tr_prevent_role_tampering;
update public.profiles set role = 'ADMIN' where id = 'c6000000-0000-4000-8000-000000000002';
alter table public.profiles enable trigger tr_prevent_role_tampering;

-- El servidor (service role, acá postgres) inserta.
insert into public.lugares_chicos_pedidos (id, nombre, direccion, tipo, contacto)
values ('c6111111-1111-4111-8111-111111111111', 'QA Pelotero Pedido', 'Calle QA 1', 'pelotero', 'qa@example.com');

select ok((select relrowsecurity from pg_class where oid = 'public.lugares_chicos_pedidos'::regclass), '1. RLS habilitada');
select ok(not has_table_privilege('anon', 'public.lugares_chicos_pedidos', 'SELECT'), '2. anon no lee');
select ok(not has_table_privilege('anon', 'public.lugares_chicos_pedidos', 'INSERT'), '3. anon no inserta');
select ok(not has_table_privilege('authenticated', 'public.lugares_chicos_pedidos', 'INSERT'), '4. authenticated no inserta');
select ok(not has_table_privilege('authenticated', 'public.lugares_chicos_pedidos', 'TRUNCATE'), '5. sin TRUNCATE');
select throws_ok(
  $$insert into public.lugares_chicos_pedidos (nombre, direccion, link) values ('QA', 'Calle QA', 'javascript:alert(1)')$$,
  '23514', null, '6. nombre corto o link raro: rechazado');
select throws_ok(
  $$insert into public.lugares_chicos_pedidos (nombre, direccion, tipo) values ('QA Lugar', 'Calle QA', 'cancha')$$,
  '23514', null, '7. tipo desconocido: rechazado');
select lives_ok(
  $$insert into public.lugares_chicos_pedidos (nombre, direccion) values ('QA Lugar Sin Tipo', 'Calle QA 2')$$,
  '8. sin tipo ni contacto: entra (no hay datos personales obligatorios)');

set local role authenticated;
set local request.jwt.claims = '{"sub":"c6000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*)::int from public.lugares_chicos_pedidos), 0, '9. usuario común: no ve ningún pedido');
update public.lugares_chicos_pedidos set estado = 'descartado';
reset role;
reset request.jwt.claims;
select is((select estado from public.lugares_chicos_pedidos where id = 'c6111111-1111-4111-8111-111111111111'), 'nuevo',
  '10. el update del común no tocó nada');

set local role authenticated;
set local request.jwt.claims = '{"sub":"c6000000-0000-4000-8000-000000000002","role":"authenticated"}';
select ok((select count(*)::int from public.lugares_chicos_pedidos) >= 2, '11. admin: ve los pedidos');
select lives_ok(
  $$update public.lugares_chicos_pedidos set estado = 'descartado', contacto = null, revisado_at = now()
    where id = 'c6111111-1111-4111-8111-111111111111'$$,
  '12. admin: descarta y borra el contacto');
select throws_ok(
  $$insert into public.lugares_chicos_pedidos (nombre, direccion) values ('QA Admin', 'Calle QA 3')$$,
  '42501', null, '13. ni el admin inserta desde el cliente (solo el servidor)');
reset role;
reset request.jwt.claims;
select is((select contacto from public.lugares_chicos_pedidos where id = 'c6111111-1111-4111-8111-111111111111'), null,
  '14. el contacto quedó borrado');

select * from finish();
rollback;
