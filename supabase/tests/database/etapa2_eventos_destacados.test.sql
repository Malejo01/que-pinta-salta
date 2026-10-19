-- pgTAP de 20261018130100_etapa2_eventos_destacados.sql: featured_until,
-- featured_set_by, featured_set_at, su índice, y que el dueño de un evento no
-- pueda destacarse solo (tr_enforce_event_user_rules), mientras que el admin
-- sí. uuid fijo, prefijo "e2" (inventados, "qa-destacados-..."). Todo en una
-- transacción con rollback.
--   D = e2000000-0000-4000-8000-000000000001: dueño (USER).
--   A = e2000000-0000-4000-8000-000000000002: admin.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000', 'e2000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'qa-destacados-duenio@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'e2000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'qa-destacados-admin@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');

alter table public.profiles disable trigger tr_prevent_role_tampering;
update public.profiles set role = 'ADMIN' where id = 'e2000000-0000-4000-8000-000000000002';
alter table public.profiles enable trigger tr_prevent_role_tampering;

-- 1-3. Columnas.
select col_type_is('public', 'events', 'featured_until', 'timestamp with time zone',
  '1. events.featured_until es timestamptz');
select col_type_is('public', 'events', 'featured_set_by', 'uuid',
  '2. events.featured_set_by es uuid');
select col_type_is('public', 'events', 'featured_set_at', 'timestamp with time zone',
  '3. events.featured_set_at es timestamptz');

-- 4. featured_set_by -> auth.users on delete set null.
select ok(
  (select confrelid = 'auth.users'::regclass and confdeltype = 'n'
   from pg_constraint
   where conrelid = 'public.events'::regclass and contype = 'f'
     and conkey = array[(select attnum from pg_attribute
                         where attrelid = 'public.events'::regclass and attname = 'featured_set_by')]),
  '4. events.featured_set_by: FK a auth.users on delete set null'
);

-- 5. Índice parcial en featured_until.
select ok(
  (select pg_get_indexdef(indexrelid) like '%(featured_until)%WHERE (featured_until IS NOT NULL)%'
   from pg_index where indexrelid = 'public.events_featured_until_idx'::regclass),
  '5. events_featured_until_idx: parcial, where featured_until is not null'
);

-- ---------------------------------------------------------------------------
-- El dueño no se destaca solo.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"e2000000-0000-4000-8000-000000000001","role":"authenticated"}';

-- 6. INSERT del dueño con las tres columnas puestas: no se rechaza...
select lives_ok(
  $$insert into public.events (title, slug, start_date, featured_until, featured_set_by, featured_set_at)
    values ('QA Destacados Uno', 'qa-destacados-uno', now() + interval '1 day',
            now() + interval '30 days', 'e2000000-0000-4000-8000-000000000001', now())$$,
  '6. dueño: el INSERT con featured_* no se rechaza'
);

-- 7. ...pero quedan en null.
select ok(
  (select featured_until is null and featured_set_by is null and featured_set_at is null
   from public.events where slug = 'qa-destacados-uno'),
  '7. dueño: al insertar, featured_until/set_by/set_at quedan en null (el trigger los pisa)'
);

-- 8. UPDATE del dueño que intenta destacarse: no se rechaza...
select lives_ok(
  $$update public.events
    set featured_until = now() + interval '30 days',
        featured_set_by = 'e2000000-0000-4000-8000-000000000001',
        featured_set_at = now()
    where slug = 'qa-destacados-uno'$$,
  '8. dueño: el UPDATE que se destaca no se rechaza'
);

reset role;
reset request.jwt.claims;

-- 9. ...pero conserva los valores de antes (null).
select ok(
  (select featured_until is null and featured_set_by is null and featured_set_at is null
   from public.events where slug = 'qa-destacados-uno'),
  '9. dueño: al editar, featured_* conservan el valor de antes (sigue sin destacar)'
);

-- ---------------------------------------------------------------------------
-- El admin sí destaca.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"e2000000-0000-4000-8000-000000000002","role":"authenticated"}';

select lives_ok(
  $$update public.events
    set featured_until = now() + interval '7 days',
        featured_set_by = 'e2000000-0000-4000-8000-000000000002',
        featured_set_at = now()
    where slug = 'qa-destacados-uno'$$,
  '10. admin: el UPDATE que destaca no se rechaza'
);

reset role;
reset request.jwt.claims;

-- 11. Quedó destacado, con quién y cuándo.
select ok(
  (select featured_until > now() and featured_set_by = 'e2000000-0000-4000-8000-000000000002'
          and featured_set_at is not null
   from public.events where slug = 'qa-destacados-uno'),
  '11. admin: featured_until en el futuro, featured_set_by = admin, featured_set_at puesto'
);

-- 12-13. Si el dueño edita después, no le saca el destacado.
set local role authenticated;
set local request.jwt.claims = '{"sub":"e2000000-0000-4000-8000-000000000001","role":"authenticated"}';

select lives_ok(
  $$update public.events set featured_until = null, featured_set_by = null, title = 'QA Destacados Uno Editado'
    where slug = 'qa-destacados-uno'$$,
  '12. dueño: el UPDATE que intenta sacar el destacado no se rechaza'
);

reset role;
reset request.jwt.claims;

select ok(
  (select featured_until > now() and featured_set_by = 'e2000000-0000-4000-8000-000000000002'
          and title = 'QA Destacados Uno Editado'
   from public.events where slug = 'qa-destacados-uno'),
  '13. dueño: el título cambió, pero el destacado del admin sigue'
);

-- 14. Vence solo: con featured_until en el pasado, featured_until > now() es falso.
update public.events set featured_until = now() - interval '1 minute' where slug = 'qa-destacados-uno';
select ok(
  (select not (featured_until > now()) from public.events where slug = 'qa-destacados-uno'),
  '14. con featured_until en el pasado deja de contar como destacado (sin cron)'
);

-- 15-16. Borrar al admin deja featured_set_by en null (on delete set null).
delete from auth.users where id = 'e2000000-0000-4000-8000-000000000002';
select ok(
  (select featured_set_by is null from public.events where slug = 'qa-destacados-uno'),
  '15. borrar al admin deja featured_set_by en null'
);
select ok(
  (select featured_set_at is not null from public.events where slug = 'qa-destacados-uno'),
  '16. ...y featured_set_at queda (no identifica a nadie)'
);

select * from finish();
rollback;
