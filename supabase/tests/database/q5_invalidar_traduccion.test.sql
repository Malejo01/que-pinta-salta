-- pgTAP de 20261103150000_q5_invalidar_traduccion.sql.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into public.events (id, title, slug, start_date, status, description, title_en, description_en, traducido_en_at)
values ('c8111111-1111-4111-8111-111111111111', 'Peña QA', 'qa-q5-pena', now() + interval '1 day', 'PUBLISHED',
        'Descripción QA', 'QA Folk Night', 'QA description', now());

-- El job de traducción escribe solo las columnas _en: no dispara nada.
update public.events set title_en = 'QA Folk Night 2', traducido_en_at = now() where id = 'c8111111-1111-4111-8111-111111111111';
select is((select title_en from public.events where id = 'c8111111-1111-4111-8111-111111111111'), 'QA Folk Night 2', '1. escribir la traducción no la borra');

-- Reescribir el mismo título (un upsert del scraper) no borra nada.
update public.events set title = 'Peña QA' where id = 'c8111111-1111-4111-8111-111111111111';
select is((select title_en from public.events where id = 'c8111111-1111-4111-8111-111111111111'), 'QA Folk Night 2', '2. el mismo título no invalida');

-- Otro cambio (el precio) tampoco.
update public.events set price_min = 1000 where id = 'c8111111-1111-4111-8111-111111111111';
select isnt((select traducido_en_at from public.events where id = 'c8111111-1111-4111-8111-111111111111'), null, '3. cambiar otra columna no invalida');

-- Cambia el título: se borra la traducción.
update public.events set title = 'Peña QA (nueva fecha)' where id = 'c8111111-1111-4111-8111-111111111111';
select is((select title_en from public.events where id = 'c8111111-1111-4111-8111-111111111111'), null, '4. otro título: title_en en null');
select is((select traducido_en_at from public.events where id = 'c8111111-1111-4111-8111-111111111111'), null, '5. y traducido_en_at en null (el job la rehace)');

-- Cambia la descripción: también.
update public.events set title_en = 'X', description_en = 'Y', traducido_en_at = now() where id = 'c8111111-1111-4111-8111-111111111111';
update public.events set description = 'Otra descripción QA' where id = 'c8111111-1111-4111-8111-111111111111';
select is((select description_en from public.events where id = 'c8111111-1111-4111-8111-111111111111'), null, '6. otra descripción: description_en en null');

select * from finish();
rollback;
