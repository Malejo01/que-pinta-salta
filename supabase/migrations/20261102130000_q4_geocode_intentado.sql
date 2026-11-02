-- ============================================================================
-- Tanda Q4 (Q4-3): los lugares nuevos al mapa, solos (pregunta 21, opción 1).
-- ============================================================================
--
-- La corrida diaria de geocodificación (`scripts/geocodificar-lugares.ts
-- --programado`, desde `.github/workflows/geocodificar-lugares.yml`) no puede
-- repetir un lugar antes de 30 días: en un runner de GitHub no hay caché entre
-- corridas, así que la memoria de "ya lo intenté" tiene que vivir en la base.
--
-- Aditiva y compatible hacia atrás: una columna nueva, NULL por defecto (NULL =
-- nunca se intentó en una corrida programada). No toca datos, policies ni
-- funciones. La escribe solo el script con la service key.
-- ============================================================================

alter table public.venues
  add column if not exists geocode_intentado_at timestamptz;

comment on column public.venues.geocode_intentado_at is
  'Q4-3: última vez que la geocodificación PROGRAMADA (workflow diario) consultó a Nominatim por este lugar, con o sin resultado. NULL = nunca. La corrida no repite un lugar antes de 30 días.';
