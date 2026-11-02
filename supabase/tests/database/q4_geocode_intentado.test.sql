-- Q4-3: venues.geocode_intentado_at (corrida diaria de geocodificación).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(4);

select has_column('public', 'venues', 'geocode_intentado_at', '1. venues.geocode_intentado_at existe');
select col_type_is('public', 'venues', 'geocode_intentado_at', 'timestamp with time zone', '2. es timestamptz');
select col_is_null('public', 'venues', 'geocode_intentado_at', '3. acepta NULL (nunca intentado)');
select col_hasnt_default('public', 'venues', 'geocode_intentado_at', '4. sin default: un lugar nuevo nace sin intento');

select * from finish();
rollback;
