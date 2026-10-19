-- pgTAP de 20261018130200_etapa2_campanias_patrocinadas.sql:
-- sponsored_campaigns (RLS solo admin, CHECKs, defaults, TRUNCATE),
-- notification_sends.campaign_id y notification_preferences.sponsored.
-- uuid fijo, prefijo "5c" (inventados, "qa-campanias-..."). Todo en una
-- transacción con rollback.
--   U = 5c000000-0000-4000-8000-000000000001: usuario común.
--   A = 5c000000-0000-4000-8000-000000000002: admin.
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000', '5c000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'qa-campanias-u@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '5c000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'qa-campanias-admin@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');

alter table public.profiles disable trigger tr_prevent_role_tampering;
update public.profiles set role = 'ADMIN' where id = '5c000000-0000-4000-8000-000000000002';
alter table public.profiles enable trigger tr_prevent_role_tampering;

insert into public.events (id, title, slug, start_date, status)
values ('5c111111-1111-4111-8111-111111111111', 'QA Campanias Evento', 'qa-campanias-evento',
        now() + interval '1 day', 'PUBLISHED');

-- Una campaña cargada como postgres, para probar quién la ve.
insert into public.sponsored_campaigns (id, title, body, url, starts_at, ends_at)
values ('5c222222-2222-4222-8222-222222222222', 'QA Campaña', 'Texto QA', 'https://example.com/qa',
        now(), now() + interval '7 days');

-- ---------------------------------------------------------------------------
-- Estructura y defaults.
-- ---------------------------------------------------------------------------

-- 1. RLS habilitada.
select ok(
  (select relrowsecurity from pg_class where oid = 'public.sponsored_campaigns'::regclass),
  '1. sponsored_campaigns: RLS habilitada'
);

-- 2. created_at con default y sent_at null.
select ok(
  (select created_at is not null and sent_at is null and created_by is null
   from public.sponsored_campaigns where id = '5c222222-2222-4222-8222-222222222222'),
  '2. sponsored_campaigns: created_at con default, sent_at y created_by null'
);

-- 3. id con default.
select col_default_is('public', 'sponsored_campaigns', 'id', 'gen_random_uuid()',
  '3. sponsored_campaigns.id: default gen_random_uuid()');

-- 4-5. Cuatro policies, todas a authenticated con is_admin().
select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and tablename = 'sponsored_campaigns'
     and roles = '{authenticated}'
     and (coalesce(qual, '') like '%is_admin()%' or coalesce(with_check, '') like '%is_admin()%')),
  4,
  '4. sponsored_campaigns: 4 policies, a authenticated, con is_admin()'
);
select is(
  (select string_agg(cmd, ',' order by cmd) from pg_policies
   where schemaname = 'public' and tablename = 'sponsored_campaigns'),
  'DELETE,INSERT,SELECT,UPDATE',
  '5. sponsored_campaigns: una policy por acción (select, insert, update, delete)'
);

-- 6. TRUNCATE revocado a anon y authenticated.
select ok(
  not has_table_privilege('anon', 'public.sponsored_campaigns', 'TRUNCATE')
  and not has_table_privilege('authenticated', 'public.sponsored_campaigns', 'TRUNCATE'),
  '6. sponsored_campaigns: ni anon ni authenticated tienen TRUNCATE'
);

-- ---------------------------------------------------------------------------
-- CHECKs (como postgres).
-- ---------------------------------------------------------------------------

select throws_ok(
  $$insert into public.sponsored_campaigns (title, body, url, starts_at, ends_at)
    values ('QA', 'QA', 'https://example.com', now(), now())$$,
  '23514', NULL,
  '7. CHECK: ends_at igual a starts_at se rechaza'
);
select throws_ok(
  $$insert into public.sponsored_campaigns (title, body, url, starts_at, ends_at)
    values ('QA', 'QA', 'https://example.com', now(), now() - interval '1 day')$$,
  '23514', NULL,
  '8. CHECK: ends_at antes de starts_at se rechaza'
);
select throws_ok(
  $$insert into public.sponsored_campaigns (title, body, starts_at, ends_at)
    values ('QA', 'QA', now(), now() + interval '1 day')$$,
  '23514', NULL,
  '9. CHECK: sin url y sin event_id se rechaza'
);
select lives_ok(
  $$insert into public.sponsored_campaigns (title, body, event_id, starts_at, ends_at)
    values ('QA Solo Evento', 'QA', '5c111111-1111-4111-8111-111111111111', now(), now() + interval '1 day')$$,
  '10. CHECK: solo event_id (sin url) se acepta'
);
select throws_ok(
  $$insert into public.sponsored_campaigns (title, body, url, starts_at, ends_at)
    values ('QA', 'QA', 'javascript:alert(1)', now(), now() + interval '1 day')$$,
  '23514', NULL,
  '11. CHECK: una url que no es http(s) se rechaza'
);
select throws_ok(
  $$insert into public.sponsored_campaigns (body, url, starts_at, ends_at)
    values ('QA', 'https://example.com', now(), now() + interval '1 day')$$,
  '23502', NULL,
  '12. title es not null'
);

-- ---------------------------------------------------------------------------
-- anon: sin ningún privilegio.
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok(
  $$select count(*) from public.sponsored_campaigns$$,
  '42501', NULL,
  '13. anon: el SELECT se rechaza (42501)'
);
select throws_ok(
  $$insert into public.sponsored_campaigns (title, body, url, starts_at, ends_at)
    values ('QA Anon', 'QA', 'https://example.com', now(), now() + interval '1 day')$$,
  '42501', NULL,
  '14. anon: el INSERT se rechaza (42501)'
);

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- authenticated no admin: no ve ni toca nada.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"5c000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (select count(*)::int from public.sponsored_campaigns),
  0,
  '15. usuario: no ve ninguna campaña'
);
select throws_ok(
  $$insert into public.sponsored_campaigns (title, body, url, starts_at, ends_at)
    values ('QA Usuario', 'QA', 'https://example.com', now(), now() + interval '1 day')$$,
  '42501', NULL,
  '16. usuario: el INSERT se rechaza por RLS (42501)'
);
update public.sponsored_campaigns set title = 'QA Hackeada' where id = '5c222222-2222-4222-8222-222222222222';
delete from public.sponsored_campaigns where id = '5c222222-2222-4222-8222-222222222222';

reset role;
reset request.jwt.claims;

select is(
  (select title from public.sponsored_campaigns where id = '5c222222-2222-4222-8222-222222222222'),
  'QA Campaña',
  '17. usuario: el UPDATE y el DELETE no cambiaron nada (RLS los filtra)'
);

-- ---------------------------------------------------------------------------
-- admin: lee, inserta, actualiza y borra.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"5c000000-0000-4000-8000-000000000002","role":"authenticated"}';

select ok(
  (select count(*)::int from public.sponsored_campaigns) >= 2,
  '18. admin: ve las campañas'
);
select lives_ok(
  $$insert into public.sponsored_campaigns (id, title, body, url, starts_at, ends_at, created_by)
    values ('5c333333-3333-4333-8333-333333333333', 'QA Admin', 'QA', 'https://example.com/admin',
            now(), now() + interval '3 days', '5c000000-0000-4000-8000-000000000002')$$,
  '19. admin: el INSERT se acepta'
);
select lives_ok(
  $$update public.sponsored_campaigns set sent_at = now() where id = '5c333333-3333-4333-8333-333333333333'$$,
  '20. admin: el UPDATE se acepta'
);
select is(
  (select count(*)::int from public.sponsored_campaigns
   where id = '5c333333-3333-4333-8333-333333333333' and sent_at is not null),
  1,
  '21. admin: el UPDATE quedó (sent_at puesto)'
);
select lives_ok(
  $$delete from public.sponsored_campaigns where id = '5c222222-2222-4222-8222-222222222222'$$,
  '22. admin: el DELETE se acepta'
);
select is(
  (select count(*)::int from public.sponsored_campaigns where id = '5c222222-2222-4222-8222-222222222222'),
  0,
  '23. admin: la campaña borrada no está más'
);

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- notification_sends.campaign_id
-- ---------------------------------------------------------------------------

select col_type_is('public', 'notification_sends', 'campaign_id', 'uuid',
  '24. notification_sends.campaign_id es uuid');

select ok(
  (select pg_get_indexdef(indexrelid) like '%(campaign_id)%'
   from pg_index where indexrelid = 'public.notification_sends_campaign_id_idx'::regclass),
  '25. notification_sends_campaign_id_idx existe'
);

insert into public.notification_sends (user_id, kind, channel, status, dedupe_key, campaign_id)
values ('5c000000-0000-4000-8000-000000000001', 'patrocinado', 'push', 'enviado',
        'qa-campanias-envio-1', '5c333333-3333-4333-8333-333333333333');

delete from public.sponsored_campaigns where id = '5c333333-3333-4333-8333-333333333333';

select is(
  (select count(*)::int from public.notification_sends
   where dedupe_key = 'qa-campanias-envio-1' and campaign_id is null),
  1,
  '26. borrar la campaña deja el envío con campaign_id null (on delete set null)'
);

-- ---------------------------------------------------------------------------
-- notification_preferences.sponsored
-- ---------------------------------------------------------------------------

select col_not_null('public', 'notification_preferences', 'sponsored',
  '27. notification_preferences.sponsored es not null');
select col_default_is('public', 'notification_preferences', 'sponsored', 'true',
  '28. notification_preferences.sponsored: default true');

-- 29-30. El dueño la crea sin mandarla (queda en true) y la puede apagar.
set local role authenticated;
set local request.jwt.claims = '{"sub":"5c000000-0000-4000-8000-000000000001","role":"authenticated"}';

insert into public.notification_preferences (user_id) values ('5c000000-0000-4000-8000-000000000001');
select is(
  (select sponsored from public.notification_preferences where user_id = '5c000000-0000-4000-8000-000000000001'),
  true,
  '29. usuario: sus preferencias nuevas quedan con sponsored = true'
);

update public.notification_preferences set sponsored = false
where user_id = '5c000000-0000-4000-8000-000000000001';
select is(
  (select sponsored from public.notification_preferences where user_id = '5c000000-0000-4000-8000-000000000001'),
  false,
  '30. usuario: puede apagar sponsored en lo suyo'
);

reset role;
reset request.jwt.claims;

select * from finish();
rollback;
