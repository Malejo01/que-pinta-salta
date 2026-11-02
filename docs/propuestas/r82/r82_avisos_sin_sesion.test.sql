-- Ronda 82 (82-a): pgTAP de 20261030120000_r82_avisos_sin_sesion.sql
-- (push_tokens y notification_sends admiten filas sin cuenta; funciones
-- register_anon_push_token, set_push_preferences, unlink_push_token y
-- purge_push_tokens_anonimos).
--
-- Va en supabase/tests/database/r82_avisos_sin_sesion.test.sql.
--
-- Dos actores con cuenta, uuid fijo, prefijo "82" (no choca con los "a"/"b"/"c"
-- de los otros tests; cada archivo corre en su transacción igual):
--   A = 82000000-0000-4000-8000-000000000001 = qa-r82-a@example.com
--   B = 82000000-0000-4000-8000-000000000002 = qa-r82-b@example.com
-- Dos dispositivos: D1 = 82d00000-...-0001, D2 = 82d00000-...-0002,
-- D3 = 82d00000-...-0003. Los tokens son inventados ("qa-r82-...").
--
-- Las funciones de solo service_role se llaman como postgres (que las puede
-- ejecutar); lo que se prueba de permisos se mira con has_function_privilege
-- y con SET ROLE anon/authenticated. Todo con rollback.
begin;
create extension if not exists pgtap with schema extensions;
select plan(58);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000', '82000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'qa-r82-a@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
   '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '82000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'qa-r82-b@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
   '', '', '', '');

-- ===========================================================================
-- Esquema
-- ===========================================================================

select has_column('public', 'push_tokens', 'device_id', '1. push_tokens.device_id existe');
select has_column('public', 'push_tokens', 'avisos_equipo', '2. push_tokens.avisos_equipo existe');
select has_column('public', 'push_tokens', 'avisos_patrocinados', '3. push_tokens.avisos_patrocinados existe');
select has_column('public', 'push_tokens', 'idioma', '4. push_tokens.idioma existe');
select has_column('public', 'notification_sends', 'push_token_id', '5. notification_sends.push_token_id existe');
select col_is_null('public', 'push_tokens', 'user_id', '6. push_tokens.user_id admite NULL');
select col_is_null('public', 'notification_sends', 'user_id', '7. notification_sends.user_id admite NULL');

-- ===========================================================================
-- Permisos: anon no toca nada; las funciones del servidor son de service_role
-- ===========================================================================

select ok(
  not has_table_privilege('anon', 'public.push_tokens', 'SELECT')
  and not has_table_privilege('anon', 'public.push_tokens', 'INSERT')
  and not has_table_privilege('anon', 'public.push_tokens', 'UPDATE')
  and not has_table_privilege('anon', 'public.push_tokens', 'DELETE'),
  '8. push_tokens: anon sin privilegios de tabla (select/insert/update/delete)'
);

select ok(
  not has_table_privilege('anon', 'public.notification_sends', 'SELECT')
  and not has_table_privilege('anon', 'public.notification_sends', 'INSERT'),
  '9. notification_sends: anon sin privilegios de tabla'
);

select ok(
  not has_table_privilege('authenticated', 'public.push_tokens', 'INSERT')
  and not has_table_privilege('authenticated', 'public.push_tokens', 'UPDATE'),
  '10. push_tokens: authenticated sigue sin INSERT ni UPDATE directo'
);

select ok(
  has_function_privilege('service_role', 'public.register_anon_push_token(text, uuid, text, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.register_anon_push_token(text, uuid, text, text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.register_anon_push_token(text, uuid, text, text)', 'EXECUTE'),
  '11. register_anon_push_token: solo service_role la ejecuta'
);

select ok(
  has_function_privilege('service_role', 'public.set_push_preferences(text, uuid, boolean, boolean)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.set_push_preferences(text, uuid, boolean, boolean)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.set_push_preferences(text, uuid, boolean, boolean)', 'EXECUTE'),
  '12. set_push_preferences: solo service_role la ejecuta'
);

select ok(
  has_function_privilege('authenticated', 'public.unlink_push_token(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.unlink_push_token(text)', 'EXECUTE'),
  '13. unlink_push_token: authenticated sí, anon no'
);

select ok(
  has_function_privilege('service_role', 'public.purge_push_tokens_anonimos(integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.purge_push_tokens_anonimos(integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.purge_push_tokens_anonimos(integer)', 'EXECUTE'),
  '14. purge_push_tokens_anonimos: solo service_role la ejecuta'
);

select ok(
  (select bool_and(prosecdef and proconfig = array['search_path=""'])
   from pg_proc
   where oid in (
     'public.register_anon_push_token(text, uuid, text, text)'::regprocedure,
     'public.set_push_preferences(text, uuid, boolean, boolean)'::regprocedure,
     'public.unlink_push_token(text)'::regprocedure,
     'public.purge_push_tokens_anonimos(integer)'::regprocedure
   )),
  '15. las cuatro funciones son SECURITY DEFINER con search_path vacío'
);

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok(
  $$select public.register_anon_push_token('ExponentPushToken[qa-r82-anon-directo]', '82d00000-0000-4000-8000-000000000001', 'android', 'es')$$,
  '42501', NULL,
  '16. anon no puede llamar a register_anon_push_token (la anon key no registra)'
);
select throws_ok(
  $$select count(*) from public.push_tokens$$,
  '42501', NULL,
  '17. anon no lee push_tokens'
);
reset role;
reset request.jwt.claims;

-- ===========================================================================
-- Alta anónima
-- ===========================================================================

select is(
  public.register_anon_push_token('ExponentPushToken[qa-r82-anon1]', '82d00000-0000-4000-8000-000000000001', 'android', 'es-AR'),
  true,
  '18. register_anon_push_token: alta nueva devuelve true'
);

select ok(
  (select user_id is null
          and device_id = '82d00000-0000-4000-8000-000000000001'::uuid
          and avisos_equipo = true
          and avisos_patrocinados = false
          and idioma = 'es-AR'
          and platform = 'android'
   from public.push_tokens where token = 'ExponentPushToken[qa-r82-anon1]'),
  '19. la fila nueva: sin usuario, con device_id, equipo on, patrocinados off, idioma guardado'
);

select is(
  public.register_anon_push_token('ExponentPushToken[qa-r82-anon1]', '82d00000-0000-4000-8000-000000000002', 'android', 'en'),
  false,
  '20. el mismo token desde OTRO device_id se rechaza (false)'
);

select is(
  (select device_id from public.push_tokens where token = 'ExponentPushToken[qa-r82-anon1]'),
  '82d00000-0000-4000-8000-000000000001'::uuid,
  '21. y la fila sigue siendo del primer dispositivo (no se pisó device_id)'
);

select is(
  public.register_anon_push_token('ExponentPushToken[qa-r82-anon1]', '82d00000-0000-4000-8000-000000000001', 'android', null),
  true,
  '22. el mismo token desde el MISMO device_id renueva (true)'
);

select is(
  (select idioma from public.push_tokens where token = 'ExponentPushToken[qa-r82-anon1]'),
  'es-AR',
  '23. renovar sin idioma no borra el idioma guardado'
);

select throws_ok(
  $$select public.register_anon_push_token('cualquier-cosa', '82d00000-0000-4000-8000-000000000001', 'android', 'es')$$,
  '22023', NULL,
  '24. un token que no tiene forma de token de Expo se rechaza (22023)'
);

select throws_ok(
  $$select public.register_anon_push_token('ExponentPushToken[qa-r82-x]', '82d00000-0000-4000-8000-000000000001', 'windows', 'es')$$,
  '22023', NULL,
  '25. una plataforma inválida se rechaza (22023)'
);

select throws_ok(
  $$select public.register_anon_push_token('ExponentPushToken[qa-r82-x]', null, 'android', 'es')$$,
  '22023', NULL,
  '26. sin device_id se rechaza (22023)'
);

select lives_ok(
  $$select public.register_anon_push_token('ExponentPushToken[qa-r82-idioma]', '82d00000-0000-4000-8000-000000000003', 'ios', 'ZZ-!!')$$,
  '27. un idioma raro no tumba el alta'
);

select is(
  (select idioma from public.push_tokens where token = 'ExponentPushToken[qa-r82-idioma]'),
  null,
  '28. ...y se guarda sin idioma'
);

-- Checks de la tabla (insert directo como postgres).
select throws_ok(
  $$insert into public.push_tokens (user_id, token, platform) values (null, 'ExponentPushToken[qa-r82-sin-device]', 'android')$$,
  '23514', NULL,
  '29. una fila sin usuario y sin device_id viola el check'
);

select throws_ok(
  $$insert into public.push_tokens (user_id, token, platform)
    values ('82000000-0000-4000-8000-000000000001', 'ExponentPushToken[qa-r82-anon1]', 'android')$$,
  '23505', NULL,
  '30. el token sigue siendo único'
);

-- ===========================================================================
-- Interruptores de la fila anónima
-- ===========================================================================

select is(
  public.set_push_preferences('ExponentPushToken[qa-r82-anon1]', '82d00000-0000-4000-8000-000000000001', false, true),
  true,
  '31. set_push_preferences con token + device_id correctos devuelve true'
);

select ok(
  (select avisos_equipo = false and avisos_patrocinados = true
   from public.push_tokens where token = 'ExponentPushToken[qa-r82-anon1]'),
  '32. los dos interruptores cambiaron'
);

select is(
  public.set_push_preferences('ExponentPushToken[qa-r82-anon1]', '82d00000-0000-4000-8000-000000000002', true, false),
  false,
  '33. con otro device_id devuelve false'
);

select ok(
  (select avisos_equipo = false and avisos_patrocinados = true
   from public.push_tokens where token = 'ExponentPushToken[qa-r82-anon1]'),
  '34. y no cambió nada'
);

select is(
  public.set_push_preferences('ExponentPushToken[qa-r82-no-existe]', '82d00000-0000-4000-8000-000000000001', true, true),
  false,
  '35. un token que no existe devuelve false (misma respuesta que un device_id distinto)'
);

select public.set_push_preferences('ExponentPushToken[qa-r82-anon1]', '82d00000-0000-4000-8000-000000000001', null, false);
select ok(
  (select avisos_equipo = false and avisos_patrocinados = false
   from public.push_tokens where token = 'ExponentPushToken[qa-r82-anon1]'),
  '36. un parámetro nulo deja ese interruptor como estaba'
);

-- ===========================================================================
-- Poda por dispositivo: quedan las 3 filas anónimas más recientes
-- ===========================================================================

select public.register_anon_push_token('ExponentPushToken[qa-r82-p1]', '82d00000-0000-4000-8000-000000000002', 'android', 'es');
select public.register_anon_push_token('ExponentPushToken[qa-r82-p2]', '82d00000-0000-4000-8000-000000000002', 'android', 'es');
select public.register_anon_push_token('ExponentPushToken[qa-r82-p3]', '82d00000-0000-4000-8000-000000000002', 'android', 'es');
select public.register_anon_push_token('ExponentPushToken[qa-r82-p4]', '82d00000-0000-4000-8000-000000000002', 'android', 'es');
select public.register_anon_push_token('ExponentPushToken[qa-r82-p5]', '82d00000-0000-4000-8000-000000000002', 'android', 'es');

select is(
  (select count(*)::int from public.push_tokens where device_id = '82d00000-0000-4000-8000-000000000002'),
  3,
  '37. tras cinco altas del mismo dispositivo quedan 3 filas'
);

select ok(
  (select count(*) = 0 from public.push_tokens where token = 'ExponentPushToken[qa-r82-p1]')
  and (select count(*) = 1 from public.push_tokens where token = 'ExponentPushToken[qa-r82-p5]'),
  '38. se fue la más vieja y quedó la más nueva'
);

-- ===========================================================================
-- Vínculo al iniciar sesión (register_push_token, sin cambios)
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"82000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok(
  $$select public.register_push_token('ExponentPushToken[qa-r82-anon1]', 'android')$$,
  '39. register_push_token: A (con sesión) registra el token que era anónimo'
);
select is(
  (select count(*)::int from public.push_tokens where token = 'ExponentPushToken[qa-r82-anon1]'),
  1,
  '40. A lee la fila vinculada (RLS del dueño) y hay una sola'
);
reset role;
reset request.jwt.claims;

select ok(
  (select user_id = '82000000-0000-4000-8000-000000000001'::uuid
          and device_id = '82d00000-0000-4000-8000-000000000001'::uuid
   from public.push_tokens where token = 'ExponentPushToken[qa-r82-anon1]'),
  '41. el vínculo pone user_id y conserva device_id (no duplica la fila)'
);

select is(
  public.register_anon_push_token('ExponentPushToken[qa-r82-anon1]', '82d00000-0000-4000-8000-000000000001', 'android', 'es'),
  true,
  '42. la API anónima puede renovar la fila ya vinculada (mismo device_id)...'
);

select is(
  (select user_id from public.push_tokens where token = 'ExponentPushToken[qa-r82-anon1]'),
  '82000000-0000-4000-8000-000000000001'::uuid,
  '43. ...y no le saca el user_id'
);

select is(
  public.set_push_preferences('ExponentPushToken[qa-r82-anon1]', '82d00000-0000-4000-8000-000000000001', true, true),
  false,
  '44. los interruptores anónimos no se tocan en una fila con cuenta (false)'
);

-- B no puede desvincular lo de A.
set local role authenticated;
set local request.jwt.claims = '{"sub":"82000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(
  public.unlink_push_token('ExponentPushToken[qa-r82-anon1]'),
  false,
  '45. unlink_push_token: B no puede desvincular el token de A'
);
reset role;
reset request.jwt.claims;

select is(
  (select user_id from public.push_tokens where token = 'ExponentPushToken[qa-r82-anon1]'),
  '82000000-0000-4000-8000-000000000001'::uuid,
  '46. y la fila sigue siendo de A'
);

-- ===========================================================================
-- Cerrar sesión: la fila queda anónima y copia las preferencias de la cuenta
-- ===========================================================================

insert into public.notification_preferences (user_id, announcements, sponsored)
values ('82000000-0000-4000-8000-000000000001', true, true);

set local role authenticated;
set local request.jwt.claims = '{"sub":"82000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(
  public.unlink_push_token('ExponentPushToken[qa-r82-anon1]'),
  true,
  '47. unlink_push_token: A desvincula su token (true)'
);
reset role;
reset request.jwt.claims;

select ok(
  (select user_id is null
          and device_id = '82d00000-0000-4000-8000-000000000001'::uuid
          and avisos_equipo = true
          and avisos_patrocinados = true
   from public.push_tokens where token = 'ExponentPushToken[qa-r82-anon1]'),
  '48. la fila queda anónima, con su device_id y con announcements/sponsored copiados'
);

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated"}';
select throws_ok(
  $$select public.unlink_push_token('ExponentPushToken[qa-r82-anon1]')$$,
  '42501', NULL,
  '49. unlink_push_token sin sesión da 42501'
);
reset role;
reset request.jwt.claims;

-- Una fila con cuenta que nunca tuvo device_id: al cerrar sesión se borra.
set local role authenticated;
set local request.jwt.claims = '{"sub":"82000000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.register_push_token('ExponentPushToken[qa-r82-login]', 'ios');
select public.unlink_push_token('ExponentPushToken[qa-r82-login]');
reset role;
reset request.jwt.claims;

select is(
  (select count(*)::int from public.push_tokens where token = 'ExponentPushToken[qa-r82-login]'),
  0,
  '50. una fila con cuenta sin device_id se borra al desvincular (no puede quedar anónima)'
);

-- ===========================================================================
-- notification_sends para anónimos + borrado de cuenta
-- ===========================================================================

select lives_ok(
  $$insert into public.notification_sends (user_id, push_token_id, kind, channel, status, dedupe_key)
    select null, id, 'anuncio', 'push', 'SUCCESS', 'anuncio:' || id::text || ':2026-10-30'
    from public.push_tokens where token = 'ExponentPushToken[qa-r82-anon1]'$$,
  '51. un envío a un dispositivo sin cuenta se registra con push_token_id'
);

select throws_ok(
  $$insert into public.notification_sends (user_id, push_token_id, kind, channel, status, dedupe_key)
    values (null, null, 'anuncio', 'push', 'SUCCESS', 'qa-r82-sin-destinatario')$$,
  '23514', NULL,
  '52. un envío sin usuario ni token viola el check'
);

-- A (con cuenta) vincula un token anónimo con envío registrado y borra su cuenta.
select public.register_anon_push_token('ExponentPushToken[qa-r82-borrar]', '82d00000-0000-4000-8000-000000000003', 'android', 'es');

set local role authenticated;
set local request.jwt.claims = '{"sub":"82000000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.register_push_token('ExponentPushToken[qa-r82-borrar]', 'android');
reset role;
reset request.jwt.claims;

insert into public.notification_sends (user_id, push_token_id, kind, channel, status, dedupe_key)
select null, id, 'patrocinado', 'push', 'SUCCESS', 'patrocinado:' || id::text || ':2026-S44'
from public.push_tokens where token = 'ExponentPushToken[qa-r82-borrar]';

set local role authenticated;
set local request.jwt.claims = '{"sub":"82000000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.delete_my_account();
reset role;
reset request.jwt.claims;

select is(
  (select count(*)::int from public.push_tokens where token = 'ExponentPushToken[qa-r82-borrar]'),
  0,
  '53. delete_my_account: la fila del teléfono de A se borra (regla vigente: borra por user_id)'
);

select is(
  (select count(*)::int from public.notification_sends where dedupe_key like 'patrocinado:%:2026-S44'),
  0,
  '54. ...y su historial de envíos se va por cascada (push_token_id)'
);

select is(
  (select count(*)::int from public.push_tokens where token = 'ExponentPushToken[qa-r82-p5]'),
  1,
  '55. las filas anónimas ajenas no se tocan'
);

-- ===========================================================================
-- Limpieza de filas anónimas viejas
-- ===========================================================================

update public.push_tokens set last_seen_at = '2020-01-01T00:00:00+00'::timestamptz
where token = 'ExponentPushToken[qa-r82-p5]';
update public.push_tokens set last_seen_at = now() - interval '10 days'
where token = 'ExponentPushToken[qa-r82-p4]';

select is(
  public.purge_push_tokens_anonimos(1),
  1,
  '56. purge_push_tokens_anonimos: borra la de 2020 (el mínimo efectivo es 30 días)'
);

select is(
  (select count(*)::int from public.push_tokens where token in ('ExponentPushToken[qa-r82-p5]', 'ExponentPushToken[qa-r82-p4]')),
  1,
  '57. ...y la de hace 10 días queda'
);

select is(
  (select count(*)::int from public.push_tokens where token = 'ExponentPushToken[qa-r82-anon1]' and user_id is null),
  1,
  '58. las demás filas anónimas recientes quedan'
);

select * from finish();
rollback;
