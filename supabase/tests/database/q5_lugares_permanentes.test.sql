-- pgTAP de 20261103120000_q5_lugares_permanentes.sql: tabla
-- lugares_permanentes, sus checks, RLS (anon / común / admin), el grant por
-- columnas de anon y delete_my_account. uuid fijo, prefijo "c5" (inventados,
-- "qa-q5-..."). Todo en una transacción con rollback.
--   U = c5000000-0000-4000-8000-000000000001: usuario común.
--   A = c5000000-0000-4000-8000-000000000002: admin.
begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000', 'c5000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'qa-q5-u@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c5000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'qa-q5-admin@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');

alter table public.profiles disable trigger tr_prevent_role_tampering;
update public.profiles set role = 'ADMIN' where id = 'c5000000-0000-4000-8000-000000000002';
alter table public.profiles enable trigger tr_prevent_role_tampering;

insert into public.venues (id, name, address, slug) values
  ('c5111111-1111-4111-8111-111111111111', 'QA Q5 Plaza Uno', 'Calle Inventada QA 1, Salta', 'qa-q5-plaza-uno'),
  ('c5111111-1111-4111-8111-111111111112', 'QA Q5 Pelotero Dos', 'Calle Inventada QA 2, Salta', 'qa-q5-pelotero-dos'),
  ('c5111111-1111-4111-8111-111111111113', 'QA Q5 Salón Tres', 'Calle Inventada QA 3, Salta', 'qa-q5-salon-tres'),
  ('c5111111-1111-4111-8111-111111111114', 'QA Q5 Libre Cuatro', 'Calle Inventada QA 4, Salta', 'qa-q5-libre-cuatro');

-- Un publicado (verificado por A), un borrador de OSM y uno vencido.
insert into public.lugares_permanentes
  (id, venue_id, tipo, estado, fuente, verificado_at, verificado_por, cargado_por, acceso)
values
  ('c5222222-2222-4222-8222-222222222221', 'c5111111-1111-4111-8111-111111111111', 'plaza_juegos',
   'publicado', 'visita', now(), 'c5000000-0000-4000-8000-000000000002',
   'c5000000-0000-4000-8000-000000000002', 'gratis');
insert into public.lugares_permanentes (id, venue_id, tipo, fuente, osm_ref)
values ('c5222222-2222-4222-8222-222222222222', 'c5111111-1111-4111-8111-111111111112', 'pelotero',
        'openstreetmap', 'node/123456');
insert into public.lugares_permanentes (id, venue_id, tipo, estado, fuente, verificado_at)
values ('c5222222-2222-4222-8222-222222222223', 'c5111111-1111-4111-8111-111111111113', 'salon_juegos',
        'vencido', 'llamado', now() - interval '200 days');

-- ---------------------------------------------------------------------------
-- 1. Forma, RLS, privilegios
-- ---------------------------------------------------------------------------
select has_table('public', 'lugares_permanentes', '1. existe la tabla');
select ok((select relrowsecurity from pg_class where oid = 'public.lugares_permanentes'::regclass),
  '2. RLS habilitada');
select col_default_is('public', 'lugares_permanentes', 'estado', 'borrador'::text, '3. estado arranca en borrador');
select ok(not has_table_privilege('anon', 'public.lugares_permanentes', 'TRUNCATE'), '4. anon sin TRUNCATE');
select ok(not has_table_privilege('authenticated', 'public.lugares_permanentes', 'TRUNCATE'), '5. authenticated sin TRUNCATE');
select ok(not has_table_privilege('anon', 'public.lugares_permanentes', 'INSERT'), '6. anon sin INSERT');
select ok(not has_table_privilege('anon', 'public.lugares_permanentes', 'UPDATE'), '7. anon sin UPDATE');
select ok(not has_column_privilege('anon', 'public.lugares_permanentes', 'cargado_por', 'SELECT'),
  '8. anon no puede leer cargado_por (decisión 8)');
select ok(not has_column_privilege('anon', 'public.lugares_permanentes', 'verificado_por', 'SELECT'),
  '9. anon no puede leer verificado_por (decisión 8)');
select ok(has_column_privilege('anon', 'public.lugares_permanentes', 'verificado_at', 'SELECT'),
  '10. anon sí lee verificado_at («Verificado el …»)');

-- ---------------------------------------------------------------------------
-- 2. Checks
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into public.lugares_permanentes (venue_id, tipo, fuente) values ('c5111111-1111-4111-8111-111111111114', 'cancha', 'visita')$$,
  '23514', null, '11. tipo fuera de la lista: rechazado');
select throws_ok(
  $$insert into public.lugares_permanentes (venue_id, tipo, fuente, estado) values ('c5111111-1111-4111-8111-111111111114', 'pelotero', 'visita', 'publicado')$$,
  '23514', null, '12. publicado sin verificado_at: rechazado');
select throws_ok(
  $$insert into public.lugares_permanentes (venue_id, tipo, fuente, estado, verificado_at) values ('c5111111-1111-4111-8111-111111111114', 'pelotero', 'openstreetmap', 'publicado', now())$$,
  '23514', null, '13. publicado con fuente openstreetmap: rechazado (hay que verificarlo)');
select throws_ok(
  $$insert into public.lugares_permanentes (venue_id, tipo, fuente, estado, verificado_at) values ('c5111111-1111-4111-8111-111111111114', 'pelotero', 'pedido_publico', 'publicado', now())$$,
  '23514', null, '14. publicado con fuente pedido_publico: rechazado');
select throws_ok(
  $$insert into public.lugares_permanentes (venue_id, tipo, fuente, estado) values ('c5111111-1111-4111-8111-111111111114', 'pelotero', 'visita', 'archivado')$$,
  '23514', null, '15. archivado sin motivo: rechazado');
select throws_ok(
  $$insert into public.lugares_permanentes (venue_id, tipo, fuente, edad_min, edad_max) values ('c5111111-1111-4111-8111-111111111114', 'pelotero', 'visita', 10, 3)$$,
  '23514', null, '16. edad_min > edad_max: rechazado');
select throws_ok(
  $$insert into public.lugares_permanentes (venue_id, tipo, fuente, osm_ref) values ('c5111111-1111-4111-8111-111111111114', 'pelotero', 'openstreetmap', 'cualquier cosa')$$,
  '23514', null, '17. osm_ref con otra forma: rechazado');
select throws_ok(
  $$insert into public.lugares_permanentes (venue_id, tipo, fuente, osm_ref) values ('c5111111-1111-4111-8111-111111111114', 'pelotero', 'openstreetmap', 'node/123456')$$,
  '23505', null, '18. el mismo osm_ref dos veces: rechazado (el importador no duplica)');
select throws_ok(
  $$insert into public.lugares_permanentes (venue_id, tipo, fuente) values ('c5111111-1111-4111-8111-111111111111', 'pelotero', 'visita')$$,
  '23505', null, '19. dos fichas para el mismo venue: rechazado (1 a 1)');
select throws_ok(
  $$insert into public.lugares_permanentes (venue_id, tipo, fuente, contacto_instagram) values ('c5111111-1111-4111-8111-111111111114', 'pelotero', 'visita', 'https://evil.example.com/x')$$,
  '23514', null, '20. instagram que no es instagram.com: rechazado');
select throws_ok(
  $$delete from public.venues where id = 'c5111111-1111-4111-8111-111111111111'$$,
  '23503', null, '21. borrar un venue con ficha: falla (on delete restrict)');
select lives_ok(
  $$insert into public.lugares_permanentes (venue_id, tipo, estado, fuente, verificado_at, horarios)
    values ('c5111111-1111-4111-8111-111111111114', 'espacio_cultural_infantil', 'publicado', 'web_oficial', now(),
            '{"version": 1, "solo_con_reserva": true, "semana": {}}'::jsonb)$$,
  '22. publicado verificado con fuente propia y «Con reserva»: entra');

-- ---------------------------------------------------------------------------
-- 3. anon
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select is((select count(*)::int from public.lugares_permanentes where venue_id::text like 'c5111111-%'), 2,
  '23. anon ve solo los 2 publicados (ni el borrador ni el vencido)');
select throws_ok(
  $$select cargado_por from public.lugares_permanentes$$,
  '42501', null, '24. anon: select de cargado_por, permiso denegado');
select throws_ok(
  $$select * from public.lugares_permanentes$$,
  '42501', null, '25. anon: select * también falla (no hay grant de toda la tabla)');
select throws_ok(
  $$insert into public.lugares_permanentes (venue_id, tipo, fuente) values ('c5111111-1111-4111-8111-111111111114', 'pelotero', 'visita')$$,
  '42501', null, '26. anon no inserta');

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- 4. Usuario común
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"c5000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is((select count(*)::int from public.lugares_permanentes where venue_id::text like 'c5111111-%'), 2,
  '27. común: ve solo los publicados');
select throws_ok(
  $$insert into public.lugares_permanentes (venue_id, tipo, fuente) values ('c5111111-1111-4111-8111-111111111114', 'pelotero', 'visita')$$,
  '42501', null, '28. común: no inserta (RLS)');
update public.lugares_permanentes set descripcion_corta = 'pisado' where id = 'c5222222-2222-4222-8222-222222222221';

reset role;
reset request.jwt.claims;

select is((select descripcion_corta from public.lugares_permanentes where id = 'c5222222-2222-4222-8222-222222222221'),
  null, '29. común: su update no tocó nada');

-- ---------------------------------------------------------------------------
-- 5. Admin
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"c5000000-0000-4000-8000-000000000002","role":"authenticated"}';

select is((select count(*)::int from public.lugares_permanentes where venue_id::text like 'c5111111-%'), 4,
  '30. admin: ve todo (borrador y vencido incluidos)');
select lives_ok(
  $$update public.lugares_permanentes set estado = 'publicado', fuente = 'visita', verificado_at = now(),
      verificado_por = 'c5000000-0000-4000-8000-000000000002'
    where id = 'c5222222-2222-4222-8222-222222222222'$$,
  '31. admin: verifica y publica el borrador de OSM');
select is((select estado from public.lugares_permanentes where id = 'c5222222-2222-4222-8222-222222222222'),
  'publicado', '32. quedó publicado');
select lives_ok(
  $$update public.lugares_permanentes set estado = 'archivado', motivo_archivo = 'cerró' where id = 'c5222222-2222-4222-8222-222222222223'$$,
  '33. admin: archiva con motivo');

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- 6. delete_my_account desvincula cargado_por y verificado_por
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"c5000000-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok($$select public.delete_my_account()$$, '34. el admin borra su cuenta');
reset role;
reset request.jwt.claims;

select is((select count(*)::int from public.lugares_permanentes
           where cargado_por = 'c5000000-0000-4000-8000-000000000002'
              or verificado_por = 'c5000000-0000-4000-8000-000000000002'), 0,
  '35. ninguna ficha queda con su id');
select is((select count(*)::int from public.lugares_permanentes where venue_id::text like 'c5111111-%'), 4,
  '36. las fichas siguen (se desvincula, no se borra)');

select * from finish();
rollback;
