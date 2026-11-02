-- Q4-7: events.title_en, description_en y traducido_en_at.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(7);

select has_column('public', 'events', 'title_en', '1. events.title_en existe');
select has_column('public', 'events', 'description_en', '2. events.description_en existe');
select has_column('public', 'events', 'traducido_en_at', '3. events.traducido_en_at existe');
select col_is_null('public', 'events', 'title_en', '4. title_en acepta NULL');
select col_hasnt_default('public', 'events', 'title_en', '5. sin default: un evento nuevo nace sin traducción');
select col_type_is('public', 'events', 'traducido_en_at', 'timestamp with time zone', '6. traducido_en_at es timestamptz');
select has_index('public', 'events', 'events_traducido_en_at_idx', '7. índice para contar los intentos del día');

select * from finish();
rollback;
