-- Ronda 19 (19-b): pgTAP de public.duplicate_dismissals y su RLS, contra la
-- implementación real de 19-a
-- (supabase/migrations/20261011120000_merge_events.sql).
--
-- Usuarios y eventos son inventados y evidentes ("qa-dismiss-...@example.com",
-- "QA Dismiss ..."), creados dentro de esta transacción con rollback al
-- final: no se lee ni se usa ninguna fila real de la base local.
--
-- uuids fijos e inventados, prefijo d0000000:
--   001 = ADMIN = qa-dismiss-admin@example.com
--   002 = USER  = qa-dismiss-usuario@example.com (común, no admin)
--   003 = OTRO  = qa-dismiss-otro@example.com (para el intento de insertar
--         decided_by de otra cuenta)
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- ---------------------------------------------------------------------------
-- Preparación (como postgres).
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'qa-dismiss-admin@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'qa-dismiss-usuario@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'qa-dismiss-otro@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');

alter table public.profiles disable trigger tr_prevent_role_tampering;
update public.profiles set role = 'ADMIN'
  where id = 'd0000000-0000-4000-8000-000000000001';
alter table public.profiles enable trigger tr_prevent_role_tampering;

-- Cuatro eventos para distintos pares (CHECK/PK necesitan event_a < event_b;
-- como el id es gen_random_uuid(), se ordenan recién al leerlos). PUBLISHED
-- a propósito: esta suite no prueba la RLS de events (ya la prueba
-- rls_matriz.test.sql), y si quedaran en DRAFT (el default) el usuario común
-- no podría ni siquiera leer sus ids con un SELECT propio -- la subconsulta
-- del INSERT de los casos 6/10 devolvería 0 filas y el INSERT sería un no-op
-- sin excepción, en vez de la violación de RLS de duplicate_dismissals que
-- se quiere probar.
insert into public.events (title, slug, start_date, status)
values
  ('QA Dismiss Evento Uno', 'qa-dismiss-evento-uno', now() + interval '1 day', 'PUBLISHED'),
  ('QA Dismiss Evento Dos', 'qa-dismiss-evento-dos', now() + interval '1 day', 'PUBLISHED'),
  ('QA Dismiss Evento Tres', 'qa-dismiss-evento-tres', now() + interval '1 day', 'PUBLISHED'),
  ('QA Dismiss Evento Cuatro', 'qa-dismiss-evento-cuatro', now() + interval '1 day', 'PUBLISHED'),
  ('QA Dismiss Evento Cinco', 'qa-dismiss-evento-cinco', now() + interval '1 day', 'PUBLISHED'),
  ('QA Dismiss Evento Seis', 'qa-dismiss-evento-seis', now() + interval '1 day', 'PUBLISHED'),
  ('QA Dismiss Evento Cascada A', 'qa-dismiss-evento-cascada-a', now() + interval '1 day', 'PUBLISHED'),
  ('QA Dismiss Evento Cascada B', 'qa-dismiss-evento-cascada-b', now() + interval '1 day', 'PUBLISHED');

-- ===========================================================================
-- CHECK y PK
-- ===========================================================================

-- 1. CHECK (event_a < event_b): insertar con el orden invertido falla.
select throws_ok(
  $$insert into public.duplicate_dismissals (event_a, event_b, decided_by)
    select greatest(e1.id, e2.id), least(e1.id, e2.id), 'd0000000-0000-4000-8000-000000000001'
    from public.events e1, public.events e2
    where e1.slug = 'qa-dismiss-evento-uno' and e2.slug = 'qa-dismiss-evento-dos'$$,
  '23514', NULL,
  '1. CHECK: insertar (b, a) con b > a falla'
);

-- 2. PK: insertar el mismo par dos veces falla.
insert into public.duplicate_dismissals (event_a, event_b, decided_by)
select least(e1.id, e2.id), greatest(e1.id, e2.id), 'd0000000-0000-4000-8000-000000000001'
from public.events e1, public.events e2
where e1.slug = 'qa-dismiss-evento-uno' and e2.slug = 'qa-dismiss-evento-dos';

select throws_ok(
  $$insert into public.duplicate_dismissals (event_a, event_b, decided_by)
    select least(e1.id, e2.id), greatest(e1.id, e2.id), 'd0000000-0000-4000-8000-000000000001'
    from public.events e1, public.events e2
    where e1.slug = 'qa-dismiss-evento-uno' and e2.slug = 'qa-dismiss-evento-dos'$$,
  '23505', NULL,
  '2. PK: insertar el mismo par dos veces falla'
);

-- ===========================================================================
-- anon: no lee ni inserta.
-- ===========================================================================

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

-- La migración hace "REVOKE ALL ON public.duplicate_dismissals FROM anon":
-- anon no tiene ni siquiera el GRANT de tabla para SELECT, así que el
-- rechazo pasa por el chequeo de privilegios de Postgres (antes de llegar a
-- evaluar RLS), con "permission denied for table", no un conteo en 0.
select throws_like(
  $$select count(*) from public.duplicate_dismissals$$,
  '%permission denied for table duplicate_dismissals%',
  '3. anon: no puede ni leer (REVOKE ALL de tabla, ni siquiera llega a RLS)'
);

select throws_ok(
  $$insert into public.duplicate_dismissals (event_a, event_b, decided_by)
    select least(e1.id, e2.id), greatest(e1.id, e2.id), 'd0000000-0000-4000-8000-000000000001'
    from public.events e1, public.events e2
    where e1.slug = 'qa-dismiss-evento-tres' and e2.slug = 'qa-dismiss-evento-cuatro'$$,
  '42501', NULL,
  '4. anon: no puede insertar'
);

reset role;
reset request.jwt.claims;

-- ===========================================================================
-- Usuario común: no lee, no inserta, no borra; las filas existentes no se le
-- ven (0 filas, no error).
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-4000-8000-000000000002","role":"authenticated"}';

select is(
  (select count(*)::int from public.duplicate_dismissals),
  0,
  '5. usuario común: no ve la fila existente (0 filas, no error)'
);

select throws_ok(
  $$insert into public.duplicate_dismissals (event_a, event_b, decided_by)
    select least(e1.id, e2.id), greatest(e1.id, e2.id), 'd0000000-0000-4000-8000-000000000002'
    from public.events e1, public.events e2
    where e1.slug = 'qa-dismiss-evento-tres' and e2.slug = 'qa-dismiss-evento-cuatro'$$,
  '42501', NULL,
  '6. usuario común: no puede insertar'
);

-- DELETE: el USING de "eliminación admin" no matchea -> 0 filas, sin error.
delete from public.duplicate_dismissals
where event_a = (select least(e1.id, e2.id) from public.events e1, public.events e2
                  where e1.slug = 'qa-dismiss-evento-uno' and e2.slug = 'qa-dismiss-evento-dos')
  and event_b = (select greatest(e1.id, e2.id) from public.events e1, public.events e2
                  where e1.slug = 'qa-dismiss-evento-uno' and e2.slug = 'qa-dismiss-evento-dos');

reset role;
reset request.jwt.claims;

select is(
  (select count(*)::int from public.duplicate_dismissals
   where event_a = (select least(e1.id, e2.id) from public.events e1, public.events e2
                     where e1.slug = 'qa-dismiss-evento-uno' and e2.slug = 'qa-dismiss-evento-dos')
     and event_b = (select greatest(e1.id, e2.id) from public.events e1, public.events e2
                     where e1.slug = 'qa-dismiss-evento-uno' and e2.slug = 'qa-dismiss-evento-dos')),
  1,
  '7. usuario común: el DELETE de la fila existente no borró nada (RLS lo filtra, 0 filas)'
);

-- ===========================================================================
-- Admin: lee, inserta (decided_by por defecto = su uid) y borra. Insertar con
-- decided_by de otro falla.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (select count(*)::int from public.duplicate_dismissals),
  1,
  '8. admin: lee la fila existente'
);

-- 9. decided_by por defecto = su uid (no se especifica en el INSERT).
insert into public.duplicate_dismissals (event_a, event_b)
select least(e1.id, e2.id), greatest(e1.id, e2.id)
from public.events e1, public.events e2
where e1.slug = 'qa-dismiss-evento-tres' and e2.slug = 'qa-dismiss-evento-cuatro';

select is(
  (select decided_by from public.duplicate_dismissals
   where event_a = (select least(e1.id, e2.id) from public.events e1, public.events e2
                     where e1.slug = 'qa-dismiss-evento-tres' and e2.slug = 'qa-dismiss-evento-cuatro')
     and event_b = (select greatest(e1.id, e2.id) from public.events e1, public.events e2
                     where e1.slug = 'qa-dismiss-evento-tres' and e2.slug = 'qa-dismiss-evento-cuatro')),
  'd0000000-0000-4000-8000-000000000001'::uuid,
  '9. admin: decided_by por defecto queda en su propio uid'
);

-- 10. insertar con decided_by de otra cuenta falla (WITH CHECK exige
--     decided_by = auth.uid()).
select throws_ok(
  $$insert into public.duplicate_dismissals (event_a, event_b, decided_by)
    select least(e1.id, e2.id), greatest(e1.id, e2.id), 'd0000000-0000-4000-8000-000000000003'
    from public.events e1, public.events e2
    where e1.slug = 'qa-dismiss-evento-cinco' and e2.slug = 'qa-dismiss-evento-seis'$$,
  '42501', NULL,
  '10. admin: insertar con decided_by de otra cuenta falla'
);

-- 11. admin: puede borrar (deshacer, "Volver a revisar", decisión 3).
select lives_ok(
  $$delete from public.duplicate_dismissals
    where event_a = (select least(e1.id, e2.id) from public.events e1, public.events e2
                      where e1.slug = 'qa-dismiss-evento-uno' and e2.slug = 'qa-dismiss-evento-dos')
      and event_b = (select greatest(e1.id, e2.id) from public.events e1, public.events e2
                      where e1.slug = 'qa-dismiss-evento-uno' and e2.slug = 'qa-dismiss-evento-dos')$$,
  '11. admin: el DELETE no se rechaza'
);

select is(
  (select count(*)::int from public.duplicate_dismissals
   where event_a = (select least(e1.id, e2.id) from public.events e1, public.events e2
                     where e1.slug = 'qa-dismiss-evento-uno' and e2.slug = 'qa-dismiss-evento-dos')
     and event_b = (select greatest(e1.id, e2.id) from public.events e1, public.events e2
                     where e1.slug = 'qa-dismiss-evento-uno' and e2.slug = 'qa-dismiss-evento-dos')),
  0,
  '12. admin: tras el DELETE, el par desaparece'
);

reset role;
reset request.jwt.claims;

-- ===========================================================================
-- Deshacer: un usuario común que intenta borrar un par existente borra 0
-- filas y la fila sigue (ya probado en el caso 7 para un par distinto; acá se
-- repite explícitamente sobre el par "tres/cuatro" que sigue existiendo, para
-- dejar sentado el caso con nombre propio pedido por la consigna).
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-4000-8000-000000000002","role":"authenticated"}';

delete from public.duplicate_dismissals
where event_a = (select least(e1.id, e2.id) from public.events e1, public.events e2
                  where e1.slug = 'qa-dismiss-evento-tres' and e2.slug = 'qa-dismiss-evento-cuatro')
  and event_b = (select greatest(e1.id, e2.id) from public.events e1, public.events e2
                  where e1.slug = 'qa-dismiss-evento-tres' and e2.slug = 'qa-dismiss-evento-cuatro');

reset role;
reset request.jwt.claims;

select is(
  (select count(*)::int from public.duplicate_dismissals
   where event_a = (select least(e1.id, e2.id) from public.events e1, public.events e2
                     where e1.slug = 'qa-dismiss-evento-tres' and e2.slug = 'qa-dismiss-evento-cuatro')
     and event_b = (select greatest(e1.id, e2.id) from public.events e1, public.events e2
                     where e1.slug = 'qa-dismiss-evento-tres' and e2.slug = 'qa-dismiss-evento-cuatro')),
  1,
  '13. deshacer: un usuario común que intenta borrar el par de otro borra 0 filas; la fila sigue'
);

-- ===========================================================================
-- Borrar uno de los dos eventos borra el par (cascada, ON DELETE CASCADE).
-- ===========================================================================

insert into public.duplicate_dismissals (event_a, event_b, decided_by)
select least(e1.id, e2.id), greatest(e1.id, e2.id), 'd0000000-0000-4000-8000-000000000001'
from public.events e1, public.events e2
where e1.slug = 'qa-dismiss-evento-cascada-a' and e2.slug = 'qa-dismiss-evento-cascada-b';

select is(
  (select count(*)::int from public.duplicate_dismissals
   where event_a = (select least(e1.id, e2.id) from public.events e1, public.events e2
                     where e1.slug = 'qa-dismiss-evento-cascada-a' and e2.slug = 'qa-dismiss-evento-cascada-b')
     and event_b = (select greatest(e1.id, e2.id) from public.events e1, public.events e2
                     where e1.slug = 'qa-dismiss-evento-cascada-a' and e2.slug = 'qa-dismiss-evento-cascada-b')),
  1,
  '14. cascada: el par existe antes de borrar el evento'
);

delete from public.events where slug = 'qa-dismiss-evento-cascada-a';

select is(
  (select count(*)::int from public.duplicate_dismissals
   where event_b = (select id from public.events where slug = 'qa-dismiss-evento-cascada-b')),
  0,
  '15. cascada: borrar uno de los dos eventos borra el par'
);

-- 16. decisión 3 ("Volver a revisar"): el deshacer del admin de arriba (caso
--     11/12) y el borrado por cascada de este bloque son los dos únicos
--     caminos para que un par vuelva a aparecer en la revisión manual; no
--     queda ninguna fila huérfana apuntando al evento borrado.
select is(
  (select count(*)::int from public.duplicate_dismissals
   where event_a = (select id from public.events where slug = 'qa-dismiss-evento-cascada-a')
      or event_b = (select id from public.events where slug = 'qa-dismiss-evento-cascada-a')),
  0,
  '16. cascada: no queda ninguna fila huérfana referenciando al evento borrado'
);

select * from finish();
rollback;
