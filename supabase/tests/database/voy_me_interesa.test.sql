-- Ronda 23 (23-b): pgTAP de "voy"/"me interesa" y la vista pública, de la
-- migración 20261013120100_voy_me_interesa.sql (event_attendance,
-- event_attendance_totals mantenida por tr_sync_event_attendance_totals, y
-- la vista event_attendance_counts).
--
-- Dos actores, uuid fijo, prefijo "d" (no choca con "a"/"b"/"c" de los otros
-- archivos de pgTAP, que corren en transacciones separadas igual):
--   A = d0000000-0000-4000-8000-000000000001 = qa-voy-a@example.com
--   B = d0000000-0000-4000-8000-000000000002 = qa-voy-b@example.com
--
-- Eventos con id fijo (para poder consultar event_attendance_totals incluso
-- después de borrar el evento, cuando ya no queda slug que buscar):
--   evento_uno  = d1111111-1111-4111-8111-111111111111 (PUBLISHED, de A)
--   evento_dos  = d2222222-2222-4222-8222-222222222222 (PUBLISHED, destino
--                 del cambio de event_id)
--   evento_tres = d3333333-3333-4333-8333-333333333333 (PUBLISHED, se borra
--                 con una marca adentro, para probar el cascade)
--   evento_draft = d4444444-4444-4444-8444-444444444444 (DRAFT, con una
--                 marca que no tiene que aparecer en la vista)
--   evento_b    = d5555555-5555-4555-8555-555555555555 (PUBLISHED, donde
--                 marca solo B, aislado del resto)
--   evento_seis = d6666666-6666-4666-8666-666666666666 (PUBLISHED, destino
--                 del UPDATE que cambia event_id y kind a la vez)
--
-- Todo dentro de una transacción con rollback; nada de esto queda en la base.
begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'qa-voy-a@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
   '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'qa-voy-b@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
   '', '', '', '');

insert into public.events (id, title, slug, start_date, status, created_by)
values
  ('d1111111-1111-4111-8111-111111111111', 'QA Voy Evento Uno', 'qa-voy-evento-uno',
   now() + interval '1 day', 'PUBLISHED', 'd0000000-0000-4000-8000-000000000001'),
  ('d2222222-2222-4222-8222-222222222222', 'QA Voy Evento Dos', 'qa-voy-evento-dos',
   now() + interval '1 day', 'PUBLISHED', 'd0000000-0000-4000-8000-000000000001'),
  ('d3333333-3333-4333-8333-333333333333', 'QA Voy Evento Tres', 'qa-voy-evento-tres',
   now() + interval '1 day', 'PUBLISHED', 'd0000000-0000-4000-8000-000000000001'),
  ('d4444444-4444-4444-8444-444444444444', 'QA Voy Evento Draft', 'qa-voy-evento-draft',
   now() + interval '1 day', 'DRAFT', 'd0000000-0000-4000-8000-000000000001'),
  ('d5555555-5555-4555-8555-555555555555', 'QA Voy Evento B', 'qa-voy-evento-b',
   now() + interval '1 day', 'PUBLISHED', 'd0000000-0000-4000-8000-000000000002'),
  ('d6666666-6666-4666-8666-666666666666', 'QA Voy Evento Seis', 'qa-voy-evento-seis',
   now() + interval '1 day', 'PUBLISHED', 'd0000000-0000-4000-8000-000000000001');

-- ===========================================================================
-- INSERT / UNIQUE / UPDATE (kind) / DELETE sobre evento_uno
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-4000-8000-000000000001","role":"authenticated"}';

-- 1. A marca "voy" en el evento publicado.
select lives_ok(
  $$insert into public.event_attendance (user_id, event_id, kind)
    values ('d0000000-0000-4000-8000-000000000001', 'd1111111-1111-4111-8111-111111111111', 'voy')$$,
  '1. event_attendance/A: el INSERT de "voy" no se rechaza'
);

-- 2. Los totales del evento quedan voy=1, me_interesa=0.
select ok(
  (select voy = 1 and me_interesa = 0 from public.event_attendance_totals
   where event_id = 'd1111111-1111-4111-8111-111111111111'),
  '2. event_attendance_totals/evento_uno: voy=1, me_interesa=0 tras el INSERT'
);

-- 3. Un segundo "voy" de A al mismo evento, como INSERT, falla por el unique
--    (user_id, event_id).
select throws_ok(
  $$insert into public.event_attendance (user_id, event_id, kind)
    values ('d0000000-0000-4000-8000-000000000001', 'd1111111-1111-4111-8111-111111111111', 'voy')$$,
  '23505', NULL,
  '3. event_attendance/A: un segundo "voy" (INSERT) al mismo evento se rechaza por el unique'
);

-- 4. Un "me_interesa" de A al mismo evento, como INSERT, también falla por
--    el mismo unique (es user_id+event_id, no user_id+event_id+kind).
select throws_ok(
  $$insert into public.event_attendance (user_id, event_id, kind)
    values ('d0000000-0000-4000-8000-000000000001', 'd1111111-1111-4111-8111-111111111111', 'me_interesa')$$,
  '23505', NULL,
  '4. event_attendance/A: un "me_interesa" (INSERT) al mismo evento también se rechaza por el unique'
);

-- 5. A cambia a "me_interesa" con un UPDATE (sí es el camino válido).
select lives_ok(
  $$update public.event_attendance set kind = 'me_interesa'
    where user_id = 'd0000000-0000-4000-8000-000000000001'
      and event_id = 'd1111111-1111-4111-8111-111111111111'$$,
  '5. event_attendance/A: el UPDATE a "me_interesa" no se rechaza'
);

-- 6. Los totales bajan voy a 0 y suben me_interesa a 1.
select ok(
  (select voy = 0 and me_interesa = 1 from public.event_attendance_totals
   where event_id = 'd1111111-1111-4111-8111-111111111111'),
  '6. event_attendance_totals/evento_uno: voy=0, me_interesa=1 tras el UPDATE de kind'
);

-- 7. A desmarca (DELETE).
select lives_ok(
  $$delete from public.event_attendance
    where user_id = 'd0000000-0000-4000-8000-000000000001'
      and event_id = 'd1111111-1111-4111-8111-111111111111'$$,
  '7. event_attendance/A: el DELETE (desmarcar) no se rechaza'
);

-- 8. Las dos cantidades vuelven a 0 (nunca negativas).
select ok(
  (select voy = 0 and me_interesa = 0 from public.event_attendance_totals
   where event_id = 'd1111111-1111-4111-8111-111111111111'),
  '8. event_attendance_totals/evento_uno: voy=0, me_interesa=0 tras desmarcar (nunca negativo)'
);

-- ===========================================================================
-- Cambio de event_id (cambio b): resta en el evento viejo, suma en el nuevo.
-- ===========================================================================

-- 9. A vuelve a marcar "voy" en evento_uno (para tener algo que mover).
select lives_ok(
  $$insert into public.event_attendance (user_id, event_id, kind)
    values ('d0000000-0000-4000-8000-000000000001', 'd1111111-1111-4111-8111-111111111111', 'voy')$$,
  '9. event_attendance/A: vuelve a marcar "voy" en evento_uno (preparación)'
);

-- 10. Preparación: evento_uno queda en voy=1 otra vez.
select is(
  (select voy from public.event_attendance_totals where event_id = 'd1111111-1111-4111-8111-111111111111'),
  1,
  '10. event_attendance_totals/evento_uno: voy=1 después de volver a marcar'
);

reset role;
reset request.jwt.claims;

-- 11. Como postgres (lo que haría una fusión): se cambia el event_id de la
--     marca de A, de evento_uno a evento_dos.
select lives_ok(
  $$update public.event_attendance set event_id = 'd2222222-2222-4222-8222-222222222222'
    where user_id = 'd0000000-0000-4000-8000-000000000001'
      and event_id = 'd1111111-1111-4111-8111-111111111111'$$,
  '11. event_attendance: el UPDATE de event_id (como lo haría una fusión) no se rechaza'
);

-- 12. evento_uno queda en voy=0 (se restó).
select is(
  (select voy from public.event_attendance_totals where event_id = 'd1111111-1111-4111-8111-111111111111'),
  0,
  '12. event_attendance_totals/evento_uno: voy=0 después de mover la marca (se restó)'
);

-- 13. evento_dos queda en voy=1 (se sumó, con upsert).
select is(
  (select voy from public.event_attendance_totals where event_id = 'd2222222-2222-4222-8222-222222222222'),
  1,
  '13. event_attendance_totals/evento_dos: voy=1 después de mover la marca (se sumó)'
);

-- ===========================================================================
-- UPDATE que cambia event_id Y kind a la vez: el trigger entra en la rama de
-- event_id (resta con old.kind en el evento viejo, suma con new.kind en el
-- nuevo) sin chequear el kind por separado. Es el camino que de verdad
-- importa: si alguien "simplifica" esa rama para que solo mire event_id y
-- siga sumando con old.kind (en vez de new.kind) en el destino, este caso
-- tiene que fallar.
-- ===========================================================================

-- 13a. Como postgres: la marca de A (ahora en evento_dos, kind "voy") pasa a
--      evento_seis Y a "me_interesa" en el mismo UPDATE.
select lives_ok(
  $$update public.event_attendance set event_id = 'd6666666-6666-4666-8666-666666666666', kind = 'me_interesa'
    where user_id = 'd0000000-0000-4000-8000-000000000001'
      and event_id = 'd2222222-2222-4222-8222-222222222222'$$,
  '13a. event_attendance: el UPDATE que cambia event_id y kind a la vez no se rechaza'
);

-- 13b. evento_dos vuelve a voy=0 (se restó 1 de "voy", el kind viejo).
select is(
  (select voy from public.event_attendance_totals where event_id = 'd2222222-2222-4222-8222-222222222222'),
  0,
  '13b. event_attendance_totals/evento_dos: voy=0 después del UPDATE combinado (se restó con el kind viejo)'
);

-- 13c. evento_seis queda en voy=0, me_interesa=1 (se sumó 1 a "me_interesa",
--      el kind NUEVO, no a "voy").
select ok(
  (select voy = 0 and me_interesa = 1 from public.event_attendance_totals
   where event_id = 'd6666666-6666-4666-8666-666666666666'),
  '13c. event_attendance_totals/evento_seis: voy=0, me_interesa=1 (se sumó con el kind nuevo, no con el viejo)'
);

-- 13d. Un UPDATE que no cambia ni event_id ni kind (acá, el mismo valor que
--      ya tenía) no entra en ninguna de las dos ramas del trigger.
select lives_ok(
  $$update public.event_attendance set kind = 'me_interesa'
    where user_id = 'd0000000-0000-4000-8000-000000000001'
      and event_id = 'd6666666-6666-4666-8666-666666666666'$$,
  '13d. event_attendance: el UPDATE que no cambia event_id ni kind no se rechaza'
);

-- 13e. Los totales de evento_seis quedan igual (ninguna rama del trigger se
--      disparó).
select ok(
  (select voy = 0 and me_interesa = 1 from public.event_attendance_totals
   where event_id = 'd6666666-6666-4666-8666-666666666666'),
  '13e. event_attendance_totals/evento_seis: sin cambios tras el UPDATE que no toca event_id ni kind'
);

-- ===========================================================================
-- Borrar un evento con marcas (cascade): no falla, no queda fila de totales.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-4000-8000-000000000001","role":"authenticated"}';

-- 14. A marca "voy" en evento_tres (preparación para el borrado).
select lives_ok(
  $$insert into public.event_attendance (user_id, event_id, kind)
    values ('d0000000-0000-4000-8000-000000000001', 'd3333333-3333-4333-8333-333333333333', 'voy')$$,
  '14. event_attendance/A: marca "voy" en evento_tres (preparación del borrado)'
);

reset role;
reset request.jwt.claims;

-- 15. Preparación: evento_tres queda en voy=1.
select is(
  (select voy from public.event_attendance_totals where event_id = 'd3333333-3333-4333-8333-333333333333'),
  1,
  '15. event_attendance_totals/evento_tres: voy=1 antes de borrar el evento'
);

-- 16. Como postgres: se borra el evento con marcas (dispara el cascade de
--     events hacia event_attendance); no tiene que fallar.
select lives_ok(
  $$delete from public.events where id = 'd3333333-3333-4333-8333-333333333333'$$,
  '16. events: el DELETE de un evento con marcas (cascade) no se rechaza'
);

-- 17. No queda fila de totales para ese evento.
select is(
  (select count(*)::int from public.event_attendance_totals
   where event_id = 'd3333333-3333-4333-8333-333333333333'),
  0,
  '17. event_attendance_totals: no queda fila de totales del evento borrado'
);

-- ===========================================================================
-- B marca "voy" en evento_b (aislado): la vista da voy=1, A no ve ni puede
-- tocar esa fila.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-4000-8000-000000000002","role":"authenticated"}';

-- 18. B marca "voy".
select lives_ok(
  $$insert into public.event_attendance (user_id, event_id, kind)
    values ('d0000000-0000-4000-8000-000000000002', 'd5555555-5555-4555-8555-555555555555', 'voy')$$,
  '18. event_attendance/B: el INSERT de "voy" en evento_b no se rechaza'
);

reset role;
reset request.jwt.claims;

-- 19. La vista da voy=1, me_interesa=0 para evento_b.
select ok(
  (select voy = 1 and me_interesa = 0 from public.event_attendance_counts
   where event_id = 'd5555555-5555-4555-8555-555555555555'),
  '19. event_attendance_counts/evento_b: voy=1, me_interesa=0'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-4000-8000-000000000001","role":"authenticated"}';

-- 20. A no ve la fila de B en event_attendance.
select is(
  (select count(*)::int from public.event_attendance
   where event_id = 'd5555555-5555-4555-8555-555555555555'),
  0,
  '20. event_attendance/A: no ve la fila de B en evento_b'
);

-- A intenta borrar la fila de B: USING (auth.uid()=user_id) no matchea -> 0
-- filas, sin error.
delete from public.event_attendance
where event_id = 'd5555555-5555-4555-8555-555555555555'
  and user_id = 'd0000000-0000-4000-8000-000000000002';

-- A intenta cambiarla: mismo filtrado en silencio.
update public.event_attendance set kind = 'me_interesa'
where event_id = 'd5555555-5555-4555-8555-555555555555'
  and user_id = 'd0000000-0000-4000-8000-000000000002';

reset role;
reset request.jwt.claims;

-- 21. La fila de B sigue existiendo (A no pudo borrarla).
select is(
  (select count(*)::int from public.event_attendance
   where event_id = 'd5555555-5555-4555-8555-555555555555'
     and user_id = 'd0000000-0000-4000-8000-000000000002'),
  1,
  '21. event_attendance: la fila de B sigue existiendo (A no pudo borrarla)'
);

-- 22. Y sigue en "voy" (A no pudo cambiarla).
select is(
  (select kind from public.event_attendance
   where event_id = 'd5555555-5555-4555-8555-555555555555'
     and user_id = 'd0000000-0000-4000-8000-000000000002'),
  'voy',
  '22. event_attendance: la fila de B sigue en "voy" (A no pudo cambiarla)'
);

-- ===========================================================================
-- anon: no lee event_attendance, sí lee event_attendance_counts.
-- ===========================================================================

-- 23. anon no puede leer event_attendance: sin ningún privilegio de tabla
--     (REVOKE ALL en la migración), da 42501 (no 0 filas por RLS: ni
--     siquiera llega a evaluar RLS, el privilegio de tabla ya lo frena).
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok(
  $$select count(*) from public.event_attendance
    where event_id = 'd5555555-5555-4555-8555-555555555555'$$,
  '42501', NULL,
  '23. event_attendance/anon: el SELECT se rechaza con 42501 (sin privilegio de tabla)'
);

-- 24. anon sí lee event_attendance_counts y obtiene las cantidades (cambio c).
select ok(
  (select voy = 1 and me_interesa = 0 from public.event_attendance_counts
   where event_id = 'd5555555-5555-4555-8555-555555555555'),
  '24. event_attendance_counts/anon: lee voy=1, me_interesa=0 para evento_b'
);

-- 25. anon no puede insertar en event_attendance: 42501 (la policy de INSERT
--     es "TO authenticated", y además la tabla está REVOKE ALL para anon).
select throws_ok(
  $$insert into public.event_attendance (user_id, event_id, kind)
    values ('d0000000-0000-4000-8000-000000000001', 'd5555555-5555-4555-8555-555555555555', 'voy')$$,
  '42501', NULL,
  '25. event_attendance/anon: el INSERT se rechaza'
);

reset role;
reset request.jwt.claims;

-- 26. La vista no tiene ninguna columna de persona: solo event_id, voy,
--     me_interesa.
select is(
  (select string_agg(column_name, ',' order by column_name)
   from information_schema.columns
   where table_schema = 'public' and table_name = 'event_attendance_counts'),
  'event_id,me_interesa,voy',
  '26. event_attendance_counts: solo tiene las columnas event_id, voy, me_interesa'
);

-- ===========================================================================
-- Un evento en borrador con marcas no aparece en la vista.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-4000-8000-000000000001","role":"authenticated"}';

-- 27. A marca "voy" en el evento DRAFT (la policy de INSERT no exige
--     PUBLISHED, solo que la marca sea propia).
select lives_ok(
  $$insert into public.event_attendance (user_id, event_id, kind)
    values ('d0000000-0000-4000-8000-000000000001', 'd4444444-4444-4444-8444-444444444444', 'voy')$$,
  '27. event_attendance/A: el INSERT en un evento DRAFT no se rechaza'
);

reset role;
reset request.jwt.claims;

-- 28. Esa marca no aparece en la vista (el JOIN de la vista exige PUBLISHED).
select is(
  (select count(*)::int from public.event_attendance_counts
   where event_id = 'd4444444-4444-4444-8444-444444444444'),
  0,
  '28. event_attendance_counts: el evento DRAFT con marcas no aparece'
);

-- ===========================================================================
-- Un evento PUBLISHED con marcas que se despublica (camino real, a
-- diferencia del caso 27/28 que arranca directo en DRAFT): desaparece de la
-- vista, pero sus totales siguen en event_attendance_totals (la vista filtra
-- por status, no la tabla de totales).
-- ===========================================================================

-- 28a. Como postgres: evento_b (PUBLISHED, con el "voy" de B del caso 18)
--      pasa a DRAFT.
select lives_ok(
  $$update public.events set status = 'DRAFT' where id = 'd5555555-5555-4555-8555-555555555555'$$,
  '28a. events: el UPDATE a DRAFT de un evento con marcas no se rechaza'
);

-- 28b. evento_b ya no aparece en event_attendance_counts.
select is(
  (select count(*)::int from public.event_attendance_counts
   where event_id = 'd5555555-5555-4555-8555-555555555555'),
  0,
  '28b. event_attendance_counts: evento_b desaparece de la vista al despublicarse'
);

-- 28c. Pero sus totales siguen intactos en event_attendance_totals (el voy=1
--      de B no se pierde, solo deja de mostrarse en la vista pública).
select is(
  (select voy from public.event_attendance_totals
   where event_id = 'd5555555-5555-4555-8555-555555555555'),
  1,
  '28c. event_attendance_totals: evento_b sigue en voy=1 aunque esté en DRAFT'
);

-- ===========================================================================
-- Nadie con rol authenticated escribe directo en event_attendance_totals.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-4000-8000-000000000001","role":"authenticated"}';

-- 29. INSERT directo: 42501 (solo hay policy de SELECT; el INSERT ni
--     siquiera tiene privilegio de tabla).
select throws_ok(
  $$insert into public.event_attendance_totals (event_id, voy, me_interesa)
    values ('d5555555-5555-4555-8555-555555555555', 999, 999)$$,
  '42501', NULL,
  '29. event_attendance_totals/A: el INSERT directo se rechaza'
);

-- 30. UPDATE directo: mismo motivo.
select throws_ok(
  $$update public.event_attendance_totals set voy = 999
    where event_id = 'd5555555-5555-4555-8555-555555555555'$$,
  '42501', NULL,
  '30. event_attendance_totals/A: el UPDATE directo se rechaza'
);

reset role;
reset request.jwt.claims;

-- ===========================================================================
-- Privilegios de tabla de authenticated sobre event_attendance: SELECT,
-- INSERT, UPDATE y DELETE sí (los acota RLS a la fila propia), TRUNCATE no
-- (RLS no filtra TRUNCATE, así que era la única acción sin acotar a la fila
-- propia hasta el REVOKE de esta migración; este caso falla si ese REVOKE se
-- sacara en el futuro).
-- ===========================================================================

select ok(
  not has_table_privilege('authenticated', 'public.event_attendance', 'TRUNCATE'),
  '31a. event_attendance: authenticated no tiene privilegio TRUNCATE'
);

select ok(
  has_table_privilege('authenticated', 'public.event_attendance', 'SELECT')
  and has_table_privilege('authenticated', 'public.event_attendance', 'INSERT')
  and has_table_privilege('authenticated', 'public.event_attendance', 'UPDATE')
  and has_table_privilege('authenticated', 'public.event_attendance', 'DELETE'),
  '31b. event_attendance: authenticated sí tiene SELECT, INSERT, UPDATE y DELETE (acotados por RLS a la fila propia)'
);

-- 31c. event_attendance_totals: mismo REVOKE ALL / GRANT SELECT que
--      anon, así que TRUNCATE tampoco queda para authenticated.
select ok(
  not has_table_privilege('authenticated', 'public.event_attendance_totals', 'TRUNCATE'),
  '31c. event_attendance_totals: authenticated no tiene privilegio TRUNCATE'
);

-- ===========================================================================
-- La vista es security_invoker = true.
-- ===========================================================================

-- 32. pg_class.reloptions trae security_invoker=true para la vista.
select ok(
  (select 'security_invoker=true' = any(c.reloptions)
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'event_attendance_counts'),
  '32. event_attendance_counts: security_invoker=true en pg_class.reloptions'
);

select * from finish();
rollback;
