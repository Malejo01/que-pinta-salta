-- Ronda 19 (19-b): pgTAP de public.merge_events(keep_id, drop_id) contra la
-- implementación real de 19-a (supabase/migrations/20261011120000_merge_events.sql).
-- No se adapta ningún test para que pase: si algo de abajo revela que la
-- función no cumple la especificación, va al informe tal cual.
--
-- Requisito de seguridad de Mauro (09/10): cada ítem de la consigna tiene al
-- menos un caso propio, con un nombre que lo diga (ver los comentarios "0.",
-- "1.", "2.", etc. que preceden cada bloque).
--
-- Usuarios y eventos son inventados y evidentes ("qa-merge-...@example.com",
-- "QA Merge ..."), creados dentro de esta transacción con rollback al final:
-- no se lee ni se usa ninguna fila real de la base local (que tiene una copia
-- de producción con emails reales).
--
-- uuids fijos e inventados, prefijo c0000000:
--   001 = ADMIN  = qa-merge-admin@example.com
--   002 = USER   = qa-merge-usuario@example.com (común, no admin)
--   003 = FAV1   = qa-merge-fav1@example.com (favoritos: solo el descartado)
--   004 = FAV2   = qa-merge-fav2@example.com (favoritos: los dos)
--   005 = FAV3   = qa-merge-fav3@example.com (favoritos: solo el que queda)
--   006 = FAVR   = qa-merge-fav-reject@example.com (favorito estable de la
--         sección 2, nunca se mueve porque los 8 casos de esa sección
--         rechazan la fusión antes de tocar nada)
--   007 = FAVTX  = qa-merge-fav-tx@example.com (favorito de la sección 3;
--         un usuario propio, para no mezclar con los de la fusión válida: el
--         par "tx" se usa antes que el par "ok" y sigue existiendo después,
--         así que si compartiera usuario con FAV1 la fila del par "tx"
--         volvería ambiguas las subconsultas de la sección 5)
--
-- Convención de roles: "set local role authenticated" + "set local
-- request.jwt.claims" con el sub del actor, como reglas_app.test.sql y
-- rls_matriz.test.sql. "reset role; reset request.jwt.claims;" después de
-- cada bloque de actor.
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

-- ---------------------------------------------------------------------------
-- Preparación general (como postgres, antes de que actúe ningún rol).
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'qa-merge-admin@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'qa-merge-usuario@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'qa-merge-fav1@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-000000000004',
   'authenticated', 'authenticated', 'qa-merge-fav2@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-000000000005',
   'authenticated', 'authenticated', 'qa-merge-fav3@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-000000000006',
   'authenticated', 'authenticated', 'qa-merge-fav-reject@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-000000000007',
   'authenticated', 'authenticated', 'qa-merge-fav-tx@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');

-- El trigger on_auth_user_created ya creó los 6 perfiles en USER. El de ADMIN
-- pasa a ADMIN (mismo truco que reglas_app.test.sql / rls_matriz.test.sql).
alter table public.profiles disable trigger tr_prevent_role_tampering;
update public.profiles set role = 'ADMIN'
  where id = 'c0000000-0000-4000-8000-000000000001';
alter table public.profiles enable trigger tr_prevent_role_tampering;

insert into public.instagram_accounts (username, display_name)
values ('qa_merge_cuenta', 'QA Merge Cuenta');

-- ---------------------------------------------------------------------------
-- Eventos de la sección 1 (Permisos): par simple, el admin SÍ lo fusiona de
-- verdad (es el único caso en que el descarte de "permiso-drop" se consume).
-- ---------------------------------------------------------------------------
insert into public.events (title, slug, start_date, status, created_by)
values
  ('QA Merge Permiso Keep', 'qa-merge-permiso-keep', now() + interval '1 day', 'DRAFT', null),
  ('QA Merge Permiso Drop', 'qa-merge-permiso-drop', now() + interval '1 day', 'DRAFT', null);

-- ---------------------------------------------------------------------------
-- Eventos de la sección 2 (Rechazos): un único par "reject" con favorito,
-- flyer, ticket_sources y merge_audit ya cargados. Los 8 casos lo reutilizan
-- (nunca se toca nada de verdad, porque los 8 rechazan antes de escribir), así
-- que estos fixtures sirven de "testigo" de que ninguno tuvo efecto.
-- ---------------------------------------------------------------------------
insert into public.events (title, slug, start_date, status, created_by, ticket_sources, merge_audit)
values
  ('QA Merge Reject Keep', 'qa-merge-reject-keep', now() + interval '1 day', 'DRAFT', null,
   '[{"source":"manual","url":"https://entradas.example.com/reject","price_min":200}]'::jsonb,
   '[{"context":"admin","note":"qa-previo"}]'::jsonb),
  ('QA Merge Reject Drop', 'qa-merge-reject-drop', now() + interval '1 day', 'DRAFT', null, '[]'::jsonb, '[]'::jsonb);

insert into public.instagram_flyers (account_id, ig_post_id, ig_post_url, published_at, ai_metadata)
values (
  (select id from public.instagram_accounts where username = 'qa_merge_cuenta'),
  'qa-merge-reject-flyer', 'https://instagram.com/p/qa-merge-reject', now(),
  jsonb_build_object('event_id', (select id from public.events where slug = 'qa-merge-reject-drop'))
);

insert into public.user_favorites (user_id, event_id)
values ('c0000000-0000-4000-8000-000000000006', (select id from public.events where slug = 'qa-merge-reject-drop'));

-- ---------------------------------------------------------------------------
-- Eventos de las secciones 3b/4/5/6/7/8/9 (fusión válida completa): el par
-- "ok", un tercer evento ajeno ("otro", para probar que un flyer de otro
-- evento no cambia), 3 flyers y 3 usuarios con favoritos en las 3
-- combinaciones que pide la consigna (solo descartado / los dos / solo el
-- que queda).
-- ---------------------------------------------------------------------------
insert into public.events (
  title, slug, start_date, status, is_featured, created_by,
  ticket_sources, ticket_url, price_min, scrape_source_key, ai_metadata
)
values
  ('QA Merge OK Keep', 'qa-merge-ok-keep', now() + interval '2 day', 'PUBLISHED', false, null,
   '[{"source":"entradaweb","url":"https://ENTRADAS.example.com/show/","price_min":1000},{"source":"garbage","note":"sin url"}]'::jsonb,
   null, 1000, 'keepsource', null),
  ('QA Merge OK Drop', 'qa-merge-ok-drop', now() + interval '2 day', 'PUBLISHED', true, null,
   '[{"source":"entradaweb","url":"https://entradas.example.com/show","price_min":800},{"source":"otratickets","url":"https://otratickets.example.com/x","price_min":300},{"source":"otratickets","url":"https://otratickets.example.com/y","price_min":350},{"source":"garbage2","note":"sin url"}]'::jsonb,
   'https://ticketdrop.example.com/z', 350, 'dropsource', '{"qa_custom_key":"mantiene"}'::jsonb),
  ('QA Merge OK Otro', 'qa-merge-ok-otro', now() + interval '2 day', 'PUBLISHED', false, null, '[]'::jsonb, null, 0, null, null);

insert into public.instagram_flyers (account_id, ig_post_id, ig_post_url, published_at, ai_metadata)
values
  ((select id from public.instagram_accounts where username = 'qa_merge_cuenta'),
   'qa-merge-ok-flyer-1', 'https://instagram.com/p/qa-merge-ok-1', now(),
   jsonb_build_object('event_id', (select id from public.events where slug = 'qa-merge-ok-drop'))),
  ((select id from public.instagram_accounts where username = 'qa_merge_cuenta'),
   'qa-merge-ok-flyer-2', 'https://instagram.com/p/qa-merge-ok-2', now(),
   jsonb_build_object('event_id', (select id from public.events where slug = 'qa-merge-ok-drop'))),
  ((select id from public.instagram_accounts where username = 'qa_merge_cuenta'),
   'qa-merge-ok-flyer-3', 'https://instagram.com/p/qa-merge-ok-3', now(),
   jsonb_build_object('event_id', (select id from public.events where slug = 'qa-merge-ok-otro')));

insert into public.user_favorites (user_id, event_id)
values
  ('c0000000-0000-4000-8000-000000000003', (select id from public.events where slug = 'qa-merge-ok-drop')),
  ('c0000000-0000-4000-8000-000000000004', (select id from public.events where slug = 'qa-merge-ok-keep')),
  ('c0000000-0000-4000-8000-000000000004', (select id from public.events where slug = 'qa-merge-ok-drop')),
  ('c0000000-0000-4000-8000-000000000005', (select id from public.events where slug = 'qa-merge-ok-keep'));

-- ---------------------------------------------------------------------------
-- Eventos de la sección 3 (una sola transacción): trigger temporal sobre
-- user_favorites que siempre lanza una excepción.
-- ---------------------------------------------------------------------------
insert into public.events (title, slug, start_date, status, created_by, merge_audit)
values
  ('QA Merge TX Keep', 'qa-merge-tx-keep', now() + interval '3 day', 'PUBLISHED', null, '[{"context":"admin","note":"qa-tx-previo"}]'::jsonb),
  ('QA Merge TX Drop', 'qa-merge-tx-drop', now() + interval '3 day', 'PUBLISHED', null, '[]'::jsonb);

insert into public.instagram_flyers (account_id, ig_post_id, ig_post_url, published_at, ai_metadata)
values (
  (select id from public.instagram_accounts where username = 'qa_merge_cuenta'),
  'qa-merge-tx-flyer', 'https://instagram.com/p/qa-merge-tx', now(),
  jsonb_build_object('event_id', (select id from public.events where slug = 'qa-merge-tx-drop'))
);

insert into public.user_favorites (user_id, event_id)
values ('c0000000-0000-4000-8000-000000000007', (select id from public.events where slug = 'qa-merge-tx-drop'));

-- ---------------------------------------------------------------------------
-- Eventos de la sección "merge_audit con 50 entradas previas".
-- ---------------------------------------------------------------------------
insert into public.events (title, slug, start_date, status, created_by, merge_audit)
values
  ('QA Merge Auditcap Keep', 'qa-merge-auditcap-keep', now() + interval '4 day', 'DRAFT', null,
   (select jsonb_agg(jsonb_build_object('context', 'filler', 'seq', n)) from generate_series(1, 50) as n)),
  ('QA Merge Auditcap Drop', 'qa-merge-auditcap-drop', now() + interval '4 day', 'DRAFT', null, '[]'::jsonb);

-- ===========================================================================
-- 0. FORMA DE LA FUNCIÓN (CATÁLOGO) Y ORDEN ("is_admin() primero")
-- ===========================================================================

-- 0a. SECURITY DEFINER.
select is_definer('public', 'merge_events', array['uuid', 'uuid'],
  '0a. merge_events es SECURITY DEFINER');

-- 0b. search_path vacío ("") en proconfig, no "public".
select is(
  (select proconfig from pg_proc where proname = 'merge_events' and pronamespace = 'public'::regnamespace),
  array['search_path=""']::text[],
  '0b. merge_events tiene SET search_path = "" (vacío) en proconfig'
);

-- 0c. anon no tiene EXECUTE.
select ok(
  not has_function_privilege('anon', 'public.merge_events(uuid,uuid)', 'EXECUTE'),
  '0c. anon no tiene EXECUTE sobre merge_events'
);

-- 0d. no hay grant a PUBLIC: ningún aclexplode(proacl) con grantee = 0.
select is(
  (select count(*)::int from (
     select (aclexplode(proacl)).grantee as grantee
     from pg_proc where proname = 'merge_events' and pronamespace = 'public'::regnamespace
   ) t where grantee = 0),
  0,
  '0d. no hay ningún grant a PUBLIC (aclexplode(proacl) sin grantee = 0)'
);

-- 0e. authenticated sí puede ejecutarla.
select ok(
  has_function_privilege('authenticated', 'public.merge_events(uuid,uuid)', 'EXECUTE'),
  '0e. authenticated tiene EXECUTE sobre merge_events'
);

-- 0f. is_admin() es la primera instrucción del CUERPO (lo que sigue a BEGIN,
--     no del DECLARE): se recorta prosrc desde el primer "BEGIN", se le
--     quitan los comentarios de línea y todo espacio en blanco, y lo que
--     queda tiene que empezar exactamente con "BEGINIFNOTpublic.is_admin()THEN".
select is(
  (select left(
     regexp_replace(
       regexp_replace(substring(prosrc from position('BEGIN' in prosrc)), '--[^\n]*', '', 'g'),
       '\s+', '', 'g'
     ),
     length('BEGINIFNOTpublic.is_admin()THEN')
   )
   from pg_proc where proname = 'merge_events' and pronamespace = 'public'::regnamespace),
  'BEGINIFNOTpublic.is_admin()THEN',
  '0f. el cuerpo de merge_events, sin comentarios ni espacios, empieza con IF NOT public.is_admin()'
);

-- 0g/0h/0i. En comportamiento: un usuario común (no admin) que llama a
-- merge_events con argumentos inválidos (keep=drop, nulos, ids inexistentes)
-- recibe 42501 ("No autorizado") y NUNCA el error de validación específico
-- (22023/P0002): prueba que is_admin() se evalúa antes que cualquier chequeo
-- de los parámetros.
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}';

select throws_ok(
  $$select public.merge_events(
      (select id from public.events where slug = 'qa-merge-reject-keep'),
      (select id from public.events where slug = 'qa-merge-reject-keep')
    )$$,
  '42501', NULL,
  '0g. usuario común, keep_id = drop_id: 42501 (is_admin primero, no 22023)'
);

select throws_ok(
  $$select public.merge_events(NULL::uuid, NULL::uuid)$$,
  '42501', NULL,
  '0h. usuario común, keep_id y drop_id nulos: 42501 (is_admin primero, no 22023)'
);

select throws_ok(
  $$select public.merge_events(
      'c0000000-0000-4000-8000-0000000000fe'::uuid,
      'c0000000-0000-4000-8000-0000000000ff'::uuid
    )$$,
  '42501', NULL,
  '0i. usuario común, ids inexistentes: 42501 (is_admin primero, no P0002)'
);

reset role;
reset request.jwt.claims;

-- ===========================================================================
-- 1. PERMISOS
-- ===========================================================================

-- 1a. anon no puede ejecutarla: "permission denied" (ni siquiera llega al
--     cuerpo de la función: falla por falta de GRANT).
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_like(
  $$select public.merge_events(
      'c0000000-0000-4000-8000-0000000000fe'::uuid,
      'c0000000-0000-4000-8000-0000000000ff'::uuid
    )$$,
  '%permission denied%',
  '1a. anon: el EXECUTE se rechaza con "permission denied"'
);

reset role;
reset request.jwt.claims;

-- 1b. un usuario común recibe 42501 ("No autorizado").
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}';

select throws_ok(
  $$select public.merge_events(
      (select id from public.events where slug = 'qa-merge-permiso-keep'),
      (select id from public.events where slug = 'qa-merge-permiso-drop')
    )$$,
  '42501', 'No autorizado',
  '1b. usuario común: 42501 "No autorizado"'
);

reset role;
reset request.jwt.claims;

-- 1c. un admin puede: fusiona de verdad el par "permiso".
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}';

select lives_ok(
  $$select public.merge_events(
      (select id from public.events where slug = 'qa-merge-permiso-keep'),
      (select id from public.events where slug = 'qa-merge-permiso-drop')
    )$$,
  '1c. admin: puede ejecutar merge_events'
);

reset role;
reset request.jwt.claims;

-- ===========================================================================
-- 2. RECHAZOS: cada uno throws_ok y no cambia nada (par "reject" reutilizado
-- en los 8 casos; entre caso y caso se revierte el estado puesto a propósito,
-- como postgres, para dejar el pie limpio al siguiente).
-- ===========================================================================

-- Nota de estilo: cada throws_ok de esta sección va con su propio "set local
-- role / reset role" (no uno solo para las 8), porque las verificaciones
-- "no cambia nada" leen public.user_favorites, y esa tabla NO tiene bypass
-- para is_admin() en su policy (a diferencia de events/profiles): si se
-- consultara todavía "siendo" el admin, auth.uid() del admin no matchea la
-- fila de FAVR y la RLS la filtraría en silencio (falso negativo del test,
-- no un bug de merge_events). Las verificaciones corren como postgres.

-- 2a. keep_id = drop_id.
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$select public.merge_events(
      (select id from public.events where slug = 'qa-merge-reject-keep'),
      (select id from public.events where slug = 'qa-merge-reject-keep')
    )$$,
  '22023', NULL,
  '2a. rechazo: keep_id = drop_id'
);
reset role;
reset request.jwt.claims;

-- 2b. keep inexistente.
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$select public.merge_events(
      'c0000000-0000-4000-8000-0000000000fe'::uuid,
      (select id from public.events where slug = 'qa-merge-reject-drop')
    )$$,
  'P0002', NULL,
  '2b. rechazo: keep inexistente'
);
reset role;
reset request.jwt.claims;

-- 2c. drop inexistente.
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$select public.merge_events(
      (select id from public.events where slug = 'qa-merge-reject-keep'),
      'c0000000-0000-4000-8000-0000000000fe'::uuid
    )$$,
  'P0002', NULL,
  '2c. rechazo: drop inexistente'
);
reset role;
reset request.jwt.claims;

-- Verificación "no cambia nada" acumulada hasta acá (2a/2b/2c no debieron
-- tocar ni el keep ni el drop ni los fixtures estables). Como postgres.
select ok(
  (select
     (select status from public.events where slug = 'qa-merge-reject-keep') = 'DRAFT'
     and (select ai_metadata from public.events where slug = 'qa-merge-reject-keep') is null
     and (select status from public.events where slug = 'qa-merge-reject-drop') = 'DRAFT'
     and (select ai_metadata from public.events where slug = 'qa-merge-reject-drop') is null
     and (select ticket_sources from public.events where slug = 'qa-merge-reject-keep')
         = '[{"source":"manual","url":"https://entradas.example.com/reject","price_min":200}]'::jsonb
     and (select merge_audit from public.events where slug = 'qa-merge-reject-keep')
         = '[{"context":"admin","note":"qa-previo"}]'::jsonb
     and (select ai_metadata->>'event_id' from public.instagram_flyers where ig_post_id = 'qa-merge-reject-flyer')
         = (select id::text from public.events where slug = 'qa-merge-reject-drop')
     and (select count(*)::int from public.user_favorites
          where user_id = 'c0000000-0000-4000-8000-000000000006'
            and event_id = (select id from public.events where slug = 'qa-merge-reject-drop')) = 1
  ),
  '2abc-unchanged. keep/drop/ticket_sources/merge_audit/flyer/favorito quedan iguales tras 2a/2b/2c'
);

-- 2d. keep ya fusionado (hacia un tercero, no hacia drop: no es el caso del ciclo).
update public.events set ai_metadata = jsonb_build_object('merged_into_event_id', 'c0000000-0000-4000-8000-0000000000ee')
  where slug = 'qa-merge-reject-keep';

set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$select public.merge_events(
      (select id from public.events where slug = 'qa-merge-reject-keep'),
      (select id from public.events where slug = 'qa-merge-reject-drop')
    )$$,
  'P0001', 'El evento que queda ya fue fusionado hacia otro evento',
  '2d. rechazo: keep ya fusionado hacia un tercero'
);
reset role;
reset request.jwt.claims;

select ok(
  (select
     (select ai_metadata->>'merged_into_event_id' from public.events where slug = 'qa-merge-reject-keep')
       = 'c0000000-0000-4000-8000-0000000000ee'
     and (select ai_metadata from public.events where slug = 'qa-merge-reject-drop') is null
     and (select ticket_sources from public.events where slug = 'qa-merge-reject-keep')
         = '[{"source":"manual","url":"https://entradas.example.com/reject","price_min":200}]'::jsonb
     and (select merge_audit from public.events where slug = 'qa-merge-reject-keep')
         = '[{"context":"admin","note":"qa-previo"}]'::jsonb
     and (select ai_metadata->>'event_id' from public.instagram_flyers where ig_post_id = 'qa-merge-reject-flyer')
         = (select id::text from public.events where slug = 'qa-merge-reject-drop')
  ),
  '2d-unchanged. keep conserva su propio merged_into_event_id y nada más cambió'
);

update public.events set ai_metadata = null where slug = 'qa-merge-reject-keep';

-- 2e. drop ya fusionado (hacia un tercero).
update public.events set ai_metadata = jsonb_build_object('merged_into_event_id', 'c0000000-0000-4000-8000-0000000000ee')
  where slug = 'qa-merge-reject-drop';

set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$select public.merge_events(
      (select id from public.events where slug = 'qa-merge-reject-keep'),
      (select id from public.events where slug = 'qa-merge-reject-drop')
    )$$,
  'P0001', 'El evento que se descarta ya fue fusionado hacia otro evento',
  '2e. rechazo: drop ya fusionado hacia un tercero'
);
reset role;
reset request.jwt.claims;

select ok(
  (select
     (select ai_metadata from public.events where slug = 'qa-merge-reject-keep') is null
     and (select ai_metadata->>'merged_into_event_id' from public.events where slug = 'qa-merge-reject-drop')
       = 'c0000000-0000-4000-8000-0000000000ee'
     and (select ticket_sources from public.events where slug = 'qa-merge-reject-keep')
         = '[{"source":"manual","url":"https://entradas.example.com/reject","price_min":200}]'::jsonb
  ),
  '2e-unchanged. drop conserva su propio merged_into_event_id y keep no cambió'
);

update public.events set ai_metadata = null where slug = 'qa-merge-reject-drop';

-- 2f. ciclo: keep apunta a drop. Mensaje propio, no el genérico de "ya fusionado".
update public.events set ai_metadata = jsonb_build_object(
    'merged_into_event_id', (select id from public.events where slug = 'qa-merge-reject-drop')::text
  )
  where slug = 'qa-merge-reject-keep';

set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_like(
  $$select public.merge_events(
      (select id from public.events where slug = 'qa-merge-reject-keep'),
      (select id from public.events where slug = 'qa-merge-reject-drop')
    )$$,
  '%ciclo%',
  '2f. rechazo: ciclo (keep ya apunta a drop) con mensaje propio, no el genérico'
);
reset role;
reset request.jwt.claims;

select ok(
  (select
     (select ai_metadata->>'merged_into_event_id' from public.events where slug = 'qa-merge-reject-keep')
       = (select id::text from public.events where slug = 'qa-merge-reject-drop')
     and (select ai_metadata from public.events where slug = 'qa-merge-reject-drop') is null
     and (select merge_audit from public.events where slug = 'qa-merge-reject-keep')
         = '[{"context":"admin","note":"qa-previo"}]'::jsonb
  ),
  '2f-unchanged. el ciclo no cambia ni keep ni drop'
);

update public.events set ai_metadata = null where slug = 'qa-merge-reject-keep';

-- 2g. un CANCELLED.
update public.events set status = 'CANCELLED' where slug = 'qa-merge-reject-drop';

set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$select public.merge_events(
      (select id from public.events where slug = 'qa-merge-reject-keep'),
      (select id from public.events where slug = 'qa-merge-reject-drop')
    )$$,
  'P0001', NULL,
  '2g. rechazo: un CANCELLED'
);
reset role;
reset request.jwt.claims;

select ok(
  (select
     (select status from public.events where slug = 'qa-merge-reject-drop') = 'CANCELLED'
     and (select status from public.events where slug = 'qa-merge-reject-keep') = 'DRAFT'
     and (select ticket_sources from public.events where slug = 'qa-merge-reject-keep')
         = '[{"source":"manual","url":"https://entradas.example.com/reject","price_min":200}]'::jsonb
     and (select count(*)::int from public.user_favorites
          where user_id = 'c0000000-0000-4000-8000-000000000006'
            and event_id = (select id from public.events where slug = 'qa-merge-reject-drop')) = 1
  ),
  '2g-unchanged. el CANCELLED sigue CANCELLED y lo demás no cambió'
);

update public.events set status = 'DRAFT' where slug = 'qa-merge-reject-drop';

-- 2h. descartado PUBLISHED con el que queda en DRAFT (decisión 1 de Mauro).
update public.events set status = 'PUBLISHED' where slug = 'qa-merge-reject-drop';

set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$select public.merge_events(
      (select id from public.events where slug = 'qa-merge-reject-keep'),
      (select id from public.events where slug = 'qa-merge-reject-drop')
    )$$,
  'P0001', NULL,
  '2h. rechazo: descartado PUBLISHED con el que queda sin publicar'
);
reset role;
reset request.jwt.claims;

select ok(
  (select
     (select status from public.events where slug = 'qa-merge-reject-drop') = 'PUBLISHED'
     and (select status from public.events where slug = 'qa-merge-reject-keep') = 'DRAFT'
     and (select ai_metadata->>'event_id' from public.instagram_flyers where ig_post_id = 'qa-merge-reject-flyer')
         = (select id::text from public.events where slug = 'qa-merge-reject-drop')
  ),
  '2h-unchanged. descartado sigue PUBLISHED, el que queda sigue DRAFT, el flyer sigue en drop'
);

update public.events set status = 'DRAFT' where slug = 'qa-merge-reject-drop';

reset role;
reset request.jwt.claims;

-- ===========================================================================
-- 3. UNA SOLA TRANSACCIÓN: trigger temporal que falla en user_favorites. La
-- fusión ya tocó los flyers antes de llegar ahí; sin EXCEPTION WHEN en la
-- función, la excepción deshace TODO lo hecho en esta llamada (no hay savepoint
-- propio dentro de merge_events).
-- ===========================================================================

create function pg_temp.qa_merge_boom() returns trigger
language plpgsql
as $$
begin
  raise exception 'qa boom: fin de transacción simulada' using errcode = 'P0001';
end;
$$;

create trigger qa_merge_boom_trigger
  before update on public.user_favorites
  for each row execute function pg_temp.qa_merge_boom();

set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}';

select throws_ok(
  $$select public.merge_events(
      (select id from public.events where slug = 'qa-merge-tx-keep'),
      (select id from public.events where slug = 'qa-merge-tx-drop')
    )$$,
  'P0001', 'qa boom: fin de transacción simulada',
  '3a. la excepción del trigger de prueba se propaga sin ser atrapada'
);

reset role;
reset request.jwt.claims;

select ok(
  (select
     (select ai_metadata->>'event_id' from public.instagram_flyers where ig_post_id = 'qa-merge-tx-flyer')
       = (select id::text from public.events where slug = 'qa-merge-tx-drop')
     and (select status from public.events where slug = 'qa-merge-tx-drop') = 'PUBLISHED'
     and (select ticket_sources from public.events where slug = 'qa-merge-tx-keep') = '[]'::jsonb
     and (select merge_audit from public.events where slug = 'qa-merge-tx-keep')
         = '[{"context":"admin","note":"qa-tx-previo"}]'::jsonb
  ),
  '3b. tras el throws_ok, los flyers siguen en drop, drop sigue igual y keep no cambió ticket_sources ni merge_audit'
);

drop trigger qa_merge_boom_trigger on public.user_favorites;
drop function pg_temp.qa_merge_boom();

-- ===========================================================================
-- 3b/4/5/6/7/8/9. FUSIÓN VÁLIDA COMPLETA (par "ok"): descartado, flyers,
-- favoritos, ticket_sources, merge_audit, contrato con findMergeRedirect y
-- el trigger de la R15.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}';

create temp table qa_merge_ok_result as
select public.merge_events(
  (select id from public.events where slug = 'qa-merge-ok-keep'),
  (select id from public.events where slug = 'qa-merge-ok-drop')
) as result;

reset role;
reset request.jwt.claims;

-- 3b. Descartado: DRAFT, sin destaque, merged_into_event_id = keep, conserva
--     sus otras claves de ai_metadata, merged_by = el admin.
select ok(
  (select
     status = 'DRAFT'
     and is_featured = false
     and ai_metadata->>'merged_into_event_id' = (select id::text from public.events where slug = 'qa-merge-ok-keep')
     and ai_metadata->>'qa_custom_key' = 'mantiene'
     and ai_metadata->>'merged_by' = 'c0000000-0000-4000-8000-000000000001'
   from public.events where slug = 'qa-merge-ok-drop'),
  '3b. descartado: DRAFT, sin destaque, merged_into_event_id=keep, conserva ai_metadata previo, merged_by=admin'
);

-- 4. Flyers: los dos del descartado pasan a keep con merged_from_event_id, el
--    de "otro" evento no cambia.
select is(
  jsonb_build_object(
    'f1_event', (select ai_metadata->>'event_id' from public.instagram_flyers where ig_post_id = 'qa-merge-ok-flyer-1'),
    'f1_from', (select ai_metadata->>'merged_from_event_id' from public.instagram_flyers where ig_post_id = 'qa-merge-ok-flyer-1'),
    'f2_event', (select ai_metadata->>'event_id' from public.instagram_flyers where ig_post_id = 'qa-merge-ok-flyer-2'),
    'f2_from', (select ai_metadata->>'merged_from_event_id' from public.instagram_flyers where ig_post_id = 'qa-merge-ok-flyer-2'),
    'f3_event', (select ai_metadata->>'event_id' from public.instagram_flyers where ig_post_id = 'qa-merge-ok-flyer-3')
  ),
  jsonb_build_object(
    'f1_event', (select id::text from public.events where slug = 'qa-merge-ok-keep'),
    'f1_from', (select id::text from public.events where slug = 'qa-merge-ok-drop'),
    'f2_event', (select id::text from public.events where slug = 'qa-merge-ok-keep'),
    'f2_from', (select id::text from public.events where slug = 'qa-merge-ok-drop'),
    'f3_event', (select id::text from public.events where slug = 'qa-merge-ok-otro')
  ),
  '4. los dos flyers del descartado pasan a keep con merged_from_event_id=drop; el de otro evento no cambia'
);

-- 5. Favoritos: FAV1 (solo drop) movido, FAV2 (los dos) queda en una sola fila
--    en keep, FAV3 (solo keep) sin cambios, ninguna fila con event_id=drop, y
--    los contadores devueltos coinciden.
select is(
  jsonb_build_object(
    'fav1_count', (select count(*)::int from public.user_favorites
                   where user_id = 'c0000000-0000-4000-8000-000000000003'),
    'fav1_event', (select event_id::text from public.user_favorites
                   where user_id = 'c0000000-0000-4000-8000-000000000003'),
    'fav2_count', (select count(*)::int from public.user_favorites
                   where user_id = 'c0000000-0000-4000-8000-000000000004'),
    'fav2_event', (select event_id::text from public.user_favorites
                   where user_id = 'c0000000-0000-4000-8000-000000000004'),
    'fav3_count', (select count(*)::int from public.user_favorites
                   where user_id = 'c0000000-0000-4000-8000-000000000005'),
    'fav3_event', (select event_id::text from public.user_favorites
                   where user_id = 'c0000000-0000-4000-8000-000000000005'),
    'ninguno_en_drop', (select count(*)::int from public.user_favorites
                   where event_id = (select id from public.events where slug = 'qa-merge-ok-drop')),
    'favorites_moved', (select (result->>'favorites_moved')::int from qa_merge_ok_result),
    'favorites_dropped', (select (result->>'favorites_dropped')::int from qa_merge_ok_result)
  ),
  jsonb_build_object(
    'fav1_count', 1,
    'fav1_event', (select id::text from public.events where slug = 'qa-merge-ok-keep'),
    'fav2_count', 1,
    'fav2_event', (select id::text from public.events where slug = 'qa-merge-ok-keep'),
    'fav3_count', 1,
    'fav3_event', (select id::text from public.events where slug = 'qa-merge-ok-keep'),
    'ninguno_en_drop', 0,
    'favorites_moved', 1,
    'favorites_dropped', 1
  ),
  '5. favoritos: FAV1 movido, FAV2 en una sola fila en keep, FAV3 sin cambios, nada en drop, contadores correctos'
);

-- 6. ticket_sources fusionados (mismos casos que mergeTicketSources): la
--    misma URL con / final y mayúsculas no se repite, dos links de la misma
--    ticketera con URLs distintas se conservan, el ticket_url del descartado
--    entra como link, los del que queda van primero, las entradas basura
--    (sin url) no pasan. ticket_sources_added coincide.
select is(
  (select ticket_sources from public.events where slug = 'qa-merge-ok-keep'),
  '[
     {"source":"entradaweb","url":"https://ENTRADAS.example.com/show/","price_min":1000},
     {"source":"otratickets","url":"https://otratickets.example.com/x","price_min":300},
     {"source":"otratickets","url":"https://otratickets.example.com/y","price_min":350},
     {"source":"dropsource","url":"https://ticketdrop.example.com/z","price_min":350}
   ]'::jsonb,
  '6. ticket_sources: dedupe por url normalizada, misma ticketera con 2 urls, ticket_url del drop entra, keep primero, basura afuera'
);

select is(
  (select (result->>'ticket_sources_added')::int from qa_merge_ok_result),
  3,
  '6b. ticket_sources_added = 3 (coincide con lo efectivamente agregado)'
);

-- 7. merge_audit: entrada nueva al final con context=admin, merged_by,
--    absorbed_event_id y absorbed_snapshot->>status = el estado previo.
select ok(
  (select
     (merge_audit -> (jsonb_array_length(merge_audit) - 1))->>'context' = 'admin'
     and (merge_audit -> (jsonb_array_length(merge_audit) - 1))->>'merged_by' = 'c0000000-0000-4000-8000-000000000001'
     and (merge_audit -> (jsonb_array_length(merge_audit) - 1))->>'absorbed_event_id'
         = (select id::text from public.events where slug = 'qa-merge-ok-drop')
     and (merge_audit -> (jsonb_array_length(merge_audit) - 1)) -> 'absorbed_snapshot' ->> 'status' = 'PUBLISHED'
   from public.events where slug = 'qa-merge-ok-keep'),
  '7. merge_audit: entrada nueva al final con context=admin, merged_by, absorbed_event_id y el status previo del descartado'
);

-- 8. Contrato con findMergeRedirect (lib/events/merged.ts): merged_into_event_id
--    es un uuid parseable y el destino está PUBLISHED.
select ok(
  (select ai_metadata->>'merged_into_event_id' from public.events where slug = 'qa-merge-ok-drop')
    ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and (select status from public.events where slug = 'qa-merge-ok-keep') = 'PUBLISHED',
  '8. findMergeRedirect: merged_into_event_id es uuid y el destino está PUBLISHED'
);

-- 9. Trigger de la R15 (enforce_event_user_rules): la fusión hecha por el
--    admin (rol authenticated) no queda deshecha. El status de keep sigue
--    PUBLISHED (si el trigger alcanzara a current_user='postgres' dentro del
--    SECURITY DEFINER, lo forzaría a DRAFT) y ticket_sources quedó como lo
--    dejó la función, no reseteado a '[]' como hace el trigger en un UPDATE
--    de un usuario común.
select ok(
  (select status = 'PUBLISHED' and ticket_sources <> '[]'::jsonb
   from public.events where slug = 'qa-merge-ok-keep'),
  '9. trigger R15: no deshace la fusión del admin (keep sigue PUBLISHED, ticket_sources no se resetea)'
);

drop table qa_merge_ok_result;

-- ===========================================================================
-- merge_audit: con 50 entradas previas sigue habiendo 50 y se fue la más
-- vieja.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}';

select lives_ok(
  $$select public.merge_events(
      (select id from public.events where slug = 'qa-merge-auditcap-keep'),
      (select id from public.events where slug = 'qa-merge-auditcap-drop')
    )$$,
  'auditcap. fusión del par de prueba del tope de merge_audit'
);

reset role;
reset request.jwt.claims;

select ok(
  (select
     jsonb_array_length(merge_audit) = 50
     and (merge_audit -> 0 ->> 'seq') = '2'
     and (merge_audit -> 48 ->> 'seq') = '50'
     and (merge_audit -> 49 ->> 'context') = 'admin'
   from public.events where slug = 'qa-merge-auditcap-keep'),
  'auditcap-resultado. con 50 entradas previas sigue habiendo 50 (se fue la seq=1, la más vieja) y la nueva queda al final'
);

select * from finish();
rollback;
