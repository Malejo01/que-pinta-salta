-- pgTAP de 20261018130400_qps_238_purge_notification_sends.sql:
-- purge_notification_sends(p_days) borra solo lo más viejo que p_days días,
-- devuelve cuántas filas borró y solo la ejecuta service_role. uuid fijo,
-- prefijo "38" (inventado, "qa-purga-..."). Todo en una transacción con
-- rollback.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select ok(
  (select prosecdef and proconfig = array['search_path=""']
   from pg_proc where oid = 'public.purge_notification_sends(integer)'::regprocedure),
  '1. purge_notification_sends: SECURITY DEFINER con search_path vacío'
);
select ok(
  has_function_privilege('service_role', 'public.purge_notification_sends(integer)', 'EXECUTE'),
  '2. service_role la puede ejecutar'
);
select ok(
  not has_function_privilege('anon', 'public.purge_notification_sends(integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.purge_notification_sends(integer)', 'EXECUTE'),
  '3. ni anon ni authenticated la pueden ejecutar'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000', '38000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'qa-purga@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');

-- Cuatro envíos: hace 200, 91, 89 y 0 días.
insert into public.notification_sends (user_id, kind, channel, status, dedupe_key, sent_at) values
  ('38000000-0000-4000-8000-000000000001', 'qa', 'push', 'enviado', 'qa-purga-200', now() - interval '200 days'),
  ('38000000-0000-4000-8000-000000000001', 'qa', 'push', 'enviado', 'qa-purga-91', now() - interval '91 days'),
  ('38000000-0000-4000-8000-000000000001', 'qa', 'push', 'enviado', 'qa-purga-89', now() - interval '89 days'),
  ('38000000-0000-4000-8000-000000000001', 'qa', 'push', 'enviado', 'qa-purga-0', now());

-- Si la base tiene otros envíos viejos (no de este archivo), el conteo
-- devuelto los incluye: se los cuenta antes para restarlos.
create temp table qa_purga_antes as
select count(*)::int as viejas from public.notification_sends
where sent_at < now() - interval '90 days' and dedupe_key not like 'qa-purga-%';
grant select on qa_purga_antes to service_role;

-- 4-5. anon y authenticated no pueden llamarla.
set local role anon;
select throws_ok($$select public.purge_notification_sends()$$, '42501', NULL,
  '4. anon: 42501');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"38000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok($$select public.purge_notification_sends()$$, '42501', NULL,
  '5. authenticated: 42501');
reset role;
reset request.jwt.claims;

-- 6-7. p_days inválido: 22023.
set local role service_role;
select throws_ok($$select public.purge_notification_sends(0)$$, '22023', NULL,
  '6. p_days = 0: 22023 (no vacía la tabla por error)');
select throws_ok($$select public.purge_notification_sends(null)$$, '22023', NULL,
  '7. p_days null: 22023');

-- 8. Con el default (90 días) borra los de 200 y 91 días.
select is(
  public.purge_notification_sends() - (select viejas from qa_purga_antes),
  2,
  '8. service_role, default 90: borra 2 envíos de este archivo (200 y 91 días)'
);
reset role;

select is(
  (select string_agg(dedupe_key, ',' order by dedupe_key) from public.notification_sends
   where dedupe_key like 'qa-purga-%'),
  'qa-purga-0,qa-purga-89',
  '9. quedan los de 89 y 0 días'
);

-- 10. Una segunda corrida no borra nada más de este archivo.
set local role service_role;
select is(public.purge_notification_sends(), 0, '10. segunda corrida: 0');

-- 11. Con p_days = 30 se lleva el de 89 días.
select ok(public.purge_notification_sends(30) >= 1, '11. p_days = 30: borra al menos el de 89 días');
reset role;

select is(
  (select string_agg(dedupe_key, ',') from public.notification_sends where dedupe_key like 'qa-purga-%'),
  'qa-purga-0',
  '12. queda solo el de hoy'
);

select * from finish();
rollback;
