-- pgTAP de 20261018130000_etapa2_venues_geocodificacion.sql: columnas
-- geocoded_at y geocode_source, y los CHECK sobre latitude/longitude (que ya
-- existían). Venues inventados ("QA Geo ..."), como postgres. Todo en una
-- transacción con rollback.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- 1-2. Columnas nuevas, nullables.
select col_type_is('public', 'venues', 'geocoded_at', 'timestamp with time zone',
  '1. venues.geocoded_at es timestamptz');
select col_type_is('public', 'venues', 'geocode_source', 'text',
  '2. venues.geocode_source es text');

-- 3. No se crearon lat/lng: siguen latitude/longitude.
select ok(
  not exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'venues' and column_name in ('lat', 'lng')),
  '3. venues: no hay columnas lat/lng (se usan latitude/longitude)'
);

-- 4-6. geocode_source: solo nominatim, manual o null.
select lives_ok(
  $$insert into public.venues (name, address, latitude, longitude, geocode_source, geocoded_at)
    values ('QA Geo Nominatim', 'Calle QA 1', -24.78, -65.41, 'nominatim', now())$$,
  '4. venues: geocode_source = nominatim se acepta'
);
select lives_ok(
  $$insert into public.venues (name, address, latitude, longitude, geocode_source)
    values ('QA Geo Manual', 'Calle QA 2', -24.79, -65.42, 'manual')$$,
  '5. venues: geocode_source = manual se acepta'
);
select throws_ok(
  $$insert into public.venues (name, address, geocode_source)
    values ('QA Geo Otro', 'Calle QA 3', 'google')$$,
  '23514', NULL,
  '6. venues: geocode_source = google se rechaza (23514)'
);

-- 7. Sin ubicación y sin fuente: se acepta (los dos null).
select lives_ok(
  $$insert into public.venues (name, address) values ('QA Geo Sin Ubicacion', 'Calle QA 4')$$,
  '7. venues: latitude y longitude null, geocode_source null, se acepta'
);

-- 8-9. latitude y longitude van juntas.
select throws_ok(
  $$insert into public.venues (name, address, latitude) values ('QA Geo Solo Lat', 'Calle QA 5', -24.7)$$,
  '23514', NULL,
  '8. venues: latitude sin longitude se rechaza'
);
select throws_ok(
  $$insert into public.venues (name, address, longitude) values ('QA Geo Solo Lng', 'Calle QA 6', -65.4)$$,
  '23514', NULL,
  '9. venues: longitude sin latitude se rechaza'
);

-- 10-13. Rangos.
select throws_ok(
  $$insert into public.venues (name, address, latitude, longitude) values ('QA Geo Lat 91', 'Calle QA 7', 91, 0)$$,
  '23514', NULL,
  '10. venues: latitude 91 se rechaza'
);
select throws_ok(
  $$insert into public.venues (name, address, latitude, longitude) values ('QA Geo Lat -91', 'Calle QA 8', -91, 0)$$,
  '23514', NULL,
  '11. venues: latitude -91 se rechaza'
);
select throws_ok(
  $$insert into public.venues (name, address, latitude, longitude) values ('QA Geo Lng 181', 'Calle QA 9', 0, 181)$$,
  '23514', NULL,
  '12. venues: longitude 181 se rechaza'
);
select lives_ok(
  $$insert into public.venues (name, address, latitude, longitude) values ('QA Geo Bordes', 'Calle QA 10', -90, 180)$$,
  '13. venues: los bordes (-90, 180) se aceptan'
);

-- 14. Un UPDATE que deja una sola coordenada también se rechaza.
select throws_ok(
  $$update public.venues set longitude = null where name = 'QA Geo Manual'$$,
  '23514', NULL,
  '14. venues: un UPDATE que borra solo longitude se rechaza'
);

-- 15. Los dos CHECK de coordenadas quedaron validados.
select is(
  (select count(*)::int from pg_constraint
   where conrelid = 'public.venues'::regclass
     and conname in ('venues_coordenadas_juntas_check', 'venues_coordenadas_rango_check')
     and convalidated),
  2,
  '15. venues: los CHECK de coordenadas están validados'
);

-- 16. Índice parcial de lugares sin ubicación.
select ok(
  (select pg_get_indexdef(indexrelid) like '%WHERE (latitude IS NULL)%'
   from pg_index where indexrelid = 'public.venues_sin_ubicacion_idx'::regclass),
  '16. venues_sin_ubicacion_idx: parcial, where latitude is null'
);

-- 17. El índice encuentra el lugar sin ubicación de este archivo.
select is(
  (select count(*)::int from public.venues where latitude is null and name like 'QA Geo %'),
  1,
  '17. venues: un solo lugar QA sin ubicación (el del caso 7)'
);

select * from finish();
rollback;
