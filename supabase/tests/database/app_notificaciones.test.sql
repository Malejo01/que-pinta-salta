-- Ronda 23 (23-b): pgTAP de las tres tablas de la migración
-- 20261013120000_app_notificaciones.sql (push_tokens + register_push_token,
-- notification_preferences, notification_sends).
--
-- Dos actores, uuid fijo, prefijo "c" (no choca con los "a"/"b" de
-- reglas_app.test.sql / rls_matriz.test.sql, que corren en transacciones
-- separadas igual):
--   A = c0000000-0000-4000-8000-000000000001 = qa-app-a@example.com
--   B = c0000000-0000-4000-8000-000000000002 = qa-app-b@example.com (nunca
--       actúa salvo donde el caso lo pide explícitamente: "lo ajeno" de A, o
--       quien reclama un token que ya era de A).
--
-- Todo dentro de una transacción con rollback; nada de esto queda en la base.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'qa-app-a@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
   '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'qa-app-b@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
   '', '', '', '');

-- ===========================================================================
-- PUSH_TOKENS / register_push_token
-- ===========================================================================

-- 1-2. A registra su token con la función, y lo lee (RLS: lectura del dueño).
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}';

select lives_ok(
  $$select public.register_push_token('qa-app-token-a', 'android')$$,
  '1. register_push_token: A registra su token sin que se rechace'
);

select is(
  (select count(*)::int from public.push_tokens where token = 'qa-app-token-a'),
  1,
  '2. push_tokens/A: lee el token que acaba de registrar'
);

-- 3-4. A lo borra (DELETE policy del dueño) y deja de verlo.
select lives_ok(
  $$delete from public.push_tokens where token = 'qa-app-token-a'$$,
  '3. push_tokens/A: borra su propio token sin que se rechace'
);

select is(
  (select count(*)::int from public.push_tokens where token = 'qa-app-token-a'),
  0,
  '4. push_tokens/A: ya no ve el token que borró'
);

-- 5. A registra un segundo token (el que después va a reclamar B).
select lives_ok(
  $$select public.register_push_token('qa-app-token-ab', 'android')$$,
  '5. register_push_token: A registra el token que B va a reclamar después'
);

reset role;
reset request.jwt.claims;

-- Como postgres: se atrasa last_seen_at a mano, para poder distinguir "se
-- actualizó en el segundo registro" de "quedó igual porque now() no cambia
-- dentro de la misma transacción" (now() es fijo durante toda la transacción).
update public.push_tokens set last_seen_at = '2020-01-01T00:00:00+00'::timestamptz
where token = 'qa-app-token-ab';

-- 6. B registra el MISMO token: el upsert por `token` lo reasigna a B.
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}';

select lives_ok(
  $$select public.register_push_token('qa-app-token-ab', 'android')$$,
  '6. register_push_token: B registra el token que ya era de A sin que se rechace'
);

reset role;
reset request.jwt.claims;

-- 7-8. El token queda de B, con last_seen_at actualizado (ya no el valor
-- atrasado a mano).
select is(
  (select user_id from public.push_tokens where token = 'qa-app-token-ab'),
  'c0000000-0000-4000-8000-000000000002'::uuid,
  '7. push_tokens: el token qa-app-token-ab queda de B (un solo registro, reasignado)'
);

select ok(
  (select last_seen_at > '2020-01-01T00:00:00+00'::timestamptz
   from public.push_tokens where token = 'qa-app-token-ab'),
  '8. push_tokens: last_seen_at se actualiza en el segundo registro (ya no es el valor atrasado a mano)'
);

-- 9-10. A deja de ver ese token; B lo ve.
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(
  (select count(*)::int from public.push_tokens where token = 'qa-app-token-ab'),
  0,
  '9. push_tokens/A: deja de ver el token que ahora es de B'
);
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(
  (select count(*)::int from public.push_tokens where token = 'qa-app-token-ab'),
  1,
  '10. push_tokens/B: ve el token que acaba de reclamar'
);
reset role;
reset request.jwt.claims;

-- 11. Sin sesión (authenticated sin "sub" en el claim, auth.uid() nulo):
--     la función da 42501 (primera instrucción del cuerpo).
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated"}';
select throws_ok(
  $$select public.register_push_token('qa-app-token-sin-sesion', 'android')$$,
  '42501', NULL,
  '11. register_push_token: sin sesión da 42501'
);
reset role;
reset request.jwt.claims;

-- 12. anon no tiene EXECUTE sobre la función: 42501 (permission denied for
--     function), por falta de privilegio, antes de que corra el cuerpo.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok(
  $$select public.register_push_token('qa-app-token-anon', 'android')$$,
  '42501', NULL,
  '12. register_push_token: anon no puede ejecutarla (sin EXECUTE)'
);
reset role;
reset request.jwt.claims;

-- 13. authenticated no puede insertar directo en push_tokens (sin policy de
--     INSERT y, además, el REVOKE de la migración le sacó el privilegio de
--     tabla): 42501.
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$insert into public.push_tokens (user_id, token, platform)
    values ('c0000000-0000-4000-8000-000000000001', 'qa-app-token-directo', 'android')$$,
  '42501', NULL,
  '13. push_tokens/A: el INSERT directo (sin pasar por la función) se rechaza'
);

-- A registra un tercer token, para el caso de abajo (B no puede borrarlo).
select public.register_push_token('qa-app-token-a2', 'android');
reset role;
reset request.jwt.claims;

-- B intenta borrar el token de A: la policy de DELETE ("eliminación del
-- dueño") no matchea esa fila -> 0 filas, sin error (como toda policy de
-- UPDATE/DELETE: filtra en silencio, no hay excepción).
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}';
delete from public.push_tokens where token = 'qa-app-token-a2';
reset role;
reset request.jwt.claims;

-- 14. El token de A sigue ahí: el DELETE de B no borró nada.
select is(
  (select count(*)::int from public.push_tokens where token = 'qa-app-token-a2'),
  1,
  '14. push_tokens: B no puede borrar el token de A (0 filas, sigue existiendo)'
);

-- 15. anon no lee nada de push_tokens: sin ningún privilegio de tabla
--     (REVOKE ALL), no solo filtrado por RLS -> 42501.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok(
  $$select count(*) from public.push_tokens where token = 'qa-app-token-a2'$$,
  '42501', NULL,
  '15. push_tokens/anon: el SELECT se rechaza (sin privilegio de tabla)'
);
reset role;
reset request.jwt.claims;

-- 16. Una plataforma inválida falla: register_push_token valida p_platform
--     antes de tocar la tabla (22023, no la del check de la columna).
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$select public.register_push_token('qa-app-token-plataforma-invalida', 'windows')$$,
  '22023', NULL,
  '16. register_push_token: una plataforma inválida falla'
);
reset role;
reset request.jwt.claims;

-- ===========================================================================
-- NOTIFICATION_PREFERENCES
-- ===========================================================================

-- 17-18. A crea las suyas (solo user_id) y quedan los defaults del plan.
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}';

select lives_ok(
  $$insert into public.notification_preferences (user_id)
    values ('c0000000-0000-4000-8000-000000000001')$$,
  '17. notification_preferences/A: el INSERT de las suyas (solo user_id) no se rechaza'
);

select ok(
  (select radar_channel = 'email' and favorite_reminders = true and follow_news = true
          and announcements = false and quiet_start = '23:00'::time and quiet_end = '09:00'::time
          and daily_cap = 4
   from public.notification_preferences where user_id = 'c0000000-0000-4000-8000-000000000001'),
  '18. notification_preferences/A: quedan los defaults del plan (email, recordatorios y novedades on, avisos off, 23-09, tope 4)'
);
reset role;
reset request.jwt.claims;

-- 19. B no ve las de A.
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(
  (select count(*)::int from public.notification_preferences
   where user_id = 'c0000000-0000-4000-8000-000000000001'),
  0,
  '19. notification_preferences/B: no ve las de A'
);

-- B intenta cambiarlas: USING (auth.uid()=user_id) no matchea -> 0 filas, sin
-- error.
update public.notification_preferences set daily_cap = 99
where user_id = 'c0000000-0000-4000-8000-000000000001';
reset role;
reset request.jwt.claims;

-- 20. El daily_cap de A no cambió.
select is(
  (select daily_cap from public.notification_preferences
   where user_id = 'c0000000-0000-4000-8000-000000000001'),
  4,
  '20. notification_preferences/B: el UPDATE sobre las de A no cambia nada (RLS lo filtra, 0 filas)'
);

-- 21. anon nada: sin privilegio de tabla -> 42501.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok(
  $$select count(*) from public.notification_preferences
    where user_id = 'c0000000-0000-4000-8000-000000000001'$$,
  '42501', NULL,
  '21. notification_preferences/anon: el SELECT se rechaza (sin privilegio de tabla)'
);
reset role;
reset request.jwt.claims;

-- ===========================================================================
-- NOTIFICATION_SENDS
-- ===========================================================================

-- Como postgres: una fila de historial para A (el camino real es
-- service_role, que bypassea RLS igual que postgres para esto).
insert into public.notification_sends (user_id, kind, channel, status, dedupe_key)
values ('c0000000-0000-4000-8000-000000000001', 'radar', 'email', 'sent', 'qa-app-send-a-1');

-- 22. A la lee (policy "lectura del dueño").
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(
  (select count(*)::int from public.notification_sends where dedupe_key = 'qa-app-send-a-1'),
  1,
  '22. notification_sends/A: lee la fila que el servidor le registró'
);
reset role;
reset request.jwt.claims;

-- 23. B no la ve (la tabla sí le da SELECT, pero RLS filtra en silencio: 0
--     filas, sin error).
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(
  (select count(*)::int from public.notification_sends where dedupe_key = 'qa-app-send-a-1'),
  0,
  '23. notification_sends/B: no ve la fila de A (RLS la filtra, 0 filas)'
);
reset role;
reset request.jwt.claims;

-- 24. authenticated no puede insertar (la migración le revocó el privilegio
--     de tabla, sin policy de INSERT): 42501, no "0 filas" (un INSERT no
--     tiene fila previa que RLS pueda filtrar; acá ni siquiera llega a RLS,
--     el privilegio de tabla ya lo frena).
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$insert into public.notification_sends (user_id, kind, channel, status, dedupe_key)
    values ('c0000000-0000-4000-8000-000000000001', 'radar', 'email', 'sent', 'qa-app-send-directo')$$,
  '42501', NULL,
  '24. notification_sends/A: el INSERT directo se rechaza (sin privilegio de tabla)'
);
reset role;
reset request.jwt.claims;

-- 25. anon nada: sin privilegio de tabla -> 42501.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok(
  $$select count(*) from public.notification_sends where dedupe_key = 'qa-app-send-a-1'$$,
  '42501', NULL,
  '25. notification_sends/anon: el SELECT se rechaza (sin privilegio de tabla)'
);
reset role;
reset request.jwt.claims;

select * from finish();
rollback;
