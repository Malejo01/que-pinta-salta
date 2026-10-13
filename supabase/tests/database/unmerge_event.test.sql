-- Hotfix 13/10: pgTAP de public.unmerge_event(drop_id)
-- (supabase/migrations/20261013090000_unmerge_event.sql).
--
-- Usuarios, eventos y flyers inventados y evidentes ("qa-unmerge-...",
-- "QA Unmerge ..."), creados dentro de esta transacción con rollback al
-- final: no se lee ni se usa ninguna fila real de la base local.
--
-- uuids fijos e inventados, prefijo d0000000:
--   usuarios: 001 = ADMIN, 002 = USER (común), 003 = FAV (favorito del descartado)
--   eventos:  a01 K1 (queda, publicado) · a02 D1 (se fusiona y se deshace)
--             a03 D2 (se fusiona en K1 después de D1 y queda fusionado)
--             b01 K2 / b02 D3 (D3 fusionado a mano pero PUBLISHED)
--             c01 K3 / c02 K4 (K4 fusionado en K3) / c03 D4 (fusionado en K4)
--             e01 K5 / e02 D5 (ticket_sources del que queda cambiados después)
--             f01 K6 / f02 D6 (fusión vieja a mano, sin merge_audit)
--
-- Convención de roles: "set local role authenticated" + "set local
-- request.jwt.claims", como merge_events.test.sql.
begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

-- ---------------------------------------------------------------------------
-- Preparación (como postgres).
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'qa-unmerge-admin@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'qa-unmerge-usuario@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'qa-unmerge-fav@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');

alter table public.profiles disable trigger tr_prevent_role_tampering;
update public.profiles set role = 'ADMIN' where id = 'd0000000-0000-4000-8000-000000000001';
alter table public.profiles enable trigger tr_prevent_role_tampering;

insert into public.instagram_accounts (username, display_name)
values ('qa_unmerge_cuenta', 'QA Unmerge Cuenta');

insert into public.events (id, title, slug, start_date, status, is_featured, created_by, ticket_sources, ticket_url, ai_metadata)
values
  ('d0000000-0000-4000-8000-000000000a01', 'QA Unmerge K1', 'qa-unmerge-k1', now() + interval '3 day', 'PUBLISHED', false, null,
   '[{"source":"entradaweb","url":"https://entradas.example.com/k1","price_min":1000}]'::jsonb, null, null),
  ('d0000000-0000-4000-8000-000000000a02', 'QA Unmerge D1', 'qa-unmerge-d1', now() + interval '3 day', 'DRAFT', true, null,
   '[{"source":"otra","url":"https://otra.example.com/d1","price_min":300}]'::jsonb,
   'https://instagram.com/p/qa-unmerge-d1',
   '{"flyer_id":"d0000000-0000-4000-8000-0000000000f1","qa_custom_key":"mantiene"}'::jsonb),
  ('d0000000-0000-4000-8000-000000000a03', 'QA Unmerge D2', 'qa-unmerge-d2', now() + interval '3 day', 'DRAFT', false, null,
   '[]'::jsonb, 'https://otra.example.com/d2', null);

insert into public.instagram_flyers (id, account_id, ig_post_id, ig_post_url, published_at, ai_metadata)
values
  ('d0000000-0000-4000-8000-0000000000f1', (select id from public.instagram_accounts where username = 'qa_unmerge_cuenta'),
   'qa-unmerge-f1', 'https://instagram.com/p/qa-unmerge-f1', now(),
   '{"event_id":"d0000000-0000-4000-8000-000000000a02"}'::jsonb),
  ('d0000000-0000-4000-8000-0000000000f2', (select id from public.instagram_accounts where username = 'qa_unmerge_cuenta'),
   'qa-unmerge-f2', 'https://instagram.com/p/qa-unmerge-f2', now(),
   '{"event_id":"d0000000-0000-4000-8000-000000000a02"}'::jsonb),
  ('d0000000-0000-4000-8000-0000000000f3', (select id from public.instagram_accounts where username = 'qa_unmerge_cuenta'),
   'qa-unmerge-f3', 'https://instagram.com/p/qa-unmerge-f3', now(),
   '{"event_id":"d0000000-0000-4000-8000-000000000a01"}'::jsonb);

insert into public.user_favorites (user_id, event_id)
values ('d0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000a02');

-- Fusiones viejas o raras, armadas a mano (como postgres, sin merge_events).
insert into public.events (id, title, slug, start_date, status, created_by, ticket_sources, ticket_url, ai_metadata)
values
  ('d0000000-0000-4000-8000-000000000b01', 'QA Unmerge K2', 'qa-unmerge-k2', now() + interval '3 day', 'PUBLISHED', null, '[]'::jsonb, null, null),
  ('d0000000-0000-4000-8000-000000000b02', 'QA Unmerge D3 publicado', 'qa-unmerge-d3', now() + interval '3 day', 'PUBLISHED', null, '[]'::jsonb, null,
   '{"merged_into_event_id":"d0000000-0000-4000-8000-000000000b01"}'::jsonb),
  ('d0000000-0000-4000-8000-000000000c01', 'QA Unmerge K3', 'qa-unmerge-k3', now() + interval '3 day', 'PUBLISHED', null, '[]'::jsonb, null, null),
  ('d0000000-0000-4000-8000-000000000c02', 'QA Unmerge K4', 'qa-unmerge-k4', now() + interval '3 day', 'DRAFT', null, '[]'::jsonb, null,
   '{"merged_into_event_id":"d0000000-0000-4000-8000-000000000c01"}'::jsonb),
  ('d0000000-0000-4000-8000-000000000c03', 'QA Unmerge D4', 'qa-unmerge-d4', now() + interval '3 day', 'DRAFT', null, '[]'::jsonb, null,
   '{"merged_into_event_id":"d0000000-0000-4000-8000-000000000c02"}'::jsonb),
  ('d0000000-0000-4000-8000-000000000e01', 'QA Unmerge K5', 'qa-unmerge-k5', now() + interval '3 day', 'PUBLISHED', null, '[]'::jsonb, null, null),
  ('d0000000-0000-4000-8000-000000000e02', 'QA Unmerge D5', 'qa-unmerge-d5', now() + interval '3 day', 'DRAFT', null, '[]'::jsonb,
   'https://otra.example.com/d5', null),
  ('d0000000-0000-4000-8000-000000000f01', 'QA Unmerge K6', 'qa-unmerge-k6', now() + interval '3 day', 'PUBLISHED', null,
   '[{"source":"manual","url":"https://instagram.com/p/qa-unmerge-d6","price_min":0}]'::jsonb, null, null),
  ('d0000000-0000-4000-8000-000000000f02', 'QA Unmerge D6 viejo', 'qa-unmerge-d6', now() + interval '3 day', 'DRAFT', null, '[]'::jsonb,
   'https://instagram.com/p/qa-unmerge-d6',
   '{"flyer_id":"d0000000-0000-4000-8000-0000000000f6","merged_into_event_id":"d0000000-0000-4000-8000-000000000f01"}'::jsonb);

insert into public.instagram_flyers (id, account_id, ig_post_id, ig_post_url, published_at, ai_metadata)
values
  ('d0000000-0000-4000-8000-0000000000f6', (select id from public.instagram_accounts where username = 'qa_unmerge_cuenta'),
   'qa-unmerge-f6', 'https://instagram.com/p/qa-unmerge-d6', now(),
   '{"event_id":"d0000000-0000-4000-8000-000000000f01"}'::jsonb);

-- ===========================================================================
-- 0. SEGURIDAD DE LA FUNCIÓN
-- ===========================================================================
select is_definer('public', 'unmerge_event', array['uuid'], '0a. unmerge_event es SECURITY DEFINER');

select is(
  (select proconfig from pg_proc where proname = 'unmerge_event' and pronamespace = 'public'::regnamespace),
  array['search_path=""']::text[],
  '0b. unmerge_event tiene SET search_path = "" (vacío)'
);

select ok(
  not has_function_privilege('anon', 'public.unmerge_event(uuid)', 'EXECUTE'),
  '0c. anon no tiene EXECUTE'
);

select is(
  (select count(*)::int from (
     select (aclexplode(proacl)).grantee as grantee
     from pg_proc where proname = 'unmerge_event' and pronamespace = 'public'::regnamespace
   ) t where grantee = 0),
  0,
  '0d. no hay grant a PUBLIC'
);

select ok(
  has_function_privilege('authenticated', 'public.unmerge_event(uuid)', 'EXECUTE'),
  '0e. authenticated tiene EXECUTE'
);

select is(
  (select left(
     regexp_replace(
       regexp_replace(substring(prosrc from position('BEGIN' in prosrc)), '--[^\n]*', '', 'g'),
       '\s+', '', 'g'
     ),
     length('BEGINIFNOTpublic.is_admin()THEN')
   )
   from pg_proc where proname = 'unmerge_event' and pronamespace = 'public'::regnamespace),
  'BEGINIFNOTpublic.is_admin()THEN',
  '0f. el cuerpo empieza con IF NOT public.is_admin()'
);

-- ===========================================================================
-- 1. PERMISOS
-- ===========================================================================
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_like(
  $$select public.unmerge_event('d0000000-0000-4000-8000-000000000b02'::uuid)$$,
  '%permission denied%',
  '1a. anon: permission denied'
);
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok(
  $$select public.unmerge_event(NULL::uuid)$$,
  '42501', 'No autorizado',
  '1b. usuario común, aunque el id sea nulo: 42501 (is_admin primero)'
);
reset role;
reset request.jwt.claims;

-- ===========================================================================
-- 2. FUSIÓN COMPLETA CON merge_events Y DESHACER
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok(
  $$select public.merge_events('d0000000-0000-4000-8000-000000000a01'::uuid, 'd0000000-0000-4000-8000-000000000a02'::uuid)$$,
  '2a. preparación: el admin fusiona D1 en K1'
);
select lives_ok(
  $$select public.merge_events('d0000000-0000-4000-8000-000000000a01'::uuid, 'd0000000-0000-4000-8000-000000000a03'::uuid)$$,
  '2b. preparación: después fusiona D2 en K1 (sus links quedan después de los de D1)'
);
reset role;
reset request.jwt.claims;

select is(
  (select jsonb_array_length(ticket_sources) from public.events where id = 'd0000000-0000-4000-8000-000000000a01'),
  4,
  '2c. preparación: K1 tiene 4 links (el propio, 2 de D1 y 1 de D2)'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-4000-8000-000000000001","role":"authenticated"}';
create temp table qa_unmerge_res on commit drop as
  select public.unmerge_event('d0000000-0000-4000-8000-000000000a02'::uuid) as r;
reset role;
reset request.jwt.claims;

select is((select (r->>'audit_found')::boolean from qa_unmerge_res), true, '2d. encontró la entrada de auditoría');
select is((select (r->>'flyers_restored')::int from qa_unmerge_res), 2, '2e. devolvió 2 flyers');
select is((select (r->>'ticket_sources_removed')::int from qa_unmerge_res), 2, '2f. sacó los 2 links que había agregado D1');
select is((select (r->>'favorites_moved')::int from qa_unmerge_res), 1, '2g. informa 1 favorito movido');
select is((select r->>'previous_status' from qa_unmerge_res), 'DRAFT', '2h. informa el estado de antes');
select is((select (r->>'dismissed')::boolean from qa_unmerge_res), true, '2i. agregó el par a duplicate_dismissals');
select ok(not (select r ? 'user_id' or r::text ilike '%@example.com%' from qa_unmerge_res), '2j. la respuesta no trae user_id ni emails');

select is(
  (select ai_metadata->>'merged_into_event_id' from public.events where id = 'd0000000-0000-4000-8000-000000000a02'),
  null,
  '2k. D1 ya no está fusionado'
);
select ok(
  (select not (ai_metadata ? 'merged_at') and not (ai_metadata ? 'merged_by')
     and ai_metadata->>'qa_custom_key' = 'mantiene'
     and ai_metadata->>'flyer_id' = 'd0000000-0000-4000-8000-0000000000f1'
   from public.events where id = 'd0000000-0000-4000-8000-000000000a02'),
  '2l. D1 sin merged_at/merged_by y con el resto de su ai_metadata intacto'
);
select is(
  (select status::text from public.events where id = 'd0000000-0000-4000-8000-000000000a02'),
  'DRAFT',
  '2m. D1 queda en DRAFT'
);
select is(
  (select is_featured from public.events where id = 'd0000000-0000-4000-8000-000000000a02'),
  true,
  '2n. D1 recupera is_featured del snapshot (merge_events lo había puesto en false)'
);
select is(
  (select count(*)::int from public.instagram_flyers
   where id in ('d0000000-0000-4000-8000-0000000000f1', 'd0000000-0000-4000-8000-0000000000f2')
     and ai_metadata->>'event_id' = 'd0000000-0000-4000-8000-000000000a02'
     and not (ai_metadata ? 'merged_from_event_id')),
  2,
  '2o. los 2 flyers de D1 vuelven a D1, sin merged_from_event_id'
);
select is(
  (select ai_metadata->>'event_id' from public.instagram_flyers where id = 'd0000000-0000-4000-8000-0000000000f3'),
  'd0000000-0000-4000-8000-000000000a01',
  '2p. el flyer propio de K1 no se toca'
);
select is(
  (select array_agg(t.e->>'url' order by t.ord)
   from public.events ev, jsonb_array_elements(ev.ticket_sources) with ordinality as t(e, ord)
   where ev.id = 'd0000000-0000-4000-8000-000000000a01'),
  array['https://entradas.example.com/k1', 'https://otra.example.com/d2'],
  '2q. K1 conserva su link y el de D2, sin los de D1'
);
select is(
  (select count(*)::int from public.events ev, jsonb_array_elements(ev.merge_audit) as e
   where ev.id = 'd0000000-0000-4000-8000-000000000a01'
     and e->>'absorbed_event_id' = 'd0000000-0000-4000-8000-000000000a02'),
  0,
  '2r. la entrada de auditoría de D1 se quitó de K1'
);
select is(
  (select count(*)::int from public.events ev, jsonb_array_elements(ev.merge_audit) as e
   where ev.id = 'd0000000-0000-4000-8000-000000000a01'
     and e->>'absorbed_event_id' = 'd0000000-0000-4000-8000-000000000a03'),
  1,
  '2s. la de D2 sigue'
);
select is(
  (select ai_metadata->>'merged_into_event_id' from public.events where id = 'd0000000-0000-4000-8000-000000000a03'),
  'd0000000-0000-4000-8000-000000000a01',
  '2t. D2 sigue fusionado en K1'
);
select ok(
  exists (select 1 from public.duplicate_dismissals
          where event_a = least('d0000000-0000-4000-8000-000000000a01'::uuid, 'd0000000-0000-4000-8000-000000000a02'::uuid)
            and event_b = greatest('d0000000-0000-4000-8000-000000000a01'::uuid, 'd0000000-0000-4000-8000-000000000a02'::uuid)),
  '2u. el par K1/D1 está en duplicate_dismissals'
);
select is(
  (select count(*)::int from public.user_favorites
   where user_id = 'd0000000-0000-4000-8000-000000000003'
     and event_id = 'd0000000-0000-4000-8000-000000000a01'),
  1,
  '2v. el favorito movido queda en K1 (no se puede saber de quién era)'
);

-- ===========================================================================
-- 3. RECHAZOS (como admin)
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-4000-8000-000000000001","role":"authenticated"}';

select throws_ok(
  $$select public.unmerge_event(NULL::uuid)$$,
  '22023', NULL, '3a. id nulo: 22023'
);
select throws_ok(
  $$select public.unmerge_event('d0000000-0000-4000-8000-0000000000ff'::uuid)$$,
  'P0002', NULL, '3b. inexistente: P0002'
);
select throws_ok(
  $$select public.unmerge_event('d0000000-0000-4000-8000-000000000a02'::uuid)$$,
  'P0001', 'Este evento no está fusionado en otro', '3c. deshacer dos veces: ya no está fusionado'
);
select throws_ok(
  $$select public.unmerge_event('d0000000-0000-4000-8000-000000000a01'::uuid)$$,
  'P0001', 'Este evento no está fusionado en otro', '3d. el que quedó nunca estuvo fusionado'
);
select throws_ok(
  $$select public.unmerge_event('d0000000-0000-4000-8000-000000000b02'::uuid)$$,
  'P0001', 'Solo se deshace la fusión de un evento en borrador', '3e. descartado que no está en DRAFT'
);
select throws_ok(
  $$select public.unmerge_event('d0000000-0000-4000-8000-000000000c03'::uuid)$$,
  'P0001', 'El evento que quedó también fue fusionado en otro: deshacé esa fusión primero', '3f. el que quedó está fusionado en otro'
);

-- 3g. ticket_sources del que queda cambiados después de la fusión: aborta.
select lives_ok(
  $$select public.merge_events('d0000000-0000-4000-8000-000000000e01'::uuid, 'd0000000-0000-4000-8000-000000000e02'::uuid)$$,
  '3g. preparación: fusiona D5 en K5'
);
reset role;
reset request.jwt.claims;

update public.events set ticket_sources = '[]'::jsonb where id = 'd0000000-0000-4000-8000-000000000e01';

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_like(
  $$select public.unmerge_event('d0000000-0000-4000-8000-000000000e02'::uuid)$$,
  'Los links de compra del evento que quedó cambiaron%',
  '3h. si los links agregados ya no están, aborta'
);
reset role;
reset request.jwt.claims;

select is(
  (select ai_metadata->>'merged_into_event_id' from public.events where id = 'd0000000-0000-4000-8000-000000000e02'),
  'd0000000-0000-4000-8000-000000000e01',
  '3i. y no deja nada a medias: D5 sigue fusionado'
);
select is(
  (select count(*)::int from public.duplicate_dismissals
   where event_a = least('d0000000-0000-4000-8000-000000000e01'::uuid, 'd0000000-0000-4000-8000-000000000e02'::uuid)
     and event_b = greatest('d0000000-0000-4000-8000-000000000e01'::uuid, 'd0000000-0000-4000-8000-000000000e02'::uuid)),
  0,
  '3j. ni agrega el par a duplicate_dismissals'
);

-- ===========================================================================
-- 4. FUSIÓN VIEJA SIN merge_audit (alcance mínimo)
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-4000-8000-000000000001","role":"authenticated"}';
create temp table qa_unmerge_viejo on commit drop as
  select public.unmerge_event('d0000000-0000-4000-8000-000000000f02'::uuid) as r;
reset role;
reset request.jwt.claims;

select is((select (r->>'audit_found')::boolean from qa_unmerge_viejo), false, '4a. sin entrada de auditoría');
select is((select (r->>'flyers_restored')::int from qa_unmerge_viejo), 1, '4b. devuelve el flyer propio del borrador (ai_metadata.flyer_id)');
select is(
  (select ai_metadata->>'event_id' from public.instagram_flyers where id = 'd0000000-0000-4000-8000-0000000000f6'),
  'd0000000-0000-4000-8000-000000000f02',
  '4c. el flyer vuelve a D6'
);
select is(
  (select ai_metadata->>'merged_into_event_id' from public.events where id = 'd0000000-0000-4000-8000-000000000f02'),
  null,
  '4d. D6 ya no está fusionado'
);
select is(
  (select ticket_sources from public.events where id = 'd0000000-0000-4000-8000-000000000f01'),
  '[{"source":"manual","url":"https://instagram.com/p/qa-unmerge-d6","price_min":0}]'::jsonb,
  '4e. sin auditoría, los links del que quedó no se tocan'
);
select is((select (r->>'ticket_sources_removed')::int from qa_unmerge_viejo), 0, '4f. e informa 0 links sacados');

select * from finish();
rollback;
