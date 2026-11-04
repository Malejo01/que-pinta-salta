-- pgTAP de 20261104020000_q6_revision_q5.sql (Q6-7, revisión de la Q5) y de
-- los bordes de la RLS de lugares_permanentes que la Q5 no probaba:
--   A. Columnas: ni anon ni un usuario común leen cargado_por / verificado_por
--      (antes de la Q6-7, authenticated sí); anon tampoco fuente_detalle ni
--      motivo_archivo. El admin sigue leyendo lo que usa el panel y
--      escribiendo cargado_por / verificado_por.
--   B. Filas: anon y común ven solo publicados y no escriben (insert, update,
--      delete); el check de «publicado» no se esquiva con un UPDATE parcial.
--   C. tomar_cupo_pedido_lugar_chicos: solo service_role, tope por clave y
--      por día, clave inválida, limpieza de días viejos.
-- uuid fijo, prefijo "c7" (inventados, "qa-q6-..."). Todo en una transacción
-- con rollback.
--   U = c7000000-0000-4000-8000-000000000001: usuario común.
--   A = c7000000-0000-4000-8000-000000000002: admin.
begin;
create extension if not exists pgtap with schema extensions;
select plan(45);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000', 'c7000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'qa-q6-u@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c7000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'qa-q6-admin@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');

alter table public.profiles disable trigger tr_prevent_role_tampering;
update public.profiles set role = 'ADMIN' where id = 'c7000000-0000-4000-8000-000000000002';
alter table public.profiles enable trigger tr_prevent_role_tampering;

insert into public.venues (id, name, address, slug) values
  ('c7111111-1111-4111-8111-111111111111', 'QA Q6 Plaza Uno', 'Calle Inventada QA 1, Salta', 'qa-q6-plaza-uno'),
  ('c7111111-1111-4111-8111-111111111112', 'QA Q6 Pelotero Dos', 'Calle Inventada QA 2, Salta', 'qa-q6-pelotero-dos'),
  ('c7111111-1111-4111-8111-111111111113', 'QA Q6 Salón Tres', 'Calle Inventada QA 3, Salta', 'qa-q6-salon-tres');

-- P: publicado (cargado y verificado por A). B: borrador de OSM. V: vencido.
insert into public.lugares_permanentes
  (id, venue_id, tipo, estado, fuente, fuente_detalle, verificado_at, verificado_por, cargado_por)
values
  ('c7222222-2222-4222-8222-222222222221', 'c7111111-1111-4111-8111-111111111111', 'plaza_juegos',
   'publicado', 'llamado', 'nota interna QA', now(), 'c7000000-0000-4000-8000-000000000002',
   'c7000000-0000-4000-8000-000000000002');
insert into public.lugares_permanentes (id, venue_id, tipo, fuente, osm_ref)
values ('c7222222-2222-4222-8222-222222222222', 'c7111111-1111-4111-8111-111111111112', 'pelotero',
        'openstreetmap', 'node/7777777');
insert into public.lugares_permanentes (id, venue_id, tipo, estado, fuente, verificado_at)
values ('c7222222-2222-4222-8222-222222222223', 'c7111111-1111-4111-8111-111111111113', 'salon_juegos',
        'vencido', 'visita', now() - interval '200 days');

-- ---------------------------------------------------------------------------
-- A. Privilegios por columna
-- ---------------------------------------------------------------------------
select ok(not has_column_privilege('authenticated', 'public.lugares_permanentes', 'cargado_por', 'SELECT'),
  'A1. authenticated no puede leer cargado_por (antes de la Q6-7 sí)');
select ok(not has_column_privilege('authenticated', 'public.lugares_permanentes', 'verificado_por', 'SELECT'),
  'A2. authenticated no puede leer verificado_por (antes de la Q6-7 sí)');
select ok(has_column_privilege('authenticated', 'public.lugares_permanentes', 'fuente_detalle', 'SELECT'),
  'A3. authenticated sí lee fuente_detalle (el panel admin la usa)');
select ok(has_column_privilege('authenticated', 'public.lugares_permanentes', 'cargado_por', 'UPDATE')
      and has_column_privilege('authenticated', 'public.lugares_permanentes', 'verificado_por', 'UPDATE')
      and has_table_privilege('authenticated', 'public.lugares_permanentes', 'INSERT'),
  'A4. authenticated conserva INSERT / UPDATE (la RLS los deja solo al admin)');
select ok(not has_column_privilege('anon', 'public.lugares_permanentes', 'fuente_detalle', 'SELECT'),
  'A5. anon no lee fuente_detalle (nota interna)');
select ok(not has_column_privilege('anon', 'public.lugares_permanentes', 'motivo_archivo', 'SELECT'),
  'A6. anon no lee motivo_archivo');
select ok(has_column_privilege('anon', 'public.lugares_permanentes', 'osm_ref', 'SELECT')
      and has_column_privilege('anon', 'public.lugares_permanentes', 'verificado_at', 'SELECT')
      and has_column_privilege('anon', 'public.lugares_permanentes', 'contacto_telefono', 'SELECT'),
  'A7. anon sigue leyendo las columnas públicas (COLUMNAS_PUBLICAS_LUGAR)');

-- ---------------------------------------------------------------------------
-- B1. anon
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select is((select count(*)::int from public.lugares_permanentes where venue_id::text like 'c7111111-%'), 1,
  'B1. anon ve solo el publicado');
select lives_ok(
  $$select id, venue_id, tipo, estado, descripcion_corta, edad_min, edad_max, horarios, acceso, nota_precio,
           techado, tiene_rampa, tiene_bano_adaptado, tiene_cambiador, contacto_telefono, contacto_web,
           contacto_instagram, fuente, osm_ref, verificado_at
      from public.lugares_permanentes$$,
  'B2. anon: el select de la web y la app (COLUMNAS_PUBLICAS_LUGAR) anda');
select throws_ok($$select fuente_detalle from public.lugares_permanentes$$, '42501', null,
  'B3. anon: select de fuente_detalle, permiso denegado');
select throws_ok($$select motivo_archivo from public.lugares_permanentes$$, '42501', null,
  'B4. anon: select de motivo_archivo, permiso denegado');
select throws_ok($$update public.lugares_permanentes set descripcion_corta = 'x'$$, '42501', null,
  'B5. anon no actualiza');
select throws_ok($$delete from public.lugares_permanentes$$, '42501', null,
  'B6. anon no borra');

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- B2. Usuario común
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"c7000000-0000-4000-8000-000000000001","role":"authenticated"}';

select throws_ok($$select cargado_por from public.lugares_permanentes$$, '42501', null,
  'B7. común: select de cargado_por, permiso denegado (era el agujero)');
select throws_ok($$select verificado_por from public.lugares_permanentes$$, '42501', null,
  'B8. común: select de verificado_por, permiso denegado');
select throws_ok($$select * from public.lugares_permanentes$$, '42501', null,
  'B9. común: select * también falla (no hay grant de toda la tabla)');
select is((select count(*)::int from public.lugares_permanentes where venue_id::text like 'c7111111-%'), 1,
  'B10. común: ve solo el publicado (ni el borrador ni el vencido)');
select throws_ok(
  $$insert into public.lugares_permanentes (venue_id, tipo, fuente) values ('c7111111-1111-4111-8111-111111111113', 'pelotero', 'visita')$$,
  '42501', null, 'B11. común: no inserta (RLS)');
select is_empty(
  $$update public.lugares_permanentes set estado = 'borrador' where id = 'c7222222-2222-4222-8222-222222222221' returning id$$,
  'B12. común: su update no alcanza ninguna fila');
select is_empty(
  $$delete from public.lugares_permanentes where id = 'c7222222-2222-4222-8222-222222222221' returning id$$,
  'B13. común: su delete no alcanza ninguna fila');

reset role;
reset request.jwt.claims;

select is((select estado from public.lugares_permanentes where id = 'c7222222-2222-4222-8222-222222222221'),
  'publicado', 'B14. el publicado sigue igual después del común');

-- ---------------------------------------------------------------------------
-- B3. Admin: lo que usa el panel, y el check de publicado con updates parciales
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"c7000000-0000-4000-8000-000000000002","role":"authenticated"}';

select is((select count(*)::int from public.lugares_permanentes where venue_id::text like 'c7111111-%'), 3,
  'B15. admin: ve todo');
select is((select fuente_detalle from public.lugares_permanentes where id = 'c7222222-2222-4222-8222-222222222221'),
  'nota interna QA', 'B16. admin: lee fuente_detalle (el panel)');
select lives_ok(
  $$update public.lugares_permanentes set verificado_at = now(), verificado_por = 'c7000000-0000-4000-8000-000000000002',
      fuente = 'visita', fuente_detalle = null where id = 'c7222222-2222-4222-8222-222222222223' returning id$$,
  'B17. admin: «Verificado hoy» (escribe verificado_por y devuelve el id)');
select lives_ok(
  $$insert into public.lugares_permanentes (venue_id, tipo, fuente, estado, cargado_por)
      select 'c7111111-1111-4111-8111-111111111113', 'salon_juegos', 'visita', 'borrador', 'c7000000-0000-4000-8000-000000000002'
      where false
    returning id$$,
  'B18. admin: un insert con cargado_por y returning id compila (el alta del panel)');
select throws_ok(
  $$update public.lugares_permanentes set fuente = 'openstreetmap' where id = 'c7222222-2222-4222-8222-222222222221'$$,
  '23514', null, 'B19. publicado → fuente openstreetmap con un update parcial: rechazado');
select throws_ok(
  $$update public.lugares_permanentes set fuente = 'pedido_publico' where id = 'c7222222-2222-4222-8222-222222222221'$$,
  '23514', null, 'B20. publicado → fuente pedido_publico: rechazado');
select throws_ok(
  $$update public.lugares_permanentes set verificado_at = null where id = 'c7222222-2222-4222-8222-222222222221'$$,
  '23514', null, 'B21. publicado → sin verificado_at: rechazado');
select throws_ok(
  $$update public.lugares_permanentes set estado = 'publicado' where id = 'c7222222-2222-4222-8222-222222222222'$$,
  '23514', null, 'B22. borrador de OSM sin verificar → publicado con solo el estado: rechazado');
select throws_ok(
  $$update public.lugares_permanentes set estado = 'publicado', verificado_at = now() where id = 'c7222222-2222-4222-8222-222222222222'$$,
  '23514', null, 'B23. borrador de OSM con fecha pero fuente openstreetmap → publicado: rechazado');
select throws_ok(
  $$update public.lugares_permanentes set estado = 'archivado' where id = 'c7222222-2222-4222-8222-222222222221'$$,
  '23514', null, 'B24. archivar sin motivo con un update parcial: rechazado');
select throws_ok($$select cargado_por from public.lugares_permanentes$$, '42501', null,
  'B25. ni el admin lee cargado_por desde la sesión (el panel no lo usa; la base sí lo tiene)');

reset role;
reset request.jwt.claims;

select is((select verificado_por::text from public.lugares_permanentes where id = 'c7222222-2222-4222-8222-222222222223'),
  'c7000000-0000-4000-8000-000000000002', 'B26. la verificación del admin quedó escrita');

-- ---------------------------------------------------------------------------
-- C. tomar_cupo_pedido_lugar_chicos
-- ---------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.tomar_cupo_pedido_lugar_chicos(text, integer, integer)', 'EXECUTE'),
  'C1. anon no ejecuta tomar_cupo');
select ok(not has_function_privilege('authenticated', 'public.tomar_cupo_pedido_lugar_chicos(text, integer, integer)', 'EXECUTE'),
  'C2. authenticated no ejecuta tomar_cupo');
select ok(has_function_privilege('service_role', 'public.tomar_cupo_pedido_lugar_chicos(text, integer, integer)', 'EXECUTE'),
  'C3. service_role sí');
select ok(not has_table_privilege('anon', 'public.lugares_chicos_pedidos_cupos', 'SELECT')
      and not has_table_privilege('authenticated', 'public.lugares_chicos_pedidos_cupos', 'SELECT')
      and not has_table_privilege('authenticated', 'public.lugares_chicos_pedidos_cupos', 'INSERT'),
  'C4. la tabla de cupos no se lee ni se escribe desde el cliente');
select ok((select relrowsecurity from pg_class where oid = 'public.lugares_chicos_pedidos_cupos'::regclass),
  'C5. RLS habilitada en la tabla de cupos');

-- Arranca de cero (otro test o una corrida vieja no ensucian la cuenta).
delete from public.lugares_chicos_pedidos_cupos;

select is(public.tomar_cupo_pedido_lugar_chicos('no-es-un-hash'), false, 'C6. clave con otra forma (¿una IP cruda?): false');
select is(public.tomar_cupo_pedido_lugar_chicos(null), false, 'C7. clave nula: false');
select is(
  (select array_agg(public.tomar_cupo_pedido_lugar_chicos(repeat($$a$$, 64), 3, 100) order by n) from generate_series(1, 4) n),
  array[true, true, true, false], 'C8. tope por clave: 3 entran, el 4.º no');
select is(
  (select cantidad from public.lugares_chicos_pedidos_cupos where clave = '*'), 3,
  'C9. lo rechazado por clave no gasta el cupo del día');
select is(
  (select array_agg(public.tomar_cupo_pedido_lugar_chicos(lpad(to_hex(n), 64, $$b$$), 10, 5) order by n) from generate_series(1, 3) n),
  array[true, true, false], 'C10. tope del día: con 3 ya usados y tope 5, entran 2 más (claves distintas) y el 3.º no');

-- Una fila de hace 5 días se borra en la próxima llamada.
insert into public.lugares_chicos_pedidos_cupos (dia, clave, cantidad)
values ((now() at time zone 'America/Argentina/Salta')::date - 5, repeat('c', 64), 1);
select public.tomar_cupo_pedido_lugar_chicos(repeat('d', 64));
select is(
  (select count(*)::int from public.lugares_chicos_pedidos_cupos where clave = repeat('c', 64)), 0,
  'C11. las filas de más de 2 días se borran');

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$select public.tomar_cupo_pedido_lugar_chicos(repeat('e', 64))$$, '42501', null,
  'C12. anon: ejecutar tomar_cupo, permiso denegado');
reset role;
reset request.jwt.claims;

select * from finish();
rollback;
