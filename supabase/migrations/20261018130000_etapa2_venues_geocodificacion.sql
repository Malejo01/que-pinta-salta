-- Etapa 2 (contrato de esquema de las rondas R48 a R57): ubicación de los
-- lugares para el mapa y la geocodificación.
--
-- venues YA tiene latitude numeric(10,8) y longitude numeric(11,8) (baseline;
-- 20261002190000_venue_canonical.sql las renombró a propósito, las usa el
-- JSON-LD de la web y las expone venues_canonical). Esta migración NO crea
-- columnas de coordenadas nuevas: suma de dónde salió la ubicación y cuándo,
-- y los CHECK que faltaban sobre las que ya existen.
--
--   * geocoded_at: cuándo se fijó la ubicación (null = nunca se geocodificó).
--   * geocode_source: de dónde salió ('nominatim' o 'manual'; null = sin dato,
--     por ejemplo las coordenadas cargadas antes de esta migración).
--   * latitude y longitude van juntas (las dos null o las dos con valor) y en
--     rango (-90..90, -180..180).
--   * Índice parcial de "lugares sin ubicación" (where latitude is null), para
--     que el proceso que geocodifica levante la cola sin recorrer la tabla.
--
-- Los CHECK sobre latitude/longitude van NOT VALID + VALIDATE: si una fila de
-- producción no los cumple, el VALIDATE falla y la transacción entera se
-- deshace (no queda nada a medias). scripts/db/produccion/verificar-etapa-2.sql
-- trae la consulta "ANTES" que tiene que dar 0 antes de aplicar.
--
-- Idempotente (add column if not exists, drop constraint if exists, create
-- index if not exists). Cambia el esquema: npm run db:types en el mismo commit.

alter table public.venues
  add column if not exists geocoded_at timestamptz null,
  add column if not exists geocode_source text null;

alter table public.venues
  drop constraint if exists venues_geocode_source_check;
alter table public.venues
  add constraint venues_geocode_source_check
  check (geocode_source in ('nominatim', 'manual'));

alter table public.venues
  drop constraint if exists venues_coordenadas_juntas_check;
alter table public.venues
  add constraint venues_coordenadas_juntas_check
  check ((latitude is null) = (longitude is null)) not valid;
alter table public.venues
  validate constraint venues_coordenadas_juntas_check;

alter table public.venues
  drop constraint if exists venues_coordenadas_rango_check;
alter table public.venues
  add constraint venues_coordenadas_rango_check
  check (latitude between -90 and 90 and longitude between -180 and 180) not valid;
alter table public.venues
  validate constraint venues_coordenadas_rango_check;

create index if not exists venues_sin_ubicacion_idx
  on public.venues (id)
  where latitude is null;

comment on column public.venues.geocoded_at is
  'Etapa 2: cuándo se fijó la ubicación (latitude/longitude). Null = nunca se geocodificó.';
comment on column public.venues.geocode_source is
  'Etapa 2: de dónde salió la ubicación: ''nominatim'' (geocodificación automática) o ''manual'' (la cargó un admin). Null = sin dato (coordenadas de antes de la etapa 2).';
comment on constraint venues_coordenadas_juntas_check on public.venues is
  'Etapa 2: latitude y longitude van juntas: las dos null o las dos con valor.';
comment on constraint venues_coordenadas_rango_check on public.venues is
  'Etapa 2: latitude entre -90 y 90, longitude entre -180 y 180.';
